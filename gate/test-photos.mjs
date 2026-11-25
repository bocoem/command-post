// Scene photos (attachments on the incident row) and app error reports.
import W from './worker.js';
const store = new Map();
globalThis.caches = { default: { match: async (k) => store.get(k.url)?.clone(), put: async (k, v) => { store.set(k.url, v); }, delete: async (k) => store.delete(k.url) } };
let LEVEL = 'Officer'; const seen = []; const log = [];
const CPSVC = 'services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/BOCO_Command_Post/FeatureServer';
globalThis.fetch = async (u, o = {}) => {
  u = String(u); const R = (j) => new Response(JSON.stringify(j));
  if (u.includes('oauth2/token')) return R({ access_token: 'T', expires_in: 7200 });
  if (u.includes('BEACON_App_Access')) {
    if (/\/1\/addFeatures/.test(u)) { log.push(JSON.parse(new URLSearchParams(String(o.body)).get('features'))[0].attributes); return R({ addResults: [{ success: true }] }); }
    return R({ features: [{ attributes: { email: 'ff@x.gov', full_name: 'FF', cb_level: LEVEL, mci_level: 'None', active: 'Yes' } }] });
  }
  seen.push({ u, body: o.body });
  if (u.endsWith('/addAttachment')) {
    const fd = o.body; const f = fd.get('attachment');
    return R({ addAttachmentResult: { objectId: 7, success: true, name: f.name, size: f.size, token: fd.get('token') } });
  }
  if (u.endsWith('/0/query')) { // guestOwns: row 5 belongs to incident inc1, row 6 to another
    const b = new URLSearchParams(String(o.body)); const oid = b.get('objectIds'); const mine = /'inc1'/.test(b.get('where'));
    return R({ count: mine && oid === '5' ? 1 : 0 });
  }
  if (/\/attachments\/\d+$/.test(u.split('?')[0])) return new Response('JPEGDATA', { headers: { 'Content-Type': 'image/jpeg' } });
  return R({ attachmentGroups: [], u });
};
const env = { ARC_CLIENT_ID: 'x', ARC_CLIENT_SECRET: 'secret-secret-secret-123', QUIET: 1, SERVICES: JSON.stringify({ cp: CPSVC, users: 'services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/BEACON_App_Access/FeatureServer' }) };
const ctx = { waitUntil(p) { if (p && p.catch) p.catch(() => {}); } };
const enc = new TextEncoder(), b64u = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function tok(payload) { const k = await crypto.subtle.importKey('raw', enc.encode('beacon-gate.' + env.ARC_CLIENT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); const body = b64u(enc.encode(JSON.stringify({ a: 'cb', exp: Date.now() + 1e6, ...payload }))); return body + '.' + b64u(await crypto.subtle.sign('HMAC', k, enc.encode('tok.' + body))); }
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const T = await tok({ e: 'ff@x.gov', n: 'FF' }), G = await tok({ e: 'guest:Capt X', n: 'Capt X (guest)', g: 'inc1', exp: Date.now() + 1e6 });
const photo = (type = 'image/jpeg', size = 1000) => { const fd = new FormData(); fd.append('attachment', new Blob([new Uint8Array(size)], { type }), 'scene 1.jpg'); fd.append('f', 'json'); return fd; };
const up = async (t, fd, path = '/0/5/addAttachment') => { const r = await W.fetch(new Request('https://g/arc/' + CPSVC + path, { method: 'POST', headers: { Authorization: 'Bearer ' + t }, body: fd }), env, ctx); return [r.status, await r.json().catch(() => ({}))]; };
const get = async (t, path, method = 'GET') => { const r = await W.fetch(new Request('https://g/arc/' + CPSVC + path, { method, headers: { Authorization: 'Bearer ' + t } }), env, ctx); return [r.status, await r.text()]; };

let r = await up(T, photo()); ok(r[0] === 200 && r[1].addAttachmentResult && r[1].addAttachmentResult.success, 'Officer adds a scene photo to the incident row');
ok(r[1].addAttachmentResult.token === 'T' && /^scene_1\.jpg$/.test(r[1].addAttachmentResult.name), 'Gate adds its own key and cleans the file name');
r = await up(T, photo('text/html')); ok(r[0] === 415, 'Only images are accepted');
r = await up(T, photo('image/jpeg', 9 * 1024 * 1024)); ok(r[0] === 413, 'Photos over 8 MB are refused');
LEVEL = 'Viewer'; store.clear(); r = await up(T, photo()); ok(r[0] === 403, 'Viewer cannot add photos'); LEVEL = 'Officer'; store.clear();
r = await up(G, photo()); ok(r[0] === 403, 'Guest cannot add photos');
r = await get(G, '/0/5/attachments/7'); ok(r[0] === 200 && r[1] === 'JPEGDATA', 'Guest sees a photo on their own incident');
r = await get(G, '/0/6/attachments/7'); ok(r[0] === 403, 'Guest cannot open a photo on another incident');
r = await get(G, '/0/attachments/7'); ok(r[0] === 403, 'Guest cannot use a short attachment path');
seen.length = 0; r = await get(G, '/0/queryAttachments?objectIds=6&where=1%3D1');
const qa = seen.find((x) => /queryAttachments/.test(x.u)); const qs = qa ? new URL(qa.u).searchParams : null;
ok(r[0] === 200 && qs && /incident_key = 'inc1'/.test(qs.get('definitionExpression')) && !qs.get('objectIds') && !qs.get('where'), 'Guest attachment list is limited to their incident');
r = await get(T, '/0/6/attachments/7'); ok(r[0] === 200, 'Officer can open any incident photo');

// error reports
const rep = async (t, b) => { const x = await W.fetch(new Request('https://g/report', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }), env, ctx); return [x.status, await x.json()]; };
r = await rep(T, { msg: 'TypeError: x is undefined', where: 'cb.js:120', ver: 'b5' }); await new Promise((z) => setTimeout(z, 20));
ok(r[0] === 200 && log.length === 1 && log[0].action === 'App error' && /Command Board b5 · Officer · TypeError/.test(log[0].details), 'App error goes to the change log');
r = await rep(T, { msg: '' }); ok(r[0] === 400, 'Empty report refused');
for (let i = 0; i < 25; i++) await rep(T, { msg: 'boom ' + i }); await new Promise((z) => setTimeout(z, 20));
ok(log.length === 20, 'At most 20 error reports per person per hour (' + log.length + ')');
r = await W.fetch(new Request('https://g/report', { method: 'POST', body: '{}' }), env, ctx); ok(r.status === 401, 'Reports need a sign-in');
