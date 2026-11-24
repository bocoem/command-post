// Setup codes, truck iPads, roles, agency limits and the change log.  node gate/test-setup.mjs
import W from './worker.js';
import { fakeArc, ctx, ok } from './fake-arc.mjs';
const st = fakeArc([
  { OBJECTID: 1, uid: 'adminuid0001', kind: 'Person', email: 'dmurray@botetourtva.gov', full_name: 'Daniel', agency: 'Emergency Management', cb_level: 'Admin', mci_level: 'Admin', active: 'Yes' },
  { OBJECTID: 2, uid: 'chiefuid0002', kind: 'Person', email: 'chief5@x.gov', full_name: 'Chief Five', agency: 'Station 5', cb_level: 'Chief', mci_level: 'None', active: 'Yes' },
  { OBJECTID: 3, uid: 'umuid0000003', kind: 'Person', email: 'um@x.gov', full_name: 'Uma Manager', agency: 'Emergency Management', cb_level: 'Viewer', mci_level: 'None', user_role: 'User manager', active: 'Yes' },
  { OBJECTID: 4, uid: 'ffuid0000004', kind: 'Person', email: 'ff@x.gov', full_name: 'FF Seven', agency: 'Station 7', cb_level: 'Officer', mci_level: 'None', active: 'Yes' },
  { OBJECTID: 5, kind: null, email: 'legacy@x.gov', full_name: 'Legacy Person', agency: 'Station 5', cb_level: 'Command', mci_level: 'None', active: 'Yes' }
]);
const env = { ARC_CLIENT_ID: 'x', ARC_CLIENT_SECRET: 'secret-secret-secret-123', QUIET: '1' };
const call = async (path, tok, body, e = env) => { const r = await W.fetch(new Request('https://g' + path, { method: body ? 'POST' : 'GET', headers: { ...(tok ? { Authorization: 'Bearer ' + tok } : {}), 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' }, body: body ? JSON.stringify(body) : undefined }), e, ctx); const t = await r.text(); let j; try { j = JSON.parse(t); } catch (x) { j = t; } return [r.status, j]; };
const enc = new TextEncoder(), b64u = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function tok(o) { const k = await crypto.subtle.importKey('raw', enc.encode('beacon-gate.' + env.ARC_CLIENT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); const body = b64u(enc.encode(JSON.stringify({ a: 'admin', exp: Date.now() + 1e6, ...o }))); return body + '.' + b64u(await crypto.subtle.sign('HMAC', k, enc.encode('tok.' + body))); }
const A = await tok({ u: 'adminuid0001', e: 'dmurray@botetourtva.gov' }), C = await tok({ u: 'chiefuid0002', e: 'chief5@x.gov' }), M = await tok({ u: 'umuid0000003', e: 'um@x.gov' }), F = await tok({ u: 'ffuid0000004', e: 'ff@x.gov', a: 'cb' });
let r;

// --- email sign-in is off without MAIL_FLOW_URL
r = await call('/auth/start', null, { email: 'ff@x.gov' }); ok(r[0] === 410, 'Email sign-in refused when MAIL_FLOW_URL is not set');

// --- who can manage
r = await call('/admin/users', F); ok(r[0] === 403, 'Officer cannot open Users');
r = await call('/admin/users', M); ok(r[0] === 200 && r[1].rights.userManager && r[1].users.length === 5, 'User manager (a Viewer on the boards) sees everyone');
ok(!r[1].users.some((u) => 'setup_hash' in u), 'Setup hashes never leave the gate');
r = await call('/admin/users', C); ok(r[0] === 200 && r[1].users.every((u) => u.agency === 'Station 5'), 'Chief sees only own agency');

// --- truck iPads
r = await call('/admin/users', M, { op: 'add', user: { kind: 'Device', full_name: 'Engine 51 iPad', email: 'trucks@botetourtva.gov', agency: 'Station 5', cb_level: 'Officer', mci_level: 'Officer' } });
const e51 = st.rows.find((x) => x.full_name === 'Engine 51 iPad'); ok(r[0] === 200 && e51 && e51.kind === 'Device' && e51.uid, 'User manager adds a truck iPad');
r = await call('/admin/users', M, { op: 'add', user: { kind: 'Device', full_name: 'Engine 71 iPad', email: 'trucks@botetourtva.gov', agency: 'Station 7', cb_level: 'Officer', mci_level: 'None' } });
ok(r[0] === 200, 'A second iPad can share the same email');
r = await call('/admin/users', M, { op: 'add', user: { kind: 'Device', full_name: 'EMS Sup 1 iPad', email: 'trucks@botetourtva.gov', cb_level: 'Officer', mci_level: 'Command' } });
ok(r[0] === 400 && /Admin/.test(r[1].error.message), 'Only an Admin can put a truck iPad above Officer');
r = await call('/admin/users', A, { op: 'add', user: { kind: 'Device', full_name: 'EMS Sup 1 iPad', email: 'trucks@botetourtva.gov', agency: 'EMS', cb_level: 'Officer', mci_level: 'Command' } });
const sup = st.rows.find((x) => x.full_name === 'EMS Sup 1 iPad'); ok(r[0] === 200 && sup.mci_level === 'Command', 'Admin sets the EMS supervisor iPad to MCI Command');
r = await call('/admin/users', M, { op: 'update', id: sup.OBJECTID, user: { full_name: 'EMS Sup 1 iPad', email: 'trucks@botetourtva.gov', agency: 'EMS', cb_level: 'Officer', mci_level: 'Command', notes: 'mounted' } });
ok(r[0] === 200, 'A User manager can still edit notes on it without lowering it');
r = await call('/admin/users', M, { op: 'add', user: { kind: 'Person', full_name: 'Dup', email: 'ff@x.gov', cb_level: 'Viewer' } });
ok(r[0] === 409, 'People still need a unique email');

// --- setup codes
r = await call('/admin/users', M, { op: 'setup', id: e51.OBJECTID }); const code = r[1].code;
ok(r[0] === 200 && /^[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(code) && r[1].qr === 'beacon-setup:' + code.replace('-', ''), 'Setup code issued (XXXXX-XXXXX, QR payload)');
ok(st.rows.find((x) => x.OBJECTID === e51.OBJECTID).setup_hash.length === 64, 'Only a hash of the code is stored');
r = await call('/auth/setup', null, { code: 'WRONG-CODE0', app: 'cb' }); ok(r[0] === 401, 'Wrong code refused');
r = await call('/auth/setup', null, { code: code.toLowerCase(), app: 'cb', device: 'ipad-1' }); const T1 = r[1].token;
ok(r[0] === 200 && r[1].kind === 'Device' && r[1].level === 'Officer' && r[1].exp > Date.now() + 3000 * 864e5, 'Truck iPad signs in, Officer, session lasts ~10 years');
r = await call('/auth/setup', null, { code, app: 'cb' }); ok(r[0] === 401, 'Same code cannot be used twice in the same app');
r = await call('/auth/setup', null, { code: 'beacon-setup:' + code.replace('-', ''), app: 'mci' }); ok(r[0] === 200 && r[1].level === 'Officer', 'Same code (scanned QR) sets up the MCI app once');
r = await call('/me', T1); ok(r[0] === 200 && r[1].kind === 'Device' && r[1].exp > Date.now() + 3000 * 864e5, '/me keeps a device signed in');
r = await call('/admin/users', M, { op: 'off', id: e51.OBJECTID }); await caches.default.delete(new Request('https://gate.cache/roster/u/' + e51.uid));
r = await call('/me', T1); ok(r[0] === 403, 'Turning the iPad off ends its session');
const e71 = st.rows.find((x) => x.full_name === 'Engine 71 iPad');
r = await call('/admin/users', M, { op: 'setup', id: e71.OBJECTID }); r = await call('/auth/setup', null, { code: r[1].code, app: 'cb' }); ok(r[0] === 200, 'Other iPad on the same email still works');
r = await call('/admin/users', M, { op: 'setup', id: e51.OBJECTID }); ok(r[0] === 400, 'No setup code for an account that is off');

// --- legacy rows and people
r = await call('/admin/users', C, { op: 'setup', id: 5 }); ok(r[0] === 200 && st.rows.find((x) => x.OBJECTID === 5).uid, 'Older row gets a uid when its first setup code is issued');
r = await call('/auth/setup', null, { code: r[1].code, app: 'cb' }); ok(r[0] === 200 && r[1].kind === 'Person' && r[1].level === 'Command' && r[1].exp < Date.now() + 31 * 864e5, 'Person signs in with a setup code, 30-day session');
r = await call('/admin/users', C, { op: 'setup', id: 4 }); ok(r[0] === 403 && /own agency/.test(r[1].error.message), 'Chief cannot touch another agency');
r = await call('/admin/users', C, { op: 'add', user: { kind: 'Person', full_name: 'New Five', email: 'new5@x.gov', agency: 'Station 9', cb_level: 'Officer' } });
ok(r[0] === 200 && st.rows.find((x) => x.email === 'new5@x.gov').agency === 'Station 5', 'Chief adds into own agency only');
r = await call('/admin/users', C, { op: 'remove', id: 5 }); ok(r[0] === 403, 'Only an Admin can remove');
r = await call('/admin/users', M, { op: 'update', id: 2, user: { full_name: 'Chief Five', email: 'chief5@x.gov', cb_level: 'Viewer' } }); ok(r[0] === 403, 'User manager cannot change a Chief');
r = await call('/admin/users', M, { op: 'update', id: 4, user: { full_name: 'FF Seven', email: 'ff@x.gov', cb_level: 'Officer', user_role: 'User manager' } });
ok(r[0] === 200 && !st.rows.find((x) => x.OBJECTID === 4).user_role, 'Only an Admin can make a User manager');
ok(st.rows.find((x) => x.OBJECTID === 4).agency === 'Station 7', 'Fields a change leaves out keep their values');
r = await call('/admin/users', M, { op: 'off', id: 3 }); ok(r[0] === 403, 'User manager cannot turn themselves (or another User manager) off');
r = await call('/admin/users', A, { op: 'update', id: 1, user: { full_name: 'Daniel', email: 'dmurray@botetourtva.gov', cb_level: 'Viewer', mci_level: 'Admin' } }); ok(r[0] === 403, 'Admin cannot lower own level');
r = await call('/admin/users', A, { op: 'remove', id: 1 }); ok(r[0] === 403, 'Admin cannot remove self');
r = await call('/admin/users', A, { op: 'remove', id: 5 }); ok(r[0] === 200 && !st.rows.find((x) => x.OBJECTID === 5), 'Admin removes');

// --- Users page sign-in and the log
r = await call('/admin/users', A, { op: 'setup', id: 3 }); r = await call('/auth/setup', null, { code: r[1].code, app: 'admin' }); ok(r[0] === 200 && r[1].level === 'Chief', 'User manager signs in to the Users page');
r = await call('/admin/users', A, { op: 'setup', id: 4 }); r = await call('/auth/setup', null, { code: r[1].code, app: 'admin' }); ok(r[0] === 403, 'An Officer cannot sign in to the Users page');
const Ptok = (await call('/admin/users', A, { op: 'setup', id: 3 }))[1].code; const pt = (await call('/auth/setup', null, { code: Ptok, app: 'admin' }))[1].token;
r = await call('/arc/' + 'services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/BOCO_Command_Post/FeatureServer/0/query', pt); ok(r[0] === 403, 'A Users-page session cannot reach ArcGIS layers');
r = await call('/admin/log', A); ok(r[0] === 200 && r[1].entries.some((x) => x.action === 'added' && x.target_name === 'Engine 51 iPad' && x.by_name === 'Uma Manager') && r[1].entries.some((x) => x.action === 'turned off') && r[1].entries.some((x) => x.action === 'signed in'), 'Change log records adds, turn-offs and sign-ins');
r = await call('/users', null); ok(r[0] === 200 && /BEACON Users/.test(r[1]) && /qrcode/.test(r[1]), 'Users page is served by the gate with the QR maker built in');
r = await call('/arc/services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/BEACON_App_Access/FeatureServer/0/query', F); ok(r[0] === 403, 'Users table still not reachable through /arc');

// --- older table (before EM Ops adds the new fields): email sign-in still works
const st2 = fakeArc([{ OBJECTID: 1, email: 'old@x.gov', full_name: 'Old', cb_level: 'Officer', mci_level: 'None', active: 'Yes' }], { noKind: true, noLog: true });
r = await call('/auth/start', null, { email: 'old@x.gov', app: 'cb' }, { ...env, MAIL_FLOW_URL: 'https://mail' }); ok(r[0] === 200 && st2.mails.length === 1, 'Before the table upgrade, email sign-in still works');
