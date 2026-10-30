/* COMMAND POST — offline support shared by every page (Command Post, EM Ops, MCI, Reunification, Check-In).
   - Knows when the device is offline and reconnects by itself.
   - Edits to ArcGIS layers made while offline are kept on the device (outbox) and sent in order when the
     connection is back. New records get a temporary id until ArcGIS assigns the real one.
   - Command Post incident records changed offline are kept on the device and merged into ArcGIS on reconnect.
   - A small status pill shows "Offline", "3 waiting to send" or "Sending…", and opens the list.
   - Registers the service worker so the apps open with no connection. */
(function (CP) {
  'use strict';
  var A = CP.arc, OB = 'bcem.cp.outbox.v1', PEND = 'bcem.cp.pendinc.v1', MAP = 'bcem.cp.idmap.v1';
  function jget(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('device storage full', e); } }
  function esc(s) { return CP.esc ? CP.esc(s) : String(s); }

  // ---------- connection state ----------
  var net = CP.net = {
    ok: navigator.onLine !== false,
    down: function () { if (net.ok) { net.ok = false; paint(); fire('cp-net'); } },
    up: function () { if (!net.ok) { net.ok = true; paint(); fire('cp-net'); setTimeout(sync.flush, 300); } }
  };
  function fire(n, d) { try { window.dispatchEvent(new CustomEvent(n, { detail: d })); } catch (e) {} }
  window.addEventListener('offline', function () { net.down(); });
  window.addEventListener('online', function () { probe(); });
  async function probe() {
    try { await fetch(A.portal + '/sharing/rest/info?f=json', { cache: 'no-store' }); net.up(); if (A.signedIn() && A.status !== 'on' && A.status !== 'busy') { await A.connect(); fire('cp-reconnected'); } sync.flush(); }
    catch (e) { net.down(); }
  }
  setInterval(function () { if (!net.ok || A.status === 'offline' || sync.count()) probe(); }, 20000);

  // ---------- outbox ----------
  // never queue writes to Command Post's own service: the incident record has its own merge-safe sync below
  function queueable(url) { return !(A.own && A.own.url && url.indexOf(A.own.url) === 0); }
  var tmp = function () { return -Math.floor(Date.now() % 1e9) - Math.floor(Math.random() * 1000); };
  var idmap = jget(MAP, {});
  function mapId(url, id) { return id < 0 && idmap[url + '|' + id] ? idmap[url + '|' + id] : id; }
  function fixFeat(url, f) { var a = f.attributes || {}; if (a.OBJECTID < 0) a.OBJECTID = mapId(url, a.OBJECTID); return f; }

  var raw = { add: A.add, update: A.update, del: A.del };
  function county(url) { return Object.keys(A.L).some(function (k) { var b = String(A.L[k]).replace(/\/\d+$/, ''); return b && url.indexOf(b) === 0; }); }
  var warned = 0;
  function wrap(kind) {
    return async function (url, items) {
      if (CP.practice && county(url)) { if (Date.now() - warned > 20000) { warned = Date.now(); CP.ui.toast('Practice incident: not posted to the county public layers.', 'ok', 4500); } return items.map(function (x) { return { objectId: kind === 'del' ? x : (x.attributes || {}).OBJECTID || 0, success: true, practice: true }; }); }
      items = kind === 'del' ? items.map(function (id) { return mapId(url, id); }) : items.map(function (f) { return fixFeat(url, f); });
      var pendingTmp = kind !== 'add' && items.some(function (x) { return (kind === 'del' ? x : (x.attributes || {}).OBJECTID) < 0; });
      if (!queueable(url) || (net.ok && !sync.count() && !pendingTmp)) {
        try { return await raw[kind](url, items); }
        catch (e) { if (!e.offline || !queueable(url)) throw e; }
      }
      return enqueue(kind, url, items);
    };
  }
  function enqueue(kind, url, items) {
    var box = jget(OB, []), out = [];
    if (kind === 'add') items = items.map(function (f) { var t = tmp(); out.push({ objectId: t, success: true, queued: true }); return Object.assign({}, f, { _tmp: t }); });
    else out = items.map(function (x) { return { objectId: kind === 'del' ? x : (x.attributes || {}).OBJECTID, success: true, queued: true }; });
    box.push({ id: Date.now() + '' + Math.random().toString(36).slice(2, 6), kind: kind, url: url, items: items, t: Date.now(), who: (A.user && A.user.username) || '', page: document.title.split('·')[0].trim() });
    jset(OB, box); paint(); fire('cp-outbox');
    if (net.ok) setTimeout(sync.flush, 50);
    return out;
  }
  A.add = wrap('add'); A.update = wrap('update'); A.del = wrap('del');
  // signing out clears this device's stored ArcGIS data and anything waiting to send
  var rawOut = A.signOut;
  A.signOut = function () {
    if (sync.count() && !confirm(sync.count() + ' change(s) have not been sent to ArcGIS yet. Sign out anyway and lose them?')) return false;
    localStorage.removeItem(OB); localStorage.removeItem(PEND); localStorage.removeItem('bcem.cp.session.v1');
    if (window.caches) caches.keys().then(function (ks) { ks.filter(function (k) { return k.indexOf('cp-data') === 0; }).forEach(function (k) { caches.delete(k); }); });
    return rawOut.apply(A, arguments);
  };

  // ---------- incident records changed while offline ----------
  var sync = CP.sync = {
    count: function () { return jget(OB, []).length + Object.keys(jget(PEND, {})).length; },
    failed: function () { return jget(OB, []).filter(function (x) { return x.err; }); },
    markIncident: function (id) { var p = jget(PEND, {}); p[id] = Date.now(); jset(PEND, p); paint(); },
    // rows waiting to send, shown in lists right away (marked as pending)
    overlay: function (url, rows) {
      var box = jget(OB, []); if (!box.length) return rows;
      var byId = {}; rows.forEach(function (r) { byId[r.OBJECTID] = r; });
      box.forEach(function (b) {
        if (b.url !== url) return;
        if (b.kind === 'add') b.items.forEach(function (f) { var a = Object.assign({}, f.attributes, { OBJECTID: f._tmp, _pending: true }); if (f.geometry && f.geometry.y != null && f.geometry.spatialReference && f.geometry.spatialReference.wkid === 4326) a._ll = [f.geometry.y, f.geometry.x]; rows.unshift(a); byId[a.OBJECTID] = a; });
        if (b.kind === 'update') b.items.forEach(function (f) { var r = byId[(f.attributes || {}).OBJECTID]; if (r) { Object.assign(r, f.attributes); r._pending = true; } });
        if (b.kind === 'del') { rows = rows.filter(function (r) { return b.items.indexOf(r.OBJECTID) < 0; }); }
      });
      return rows;
    },
    busy: false,
    flush: async function () {
      if (sync.busy || !A.signedIn()) return;
      if (!net.ok) return probe(); // checks the connection, then sends if it is back
      if (A.status !== 'on') { if (A.status === 'busy') return; await A.connect().catch(function () {}); if (A.status !== 'on') return; fire('cp-reconnected'); }
      sync.busy = true; paint();
      try {
        var box = jget(OB, []);
        while (box.length) {
          var b = box[0];
          if (b.err && !b.retry) { box.push(box.shift()); if (box.every(function (x) { return x.err && !x.retry; })) break; continue; }
          try {
            var items = b.kind === 'del' ? b.items.map(function (id) { return mapId(b.url, id); }) : b.items.map(function (f) { var c = Object.assign({}, f); delete c._tmp; return fixFeat(b.url, c); });
            if (b.kind !== 'add' && items.some(function (x) { return (b.kind === 'del' ? x : x.attributes.OBJECTID) < 0; })) throw new Error('The record it changes was never saved');
            var r = await raw[b.kind](b.url, items);
            if (b.kind === 'add') { r.forEach(function (x, i) { idmap[b.url + '|' + b.items[i]._tmp] = x.objectId; }); jset(MAP, idmap); }
            box.shift();
          } catch (e) {
            if (e.offline) break;
            b.err = CP.friendly ? CP.friendly(e.message) : e.message; b.retry = false; box.push(box.shift());
            if (box.every(function (x) { return x.err && !x.retry; })) { jset(OB, box); break; }
          }
          jset(OB, box);
        }
        jset(OB, box);
        var pend = jget(PEND, {});
        for (var id of Object.keys(pend)) {
          var loc = CP.store.get(id); if (!loc) { delete pend[id]; continue; }
          try { var merged = await A.save(CP.clone(loc)); CP.store.put(CP.merge(CP.store.get(id) || merged, merged)); delete pend[id]; fire('cp-incident-synced', id); }
          catch (e) { if (e.offline) break; console.warn('incident sync', e); }
        }
        jset(PEND, pend);
      } finally { sync.busy = false; paint(); fire('cp-outbox'); }
    },
    retry: function (id) { var box = jget(OB, []); box.forEach(function (b) { if (!id || b.id === id) { b.retry = true; } }); jset(OB, box); sync.flush(); },
    discard: function (id) { jset(OB, jget(OB, []).filter(function (b) { return b.id !== id; })); paint(); fire('cp-outbox'); }
  };

  // ---------- status pill ----------
  function paint() {
    var n = sync.count(), bad = sync.failed().length, off = !net.ok || A.status === 'offline';
    var el = document.getElementById('netpill');
    if (!off && !n) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('button'); el.id = 'netpill'; el.type = 'button'; el.onclick = panel; (document.body || document.documentElement).appendChild(el); }
    el.className = 'netpill ' + (bad ? 'bad' : off ? 'off' : 'busy');
    el.innerHTML = '<span class="dot"></span>' + (off ? 'Offline' : sync.busy ? 'Sending…' : bad ? 'Needs attention' : 'Waiting to send') + (n ? ' · ' + n + (n === 1 ? ' change' : ' changes') : '') + (off && !n ? ' · saving on this device' : '');
  }
  function panel() {
    var box = jget(OB, []), pend = jget(PEND, {}), off = !net.ok || A.status === 'offline';
    var rows = box.map(function (b) {
      var what = { add: 'New', update: 'Change to', del: 'Delete from' }[b.kind] + ' ' + layerName(b.url) + (b.items.length > 1 ? ' (' + b.items.length + ')' : '');
      return '<div class="obrow' + (b.err ? ' bad' : '') + '"><div><b>' + esc(what) + '</b><div class="dim" style="font-size:12px">' + esc(new Date(b.t).toLocaleString()) + (b.page ? ' · ' + esc(b.page) : '') + '</div>' + (b.err ? '<div class="obErr">' + esc(b.err) + '</div>' : '') + '</div>' +
        (b.err ? '<div class="row" style="gap:6px"><button class="btn xs" data-ob="retry" data-id="' + b.id + '">Try again</button><button class="btn xs ghost" data-ob="discard" data-id="' + b.id + '">Discard</button></div>' : '') + '</div>';
    }).concat(Object.keys(pend).map(function (id) { var i = CP.store.get(id); return '<div class="obrow"><div><b>Incident record: ' + esc(i ? i.name : id) + '</b><div class="dim" style="font-size:12px">Merges with everyone else\'s changes when it sends</div></div></div>'; }));
    var body = '<p style="margin-top:0">' + (off ? 'This device is offline. Keep working: everything is saved here and sends to ArcGIS by itself when the connection comes back.' : 'These changes are saved on this device and are being sent to ArcGIS.') + '</p>' +
      (rows.length ? '<div class="oblist">' + rows.join('') + '</div>' : '<p class="dim">Nothing waiting to send.</p>') +
      '<p class="dim" style="font-size:12px;margin-bottom:0">Don\'t clear this browser\'s data or sign out until the list is empty.</p>';
    var bg = CP.ui.modal(off ? 'Offline' : 'Waiting to send', body, [{ label: 'Close', cls: 'ghost' }, { label: 'Send now', cls: 'pri', fn: function () { probe(); } }]);
    bg.addEventListener('click', function (e) { var t = e.target.closest('[data-ob]'); if (!t) return; if (t.dataset.ob === 'retry') sync.retry(t.dataset.id); else sync.discard(t.dataset.id); CP.ui.closeModal(); setTimeout(panel, 400); });
  }
  function layerName(url) {
    var L = CP.ops && CP.ops.LAYERS; if (L && CP.ops.svc) for (var k in L) { try { if (CP.ops.url(k) === url) return L[k].title; } catch (e) {} }
    var m = url.match(/services\/([^/]+)\/FeatureServer\/(\d+)/); return m ? decodeURIComponent(m[1]).replace(/_[0-9a-f]{32}$/, '').replace(/_/g, ' ') + ' (' + m[2] + ')' : 'ArcGIS';
  }
  window.addEventListener('cp-net', paint);
  window.addEventListener('storage', function (e) { if (e.key === OB || e.key === PEND) paint(); });
  document.addEventListener('DOMContentLoaded', paint);
  setTimeout(paint, 500);
  // flush soon after load if anything is waiting from last time
  setTimeout(function () { if (sync.count()) probe(); }, 4000);

  // ---------- service worker: open with no connection ----------
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('sw', e); }); });
  }
})(window.CP);
