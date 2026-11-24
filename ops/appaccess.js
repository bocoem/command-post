/* EM OPS — App access: who may sign in to the Command Board and MCI Board apps (iPhone / iPad), and at what level.
   People and truck iPads sign in with a one-time setup code (or its QR), not with ArcGIS logins. The BEACON gate
   (a Cloudflare Worker that holds the county's ArcGIS key) checks every sign-in and every request against this list.
   Day to day, users are managed on the gate's Users page (the Teams tab) or inside the apps. This page is the break-glass:
   it works with Daniel's ArcGIS sign-in even if every Admin has lost their device, and can issue an Admin setup code.
   - BEACON_App_Access (owner only, never shared): APP_Users (layer 0) and APP_UserLog (layer 1, the change log).
   - Setup → "Command Board & MCI apps" lists what the gate's ArcGIS key needs access to. */
(function (CP) {
  'use strict';
  var OPS = CP.ops, A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon;
  var AX = OPS.appaccess = {};
  var NAME = 'BEACON_App_Access', TABLE = 'APP_Users';
  var LEVELS = ['None', 'Viewer', 'Officer', 'Command', 'Chief', 'Admin'];
  var GATE = 'https://beacon-gate.dmurray-5fa.workers.dev';
  var LEVEL_HELP = { None: 'No access to this app', Viewer: 'Read only: board, map, whiteboard', Officer: 'Full board view, update their own unit, acknowledge assignments', Command: 'Start and run boards, transfer command, close, export, incident codes for mutual aid', Chief: 'Everything Command can do, plus manage users up to Command inside the app (More → Users)', Admin: 'Everything, including managing Chiefs and Admins inside the app' };
  function P(path) { return A.portal + '/sharing/rest' + path; }
  function svcBase() { return (A.L && A.L.cad ? A.L.cad.replace(/CAD%20Calls.*$/, '') : 'https://services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/'); }
  var FIELDS = [['email', 'String', 200, 'Email'], ['full_name', 'String', 150, 'Name'], ['agency', 'String', 150, 'Agency'], ['cb_level', 'String', 20, 'Command Board level'], ['mci_level', 'String', 20, 'MCI Board level'],
    ['active', 'String', 5, 'Active'], ['expires', 'Date', 0, 'Access ends'], ['notes', 'String', 500, 'Notes']];
  // added Nov 2026 for setup codes and truck iPads (AX.upgrade adds them to an older table)
  var NEW_FIELDS = [['uid', 'String', 16, 'User ID'], ['kind', 'String', 10, 'Person or device'], ['user_role', 'String', 30, 'Role'], ['setup_hash', 'String', 64, 'Setup code (hash)'], ['setup_expires', 'Date', 0, 'Setup code good until'], ['setup_used', 'String', 50, 'Setup code used in']];
  var LOG_TABLE = 'APP_UserLog', LOG_FIELDS = [['at', 'Date', 0, 'When'], ['by_uid', 'String', 16, 'By (ID)'], ['by_name', 'String', 150, 'By'], ['action', 'String', 40, 'What'], ['target_uid', 'String', 16, 'About (ID)'], ['target_name', 'String', 150, 'About'], ['agency', 'String', 150, 'Agency'], ['details', 'String', 500, 'Details']];
  function fieldDef(f) {
    var d = { name: f[0], type: 'esriFieldType' + f[1], alias: f[3], nullable: true, editable: true }; if (f[1] === 'String') d.length = f[2];
    if (/_level$/.test(f[0])) d.domain = { type: 'codedValue', name: 'APP_' + f[0], codedValues: LEVELS.map(function (l) { return { name: l, code: l }; }) };
    if (f[0] === 'active') d.domain = { type: 'codedValue', name: 'APP_active', codedValues: [{ name: 'Yes', code: 'Yes' }, { name: 'No', code: 'No' }] };
    if (f[0] === 'kind') d.domain = { type: 'codedValue', name: 'APP_kind', codedValues: [{ name: 'Person', code: 'Person' }, { name: 'Device (truck iPad)', code: 'Device' }] };
    if (f[0] === 'user_role') d.domain = { type: 'codedValue', name: 'APP_role', codedValues: [{ name: 'User manager', code: 'User manager' }] };
    return d;
  }
  var ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', UABC = 'abcdefghjkmnpqrstuvwxyz23456789';
  function rand(abc, n) { var o = '', b = crypto.getRandomValues(new Uint8Array(n * 3)); for (var i = 0; o.length < n && i < b.length; i++) if (b[i] < 248) o += abc[b[i] % abc.length]; return o; }
  async function sha256hex(t) { var h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return Array.prototype.map.call(new Uint8Array(h), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }

  // ---------- the service ----------
  AX.find = async function () {
    if (AX.svc) return AX.svc;
    try { var j = await A.req(svcBase() + NAME + '/FeatureServer', { _: Date.now() }); var t = (j.tables || []).find(function (x) { return x.name === TABLE; }), lg = (j.tables || []).find(function (x) { return x.name === LOG_TABLE; }); if (t) return (AX.svc = { url: svcBase() + NAME + '/FeatureServer', table: svcBase() + NAME + '/FeatureServer/' + t.id, log: lg ? svcBase() + NAME + '/FeatureServer/' + lg.id : '', itemId: j.serviceItemId }); } catch (e) {}
    return null;
  };
  AX.ensureLevels = async function () {
    if (AX.lvOk) return; AX.lvOk = true;
    try {
      var s = await AX.find(); if (!s) return;
      var t = await A.req(s.table, { _: Date.now() }), f = (t.fields || []).find(function (x) { return x.name === 'cb_level'; });
      var have = f && f.domain && (f.domain.codedValues || []).map(function (c) { return c.code; }) || [];
      if (have.indexOf('Chief') >= 0) return;
      var admin = s.table.replace('/rest/services/', '/rest/admin/services/');
      await A.req(admin + '/updateDefinition', { updateDefinition: { fields: ['cb_level', 'mci_level'].map(function (n) { return { name: n, domain: { type: 'codedValue', name: 'APP_' + n, codedValues: LEVELS.map(function (l) { return { name: l, code: l }; }) } }; }) } }, true);
    } catch (e) { AX.lvOk = false; }
  };
  AX.create = async function (log) {
    var u = A.user.username;
    log('Creating ' + NAME + ' (owner only)…');
    var cp = { name: NAME, serviceDescription: 'Who may sign in to the BEACON Command Board and MCI Board apps. Read by the BEACON gate. Do not share.', hasStaticData: false, maxRecordCount: 2000, supportedQueryFormats: 'JSON', capabilities: 'Create,Delete,Query,Update,Editing',
      spatialReference: { wkid: 4326 }, xssPreventionInfo: { xssPreventionEnabled: true, xssPreventionRule: 'InputOnly', xssInputRule: 'rejectInvalid' }, editorTrackingInfo: { enableEditorTracking: true, enableOwnershipAccessControl: false, allowOthersToUpdate: false, allowOthersToDelete: false } };
    var r = await A.req(P('/content/users/' + u + '/createService'), { createParameters: cp, outputType: 'featureService', tags: 'BEACON,Command Board,MCI,Access', snippet: 'Command Board and MCI Board app access list (BEACON gate). Owner only.' }, true);
    if (!r.success) throw new Error('Could not create the service');
    var admin = r.encodedServiceURL.replace('/rest/services/', '/rest/admin/services/');
    var base = [{ name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'OBJECTID', nullable: false, editable: false }, { name: 'GlobalID', type: 'esriFieldTypeGlobalID', alias: 'GlobalID', length: 38, nullable: false, editable: false },
      { name: 'CreationDate', type: 'esriFieldTypeDate', alias: 'Added', nullable: true, editable: false }, { name: 'Creator', type: 'esriFieldTypeString', alias: 'Added by', length: 128, nullable: true, editable: false }, { name: 'EditDate', type: 'esriFieldTypeDate', alias: 'Changed', nullable: true, editable: false }, { name: 'Editor', type: 'esriFieldTypeString', alias: 'Changed by', length: 128, nullable: true, editable: false }];
    var t = { id: 0, name: TABLE, type: 'Table', displayField: 'email', description: 'App users: one row per email.', objectIdField: 'OBJECTID', globalIdField: 'GlobalID', fields: base.concat(FIELDS.concat(NEW_FIELDS).map(fieldDef)), capabilities: 'Create,Delete,Query,Update,Editing',
      editFieldsInfo: { creationDateField: 'CreationDate', creatorField: 'Creator', editDateField: 'EditDate', editorField: 'Editor' } };
    var a = await A.req(admin + '/addToDefinition', { addToDefinition: { tables: [t, logTableDef(base)] } }, true);
    if (!a.success) throw new Error('Could not add the users table');
    await A.req(P('/content/users/' + u + '/items/' + r.itemId + '/protect'), {}, true).catch(function () {});
    AX.svc = { url: r.encodedServiceURL.replace(/\/$/, ''), table: r.encodedServiceURL.replace(/\/$/, '') + '/0', log: r.encodedServiceURL.replace(/\/$/, '') + '/1', itemId: r.itemId };
    log('Adding you as Admin…');
    await A.add(AX.svc.table, [{ attributes: { uid: rand(UABC, 12), kind: 'Person', email: (A.user.email || '').toLowerCase(), full_name: A.user.name || u, agency: 'Botetourt County Emergency Management', cb_level: 'Admin', mci_level: 'Admin', active: 'Yes', notes: 'Added by setup' } }]);
    log('Done.');
    return AX.svc;
  };

  function logTableDef(base) {
    return { id: 1, name: LOG_TABLE, type: 'Table', displayField: 'action', description: 'Who added, changed, turned off or set up whom. Written by the BEACON gate.', objectIdField: 'OBJECTID', globalIdField: 'GlobalID', fields: base.slice(0, 2).concat(LOG_FIELDS.map(fieldDef)), capabilities: 'Create,Query' };
  }
  // ---------- upgrade an older list for setup codes, truck iPads and the change log (safe to run again) ----------
  AX.missing = async function () {
    var s = await AX.find(); if (!s) return null;
    var t = await A.req(s.table, { _: Date.now() }), have = (t.fields || []).map(function (f) { return f.name; });
    return { fields: NEW_FIELDS.filter(function (f) { return have.indexOf(f[0]) < 0; }), log: !s.log };
  };
  AX.upgrade = async function (log) {
    var s = await AX.find(), m = await AX.missing(), admin = s.url.replace('/rest/services/', '/rest/admin/services/');
    if (m.fields.length) { log('Adding fields: ' + m.fields.map(function (f) { return f[0]; }).join(', ') + '…'); var a = await A.req(admin + '/0/addToDefinition', { addToDefinition: { fields: m.fields.map(fieldDef) } }, true); if (!a.success) throw new Error('ArcGIS did not add the fields'); }
    if (m.log) { log('Adding the change log table (APP_UserLog)…'); var b = await A.req(admin + '/addToDefinition', { addToDefinition: { tables: [logTableDef([{ name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'OBJECTID', nullable: false, editable: false }, { name: 'GlobalID', type: 'esriFieldTypeGlobalID', alias: 'GlobalID', length: 38, nullable: false, editable: false }])] } }, true); if (!b.success) throw new Error('ArcGIS did not add the log table'); AX.svc = null; s = await AX.find(); }
    var rows = (await A.query(s.table, "uid IS NULL OR uid = '' OR kind IS NULL", { n: 5000 })).map(function (x) { return x.attributes; });
    if (rows.length) { log('Giving ' + rows.length + ' existing row(s) an ID…'); await A.update(s.table, rows.map(function (r) { return { attributes: { OBJECTID: r.OBJECTID, uid: r.uid || rand(UABC, 12), kind: r.kind || 'Person' } }; })); }
    log('Done. The gate now accepts setup codes, truck iPads and logs changes.');
  };

  // ---------- what the gate's key needs (Setup panel) ----------
  async function itemFor(title, type) {
    var r = await A.req(P('/search'), { q: 'title:"' + title + '" AND type:"' + (type || 'Feature Service') + '" AND orgid:' + A.user.orgId, num: 20 });
    return (r.results || []).find(function (x) { return x.title === title; }) || null;
  }
  AX.gateNeeds = async function () {
    var out = [], add = function (k, label, it, use) { out.push({ k: k, label: label, title: it ? it.title : '', id: it ? it.id : '', url: it ? String(it.url || '').replace(/\/$/, '') : '', owner: it ? it.owner : '', use: use }); };
    var s = await AX.find(); add('users', 'App access list', s ? { title: NAME, id: s.itemId, url: s.url, owner: A.user.username } : null, 'Read: who may sign in');
    add('cp', 'Command Post incidents', A.own ? { title: 'BOCO_Command_Post', id: A.own.id || '', url: A.own.url, owner: '' } : await itemFor('BOCO_Command_Post'), 'Read and edit: the boards');
    var r = await A.req(P('/search'), { q: '(title:"CAD" AND title:"Fire") AND orgid:' + A.user.orgId + ' AND type:"Feature Service"', num: 30 });
    var cad = (r.results || []).filter(function (x) { return /fire/i.test(x.title) && /cad/i.test(x.title) && !/closed/i.test(x.title); });
    var calls = cad.find(function (x) { return /call/i.test(x.title) && /active/i.test(x.title); }) || cad.find(function (x) { return /call/i.test(x.title); }), units = cad.find(function (x) { return /unit/i.test(x.title); });
    add('cadCalls', 'CAD calls (Fire & EMS view)', calls, 'Read: active fire and EMS calls');
    add('cadUnits', 'CAD units (Fire & EMS view)', units, 'Read: fire and EMS units');
    add('hydrants', 'Hydrants', await itemFor('Hydrants'), 'Read');
    add('ppTac', 'Preplans (Tactical)', await itemFor('BOCO_Preplans_Tactical'), 'Read: approved preplans');
    add('ppProt', 'Preplans (Protected)', await itemFor('BOCO_Preplans_Protected'), 'Read: Command only');
    add('patients', 'EMS Patient Care (MCI Board, later)', await itemFor('BOCO_EMS_PatientCare'), 'Read and edit (MCI app)');
    return out;
  };
  AX.panel = function () {
    var g = OPS.load('appaccess:needs', AX.gateNeeds, 600000);
    var h = '<div class="card"><h3>' + I('shield') + 'Command Board & MCI apps<span class="x"><a href="#appaccess" data-act="go" data-a="appaccess" class="btn xs">Manage app access</a></span></h3>' +
      '<p class="dim" style="margin-top:0">The iPhone/iPad apps sign people in by email (no ArcGIS login). The BEACON gate holds one county ArcGIS key. Give that key (ArcGIS → Content → New item → Developer credentials → API key credentials) <b>item access to exactly these items and nothing else</b>. The Sheriff\'s Office CAD layers are not on this list on purpose.</p>';
    if (OPS.bad(g)) return h + OPS.wait(g, 'items') + '</div>';
    h += '<table class="t" style="font-size:13px"><thead><tr><th>For</th><th>Item</th><th>Item ID</th><th>Use</th></tr></thead><tbody>' + g.map(function (x) { return '<tr><td>' + E(x.label) + '</td><td>' + (x.id ? '<a href="' + A.portal + '/home/item.html?id=' + E(x.id) + '" target="_blank" rel="noopener">' + E(x.title) + '</a>' : '<span class="warn-t">not found</span>') + '</td><td class="mono">' + E(x.id) + '</td><td class="dim">' + E(x.use) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<div class="row" style="margin-top:8px"><button class="btn sm" data-act="axCopy">' + I('copy') + 'Copy gate settings</button></div><div id="axOut" class="mono dim" style="font-size:11.5px;white-space:pre-wrap;margin-top:6px"></div></div>';
    return h;
  };
  OPS.act.axCopy = function () {
    var g = OPS.st.cache['appaccess:needs'] && OPS.st.cache['appaccess:needs'].data; if (!Array.isArray(g)) return;
    var o = {}; g.forEach(function (x) { if (x.url) o[x.k] = x.url.replace(/^https:\/\//, ''); });
    var t = JSON.stringify(o, null, 1), el = document.getElementById('axOut'); if (el) el.textContent = t;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { U.toast('Copied', 'ok'); }, function () {});
  };

  // ---------- the list ----------
  function rows() { return OPS.load('appaccess:rows', async function () { var s = await AX.find(); if (!s) return { _none: 1 }; AX.ensureLevels(); var f = await A.query(s.table, '1=1', { order: 'full_name', n: 5000 }); return f.map(function (x) { return x.attributes; }); }); }
  OPS.tool('appaccess', {
    n: 'App access', sub: 'Command Board & MCI apps', icon: 'shield', d: 'Who can sign in to the Command Board and MCI Board iPhone/iPad apps, and at what level. People sign in with their email; no ArcGIS login needed.',
    render: function () {
      var d = rows(), u = OPS.st.ui;
      var h = '<div class="phead"><div><h1 class="pg">App access</h1><p class="pgsub" style="margin:0">Command Board and MCI Board apps (iPhone / iPad). People and truck iPads on this list sign in with a one-time setup code. Day to day, manage users on the <a href="' + GATE + '/users" target="_blank" rel="noopener">BEACON Users page</a> (the Teams tab) or in the apps; this page is the break-glass. Changes reach the apps within about 2 minutes.</p></div><div class="acts">' + (Array.isArray(d) ? '<button class="btn pri" data-act="axEdit" data-a="">' + I('plus') + 'Add person</button>' : '') + '</div></div>';
      if (d && d._none) return h + '<div class="card" style="max-width:720px"><h3>' + I('build') + 'Set up the app access list</h3><p>Creates <b>' + NAME + '</b> in ArcGIS: one table, owner only, never shared, protected from deletion, with you as Admin.</p><div id="axLog" class="mono dim" style="font-size:12.5px;white-space:pre-wrap"></div><button class="btn pri" data-act="axCreate">' + I('play') + 'Create the list</button></div>';
      if (OPS.bad(d)) return h + OPS.wait(d, 'app access list');
      var mm = OPS.load('appaccess:missing', AX.missing, 300000);
      if (mm && !OPS.bad(mm) && (mm.fields.length || mm.log)) h += '<div class="card" style="border-color:var(--gold)"><h3>' + I('build') + 'Upgrade for setup codes and truck iPads</h3><p style="margin-top:0">Adds ' + (mm.fields.length ? mm.fields.length + ' field(s) to APP_Users' : '') + (mm.fields.length && mm.log ? ' and ' : '') + (mm.log ? 'the change log table' : '') + ', and gives every existing row an ID. Nothing is removed and the apps keep working. Run this before deploying the new gate.</p><div id="axLog" class="mono dim" style="font-size:12.5px;white-space:pre-wrap"></div><button class="btn pri" data-act="axUpgrade">' + I('play') + 'Upgrade the list</button></div>';
      h += '<div class="card"><h3>' + I('users') + 'Users page for Teams</h3><p style="margin-top:0">In the BEACON Team, add a tab: <b>+ → Website</b>, name it <b>BEACON Users</b>, address <span class="mono">' + E(GATE) + '/users</span>. Chiefs, User managers and Admins sign in there with a setup code. Teams may open it in the browser; it works the same.</p></div>';
      var q = (u.q_ax || '').toLowerCase(), list = d.filter(function (r) { return !q || [r.email, r.full_name, r.agency].join(' ').toLowerCase().indexOf(q) >= 0; });
      var now = Date.now(), on = function (r) { return r.active !== 'No' && !(r.expires && r.expires < now); };
      h += '<div class="grid g4" style="margin-bottom:12px">' + OPS.stat(d.filter(on).length, 'Active') + OPS.stat(d.filter(function (r) { return on(r) && /Command|Chief|Admin/.test(r.cb_level); }).length, 'Command Board: Command+', 'gold') + OPS.stat(d.filter(function (r) { return on(r) && r.mci_level && r.mci_level !== 'None'; }).length, 'MCI Board') + OPS.stat(d.filter(function (r) { return !on(r); }).length, 'Off / expired') + '</div>';
      h += '<div class="toolbar">' + OPS.searchBox('ax', 'Search name, email, agency') + '</div>';
      h += '<table class="t"><thead><tr><th>Name</th><th>Type</th><th>Email</th><th>Agency</th><th>Command Board</th><th>MCI Board</th><th>Status</th><th></th></tr></thead><tbody>' + list.map(function (r) {
        return '<tr class="' + (on(r) ? '' : 'row-warn') + '"><td><b>' + E(r.full_name || '') + '</b>' + (r.user_role ? ' <span class="dim">· ' + E(r.user_role) + '</span>' : '') + '</td><td>' + (r.kind === 'Device' ? 'Truck iPad' : 'Person') + '</td><td class="mono" style="font-size:12.5px">' + E(r.email || '') + '</td><td>' + E(r.agency || '') + '</td><td>' + E(r.cb_level || 'None') + '</td><td>' + E(r.mci_level || 'None') + '</td><td>' + (on(r) ? (r.expires ? 'Until ' + E(OPS.dt(r.expires)) : 'Active') : '<span class="warn-t">' + (r.active === 'No' ? 'Off' : 'Expired') + '</span>') + '</td><td><button class="btn xs" data-act="axEdit" data-a="' + r.OBJECTID + '">Edit</button> <button class="btn xs" data-act="axCode" data-a="' + r.OBJECTID + '">Setup code</button></td></tr>';
      }).join('') + '</tbody></table>' + (list.length ? '' : '<div class="empty">Nobody matches.</div>');
      h += '<div class="card" style="margin-top:14px"><h3>' + I('info') + 'Levels</h3><p class="dim" style="margin-top:0;font-size:13px">Truck iPads default to Officer; only an Admin raises one (for example EMS supervisor trucks to MCI Command). <b>User manager</b> is a role, not a level: it lets someone add people and iPads, issue setup codes and turn them off on the Users page, up to Command, for any agency. Chiefs can do the same for their own agency.</p><table class="t" style="font-size:13px"><tbody>' + LEVELS.map(function (l) { return '<tr><td><b>' + l + '</b></td><td>' + E(LEVEL_HELP[l]) + '</td></tr>'; }).join('') + '</tbody></table><p class="dim" style="font-size:13px">Mutual aid without an account: the IC gives an incident code from the app (More → Incident code). It is view-only, for that incident, until it closes.</p></div>';
      return h;
    }
  });
  OPS.act.axUpgrade = async function () {
    var el = document.getElementById('axLog'), log = function (t) { if (el) el.textContent += t + '\n'; };
    try { await AX.upgrade(log); OPS.bust('appaccess'); OPS.repaint(); U.toast('Upgraded', 'ok'); } catch (e) { log('Stopped: ' + e.message); U.toast(E(e.message), 'err', 6000); }
  };
  // break-glass: issue a setup code straight into the table with this ArcGIS sign-in (the gate checks the same hash)
  OPS.act.axCode = async function (oid) {
    var d = OPS.arr(rows()), r = d.find(function (x) { return x.OBJECTID === +oid; }); if (!r) return;
    var m = await AX.missing(); if (m && m.fields.length) { U.toast('Upgrade the list first (button at the top).', 'err', 6000); return; }
    if (r.active === 'No') { U.toast('Turn this account on first.', 'err'); return; }
    var code = rand(ABC, 10), exp = Date.now() + 24 * 3600e3, s = await AX.find();
    try { await A.update(s.table, [{ attributes: { OBJECTID: r.OBJECTID, uid: r.uid || rand(UABC, 12), kind: r.kind || 'Person', setup_hash: await sha256hex(code), setup_expires: exp, setup_used: '' } }]);
      if (s.log) A.add(s.log, [{ attributes: { at: Date.now(), by_uid: '', by_name: (A.user.name || A.user.username) + ' (EM Ops)', action: 'setup code issued', target_uid: r.uid || '', target_name: r.full_name || r.email, agency: r.agency || '', details: 'break-glass from EM Ops' } }]).catch(function () {});
    } catch (e) { U.toast(E(e.message), 'err', 6000); return; }
    var shown = code.slice(0, 5) + '-' + code.slice(5), img = ''; try { var q = window.qrcode(0, 'M'); q.addData('beacon-setup:' + code); q.make(); img = q.createImgTag(6, 8); } catch (e2) {}
    OPS.bust('appaccess');
    U.modal('Setup code for ' + E(r.full_name || r.email), '<div style="text-align:center"><div style="font:800 40px/1.1 \'Barlow Condensed\',monospace;letter-spacing:.06em;color:var(--gold)">' + E(shown) + '</div><div style="margin:10px auto;background:#fff;display:inline-block;padding:6px;border-radius:8px">' + img + '</div><p class="dim">Good for 24 hours, once in each app and once on the Users page. Issuing a new code cancels this one.</p></div>', [{ label: 'Done', cls: 'pri' }]);
  };
  OPS.act.axCreate = async function () {
    var el = document.getElementById('axLog'), log = function (t) { if (el) el.textContent += t + '\n'; };
    try { await AX.create(log); OPS.bust('appaccess'); OPS.repaint(); U.toast('App access list created', 'ok'); } catch (e) { log('Stopped: ' + e.message); U.toast(E(e.message), 'err', 6000); }
  };
  OPS.act.axEdit = function (oid) {
    var d = OPS.arr(rows()), r = oid ? d.find(function (x) { return x.OBJECTID === +oid; }) : null, x = r || { cb_level: 'Viewer', mci_level: 'None', active: 'Yes' };
    var sel = function (id, v) { return '<select class="in" id="' + id + '">' + LEVELS.map(function (l) { return '<option' + (l === (v || 'None') ? ' selected' : '') + '>' + l + '</option>'; }).join('') + '</select>'; };
    var exp = x.expires ? new Date(x.expires).toISOString().slice(0, 10) : '';
    U.modal(r ? 'Edit ' + (r.full_name || r.email) : 'Add person',
      '<label class="f"><span>Email (what they sign in with)</span><input class="in" id="axE" type="email" autocapitalize="off" value="' + E(x.email || '') + '"></label><div class="grid g2"><label class="f"><span>Name</span><input class="in" id="axN" value="' + E(x.full_name || '') + '"></label><label class="f"><span>Agency</span><input class="in" id="axA" value="' + E(x.agency || '') + '"></label></div>' +
      '<div class="grid g2"><label class="f"><span>Command Board</span>' + sel('axCB', x.cb_level) + '</label><label class="f"><span>MCI Board</span>' + sel('axMCI', x.mci_level) + '</label></div>' +
      '<div class="grid g2"><label class="f"><span>Active</span><select class="in" id="axOn"><option' + (x.active !== 'No' ? ' selected' : '') + '>Yes</option><option' + (x.active === 'No' ? ' selected' : '') + '>No</option></select></label><label class="f"><span>Access ends (optional)</span><input class="in" id="axX" type="date" value="' + exp + '"></label></div>' +
      '<label class="f"><span>Notes</span><input class="in" id="axNo" value="' + E(x.notes || '') + '"></label>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: r ? 'Save' : 'Add', cls: 'pri', fn: async function (b) {
        var v = function (id) { return (b.querySelector('#' + id).value || '').trim(); }, em = v('axE').toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(em)) { U.toast('Enter a full email address', 'err'); return false; }
        if (!r && d.some(function (y) { return (y.email || '').toLowerCase() === em; })) { U.toast('That email is already on the list', 'err'); return false; }
        var at = { email: em, full_name: v('axN'), agency: v('axA'), cb_level: v('axCB'), mci_level: v('axMCI'), active: v('axOn'), expires: v('axX') ? new Date(v('axX') + 'T23:59:00').getTime() : null, notes: v('axNo') };
        var mc = OPS.st.cache['appaccess:missing'] && OPS.st.cache['appaccess:missing'].data; if (!r && mc && mc.fields && !mc.fields.length) { at.uid = rand(UABC, 12); at.kind = 'Person'; }
        try { var s = await AX.find(); if (r) { at.OBJECTID = r.OBJECTID; await A.update(s.table, [{ attributes: at }]); } else await A.add(s.table, [{ attributes: at }]); OPS.bust('appaccess'); OPS.repaint(); U.toast('Saved. The apps pick it up within about 2 minutes.', 'ok'); }
        catch (e) { U.toast(E(e.message), 'err'); return false; }
      } }], { nofocus: true });
  };
})(window.CP);
