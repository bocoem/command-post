// The Users screen with older email sessions (no uid yet), as used by Command Board builds 2 and 3.  node gate/test-users.mjs
import W from './worker.js';
import { fakeArc, ctx, ok } from './fake-arc.mjs';
const st = fakeArc([
  { OBJECTID: 1, email: 'dmurray@botetourtva.gov', full_name: 'Daniel', agency: 'EM', cb_level: 'Admin', mci_level: 'Admin', active: 'Yes' },
  { OBJECTID: 2, email: 'chief@x.gov', full_name: 'Chief', agency: 'Station 1', cb_level: 'Chief', mci_level: 'None', active: 'Yes' },
  { OBJECTID: 3, email: 'capt@x.gov', full_name: 'Capt', agency: 'Station 1', cb_level: 'Command', mci_level: 'None', active: 'Yes' },
  { OBJECTID: 4, email: 'ff@x.gov', full_name: 'FF', agency: 'Station 1', cb_level: 'Viewer', mci_level: 'None', active: 'Yes' }]);
const env = { ARC_CLIENT_ID: 'x', ARC_CLIENT_SECRET: 'secret-secret-secret-123', MAIL_FLOW_URL: 'https://mail', QUIET: '1' };
const call = async (path, tok, method = 'GET', body) => { const r = await W.fetch(new Request('https://g' + path, { method, headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env, ctx); return [r.status, await r.json()]; };
const enc = new TextEncoder(); const b64u = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function tok(e) { const k = await crypto.subtle.importKey('raw', enc.encode('beacon-gate.' + env.ARC_CLIENT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); const body = b64u(enc.encode(JSON.stringify({ e, n: e, a: 'cb', exp: Date.now() + 1e6 }))); return body + '.' + b64u(await crypto.subtle.sign('HMAC', k, enc.encode('tok.' + body))); }
const A = await tok('dmurray@botetourtva.gov'), C = await tok('chief@x.gov'), K = await tok('capt@x.gov');
let r;
r = await call('/admin/users', K); ok(r[0] === 403, 'Command cannot list users');
r = await call('/admin/users', C); ok(r[0] === 200 && r[1].rights.cap === 'Command' && r[1].users.find((u) => u.OBJECTID === 2).locked && !r[1].users.find((u) => u.OBJECTID === 3).locked, 'Chief lists own agency; Chief rows locked, Command row editable');
ok(JSON.stringify(r[1].levels) === '["None","Viewer","Officer","Command"]', 'Chief can grant up to Command');
r = await call('/admin/users', C, 'POST', { op: 'add', user: { email: 'New@X.gov', full_name: 'New', cb_level: 'Chief' } }); ok(r[0] === 400, 'Chief cannot grant Chief');
r = await call('/admin/users', C, 'POST', { op: 'add', user: { email: 'New@X.gov', full_name: 'New', cb_level: 'Officer' } }); ok(r[0] === 200 && st.rows.find((x) => x.email === 'new@x.gov'), 'Chief adds Officer (email lowercased)');
r = await call('/admin/users', C, 'POST', { op: 'add', user: { email: 'new@x.gov', full_name: 'Again', cb_level: 'Viewer' } }); ok(r[0] === 409, 'Duplicate email refused');
r = await call('/admin/users', C, 'POST', { op: 'update', id: 1, user: { email: 'dmurray@botetourtva.gov', cb_level: 'None' } }); ok(r[0] === 403, 'Chief cannot touch Admin');
r = await call('/admin/users', C, 'POST', { op: 'update', id: 2, user: { email: 'chief@x.gov', cb_level: 'Chief', full_name: 'Chief Renamed' } }); ok(r[0] === 200, 'Chief can fix own name');
r = await call('/admin/users', C, 'POST', { op: 'update', id: 2, user: { cb_level: 'Admin' } }); ok(r[0] === 400 || r[0] === 403, 'Chief cannot raise own level');
r = await call('/admin/users', A, 'POST', { op: 'update', id: 1, user: { email: 'dmurray@botetourtva.gov', cb_level: 'Viewer', mci_level: 'Admin' } }); ok(r[0] === 403, 'Admin cannot demote self (email session)');
r = await call('/admin/users', A, 'POST', { op: 'update', id: 1, user: { full_name: 'Daniel Murray' } }); ok(r[0] === 200 && st.rows[0].full_name === 'Daniel Murray', 'Admin can rename self');
r = await call('/admin/users', A, 'POST', { op: 'remove', id: 1 }); ok(r[0] === 403, 'Admin cannot remove self');
r = await call('/admin/users', C, 'POST', { op: 'remove', id: 4 }); ok(r[0] === 403, 'Chief turns off instead of removing');
r = await call('/admin/users', C, 'POST', { op: 'off', id: 4 }); ok(r[0] === 200 && st.rows.find((x) => x.OBJECTID === 4).active === 'No', 'Chief turns a Viewer off');
r = await call('/admin/users', A, 'POST', { op: 'remove', id: 3 }); ok(r[0] === 200 && !st.rows.find((x) => x.OBJECTID === 3), 'Admin removes Command');
r = await call('/admin/users', A, 'POST', { op: 'add', user: { email: 'bad', full_name: 'Bad', cb_level: 'Viewer' } }); ok(r[0] === 400, 'Bad email refused');
r = await call('/arc/services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/BEACON_App_Access/FeatureServer/0/query', A); ok(r[0] === 403, 'Users table still not reachable through /arc');
