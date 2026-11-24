/* EM OPS — App access: who may sign in to the Command Board and MCI Board apps (iPhone / iPad), and at what level.
   The apps sign people in by email (a 6-digit code), not with ArcGIS logins. The BEACON gate (a Cloudflare Worker that
   holds the county's ArcGIS key) checks every sign-in and every request against this list.
   - BEACON_App_Access (owner only, never shared): one table, APP_Users. Edit it here, or in ArcGIS Online → the item → Data.
   - Setup → "Command Board & MCI apps" lists what the gate's ArcGIS key needs access to. */
(function (CP) {
  'use strict';
  var OPS = CP.ops, A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon;
  var AX = OPS.appaccess = {};
  var NAME = 'BEACON_App_Access', TABLE = 'APP_Users';
  var LEVELS = ['None', 'Viewer', 'Officer', 'Command', 'Chief', 'Admin'];
  var LEVEL_HELP = { None: 'No access to this app', Viewer: 'Read only: board, map, whiteboard', Officer: 'Full board view, update their own unit, acknowledge assignments', Command: 'Start and run boards, transfer command, close, export, incident codes for mutual aid', Chief: 'Everything Command can do, plus manage users up to Command inside the app (More → Users)', Admin: 'Everything, including managing Chiefs and Admins inside the app' };
  function P(path) { return A.portal + '/sharing/rest' + path; }
  function svcBase() { return (A.L && A.L.cad ? A.L.cad.replace(/CAD%20Calls.*$/, '') : 'https://services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/'); }
  var FIELDS = [['email', 'String', 200, 'Email'], ['full_name', 'String', 150, 'Name'], ['agency', 'String', 150, 'Agency'], ['cb_level', 'String', 20, 'Command Board level'], ['mci_level', 'String', 20, 'MCI Board level'],
    ['active', 'String', 5, 'Active'], ['expires', 'Date', 0, 'Access ends'], ['notes', 'String', 500, 'Notes']];
  function fieldDef(f) {
    var d = { name: f[0], type: 'esriFieldType' + f[1], alias: f[3], nullable: true, editable: true }; if (f[1] === 'String') d.length = f[2];
    if (/_level$/.test(f[0])) d.domain = { type: 'codedValue', name: 'APP_' + f[0], codedValues: LEVELS.map(function (l) { return { name: l, code: l }; }) };
    if (f[0] === 'active') d.domain = { type: 'codedValue', name: 'APP_active', codedValues: [{ name: 'Yes', code: 'Yes' }, { name: 'No', code: 'No' }] };
    return d;
  }

  // ---------- the service ----------
  AX.find = async function () {
    if (AX.svc) return AX.svc;
    try { var j = await A.req(svcBase() + NAME + '/FeatureServer', { _: Date.now() }); var t = (j.tables || []).find(function (x) { return x.name === TABLE; }); if (t) return (AX.svc = { url: svcBase() + NAME + '/FeatureServer', table: svcBase() + NAME + '/FeatureServer/' + t.id, itemId: j.serviceItemId }); } catch (e) {}
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
    var t = { id: 0, name: TABLE, type: 'Table', displayField: 'email', description: 'App users: one row per email.', objectIdField: 'OBJECTID', globalIdField: 'GlobalID', fields: base.concat(FIELDS.map(fieldDef)), capabilities: 'Create,Delete,Query,Update,Editing',
      editFieldsInfo: { creationDateField: 'CreationDate', creatorField: 'Creator', editDateField: 'EditDate', editorField: 'Editor' } };
    var a = await A.req(admin + '/addToDefinition', { addToDefinition: { tables: [t] } }, true);
    if (!a.success) throw new Error('Could not add the users table');
    await A.req(P('/content/users/' + u + '/items/' + r.itemId + '/protect'), {}, true).catch(function () {});
    AX.svc = { url: r.encodedServiceURL.replace(/\/$/, ''), table: r.encodedServiceURL.replace(/\/$/, '') + '/0', itemId: r.itemId };
    log('Adding you as Admin…');
    await A.add(AX.svc.table, [{ attributes: { email: (A.user.email || '').toLowerCase(), full_name: A.user.name || u, agency: 'Botetourt County Emergency Management', cb_level: 'Admin', mci_level: 'Admin', active: 'Yes', notes: 'Added by setup' } }]);
    log('Done.');
    return AX.svc;
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
    add('patients', 'EMS Patient Care (MCI Board)', await itemFor('BOCO_EMS_PatientCare'), 'MCI app: patients (layer 0). Names for Command and up only; nothing deleted');
    add('ops', 'EM Operations (MCI hospital board)', await itemFor('BOCO_EM_Operations'), 'MCI app: hospital board only (layer 15)');
    add('prot', 'EM Protected (Reunification hand-off)', await itemFor('BOCO_EM_Protected'), 'MCI app: add a found person to Reunification only (layer 2); cannot read it');
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
      var h = '<div class="phead"><div><h1 class="pg">App access</h1><p class="pgsub" style="margin:0">Command Board and MCI Board apps (iPhone / iPad). People on this list sign in with their email and a 6-digit code. Changes reach the apps within about 2 minutes; removing someone or turning off Active locks them out.</p></div><div class="acts">' + (Array.isArray(d) ? '<button class="btn pri" data-act="axEdit" data-a="">' + I('plus') + 'Add person</button>' : '') + '</div></div>';
      if (d && d._none) return h + '<div class="card" style="max-width:720px"><h3>' + I('build') + 'Set up the app access list</h3><p>Creates <b>' + NAME + '</b> in ArcGIS: one table, owner only, never shared, protected from deletion, with you as Admin.</p><div id="axLog" class="mono dim" style="font-size:12.5px;white-space:pre-wrap"></div><button class="btn pri" data-act="axCreate">' + I('play') + 'Create the list</button></div>';
      if (OPS.bad(d)) return h + OPS.wait(d, 'app access list');
      var q = (u.q_ax || '').toLowerCase(), list = d.filter(function (r) { return !q || [r.email, r.full_name, r.agency].join(' ').toLowerCase().indexOf(q) >= 0; });
      var now = Date.now(), on = function (r) { return r.active !== 'No' && !(r.expires && r.expires < now); };
      h += '<div class="grid g4" style="margin-bottom:12px">' + OPS.stat(d.filter(on).length, 'Active') + OPS.stat(d.filter(function (r) { return on(r) && /Command|Chief|Admin/.test(r.cb_level); }).length, 'Command Board: Command+', 'gold') + OPS.stat(d.filter(function (r) { return on(r) && r.mci_level && r.mci_level !== 'None'; }).length, 'MCI Board') + OPS.stat(d.filter(function (r) { return !on(r); }).length, 'Off / expired') + '</div>';
      h += '<div class="toolbar">' + OPS.searchBox('ax', 'Search name, email, agency') + '</div>';
      h += '<table class="t"><thead><tr><th>Name</th><th>Email</th><th>Agency</th><th>Command Board</th><th>MCI Board</th><th>Status</th><th></th></tr></thead><tbody>' + list.map(function (r) {
        return '<tr class="' + (on(r) ? '' : 'row-warn') + '"><td><b>' + E(r.full_name || '') + '</b></td><td class="mono" style="font-size:12.5px">' + E(r.email || '') + '</td><td>' + E(r.agency || '') + '</td><td>' + E(r.cb_level || 'None') + '</td><td>' + E(r.mci_level || 'None') + '</td><td>' + (on(r) ? (r.expires ? 'Until ' + E(OPS.dt(r.expires)) : 'Active') : '<span class="warn-t">' + (r.active === 'No' ? 'Off' : 'Expired') + '</span>') + '</td><td><button class="btn xs" data-act="axEdit" data-a="' + r.OBJECTID + '">Edit</button></td></tr>';
      }).join('') + '</tbody></table>' + (list.length ? '' : '<div class="empty">Nobody matches.</div>');
      h += '<div class="card" style="margin-top:14px"><h3>' + I('info') + 'Levels</h3><table class="t" style="font-size:13px"><tbody>' + LEVELS.map(function (l) { return '<tr><td><b>' + l + '</b></td><td>' + E(LEVEL_HELP[l]) + '</td></tr>'; }).join('') + '</tbody></table><p class="dim" style="font-size:13px">Mutual aid without an account: the IC gives an incident code from the app (More → Incident code). It is view-only, for that incident, until it closes.</p></div>';
      return h;
    }
  });
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
        try { var s = await AX.find(); if (r) { at.OBJECTID = r.OBJECTID; await A.update(s.table, [{ attributes: at }]); } else await A.add(s.table, [{ attributes: at }]); OPS.bust('appaccess'); OPS.repaint(); U.toast('Saved. The apps pick it up within about 2 minutes.', 'ok'); }
        catch (e) { U.toast(E(e.message), 'err'); return false; }
      } }], { nofocus: true });
  };
})(window.CP);
