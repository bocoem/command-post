// Tests for the MCI Board rules in the gate:  node gate/test-mci.mjs
import W from './worker.js';
const store = new Map();
globalThis.caches = { default: { match: async k => store.get(k.url)?.clone(), put: async (k, v) => { store.set(k.url, v); }, delete: async k => store.delete(k.url) } };
const rows = [
  { OBJECTID: 1, email: 'admin@x.gov', full_name: 'Admin', cb_level: 'Admin', mci_level: 'Admin', active: 'Yes' },
  { OBJECTID: 2, email: 'cmd@x.gov', full_name: 'Cmd', cb_level: 'None', mci_level: 'Command', active: 'Yes' },
  { OBJECTID: 3, email: 'off@x.gov', full_name: 'Off', cb_level: 'None', mci_level: 'Officer', active: 'Yes' },
  { OBJECTID: 4, email: 'view@x.gov', full_name: 'View', cb_level: 'None', mci_level: 'Viewer', active: 'Yes' }];
let last = null;
globalThis.fetch = async (u, o = {}) => {
  u = String(u); const R = j => new Response(JSON.stringify(j));
  if (u.includes('oauth2/token')) return R({ access_token: 'T', expires_in: 7200 });
  const body = o.body ? new URLSearchParams(String(o.body)) : new URL(u).searchParams;
  if (u.includes('BEACON_App_Access')) { const m = body.get('where').match(/LOWER\(email\) = '([^']*)'/); return R({ features: rows.filter(r => m && r.email === m[1]).map(a => ({ attributes: a })) }); }
  last = { url: u.split('?')[0], p: body };
  if (u.includes('/query')) return R({ fields: [{ name: 'tag_no' }, { name: 'first_name' }, { name: 'last_name' }], features: [{ attributes: { OBJECTID: 9, tag_no: '12', first_name: 'Ann', last_name: 'Lee', triage: 'Immediate (Red)' } }] });
  return R({ addResults: [{ success: true, objectId: 5 }], updateResults: [{ success: true, objectId: 9 }] });
};
const env = { ARC_CLIENT_ID: 'x', ARC_CLIENT_SECRET: 'secret-secret-secret-123', MAIL_FLOW_URL: 'https://mail' };
const ctx = { waitUntil() {} };
const enc = new TextEncoder(); const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function tok(e, a = 'mci') { const k = await crypto.subtle.importKey('raw', enc.encode('beacon-gate.' + env.ARC_CLIENT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); const body = b64u(enc.encode(JSON.stringify({ e, n: e, a, exp: Date.now() + 1e6 }))); return body + '.' + b64u(await crypto.subtle.sign('HMAC', k, enc.encode('tok.' + body))); }
const S = 'services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/';
const call = async (path, t, params, method = 'GET') => {
  const u = 'https://g' + path + (method === 'GET' && params ? '?' + new URLSearchParams(params) : '');
  const r = await W.fetch(new Request(u, { method, headers: { Authorization: 'Bearer ' + t }, body: method === 'POST' ? new URLSearchParams(params) : undefined }), env, ctx);
  return [r.status, await r.json()];
};
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const A = await tok('admin@x.gov'), C = await tok('cmd@x.gov'), O = await tok('off@x.gov'), V = await tok('view@x.gov');
const PT = '/arc/' + S + 'BOCO_EMS_PatientCare/FeatureServer/0';
let r;
r = await call('/me', O); ok(r[0] === 200 && r[1].level === 'Officer', 'Officer /me');
const pl = r[1].layers.find(l => /PatientCare/.test(l.url)); ok(pl && pl.write && pl.hidden.length === 2 && !pl.counts, 'Officer: patients writable, names hidden');
ok(!r[1].layers.find(l => /BOCO_EM_Protected/.test(l.url)), 'Officer does not get Reunification');
r = await call('/me', V); ok(r[1].layers.find(l => /PatientCare/.test(l.url)).counts === true, 'Viewer: counts only');
r = await call('/me', C); ok(r[1].layers.find(l => /BOCO_EM_Protected/.test(l.url)).only === '^addFeatures$', 'Command: Reunification add-only');
r = await call(PT + '/query', O, { where: "incident_key='X'", outFields: '*' }); ok(r[0] === 200 && !('first_name' in r[1].features[0].attributes) && !r[1].fields.some(f => /name/.test(f.name)), 'Officer reads patients without names');
r = await call(PT + '/query', C, { where: "incident_key='X'", outFields: '*' }); ok(r[0] === 200 && r[1].features[0].attributes.last_name === 'Lee', 'Command sees names');
r = await call(PT + '/query', O, { where: "last_name LIKE 'L%'" }); ok(r[0] === 403, 'Officer cannot filter on last_name');
r = await call(PT + '/query', O, { where: '1=1', orderByFields: 'first_name' }); ok(r[0] === 403, 'Officer cannot sort on first_name');
r = await call(PT + '/addFeatures', O, { features: JSON.stringify([{ attributes: { tag_no: '1', last_name: 'X' } }]) }, 'POST'); ok(r[0] === 403, 'Officer cannot write names');
r = await call(PT + '/addFeatures', O, { features: JSON.stringify([{ attributes: { tag_no: '1', triage: 'Minor (Green)' } }]) }, 'POST'); ok(r[0] === 200, 'Officer can triage');
r = await call(PT + '/deleteFeatures', A, { objectIds: '9' }, 'POST'); ok(r[0] === 403, 'Nobody deletes patients (Admin refused)');
r = await call(PT + '/applyEdits', A, { deletes: '[9]' }, 'POST'); ok(r[0] === 403, 'applyEdits deletes refused too');
r = await call(PT + '/updateFeatures', V, { features: '[]' }, 'POST'); ok(r[0] === 403, 'Viewer cannot edit');
r = await call(PT + '/query', V, { where: '1=1', outFields: '*' }); ok(r[0] === 403, 'Viewer cannot read rows');
r = await call(PT + '/query', V, { where: "incident_key='MCI-1'", returnCountOnly: 'true' }); ok(r[0] === 200, 'Viewer count ok');
r = await call(PT + '/query', V, { where: "incident_key='MCI-1' AND last_name='Lee'", returnCountOnly: 'true' }); ok(r[0] === 403, 'Viewer cannot count by name');
r = await call(PT + '/query', V, { where: "incident_key='MCI-1'", outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'n' }]), groupByFieldsForStatistics: 'triage,status' }); ok(r[0] === 200 && last.p.get('returnGeometry') === 'false' && !last.p.has('outFields'), 'Viewer grouped counts ok');
r = await call(PT + '/query', V, { where: '1=1', outStatistics: JSON.stringify([{ statisticType: 'max', onStatisticField: 'injuries', outStatisticFieldName: 'n' }]) }); ok(r[0] === 403, 'Viewer cannot max() a text field');
r = await call('/arc/' + S + 'BOCO_EMS_PatientCare/FeatureServer/3/query', C, { where: '1=1' }); ok(r[0] === 403, 'Other layers in the patient service refused');
r = await call('/arc/' + S + 'BOCO_EMS_PatientCare/FeatureServer', C, {}); ok(r[0] === 403, 'Patient service summary refused');
r = await call('/arc/' + S + 'BOCO_EM_Operations/FeatureServer/15/query', V, { where: '1=1' }); ok(r[0] === 200, 'Viewer reads hospital board');
r = await call('/arc/' + S + 'BOCO_EM_Operations/FeatureServer/15/updateFeatures', O, { features: '[]' }, 'POST'); ok(r[0] === 200, 'Officer updates hospital board');
r = await call('/arc/' + S + 'BOCO_EM_Operations/FeatureServer/3/query', C, { where: '1=1' }); ok(r[0] === 403, 'Other EM Ops layers refused');
r = await call('/arc/' + S + 'BOCO_EM_Protected/FeatureServer/2/query', A, { where: '1=1' }); ok(r[0] === 403, 'Reunification cannot be read, even by Admin');
r = await call('/arc/' + S + 'BOCO_EM_Protected/FeatureServer/2/addFeatures', O, { features: '[]' }, 'POST'); ok(r[0] === 403, 'Officer cannot send to Reunification');
r = await call('/arc/' + S + 'BOCO_EM_Protected/FeatureServer/2/addFeatures', C, { features: '[]' }, 'POST'); ok(r[0] === 200, 'Command can send to Reunification');
r = await call('/arc/' + S + 'BOCO_EM_Protected/FeatureServer/0/addFeatures', C, { features: '[]' }, 'POST'); ok(r[0] === 403, 'AFN registry refused');
r = await call('/arc/' + S + 'CAD_Calls_For_Service_Active_Fire_EMS/FeatureServer/0/query', A, { where: '1=1' }); ok(r[0] === 403, 'CAD calls not in the MCI app');
r = await call('/arc/' + S + 'CAD_Units_Fire_EMS/FeatureServer/0/query', O, { where: '1=1' }); ok(r[0] === 200, 'Officer reads CAD units');
r = await W.fetch(new Request('https://g/auth/guest', { method: 'POST', body: JSON.stringify({ app: 'mci', code: 'GABCDEFG', name: 'x' }) }), env, ctx); ok(r.status === 403, 'No guests in the MCI app');
// Command Board unchanged
const CB = await tok('admin@x.gov', 'cb');

r = await call('/me', CB); ok(r[1].layers.find(l => /PatientCare/.test(l.url)).counts === true, 'Command Board app: patient layer is counts only');
r = await call('/arc/' + S + 'BOCO_EMS_PatientCare/FeatureServer/0/query', CB, { where: "incident_key='abc123'", outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'n' }]), groupByFieldsForStatistics: 'triage,status' }); ok(r[0] === 200, 'Command Board live MCI count works');
r = await call('/arc/' + S + 'BOCO_EMS_PatientCare/FeatureServer/0/query', CB, { where: '1=1', outFields: '*' }); ok(r[0] === 403, 'Command Board (even Admin) cannot read patient rows');
