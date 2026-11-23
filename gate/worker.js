/* BEACON gate — sign-in and ArcGIS access for the Command Board and MCI Board apps (Botetourt County).
 *
 * Who gets in is decided by one ArcGIS table ("Command Board Users"): one row per email with a level per app.
 * People sign in with their email and a 6-digit code (no password, no ArcGIS login).
 * The county's ArcGIS app credentials live only here (ARC_CLIENT_ID + secret ARC_CLIENT_SECRET). The apps never see them.
 * The apps reach ArcGIS through /arc/<host>/<path>; only the services in layersFor() are allowed,
 * and what each level may do with each layer is decided here, not in the app.
 *
 * Secrets (wrangler secret put):  ARC_CLIENT_SECRET  MAIL_FLOW_URL   (optional: SIGNING_KEY; or ARC_KEY instead of the client credentials)
 * Vars (wrangler.toml):           SERVICES (JSON from EM Ops)  AUTO_VIEWER_DOMAIN (optional)  USERS_TABLE (optional)
 */

const ORDER = ['None', 'Guest', 'Viewer', 'Officer', 'Command', 'Admin'];
const rank = (l) => Math.max(0, ORDER.indexOf(l || 'None'));
const SESSION_DAYS = 30, CODE_MIN = 10, ROSTER_TTL = 120, MAX_TRIES = 8;
const S6 = 'services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/';

// Every ArcGIS service the apps may touch. Anything else is refused.
// The addresses come from the SERVICES var (EM Ops → Setup → "Command Board & MCI apps" → Copy gate settings);
// the defaults below are only used until it is set.
//  read: lowest level that may query.  write: lowest level that may edit (null = never).  del: lowest level that may delete.
//  strip: fields removed unless the level is at least `stripBelow`.  guestScope: guests only see their incident's rows.
const DEFAULT_SERVICES = {
  users: S6 + 'BEACON_App_Access/FeatureServer', cp: S6 + 'BOCO_Command_Post/FeatureServer',
  cadCalls: S6 + 'CAD_Calls_For_Service_Active_Fire_EMS/FeatureServer', cadUnits: S6 + 'CAD_Units_Fire_EMS/FeatureServer',
  hydrants: S6 + 'Hydrants/FeatureServer', ppTac: S6 + 'BOCO_Preplans_Tactical/FeatureServer', ppProt: S6 + 'BOCO_Preplans_Protected/FeatureServer',
  patients: S6 + 'BOCO_EMS_PatientCare/FeatureServer'
};
function services(env) {
  let o = {}; try { o = env.SERVICES ? JSON.parse(env.SERVICES) : {}; } catch (e) {}
  const out = { ...DEFAULT_SERVICES };
  Object.keys(o).forEach((k) => { if (o[k]) out[k] = String(o[k]).replace(/^https:\/\//, '').replace(/\/(\d+)?$/, '').replace(/\/$/, ''); });
  return out;
}
function layersFor(env) {
  const S = services(env);
  return {
    cb: [
      { svc: S.cp, read: 'Guest', write: 'Officer', del: 'Command', guestScope: 'incident_key' },
      { svc: S.cadCalls, read: 'Officer', strip: [/caller/i], stripBelow: 'Command' },
      { svc: S.cadUnits, read: 'Officer' },
      { svc: S.hydrants, read: 'Viewer' },
      { svc: S.ppTac, read: 'Officer' },
      { svc: S.ppProt, read: 'Command' }
    ],
    mci: [ // planned: the MCI Board app uses the same gate
      { svc: S.cp, read: 'Viewer', write: null },
      { svc: S.patients, read: 'Officer', write: 'Officer', del: null, guestScope: 'incident_key' },
      { svc: S.hydrants, read: 'Viewer' }
    ]
  };
}
const APPS = { cb: 'cb_level', mci: 'mci_level' };
const READ_OPS = /^(query|queryRelatedRecords|queryAttachments|attachments\/\d+|\d+\/attachments\/\d+)?$/;
const WRITE_OPS = /^(applyEdits|addFeatures|updateFeatures)$/;
const DEL_OPS = /^deleteFeatures$/;

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
// Sessions and codes are signed with SIGNING_KEY, or (if that is not set) a key derived from the ArcGIS client secret.
// Changing either one signs everybody out, which is what you want if a secret is ever exposed.
async function hmac(env, msg) {
  const raw = env.SIGNING_KEY || ('beacon-gate.' + (env.ARC_CLIENT_SECRET || env.ARC_KEY || ''));
  if (raw.length < 20) throw new Error('The gate is not set up yet (no ArcGIS client secret).');
  const k = await crypto.subtle.importKey('raw', enc.encode(raw), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
async function sign(env, obj) { const body = b64u(enc.encode(JSON.stringify(obj))); return body + '.' + b64u(await hmac(env, 'tok.' + body)); }
async function verify(env, tok) {
  if (!tok || tok.indexOf('.') < 0) return null; const [body, sig] = tok.split('.');
  const want = b64u(await hmac(env, 'tok.' + body)); if (!timingSafe(want, sig)) return null;
  const o = JSON.parse(new TextDecoder().decode(unb64u(body))); return o.exp > Date.now() ? o : null;
}
function timingSafe(a, b) { if (!a || !b || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
async function codeFor(env, email, win) { const h = await hmac(env, 'code.' + email + '.' + win); return String(((h[0] << 24 | h[1] << 16 | h[2] << 8 | h[3]) >>> 0) % 1000000).padStart(6, '0'); }
const win = (t) => Math.floor((t || Date.now()) / (CODE_MIN * 60000));
const normEmail = (e) => String(e || '').trim().toLowerCase();
const okEmail = (e) => /^[^@\s'"]+@[^@\s'"]+\.[a-z]{2,}$/.test(e);

// ---------- ArcGIS token: app credentials (client id + secret) held here; the token is cached until shortly before it expires ----------
let TOK = null;
async function arcToken(env) {
  if (env.ARC_KEY) return env.ARC_KEY;
  if (TOK && TOK.exp > Date.now() + 10 * 60000) return TOK.t;
  const key = new Request('https://gate.cache/arc-token');
  const hit = await caches.default.match(key); if (hit) { const o = await hit.json(); if (o.exp > Date.now() + 10 * 60000) { TOK = o; return o.t; } }
  const portal = (env.ARC_PORTAL || 'https://botetourt.maps.arcgis.com').replace(/\/$/, '');
  const r = await fetch(portal + '/sharing/rest/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.ARC_CLIENT_ID || '', client_secret: env.ARC_CLIENT_SECRET || '', grant_type: 'client_credentials', expiration: '1440' }) }).then((x) => x.json());
  if (!r.access_token) throw new Error('ArcGIS sign-in for the gate failed: ' + ((r.error && (r.error.message || r.error.error_description)) || 'check ARC_CLIENT_ID and ARC_CLIENT_SECRET'));
  TOK = { t: r.access_token, exp: Date.now() + (r.expires_in || 86400) * 1000 };
  await caches.default.put(key, new Response(JSON.stringify(TOK), { headers: { 'Cache-Control': 'max-age=' + Math.max(60, (r.expires_in || 86400) - 900) } }));
  return TOK.t;
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '86400' };
const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS, ...h } });
const err = (m, s = 400) => json({ error: { message: m, code: s } }, s);

// ---------- roster (ArcGIS table, cached briefly so a removed person is locked out within minutes) ----------
async function roster(env, ctx, email) {
  const key = new Request('https://gate.cache/roster/' + encodeURIComponent(email));
  const cache = caches.default; const hit = await cache.match(key); if (hit) return hit.json();
  const p = new URLSearchParams({ f: 'json', where: "LOWER(email) = '" + email.replace(/'/g, "''") + "'", outFields: '*', resultRecordCount: '1', token: await arcToken(env) });
  const r = await fetch('https://' + (env.USERS_TABLE || services(env).users + '/0') + '/query?' + p).then((x) => x.json());
  if (r.error) throw new Error('Users table: ' + r.error.message);
  const a = (r.features && r.features[0] && r.features[0].attributes) || null;
  let row = null;
  if (a) {
    const lv = (k) => (ORDER.includes(a[k]) ? a[k] : 'None');
    const expired = a.expires && a.expires < Date.now();
    row = { email, name: a.full_name || email, agency: a.agency || '', active: String(a.active || 'Yes') !== 'No' && !expired, levels: { cb: lv('cb_level'), mci: lv('mci_level') } };
  } else if (env.AUTO_VIEWER_DOMAIN && email.endsWith('@' + env.AUTO_VIEWER_DOMAIN)) {
    row = { email, name: email.split('@')[0], agency: 'Botetourt County', active: true, levels: { cb: 'Viewer', mci: 'None' }, auto: true };
  }
  const out = row || { email, active: false, levels: {} };
  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(out), { headers: { 'Cache-Control': 'max-age=' + ROSTER_TTL } })));
  return out;
}
const levelOf = (row, app) => (row && row.active ? row.levels[app] || 'None' : 'None');

// simple attempt limit per email (per Cloudflare location; good enough to stop guessing)
async function tries(email, add) {
  const key = new Request('https://gate.cache/tries/' + encodeURIComponent(email) + '/' + win());
  const hit = await caches.default.match(key); let n = hit ? +(await hit.text()) : 0;
  if (add) { n++; await caches.default.put(key, new Response(String(n), { headers: { 'Cache-Control': 'max-age=' + CODE_MIN * 60 } })); }
  return n;
}

// ---------- guest codes: the IC hands a code to a mutual-aid company for one incident ----------
async function guestCode(env, incKey) { const h = await hmac(env, 'guest.' + incKey); return 'G' + b64u(h).replace(/[-_]/g, '').slice(0, 7).toUpperCase(); }

async function session(env, req) {
  const t = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '') || new URL(req.url).searchParams.get('gt');
  return verify(env, t);
}
async function currentLevel(env, ctx, s) {
  if (s.g) return 'Guest';
  const row = await roster(env, ctx, s.e); return levelOf(row, s.a);
}
function sessionOut(s, lvl, row) { return { email: s.e, name: (row && row.name) || s.n, agency: (row && row.agency) || s.ag || '', level: lvl, app: s.a, incident: s.g || null, exp: s.exp }; }

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url), path = url.pathname;
    try {
      if (path === '/' || path === '/health') return json({ ok: true, service: 'BEACON gate', t: Date.now() });

      // 1) ask for a code
      if (path === '/auth/start' && req.method === 'POST') {
        const b = await req.json(), email = normEmail(b.email), app = APPS[b.app] ? b.app : 'cb';
        if (!okEmail(email)) return err('Enter a full email address.');
        const row = await roster(env, ctx, email);
        // same answer whether or not the email is on the list, so the list can't be fished
        if (levelOf(row, app) !== 'None') {
          const code = await codeFor(env, email, win());
          const r = await fetch(env.MAIL_FLOW_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: email, name: row.name, code, app: app === 'mci' ? 'MCI Board' : 'Command Board', minutes: CODE_MIN }) });
          if (!r.ok) return err('The sign-in email could not be sent. Try again in a minute.', 502);
        }
        return json({ ok: true, minutes: CODE_MIN });
      }

      // 2) trade the code for a session
      if (path === '/auth/verify' && req.method === 'POST') {
        const b = await req.json(), email = normEmail(b.email), app = APPS[b.app] ? b.app : 'cb', code = String(b.code || '').replace(/\D/g, '');
        if (!okEmail(email) || code.length !== 6) return err('Enter the 6-digit code from the email.');
        if ((await tries(email)) >= MAX_TRIES) return err('Too many tries. Wait 10 minutes and ask for a new code.', 429);
        const ok = timingSafe(code, await codeFor(env, email, win())) || timingSafe(code, await codeFor(env, email, win() - 1));
        if (!ok) { await tries(email, true); return err('That code is not right, or it has expired.', 401); }
        const row = await roster(env, ctx, email), lvl = levelOf(row, app);
        if (lvl === 'None') return err('This email does not have access.', 403);
        const s = { e: email, n: row.name, ag: row.agency, a: app, d: String(b.device || '').slice(0, 64), iat: Date.now(), exp: Date.now() + SESSION_DAYS * 864e5 };
        return json({ token: await sign(env, s), ...sessionOut(s, lvl, row) });
      }

      // 2b) guest: an incident code from the IC (view only, that incident only, until it closes)
      if (path === '/auth/guest' && req.method === 'POST') {
        const b = await req.json(), code = String(b.code || '').trim().toUpperCase(), name = String(b.name || '').trim().slice(0, 60), app = APPS[b.app] ? b.app : 'cb';
        if (!/^G[A-Z0-9]{7}$/.test(code) || !name) return err('Enter your name and the incident code.');
        const inc = await findIncidentForGuest(env, code);
        if (!inc) return err('That incident code is not valid or the incident is closed.', 403);
        const s = { e: 'guest:' + name, n: name + ' (guest)', ag: String(b.agency || '').slice(0, 60), a: app, g: inc.key, iat: Date.now(), exp: Date.now() + 2 * 864e5 };
        return json({ token: await sign(env, s), ...sessionOut(s, 'Guest') });
      }

      // everything below needs a session
      const s = await session(env, req); if (!s) return err('Signed out. Sign in again.', 401);
      const lvl = await currentLevel(env, ctx, s);
      if (lvl === 'None') return err('Access was removed. Contact Emergency Management.', 403);

      // 3) who am I (the app calls this on launch and every few minutes; returns a fresh token)
      if (path === '/me') {
        const row = s.g ? null : await roster(env, ctx, s.e);
        const fresh = s.g ? s : { ...s, n: (row && row.name) || s.n, iat: Date.now(), exp: Date.now() + SESSION_DAYS * 864e5 };
        return json({ token: s.g ? null : await sign(env, fresh), ...sessionOut(fresh, lvl, row), layers: (layersFor(env)[s.a] || []).filter((L) => rank(lvl) >= rank(L.read)).map((L) => ({ url: 'https://' + L.svc, write: !!(L.write && rank(lvl) >= rank(L.write)) })) });
      }

      // 4) guest code for an incident (Command only)
      if (path === '/guest-code') {
        if (rank(lvl) < rank('Command')) return err('Only Command can hand out incident codes.', 403);
        const key = String(url.searchParams.get('incident') || '').slice(0, 40); if (!/^[\w-]+$/.test(key)) return err('No incident.');
        return json({ code: await guestCode(env, key) });
      }

      // 5) ArcGIS through the gate
      if (path.startsWith('/arc/')) return arcProxy(req, env, ctx, s, lvl, url);

      return err('Not found', 404);
    } catch (e) {
      return err('Gate error: ' + (e && e.message || e), 500);
    }
  }
};

async function findIncidentForGuest(env, code) {
  const cp = services(env).cp;
  const p = new URLSearchParams({ f: 'json', where: "closed_time IS NULL", outFields: 'incident_key', resultRecordCount: '200', orderByFields: 'start_time DESC', token: await arcToken(env) });
  const r = await fetch('https://' + cp + '/0/query?' + p).then((x) => x.json());
  for (const f of r.features || []) { const k = f.attributes.incident_key; if (k && (await guestCode(env, k)) === code) return { key: k }; }
  return null;
}

async function arcProxy(req, env, ctx, s, lvl, url) {
  const rest = url.pathname.slice(5); // host/arcgis/rest/services/...
  if (/\.\.|%2e|%2f|\/\/|\\/i.test(rest)) return err('That request is not allowed.', 403);
  const L = (layersFor(env)[s.a] || []).find((x) => rest === x.svc || rest.startsWith(x.svc + '/'));
  if (!L) return err('That layer is not available in this app.', 403);
  if (rank(lvl) < rank(L.read)) return err('Your access level cannot see this layer.', 403);
  const tail = rest.slice(L.svc.length).replace(/^\//, ''); // e.g. "0/query", "applyEdits", ""
  const op = tail.replace(/^\d+\/?/, '');
  // read params from query string and (for POST) the form body
  const p = new URLSearchParams(url.search);
  if (req.method === 'POST') { const body = new URLSearchParams(await req.text()); for (const [k, v] of body) p.set(k, v); }
  p.delete('token'); p.delete('gt');
  const isWrite = WRITE_OPS.test(op), isDel = DEL_OPS.test(op);
  if (isWrite && !(L.write && rank(lvl) >= rank(L.write))) return err('Your access level cannot change this.', 403);
  if (isDel && !(L.del && rank(lvl) >= rank(L.del))) return err('Your access level cannot delete this.', 403);
  if (!isWrite && !isDel && !READ_OPS.test(op)) return err('That request is not allowed.', 403);
  if (lvl === 'Guest') {
    if (isWrite || isDel) return err('Guests can only view.', 403);
    // guests: the filter is replaced, not added to, so no where clause can widen it
    if (L.guestScope && /query/.test(op)) { p.set('where', L.guestScope + " = '" + String(s.g).replace(/'/g, "''") + "'"); ['objectIds', 'geometry', 'text', 'relationshipParam'].forEach((k) => p.delete(k)); }
    else if (!L.guestScope && op) return err('Guests can only view their incident.', 403);
  }
  p.set('token', await arcToken(env)); if (!p.get('f')) p.set('f', 'json');
  const target = 'https://' + L.svc + (tail ? '/' + tail : '');
  const isBin = /attachments\/\d+$/.test(op);
  const r = (isWrite || isDel || req.method === 'POST')
    ? await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p })
    : await fetch(target + '?' + p);
  if (isBin) return new Response(r.body, { status: r.status, headers: { 'Content-Type': r.headers.get('Content-Type') || 'application/octet-stream', 'Cache-Control': 'private, max-age=3600', ...CORS } });
  let j = await r.json();
  if (L.strip && rank(lvl) < rank(L.stripBelow)) j = stripFields(j, L.strip);
  if (j && typeof j === 'object' && !Array.isArray(j)) { delete j.serviceItemId; } // nothing that helps find the source item
  return json(j, r.status === 200 ? 200 : r.status);
}
function stripFields(j, pats) {
  const bad = (n) => pats.some((re) => re.test(n));
  if (Array.isArray(j.fields)) j.fields = j.fields.filter((f) => !bad(f.name) && !bad(f.alias || ''));
  (j.features || []).forEach((f) => { Object.keys(f.attributes || {}).forEach((k) => { if (bad(k)) delete f.attributes[k]; }); });
  return j;
}
