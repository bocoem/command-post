/* COMMAND POST — service worker: lets every page open and show its last data with no connection.
   - App pages and code: network first, last copy when offline (so a deploy is picked up right away when online).
   - Maps, fonts and libraries from other sites: cached copy first.
   - ArcGIS reads (GET): network first, last copy when offline. Sign-in tokens are stripped from the stored key.
     Records with personal information (protected services, shelter registry) are never stored on the device.
   - Writes (POST) are never cached; the app's outbox handles them. */
var V = 'cp-v6', SHELL = 'cp-shell-' + V, DATA = 'cp-data-' + V, LIB = 'cp-lib-' + V;
var PRIVATE = /BOCO_EM_Protected|BOCO_EMS_PatientCare|Shelter_Registry|Shelter_Checkouts|Reunification|oauth2|\/generateToken/i;
var PAGES = ['./', 'index.html', 'ops.html', 'mci.html', 'reunify.html', 'checkin.html', 'family.html', 'hotline.html', 'faq.html', 'commandboard.html', 'cb.css', 'cb.js', 'sync.js', 'lib/jsQR.js', 'app.css', 'seal.png', 'icon.png', 'cp_lockup.png', 'manifest.webmanifest'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return Promise.all(PAGES.map(function (p) { return c.add(new Request(p, { cache: 'reload' })).catch(function () {}); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf(V) < 0; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});

function keyOf(req) { var u = new URL(req.url); u.searchParams.delete('token'); u.searchParams.delete('_'); return u.toString(); }
async function netFirst(req, cacheName, key) {
  var c = await caches.open(cacheName);
  try {
    var r = await fetch(req);
    if (r && r.ok) c.put(key || req, r.clone()).catch(function () {});
    return r;
  } catch (e) {
    var hit = await c.match(key || req, { ignoreVary: true }) || (cacheName === SHELL ? await c.match(stripQuery(req)) : null);
    if (hit) { var h = new Headers(hit.headers); h.set('x-cp-offline', '1'); return new Response(await hit.blob(), { status: hit.status, statusText: hit.statusText, headers: h }); }
    throw e;
  }
}
function stripQuery(req) { var u = new URL(req.url); u.search = ''; return u.toString(); }
async function cacheFirst(req) {
  var c = await caches.open(LIB), hit = await c.match(req);
  if (hit) return hit;
  var r = await fetch(req); if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()).catch(function () {});
  return r;
}
var tileCount = 0;
self.addEventListener('fetch', function (e) {
  var req = e.request; if (req.method !== 'GET') return;
  var u = new URL(req.url);
  if (u.origin === self.location.origin) {
    if (/\/sw\.js$/.test(u.pathname)) return;
    // page navigations with ?incident=… etc. fall back to the stored page
    e.respondWith(netFirst(req, SHELL, req.mode === 'navigate' ? stripQuery(req) : null));
    return;
  }
  if (/unpkg\.com|fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/.test(u.host)) { e.respondWith(cacheFirst(req)); return; }
  if (/arcgis\.com|arcgisonline\.com/.test(u.host)) {
    if (PRIVATE.test(u.href)) return; // never store personal information on the device
    if (/\/tile\/|\/MapServer\/tile|basemaps/.test(u.href)) { // map tiles: keep a modest set for offline maps
      e.respondWith(caches.open(LIB + '-tiles').then(async function (c) {
        var hit = await c.match(req); if (hit) return hit;
        var r = await fetch(req); if (r && r.ok && tileCount++ < 3000) c.put(req, r.clone()).catch(function () {}); return r;
      }));
      return;
    }
    e.respondWith(netFirst(req, DATA, keyOf(req)));
  }
});
