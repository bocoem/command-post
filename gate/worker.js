/* BEACON gate — sign-in and ArcGIS access for the Command Board and MCI Board apps (Botetourt County).
 *
 * Who gets in is decided by one ArcGIS table (BEACON_App_Access / APP_Users): one row per person or truck iPad, a level per app.
 * On the list you're in; turned off, you're out. Each row is identified by its uid.
 * Sign-in is a one-time setup code (or its QR) that a Chief, User manager or Admin issues from the Users page or an app.
 *   People stay signed in a year while they use the app (renewed on each use; was 30 days until Nov 24). Devices (truck iPads, shared email) stay signed in until turned off.
 * Email sign-in was retired Nov 24, 2026. Older email sessions keep working until they lapse (a year unused).
 * The Users page for the Teams tab is served at /users.
 * The county's ArcGIS app credentials live only here (ARC_CLIENT_ID + secret ARC_CLIENT_SECRET). The apps never see them.
 * The apps reach ArcGIS through /arc/<host>/<path>; only the services in layersFor() are allowed,
 * and what each level may do with each layer is decided here, not in the app.
 *
 * Secrets (wrangler secret put):  ARC_CLIENT_SECRET   (optional: SIGNING_KEY; or ARC_KEY instead of the client credentials)
 * Vars (wrangler.toml):           SERVICES (JSON from EM Ops)  USERS_TABLE, USERLOG_TABLE (optional)
 */
import USERS_PAGE from './users-page.js';

const ORDER = ['None', 'Guest', 'Viewer', 'Officer', 'Command', 'Chief', 'Admin'];
const rank = (l) => Math.max(0, ORDER.indexOf(l || 'None'));
const SESSION_DAYS = 365, DEVICE_DAYS = 3650, CODE_MIN = 10, ROSTER_TTL = 120, MAX_TRIES = 8, SETUP_HOURS = 24;
const SETUP_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const S6 = 'services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/';

// Every ArcGIS service the apps may touch. Anything else is refused.
// The addresses come from the SERVICES var (EM Ops → Setup → "Command Board & MCI apps" → Copy gate settings);
// the defaults below are only used until it is set.
//  read: lowest level that may query.  write: lowest level that may edit (null = never).  del: lowest level that may delete.
//  strip: fields removed unless the level is at least `stripBelow`. Below that level these fields also can't be searched,
//         sorted or grouped on (so a filter can't be used to guess them), and with noWrite they can't be written either.
//  guestScope: guests only see their incident's rows.
//  layers: only these layer numbers inside the service (the service's own summary is refused).
//  only: the only operations allowed on this service (for example add-only).
//  statsBelow: levels below this may only ask for counts (by triage, status, hospital), never rows.  countsOnly: everyone.
const DEFAULT_SERVICES = {
  users: S6 + 'BEACON_App_Access/FeatureServer', cp: S6 + 'BOCO_Command_Post/FeatureServer',
  cadCalls: S6 + 'CAD_Calls_For_Service_Active_Fire_EMS/FeatureServer', cadUnits: S6 + 'CAD_Units_Fire_EMS/FeatureServer',
  hydrants: S6 + 'Hydrants/FeatureServer', ppTac: S6 + 'BOCO_Preplans_Tactical/FeatureServer', ppProt: S6 + 'BOCO_Preplans_Protected/FeatureServer',
  patients: S6 + 'BOCO_EMS_PatientCare/FeatureServer',
  ops: S6 + 'BOCO_EM_Operations/FeatureServer', prot: S6 + 'BOCO_EM_Protected/FeatureServer'
};
// Layer numbers inside shared services (EM Ops schema: OPS_Hospitals = 15, PROT_Reunification = 2, PROT_MCI_Patients = 0).
const HOSP_LAYER = 15, REUN_LAYER = 2, PT_LAYER = 0;
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
      { svc: S.ppProt, read: 'Command' },
      // live MCI count on the board: counts by triage and status only, never patient rows
      { svc: S.patients, read: 'Officer', write: null, layers: [PT_LAYER], countsOnly: true }
    ],
    mci: [ // the MCI Board iPad/iPhone app (no guests: patient records)
      { svc: S.cp, read: 'Viewer', write: null, layers: [0] },
      // patients: Officers triage, treat and transport; names only for Command and up; Viewers get counts only; nothing is ever deleted
      { svc: S.patients, read: 'Viewer', write: 'Officer', del: null, layers: [PT_LAYER], strip: [/first_name/i, /last_name/i], stripBelow: 'Command', noWrite: true, statsBelow: 'Officer' },
      { svc: S.ops, read: 'Viewer', write: 'Officer', del: null, layers: [HOSP_LAYER] },            // hospital board only
      { svc: S.prot, read: 'Command', write: 'Command', del: null, layers: [REUN_LAYER], only: /^addFeatures$/ }, // send a found person to Reunification; can't read it back
      { svc: S.cadUnits, read: 'Officer' }
    ]
  };
}
const APPS = { cb: 'cb_level', mci: 'mci_level', admin: 'manager' }; // admin = the Users page (level from manager rights, not a column)
const LEVEL_COLS = ['cb_level', 'mci_level'];
const READ_OPS = /^(query|queryRelatedRecords|queryAttachments|attachments\/\d+|\d+\/attachments\/\d+)?$/;
const WRITE_OPS = /^(applyEdits|addFeatures|updateFeatures)$/;
const STAT_FIELDS = ['OBJECTID', 'triage', 'status', 'hospital', 'incident_key'];
const SEARCH_PARAMS = ['where', 'orderByFields', 'groupByFieldsForStatistics', 'outStatistics', 'having', 'text', 'sqlFormat'];
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
// Looked up by uid (setup-code sessions) or by email (email sessions from before Nov 24, until they lapse; never a Device row).
const usersUrl = (env) => 'https://' + (env.USERS_TABLE || services(env).users + '/0');
const logUrl = (env) => 'https://' + (env.USERLOG_TABLE || services(env).users + '/1');
const q = (v) => "'" + String(v).replace(/'/g, "''") + "'";
async function usersQuery(env, where, fallbackWhere) {
  const p = new URLSearchParams({ f: 'json', where, outFields: '*', orderByFields: 'full_name', resultRecordCount: '2000', token: await arcToken(env) });
  let r = await fetch(usersUrl(env) + '/query?' + p).then((x) => x.json());
  if (r.error && fallbackWhere) { p.set('where', fallbackWhere); r = await fetch(usersUrl(env) + '/query?' + p).then((x) => x.json()); } // table not yet upgraded by EM Ops
  if (r.error) throw new Error('Users table: ' + r.error.message);
  return (r.features || []).map((f) => f.attributes);
}
const isDev = (a) => String(a && a.kind || '') === 'Device';
const umOf = (a) => String(a && a.user_role || '') === 'User manager';
const topOf = (a) => LEVEL_COLS.reduce((m, k) => (rank(a[k]) > rank(m) ? a[k] : m), 'None');
function managerLevel(a) { const t = topOf(a); if (rank(t) >= rank('Admin')) return 'Admin'; if (rank(t) >= rank('Chief') || umOf(a)) return 'Chief'; return 'None'; }
function rowOut(a, key) {
  const lv = (k) => (ORDER.includes(a[k]) ? a[k] : 'None');
  const expired = a.expires && a.expires < Date.now();
  return { key, id: a.OBJECTID, uid: a.uid || '', email: normEmail(a.email), name: a.full_name || a.email || 'Device', agency: a.agency || '', kind: isDev(a) ? 'Device' : 'Person', role: a.user_role || '',
    active: String(a.active || 'Yes') !== 'No' && !expired, levels: { cb: lv('cb_level'), mci: lv('mci_level'), admin: managerLevel(a) } };
}
async function roster(env, ctx, who) {
  const byUid = typeof who === 'object' && who.u, email = typeof who === 'object' ? who.e : who;
  const key = new Request('https://gate.cache/roster/' + (byUid ? 'u/' + encodeURIComponent(who.u) : encodeURIComponent(email)));
  const cache = caches.default; const hit = await cache.match(key); if (hit) return hit.json();
  const rows = byUid ? await usersQuery(env, 'uid = ' + q(who.u))
    : await usersQuery(env, 'LOWER(email) = ' + q(email) + " AND (kind IS NULL OR kind <> 'Device')", 'LOWER(email) = ' + q(email));
  const a = rows.find((x) => !(!byUid && isDev(x))) || null;
  let row = a ? rowOut(a, byUid ? who.u : email) : null;
  const out = row || { email, active: false, levels: {} };
  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(out), { headers: { 'Cache-Control': 'max-age=' + ROSTER_TTL } })));
  return out;
}
async function forget(row) { for (const k of [row.uid && 'u/' + encodeURIComponent(row.uid), row.email && encodeURIComponent(normEmail(row.email))].filter(Boolean)) await caches.default.delete(new Request('https://gate.cache/roster/' + k)); }
const levelOf = (row, app) => (row && row.active ? row.levels[app] || 'None' : 'None');

// simple attempt limit (per Cloudflare location; good enough to stop guessing setup codes)
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
const who = (s) => (s.u ? { u: s.u, e: s.e } : s.e);
async function currentLevel(env, ctx, s) {
  if (s.g) return 'Guest';
  const row = await roster(env, ctx, who(s)); return levelOf(row, s.a);
}
function sessionOut(s, lvl, row) { return { email: s.e, name: (row && row.name) || s.n, agency: (row && row.agency) || s.ag || '', kind: s.k || (row && row.kind) || 'Person', role: (row && row.role) || '', uid: s.u || null, level: lvl, app: s.a, incident: s.g || null, exp: s.exp }; }
const lifeDays = (s) => (s.k === 'Device' ? DEVICE_DAYS : SESSION_DAYS);
async function sha256hex(t) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join(''); }
const normSetup = (c) => String(c || '').toUpperCase().replace(/^BEACON-SETUP:/, '').replace(/[^A-Z0-9]/g, '');
function randFrom(abc, n) { const b = crypto.getRandomValues(new Uint8Array(n * 2)); let o = ''; for (let i = 0; o.length < n && i < b.length; i++) if (b[i] < 248) o += abc[b[i] % abc.length]; return o.length === n ? o : randFrom(abc, n); }
const newUid = () => randFrom('abcdefghjkmnpqrstuvwxyz23456789', 12);
async function arcEdit(env, url, op, payload) {
  const p = new URLSearchParams({ f: 'json', token: await arcToken(env) });
  if (op === 'deleteFeatures') p.set('objectIds', String(payload)); else p.set('features', JSON.stringify(payload));
  const r = await fetch(url + '/' + op, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p }).then((x) => x.json());
  const res = r.error ? r : ((r.addResults || r.updateResults || r.deleteResults || [])[0] || {});
  if (r.error || !res.success) throw new Error('ArcGIS did not save the change: ' + ((r.error && r.error.message) || (res.error && res.error.description) || 'unknown') + '. If this is the first time, run EM Ops → Setup → App Access.');
  return res;
}

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url), path = url.pathname;
    try {
      if (path === '/' || path === '/health') return json({ ok: true, service: 'BEACON gate', t: Date.now() });

      // Users page (Teams tab)
      if (path === '/users' || path === '/users/') return new Response(USERS_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; connect-src 'self'" } });

      // 0) sign in with a setup code (people and truck iPads)
      if (path === '/auth/setup' && req.method === 'POST') {
        const b = await req.json(), app = APPS[b.app] ? b.app : 'cb', code = normSetup(b.code);
        const ip = req.headers.get('CF-Connecting-IP') || 'ip';
        if ((await tries('ip:' + ip)) >= MAX_TRIES * 2) return err('Too many tries. Wait 10 minutes.', 429);
        if (code.length !== 10) return err('Enter the 10-character setup code.');
        const a = (await usersQuery(env, 'setup_hash = ' + q(await sha256hex(code))))[0];
        const used = String(a && a.setup_used || '').split(',').filter(Boolean);
        if (!a || !(a.setup_expires > Date.now()) || used.includes(app)) { await tries('ip:' + ip, true); return err('That setup code is not right, has expired, or was already used in this app. Ask for a new one.', 401); }
        const uid = a.uid || newUid();
        await arcEdit(env, usersUrl(env), 'updateFeatures', [{ attributes: { OBJECTID: a.OBJECTID, uid, setup_used: used.concat(app).join(',') } }]);
        const row = rowOut({ ...a, uid }, uid), lvl = levelOf(row, app);
        if (lvl === 'None') return err(app === 'admin' ? 'This account cannot manage users.' : 'This account does not have access to this app.', 403);
        await forget(row);
        const s = { u: uid, e: row.email, k: row.kind, n: row.name, ag: row.agency, a: app, d: String(b.device || '').slice(0, 64), iat: Date.now() };
        s.exp = Date.now() + lifeDays(s) * 864e5;
        ctx.waitUntil(writeLog(env, { uid, name: row.name }, 'signed in', row, (row.kind === 'Device' ? 'device set up' : 'setup code used') + ' in ' + ({ cb: 'Command Board', mci: 'MCI Board', admin: 'Users page' }[app]) + (s.d ? ' on ' + s.d : '')).catch(() => {}));
        return json({ token: await sign(env, s), ...sessionOut(s, lvl, row) });
      }

      // email sign-in was retired Nov 24, 2026: older app builds get a clear answer
      if (path === '/auth/start' || path === '/auth/verify') return err('Email sign-in has been retired. Ask a Chief, a User manager or Emergency Management for a setup code, and update the app from TestFlight.', 410);

      // 1) guest: an incident code from the IC (view only, that incident only, until it closes)
      if (path === '/auth/guest' && req.method === 'POST') {
        const b = await req.json(), code = String(b.code || '').trim().toUpperCase(), name = String(b.name || '').trim().slice(0, 60), app = APPS[b.app] ? b.app : 'cb';
        if (app === 'mci') return err('The MCI Board has no guest access (patient records).', 403);
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
        const row = s.g ? null : await roster(env, ctx, who(s));
        const fresh = s.g ? s : { ...s, n: (row && row.name) || s.n, iat: Date.now(), exp: Date.now() + lifeDays(s) * 864e5 };
        return json({ token: s.g ? null : await sign(env, fresh), ...sessionOut(fresh, lvl, row), layers: (layersFor(env)[s.a] || []).filter((L) => L.read && rank(lvl) >= rank(L.read)).map((L) => ({ url: 'https://' + L.svc, write: !!(L.write && rank(lvl) >= rank(L.write)), ids: L.layers || null, only: L.only ? String(L.only.source) : null, counts: !!(L.countsOnly || (L.statsBelow && rank(lvl) < rank(L.statsBelow))), hidden: L.strip && rank(lvl) < rank(L.stripBelow) ? L.strip.map((re) => re.source) : [] })) });
      }

      // 4) guest code for an incident (Command only)
      if (path === '/guest-code') {
        if (rank(lvl) < rank('Command')) return err('Only Command can hand out incident codes.', 403);
        const key = String(url.searchParams.get('incident') || '').slice(0, 40); if (!/^[\w-]+$/.test(key)) return err('No incident.');
        return json({ code: await guestCode(env, key) });
      }

      // 5) ArcGIS through the gate
      if (path === '/admin/users') return await adminUsers(req, env, ctx, s);
      if (path === '/admin/log') return await adminLog(req, env, ctx, s, url);
      if (path.startsWith('/arc/')) { if (s.a === 'admin') return err('That layer is not available in this app.', 403); return await arcProxy(req, env, ctx, s, lvl, url); }

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
  if (!L.read || rank(lvl) < rank(L.read)) return err('Your access level cannot see this layer.', 403);
  const tail = rest.slice(L.svc.length).replace(/^\//, ''); // e.g. "0/query", "applyEdits", ""
  const op = tail.replace(/^\d+\/?/, '');
  if (L.layers) { const m = tail.match(/^(\d+)(\/|$)/); if (!m || !L.layers.includes(+m[1])) return err('That layer is not available in this app.', 403); }
  if (L.only && !L.only.test(op)) return err('That request is not allowed.', 403);
  // read params from query string and (for POST) the form body
  const p = new URLSearchParams(url.search);
  if (req.method === 'POST') { const body = new URLSearchParams(await req.text()); for (const [k, v] of body) p.set(k, v); }
  p.delete('token'); p.delete('gt');
  const isWrite = WRITE_OPS.test(op), isDel = DEL_OPS.test(op) || (op === 'applyEdits' && !!(p.get('deletes') || '').replace(/[\s\[\]]/g, ''));
  if (isWrite && !(L.write && rank(lvl) >= rank(L.write))) return err('Your access level cannot change this.', 403);
  if (isDel && !(L.del && rank(lvl) >= rank(L.del))) return err('Your access level cannot delete this.', 403);
  if (!isWrite && !isDel && !READ_OPS.test(op)) return err('That request is not allowed.', 403);
  const hides = L.strip && rank(lvl) < rank(L.stripBelow);
  if (hides) {
    // hidden fields can't be used to filter, sort or group either (that would let someone guess them one letter at a time)
    if (SEARCH_PARAMS.some((k) => p.has(k) && L.strip.some((re) => re.test(p.get(k))))) return err('Your access level cannot search on that field.', 403);
    if (L.noWrite && isWrite && ['features', 'adds', 'updates'].some((k) => p.has(k) && L.strip.some((re) => re.test(p.get(k))))) return err('Your access level cannot change that field.', 403);
  }
  if ((L.countsOnly || (L.statsBelow && rank(lvl) < rank(L.statsBelow))) && !isWrite && !isDel) {
    // counts only: by incident, and grouped by triage / status / hospital
    if (op !== 'query') return err('Your access level can only see counts.', 403);
    const w = (p.get('where') || '1=1').trim();
    if (!/^(1\s*=\s*1|incident_key\s*=\s*'[\w-]{1,40}')$/i.test(w)) return err('Your access level can only see counts for one incident.', 403);
    if (p.get('returnCountOnly') !== 'true') {
      let st; try { st = JSON.parse(p.get('outStatistics') || 'null'); } catch (e) { st = null; }
      const grp = (p.get('groupByFieldsForStatistics') || '').split(',').map((x) => x.trim()).filter(Boolean);
      if (!Array.isArray(st) || !st.length || st.some((x) => !x || String(x.statisticType).toLowerCase() !== 'count' || !STAT_FIELDS.includes(x.onStatisticField)) || grp.some((g) => !STAT_FIELDS.includes(g)))
        return err('Your access level can only see counts.', 403);
    }
    ['outFields', 'orderByFields', 'objectIds', 'geometry', 'text', 'having', 'returnDistinctValues', 'relationshipParam'].forEach((k) => p.delete(k));
    p.set('returnGeometry', 'false');
  }
  if (lvl === 'Guest') {
    if (isWrite || isDel) return err('Guests can only view.', 403);
    // guests: the filter is replaced, not added to, so no where clause can widen it
    if (L.guestScope && /query/.test(op)) { p.set('where', L.guestScope + " = '" + String(s.g).replace(/'/g, "''") + "'"); ['objectIds', 'geometry', 'text', 'relationshipParam'].forEach((k) => p.delete(k)); }
    else if (!L.guestScope && op) return err('Guests can only view their incident.', 403);
  }
  if (L.strip && rank(lvl) < rank(L.stripBelow)) {
    // fields this level may not see: never in a filter, sort or statistic (that would reveal them a letter at a time),
    // and answers always come back as JSON so they can be removed (GeoJSON or PBF would carry them through)
    for (const [k, v] of p) if (k !== 'f' && L.strip.some((re) => re.test(v))) return err('That request is not allowed.', 403);
    if (!/attachments\/\d+$/.test(op)) p.set('f', 'json');
  }
  p.set('token', await arcToken(env)); if (!p.get('f')) p.set('f', 'json');
  const target = 'https://' + L.svc + (tail ? '/' + tail : '');
  const isBin = /attachments\/\d+$/.test(op);
  const r = (isWrite || isDel || req.method === 'POST')
    ? await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p })
    : await fetch(target + '?' + p);
  if (isBin) return new Response(r.body, { status: r.status, headers: { 'Content-Type': r.headers.get('Content-Type') || 'application/octet-stream', 'Cache-Control': 'private, max-age=3600', ...CORS } });
  let j = await r.json();
  if (hides) j = stripFields(j, L.strip);
  if (j && typeof j === 'object' && !Array.isArray(j)) { delete j.serviceItemId; } // nothing that helps find the source item
  return json(j, r.status === 200 ? 200 : r.status);
}
function stripFields(j, pats) {
  const bad = (n) => pats.some((re) => re.test(n));
  if (Array.isArray(j.fields)) j.fields = j.fields.filter((f) => !bad(f.name) && !bad(f.alias || ''));
  (j.features || []).forEach((f) => { ['attributes', 'properties'].forEach((g) => Object.keys(f[g] || {}).forEach((k) => { if (bad(k)) delete f[g][k]; })); });
  return j;
}

// ---------- user management: the Users page (Teams tab) and the Users screen in each app ----------
// Admin: everything. The only one who can raise a truck iPad above Officer, set "User manager", or remove a row.
// User manager (a role, not a board level): people and devices up to Command, any agency. Can't touch Chiefs, Admins or User managers.
// Chief: the same, but only their own agency.
// Nobody can change their own access (levels, on/off, role, email) or remove themselves.
const ROLES = ['', 'User manager'];
function rightsOf(me) {
  if (!me || !me.active) return null;
  const admin = rank(me.levels.cb) >= rank('Admin') || rank(me.levels.mci) >= rank('Admin');
  const um = me.role === 'User manager', chief = !admin && !um && (rank(me.levels.cb) >= rank('Chief') || rank(me.levels.mci) >= rank('Chief'));
  if (!admin && !um && !chief) return null;
  return { admin, um, chief, agency: (me.agency || '').trim().toLowerCase(), cap: admin ? 'Admin' : 'Command' };
}
const sameAgency = (R, a) => (a.agency || '').trim().toLowerCase() === R.agency;
function canTouch(R, a) {
  if (R.admin) return true;
  if (rank(topOf(a)) >= rank('Chief') || umOf(a)) return false;
  return R.chief ? sameAgency(R, a) : true;
}
function publicRow(a, R, meUid) {
  const o = {}; ['OBJECTID', 'uid', 'email', 'full_name', 'agency', 'cb_level', 'mci_level', 'active', 'expires', 'notes', 'user_role'].forEach((k) => { o[k] = a[k] == null ? (k === 'user_role' ? '' : null) : a[k]; });
  o.kind = isDev(a) ? 'Device' : 'Person'; o.setup_pending = a.setup_expires > Date.now(); o.setup_expires = o.setup_pending ? a.setup_expires : null;
  o.self = !!meUid && a.uid === meUid; o.locked = !o.self && !canTouch(R, a); return o;
}
function cleanUser(u0, R, old) {
  // on a change, anything the request leaves out keeps its current value
  const u = old ? { ...old, ...Object.fromEntries(Object.entries(u0).filter(([, v]) => v !== undefined)) } : u0;
  const o = {}, str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const kind = old ? (isDev(old) ? 'Device' : 'Person') : (u.kind === 'Device' ? 'Device' : 'Person');
  o.kind = kind;
  o.full_name = str(u.full_name, 150); o.notes = str(u.notes, 500);
  o.agency = R.chief ? (old ? old.agency || '' : R.agencyRaw || '') : str(u.agency, 150);
  o.email = normEmail(u.email);
  if (kind === 'Person' && !okEmail(o.email)) throw new Error('Enter a full email address.');
  if (kind === 'Device') { if (o.email && !okEmail(o.email)) throw new Error('The contact email is not a valid address.'); if (!o.full_name) throw new Error('Give the device a name, like "Engine 51 iPad".'); }
  LEVEL_COLS.forEach((k) => {
    const v = u[k] || 'None'; if (!ORDER.includes(v) || v === 'Guest') throw new Error('Unknown level ' + v + '.');
    if (rank(v) > rank(R.cap) && !(old && (old[k] || 'None') === v)) throw new Error('You can give levels up to ' + R.cap + '.');
    if (kind === 'Device' && rank(v) > rank('Officer') && !R.admin && !(old && old[k] === v)) throw new Error('Only an Admin can set a truck iPad above Officer.');
    o[k] = v;
  });
  o.user_role = R.admin ? (ROLES.includes(u.user_role) ? u.user_role : '') : (old ? old.user_role || '' : '');
  if (kind === 'Device') o.user_role = '';
  o.active = u.active === 'No' ? 'No' : 'Yes';
  o.expires = u.expires ? Number(u.expires) || null : null;
  return o;
}
async function writeLog(env, by, action, target, details) {
  const at = { at: Date.now(), by_uid: by.uid || '', by_name: String(by.name || '').slice(0, 150), action, target_uid: target.uid || '', target_name: String(target.name || target.full_name || target.email || '').slice(0, 150), agency: String(target.agency || '').slice(0, 150), details: String(details || '').slice(0, 500) };
  if (!env.QUIET) console.log(JSON.stringify({ log: at }));
  await arcEdit(env, logUrl(env), 'addFeatures', [{ attributes: at }]);
}
async function managerOf(env, ctx, s) {
  if (s.g) return [null, null];
  const me = await roster(env, ctx, who(s)); const R = rightsOf(me); if (R) R.agencyRaw = me.agency || '';
  return [me, R];
}
async function adminUsers(req, env, ctx, s) {
  const [me, R] = await managerOf(env, ctx, s);
  if (!R) return err('Only Chiefs, User managers and Admins can manage users.', 403);
  const meUid = me.uid || '';
  if (req.method === 'GET') {
    let rows = await usersQuery(env, '1=1');
    if (R.chief) rows = rows.filter((a) => sameAgency(R, a));
    return json({ me: { uid: meUid, email: me.email, name: me.name, agency: me.agency }, rights: { admin: R.admin, userManager: R.um, chief: R.chief, cap: R.cap }, levels: ORDER.filter((l) => l !== 'Guest' && rank(l) <= rank(R.cap)), roles: R.admin ? ROLES : [], users: rows.map((a) => publicRow(a, R, meUid)) });
  }
  if (req.method !== 'POST') return err('Not allowed', 405);
  const b = await req.json(), op = b.op;
  let old = null;
  if (op !== 'add') {
    const id = parseInt(b.id, 10); if (!id) return err('No user.');
    old = (await usersQuery(env, 'OBJECTID = ' + id))[0]; if (!old) return err('That person or device is no longer on the list.', 404);
    const mine = (meUid && old.uid === meUid) || (!s.u && !isDev(old) && normEmail(old.email) === me.email);
    if (!mine && !canTouch(R, old)) return err(R.chief && !sameAgency(R, old) ? 'Chiefs can only manage their own agency.' : 'Only an Admin can change a Chief, an Admin or a User manager.', 403);
  }
  const self = !!(old && meUid && old.uid === meUid) || !!(old && !isDev(old) && !old.uid && normEmail(old.email) === me.email && !s.u);
  const by = { uid: meUid, name: me.name }, label = (a) => ({ uid: a.uid, name: a.full_name || a.email, agency: a.agency });
  let res, logAction = op, details = '', out = {};
  if (op === 'remove') {
    if (!R.admin) return err('Only an Admin can remove. Turn them off instead.', 403);
    if (self) return err('You cannot remove yourself. Ask another Admin.', 403);
    res = await arcEdit(env, usersUrl(env), 'deleteFeatures', old.OBJECTID); logAction = 'removed';
  } else if (op === 'off' || op === 'on') {
    if (self) return err('You cannot turn yourself off or on. Ask another Admin.', 403);
    res = await arcEdit(env, usersUrl(env), 'updateFeatures', [{ attributes: { OBJECTID: old.OBJECTID, active: op === 'off' ? 'No' : 'Yes' } }]);
    logAction = op === 'off' ? 'turned off' : 'turned on';
  } else if (op === 'setup' || op === 'clearsetup') {
    if (old.active === 'No' && op === 'setup') return err('Turn this account on before issuing a setup code.', 400);
    const code = op === 'setup' ? randFrom(SETUP_ABC, 10) : null, expires = Date.now() + SETUP_HOURS * 3600e3;
    const attrs = { OBJECTID: old.OBJECTID, setup_hash: code ? await sha256hex(code) : null, setup_expires: code ? expires : null, setup_used: '' };
    if (!old.uid) attrs.uid = newUid();
    if (old.kind == null) attrs.kind = 'Person';
    res = await arcEdit(env, usersUrl(env), 'updateFeatures', [{ attributes: attrs }]);
    logAction = code ? 'setup code issued' : 'setup code cancelled';
    if (code) out = { code: code.slice(0, 5) + '-' + code.slice(5), expires, qr: 'beacon-setup:' + code };
  } else if (op === 'add' || op === 'update') {
    let u; try { u = cleanUser(b.user || {}, R, old); } catch (e) { return err(e.message, 400); }
    if (self && (LEVEL_COLS.some((k) => u[k] !== (old[k] || 'None')) || u.active !== (old.active === 'No' ? 'No' : 'Yes') || u.email !== normEmail(old.email) || (u.user_role || '') !== (old.user_role || '') || (u.expires || null) !== (old.expires || null)))
      return err('You cannot change your own access. Ask another Admin.', 403);
    if (u.kind === 'Person' && (!old || normEmail(old.email) !== u.email)) {
      const dup = (await usersQuery(env, 'LOWER(email) = ' + q(u.email) + " AND (kind IS NULL OR kind <> 'Device')", 'LOWER(email) = ' + q(u.email))).filter((a) => !isDev(a));
      if (dup.length) return err('That email is already on the list.', 409);
    }
    if (old) {
      if (self && u.agency !== (old.agency || '') && !R.admin) return err('Ask an Admin to change your agency.', 403);
      const changed = Object.keys(u).filter((k) => String(u[k] == null ? '' : u[k]) !== String(old[k] == null ? '' : old[k]));
      details = changed.map((k) => k + ': ' + (old[k] || '–') + ' → ' + (u[k] || '–')).join('; ');
      res = await arcEdit(env, usersUrl(env), 'updateFeatures', [{ attributes: { OBJECTID: old.OBJECTID, ...u } }]);
      logAction = 'changed';
    } else {
      u.uid = newUid();
      res = await arcEdit(env, usersUrl(env), 'addFeatures', [{ attributes: u }]);
      details = [u.kind, 'CB ' + u.cb_level, 'MCI ' + u.mci_level, u.user_role].filter(Boolean).join(', ');
      logAction = 'added';
    }
    old = old || u;
  } else return err('Unknown request.');
  await forget({ uid: old.uid, email: old.email });
  if (b.user && b.user.email) await forget({ email: b.user.email });
  let logged = true; try { await writeLog(env, by, logAction, label(old.full_name ? old : { ...old, full_name: (b.user || {}).full_name }), details); } catch (e) { logged = false; }
  return json({ ok: true, id: res.objectId || old.OBJECTID, logged, ...out });
}
async function adminLog(req, env, ctx, s, url) {
  const [me, R] = await managerOf(env, ctx, s);
  if (!R) return err('Only Chiefs, User managers and Admins can see the change log.', 403);
  const n = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 200));
  const where = R.chief ? '(by_uid = ' + q(me.uid || '-') + ' OR LOWER(agency) = ' + q(R.agency) + ')' : '1=1';
  const p = new URLSearchParams({ f: 'json', where, outFields: 'at,by_name,action,target_name,agency,details', orderByFields: 'at DESC', resultRecordCount: String(n), token: await arcToken(env) });
  const r = await fetch(logUrl(env) + '/query?' + p).then((x) => x.json());
  if (r.error) return json({ entries: [], note: 'The change log table is not set up yet. Run EM Ops → Setup → App Access.' });
  return json({ entries: (r.features || []).map((f) => f.attributes) });
}
