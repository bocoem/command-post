/* EM OPS — Resources: county inventory (NIMS typed), ICS 213RR requests in the Command Post incident, deployments */
(function (CP) {
  'use strict';
  var OPS = CP.ops, A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon, K = OPS.LISTS;
  var R = OPS.res = {};

  // ---------- links to the Command Post incident record ----------
  R.cpDoc = function (key) { return OPS.load('cpdoc:' + key, function () { return A.loadRemote(key); }, 30000); };
  // put an inventory item on an incident: adds it to Command Post Resources and marks inventory Assigned
  R.assign = async function (res, incKey, o) {
    o = o || {}; var incName = '';
    var cpId = await OPS.cpEdit(incKey, function (inc) {
      incName = inc.name;
      var ex = CP.alive(inc.resources).find(function (r) { return r.invOid === res.OBJECTID && ['Released', 'Demobilized'].indexOf(r.status) < 0; });
      if (ex) { ex.status = o.status || ex.status; ex.u = CP.now(); return ex.id; }
      var row = CP.addItem(inc, 'resources', { name: res.res_id ? res.res_id + ' ' + res.name : res.name, kind: res.kind || res.category || '', type: res.type_level || '', agency: res.owner || '', leader: o.leader || '', persons: res.persons || '', contact: [res.contact, res.phone].filter(Boolean).join(' '),
        orderNo: o.orderNo || '', checkinLoc: o.loc || '', status: o.status || 'Assigned', assign: '', checkin: /Ordered|En Route/.test(o.status || '') ? '' : CP.now(), ordered: /Ordered|En Route/.test(o.status || '') ? CP.now() : '', location: o.loc || '', notes: 'County inventory' + (res.fema_code ? ' · FEMA ' + res.fema_code : ''), invOid: res.OBJECTID, rate: res.rate_hr || '' });
      return row.id;
    }, (res.res_id || res.name) + ' (' + (res.kind || res.category || 'resource') + ', ' + (res.owner || 'county') + ') ' + (o.status === 'Ordered' ? 'ordered' : 'assigned') + ' from county inventory' + (o.orderNo ? ' for ' + o.orderNo : ''));
    await OPS.upd('resources', res.OBJECTID, { status: 'Assigned', incident_key: incKey, incident_name: incName, cp_res_id: cpId, assignment: o.assignment || null, status_time: Date.now() });
    OPS.bust('cpdoc'); return cpId;
  };
  R.release = async function (res, why) {
    if (res.incident_key && res.cp_res_id) {
      await OPS.cpEdit(res.incident_key, function (inc) { var r = CP.byId(inc.resources, res.cp_res_id); if (r && ['Released', 'Demobilized'].indexOf(r.status) < 0) { r.status = 'Released'; r.released = CP.now(); r.u = CP.now(); CP.touch(inc, 'resources'); } }, (res.res_id || res.name) + ' released back to county inventory' + (why ? ' (' + why + ')' : ''));
    }
    await OPS.upd('resources', res.OBJECTID, { status: 'Available', incident_key: null, incident_name: null, cp_res_id: null, assignment: null, status_time: Date.now() });
    OPS.bust('cpdoc');
  };
  // mirror a Command Post 213RR into the OPS_Requests table so dashboards can see every request
  R.mirrorReq = async function (inc, q) {
    var items = CP.alive(q.items), first = items[0] || {};
    var at = { incident_key: inc.id, incident_name: inc.name, req_no: q.number, cp_req_id: q.id, req_time: q.ts ? Date.parse(q.ts) : Date.now(), priority: q.priority, requested_by: q.requestor, deliver_to: q.deliverTo,
      needed_by: first.arrival ? Date.parse(first.arrival) : null, qty: items.reduce(function (n, i) { return n + (+i.qty || 0); }, 0) || null, kind: (first.kind || '').slice(0, 80), type_level: (first.type || '').slice(0, 10),
      description: items.map(function (i) { return (i.qty || 1) + ' × ' + [i.kind, i.type ? 'Type ' + i.type : '', i.desc].filter(Boolean).join(' '); }).join('; ').slice(0, 1000), status: q.status, source: q.source || null, supplier: q.supplier || null, order_no: q.logOrder || null,
      assigned_res: (q.assigned || []).join(', ').slice(0, 1000) || null, cost_est: items.reduce(function (n, i) { return n + (parseFloat(String(i.cost || '').replace(/[$,]/g, '')) || 0); }, 0) || null, approved_by: q.approval || null, notes: (q.notes || '').slice(0, 1000) || null };
    if (!OPS.ready('requests')) return;
    var ex = await OPS.q('requests', 'cp_req_id=' + A.sq(q.id), { fields: 'OBJECTID', n: 1 }).catch(function () { return []; });
    if (ex.length) at.OBJECTID = ex[0].attributes.OBJECTID;
    await OPS.save('requests', at);
  };

  OPS.tool('resources', {
    n: 'Resources', sub: 'Inventory · Requests · Deployments', icon: 'truck', color: 'blue', d: 'County resource inventory with NIMS typing, ICS 213RR requests that land in Command Post, and what is deployed where.',
    nums: async function () {
      var st = await OPS.q('resources', '1=1', { fields: 'status', n: 2000 }), c = {}; st.forEach(function (f) { c[f.attributes.status] = (c[f.attributes.status] || 0) + 1; });
      var rq = await OPS.count('requests', OPS.incWhere("status NOT IN ('Filled','Cancelled')")).catch(function () { return '?'; });
      return [[c.Available || 0, 'available', 'ok-t'], [c.Assigned || 0, 'assigned'], [c['Out of Service'] || 0, 'out of service', c['Out of Service'] ? 'bad-t' : ''], [rq, 'open requests']];
    },
    render: function () {
      var u = OPS.st.ui, tab = u.tab || 'inv';
      var inv = OPS.load('resources', function () { return OPS.rows('resources', '1=1', { order: 'category,name' }); });
      var h = '<div class="phead"><div><h1 class="pg">Resources</h1><p class="pgsub" style="margin:0">County inventory lives in ArcGIS (OPS_Resources). Assigning an item or filling a request puts it straight into the Command Post incident.</p></div><div class="acts"><button class="btn sm" data-act="refresh">' + I('refresh') + 'Refresh</button></div></div>';
      var nAsg = Array.isArray(inv) ? inv.filter(function (r) { return r.status === 'Assigned'; }).length : '';
      h += OPS.tabs('tab', [['inv', 'Inventory', Array.isArray(inv) ? inv.length : ''], ['req', 'Requests (213RR)'], ['dep', 'Deployed', nAsg], ['map', 'Map']], tab);
      if (tab === 'inv') h += invTab(inv);
      else if (tab === 'req') h += reqTab();
      else if (tab === 'dep') h += depTab(inv);
      else h += OPS.wait(inv, 'inventory') + OPS.mapPage('resMap', 560);
      return h;
    },
    after: function () {
      if ((OPS.st.ui.tab || 'inv') === 'map') { var inv = OPS.st.cache.resources && OPS.st.cache.resources.data; if (Array.isArray(inv)) OPS.drawMap('resMap', inv.map(function (r) { return { ll: r._ll, c: r.status === 'Available' ? '#2FBF71' : r.status === 'Assigned' ? '#FDB833' : '#F0444C', t: (r.kind || r.category || '?').slice(0, 2).toUpperCase(), pop: '<b>' + E(r.name) + '</b><br>' + E(r.kind || r.category || '') + '<br>' + E(r.status) + (r.incident_name ? ' · ' + E(r.incident_name) : ''), act: ['edit', 'resources|' + r.OBJECTID] }; })); }
    },
    edit: { resources: function (r) { resForm(r); } }
  });

  function invTab(inv) {
    var u = OPS.st.ui, f = u.rf || 'All', cat = u.rc || '';
    var h = '<div class="toolbar">' + OPS.searchBox('res', 'Search name, ID, kind, owner') + OPS.seg('rf', ['All', 'Available', 'Assigned', 'Out of Service'], f) +
      '<select class="in" style="max-width:200px" data-chg="rc"><option value="">All categories</option>' + K.resCat.map(function (c) { return '<option' + (c === cat ? ' selected' : '') + '>' + E(c) + '</option>'; }).join('') + '</select><span class="sp"></span>' +
      '<button class="btn sm" data-act="resCsv">' + I('down') + 'CSV</button><button class="btn sm" data-act="resImport">' + I('up') + 'Import CSV</button><button class="btn sm pri" data-act="resNew">' + I('plus') + 'Add resource</button></div>';
    if (OPS.bad(inv)) return h + OPS.wait(inv, 'inventory');
    var rows = inv.filter(function (r) { return (f === 'All' || r.status === f) && (!cat || r.category === cat); });
    var now = Date.now();
    return h + OPS.table({ k: 'resources', rows: rows, q: u.q_res, empty: inv.length ? 'Nothing matches.' : 'No inventory yet. Add resources or import a CSV.',
      cols: ['res_id', 'name', { f: 'kind', l: 'Kind / typing', fmt: function (r) { return E([r.kind || r.category, r.nims_type || (r.type_level ? 'Type ' + r.type_level : '')].filter(Boolean).join(' · ')); } }, 'owner', 'status', { f: 'incident_name', l: 'Where', fmt: function (r) { return r.incident_name ? E(r.incident_name) + (r.assignment ? '<div class="dim" style="font-size:12px">' + E(r.assignment) + '</div>' : '') : E(r.home_base || ''); } }, { f: 'rate_hr', l: 'Rate', fmt: function (r) { return r.rate_hr ? OPS.money(r.rate_hr) + '/hr' : ''; } }],
      rowCls: function (r) { return r.next_service && r.next_service < now ? 'row-warn' : ''; },
      actions: function (r) { return r.status === 'Available' ? '<button class="btn xs" data-act="resAssign" data-a="' + r.OBJECTID + '">Assign</button>' : r.status === 'Assigned' ? '<button class="btn xs ghost" data-act="resRelease" data-a="' + r.OBJECTID + '">Release</button>' : ''; } });
  }
  OPS.chg.rc = function (el) { OPS.st.ui.rc = el.value; OPS.repaint(); };
  function resForm(r) {
    OPS.edit('resources', r || null, { defaults: r ? null : { status: 'Available', quantity: 1, owner: 'Botetourt County Emergency Management', mutual_aid_ok: 'Yes' }, addrField: 'home_base',
      top: r && r.incident_key ? '<div class="hint" style="margin-bottom:10px">Assigned to <b>' + E(r.incident_name) + '</b>. <a href="' + 'index.html?incident=' + encodeURIComponent(r.incident_key) + '&view=resources" target="_blank">Open in Command Post</a></div>' : '',
      before: function (at, old) { if (!old.OBJECTID || at.status !== old.status) at.status_time = Date.now(); return at; },
      buttons: r ? [r.status === 'Available' ? { label: 'Assign to incident', fn: function () { setTimeout(function () { OPS.act.resAssign(r.OBJECTID); }, 30); } } : r.status === 'Assigned' ? { label: 'Release', fn: function () { setTimeout(function () { OPS.act.resRelease(r.OBJECTID); }, 30); } } : null].filter(Boolean) : [] });
  }
  OPS.act.resNew = function () { resForm(null); };
  OPS.act.resCsv = function () { var d = OPS.st.cache.resources && OPS.st.cache.resources.data; if (Array.isArray(d)) OPS.csv('County resource inventory', 'resources', d); };
  OPS.act.resImport = function () {
    U.modal('Import inventory from CSV', '<p class="dim" style="margin-top:0">First row = column names. Columns are matched to field names or labels (Name, Category, Kind, NIMS typing, Type, Quantity, Owner / agency, Home location, Status, FEMA equipment code, Hourly rate ($)…). New rows are added; nothing is overwritten.</p><input type="file" id="csvF" accept=".csv,text/csv"><div id="csvP" style="margin-top:10px"></div>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Import', cls: 'pri', fn: function (bg) { var rows = bg._rows; if (!rows || !rows.length) { U.toast('Choose a CSV first', 'err'); return false; } OPS.saveMany('resources', rows).then(function (r) { U.toast(r.length + ' resources imported', 'ok'); OPS.repaint(); }).catch(function (e) { U.toast(E(e.message), 'err', 8000); }); } }],
      { onOpen: function (bg) { bg.querySelector('#csvF').addEventListener('change', async function (e) { var t = await e.target.files[0].text(); var rows = parseCsv(t); var map = mapCols(rows[0]); bg._rows = rows.slice(1).filter(function (r) { return r.some(Boolean); }).map(function (r) { var o = { status: 'Available' }; map.forEach(function (m, i) { if (m && r[i] !== '') { var f = OPS.LAYERS.resources.fields.find(function (x) { return x[0] === m; }); o[m] = f[1] === 'I' ? parseInt(r[i], 10) || null : f[1] === 'D' ? parseFloat(String(r[i]).replace(/[$,]/g, '')) || null : f[1] === 'T' ? Date.parse(r[i]) || null : String(r[i]).slice(0, f[2]); } }); return o; }).filter(function (o) { return o.name; }); bg.querySelector('#csvP').innerHTML = '<div class="hint">' + bg._rows.length + ' rows ready. Matched columns: ' + map.filter(Boolean).map(E).join(', ') + '</div>'; }); } });
  };
  function parseCsv(t) { var out = [], row = [], cur = '', q = false; for (var i = 0; i < t.length; i++) { var c = t[i]; if (q) { if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { row.push(cur.trim()); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur.trim()); out.push(row); row = []; cur = ''; } else cur += c; } if (cur || row.length) { row.push(cur.trim()); out.push(row); } return out; }
  function mapCols(head) { var fs = OPS.LAYERS.resources.fields; return head.map(function (h) { var n = h.toLowerCase().replace(/[^a-z0-9]/g, ''); var f = fs.find(function (x) { return x[0].replace(/_/g, '') === n || x[3].toLowerCase().replace(/[^a-z0-9]/g, '') === n; }); return f && !(f[4] || {}).ro ? f[0] : null; }); }

  // assign dialog
  OPS.act.resAssign = function (oid) {
    var r = OPS.findRow('resources', oid); if (!r) return;
    var open = OPS.incList.filter(function (a) { return a.status !== 'Closed'; });
    if (!open.length) { U.toast('No open Command Post incidents', 'err'); return; }
    U.modal('Assign ' + (r.res_id || r.name), '<div class="grid g2"><label class="f spanall"><span>Incident</span><select class="in" name="inc">' + open.map(function (a) { return '<option value="' + E(a.incident_key) + '"' + (OPS.inc && OPS.inc.key === a.incident_key ? ' selected' : '') + '>' + E(a.incident_name) + ' · ' + E(a.incident_number) + '</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Status in Command Post</span><select class="in" name="st"><option>Assigned</option><option>En Route</option><option>Ordered</option><option>Staged</option></select></label><label class="f"><span>Report to / assignment</span><input class="in" name="asg"></label><label class="f"><span>Leader / operator</span><input class="in" name="ldr"></label><label class="f"><span>Request / order #</span><input class="in" name="ord"></label></div>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Assign', cls: 'pri', fn: function (bg) { var g = function (n) { return U.val(bg, n); }; R.assign(r, g('inc'), { status: g('st'), assignment: g('asg'), loc: g('asg'), leader: g('ldr'), orderNo: g('ord') }).then(function () { U.toast((r.res_id || r.name) + ' assigned and added to Command Post', 'ok'); OPS.repaint(); }).catch(function (e) { U.toast(E(e.message), 'err', 7000); }); } }]);
  };
  OPS.act.resRelease = function (oid) { var r = OPS.findRow('resources', oid); if (!r) return; U.confirm('Release ' + E(r.res_id || r.name) + '?', 'Marks it Released in Command Post (' + E(r.incident_name || '') + ') and Available in county inventory.', 'Release', function () { R.release(r).then(function () { U.toast('Released', 'ok'); OPS.repaint(); }).catch(function (e) { U.toast(E(e.message), 'err'); }); }); };

  // ---------- requests ----------
  var COLS = CP.REQ_STATUS;
  function reqTab() {
    if (!OPS.inc) {
      var all = OPS.load('requests', function () { return OPS.rows('requests', '1=1', { order: 'req_time DESC', n: 500 }); });
      return OPS.needInc('make or fill requests') + '<div style="height:10px"></div><div class="toolbar">' + OPS.searchBox('req', 'Search requests') + '</div>' + (OPS.bad(all) ? OPS.wait(all, 'requests') : OPS.table({ k: 'requests', rows: all, q: OPS.st.ui.q_req, click: 'reqOpenMirror', cols: ['incident_name', 'req_no', 'req_time', 'priority', 'description', 'status', 'assigned_res'], empty: 'No requests yet.' }));
    }
    var inc = R.cpDoc(OPS.inc.key); if (OPS.bad(inc) || !inc) return OPS.wait(inc, 'Command Post requests') || '<div class="warnbox">Incident record not found in Command Post.</div>';
    var reqs = CP.alive(inc.requests);
    var h = '<div class="toolbar"><span class="muted">Requests in the Command Post record for <b>' + E(inc.name) + '</b>. They print as ICS 213RR here or in Command Post.</span><span class="sp"></span><button class="btn sm pri" data-act="reqNew">' + I('plus') + 'New request</button></div>';
    h += '<div class="kb">' + COLS.map(function (s) {
      var list = reqs.filter(function (q) { return (q.status || 'Draft') === s; });
      return '<div class="col"><h4>' + E(s) + '<span class="ct">' + list.length + '</span></h4>' + list.map(function (q) { var it = CP.alive(q.items); return '<div class="kc' + (q.priority === 'Urgent' ? ' urgent' : '') + '" data-act="reqOpen" data-a="' + q.id + '"><b>' + E(q.number) + ' · ' + E(it.map(function (i) { return (i.qty || 1) + '× ' + (i.kind || i.desc || '?'); }).join(', ') || 'No items') + '</b><div class="m">' + E(q.priority || '') + (it[0] && it[0].arrival ? ' · need ' + CP.fmtDT(it[0].arrival) : '') + '</div>' + ((q.assigned || []).length ? '<div class="m ok-t">' + E(q.assigned.join(', ')) + '</div>' : '') + '</div>'; }).join('') + '</div>';
    }).join('') + '</div>';
    return h;
  }
  OPS.act.reqOpenMirror = function (a) { var r = OPS.findRow('requests', a.split('|')[1]); if (r && r.incident_key) { OPS.setInc(r.incident_key); OPS.st.ui.tab = 'req'; setTimeout(function () { OPS.act.reqOpen(r.cp_req_id); }, 1500); } };
  OPS.act.reqNew = function () { reqForm(null); };
  OPS.act.reqOpen = function (id) { var inc = R.cpDoc(OPS.inc.key); var q = inc && CP.byId(inc.requests, id); if (q) reqForm(q); };
  function itemRow(i) { return '<tr data-id="' + E(i.id || '') + '"><td><input class="in" type="number" name="qty" value="' + E(i.qty || 1) + '" style="width:64px"></td><td><input class="in" name="kind" list="dl_kinds" value="' + E(i.kind || '') + '"></td><td><input class="in" name="type" value="' + E(i.type || '') + '" style="width:60px"></td><td><input class="in" name="desc" value="' + E(i.desc || '') + '"></td><td><input class="in" type="datetime-local" name="arrival" value="' + CP.localInput(i.arrival) + '"></td><td><input class="in" name="cost" value="' + E(i.cost || '') + '" style="width:90px"></td><td><button class="ibtn del" data-rmrow>' + I('trash') + '</button></td></tr>'; }
  function reqForm(q) {
    var isNew = !q; q = q || { priority: 'Routine', status: 'Submitted', requestor: OPS.me() + (CP.me.pos ? ' / ' + CP.me.pos : ''), items: [{ qty: 1 }] };
    var v = function (n) { return E(q[n] || ''); };
    var body = '<div class="grid g3"><label class="f"><span>Priority</span><select class="in" name="priority">' + CP.PRIORITY.map(function (p) { return '<option' + (q.priority === p ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></label><label class="f"><span>Status</span><select class="in" name="status">' + COLS.map(function (p) { return '<option' + (q.status === p ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></label><label class="f"><span>Requested by</span><input class="in" name="requestor" value="' + v('requestor') + '"></label>' +
      '<label class="f"><span>Deliver / report to</span><input class="in" name="deliverTo" value="' + v('deliverTo') + '"></label><label class="f"><span>Source</span><select class="in" name="source"><option></option>' + K.reqSource.map(function (p) { return '<option' + (q.source === p ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></label><label class="f"><span>Supplier / POC</span><input class="in" name="supplier" value="' + v('supplier') + '"></label></div>' +
      '<div class="fgrp">Items</div><div class="tbl-wrap"><table class="t" id="items"><thead><tr><th>Qty</th><th>Kind</th><th>Type</th><th>Detailed description</th><th>Needed by</th><th>Cost</th><th></th></tr></thead><tbody>' + CP.alive(q.items).map(itemRow).join('') + '</tbody></table></div><button class="btn xs" style="margin-top:6px" data-additem>' + I('plus') + 'Item</button>' +
      '<div class="grid g3" style="margin-top:10px"><label class="f"><span>Suitable substitutes</span><input class="in" name="substitutes" value="' + v('substitutes') + '"></label><label class="f"><span>Approved by (section chief)</span><input class="in" name="approval" value="' + v('approval') + '"></label><label class="f"><span>Logistics order #</span><input class="in" name="logOrder" value="' + v('logOrder') + '"></label><label class="f spanall"><span>Notes</span><textarea class="in" name="notes">' + v('notes') + '</textarea></label></div>' +
      ((q.assigned || []).length ? '<div class="hint" style="margin-top:10px">Assigned from county inventory: ' + E(q.assigned.join(', ')) + '</div>' : '');
    var btns = [{ label: 'Cancel', cls: 'ghost' }];
    if (!isNew) { btns.unshift({ label: I('print') + '213RR', cls: 'ghost', fn: function () { print213(q); return false; } }); btns.push({ label: 'Fill from inventory', fn: function (bg) { saveReq(bg, q, isNew).then(function (sq) { setTimeout(function () { fillDlg(sq); }, 50); }).catch(function () {}); return false; } }); }
    btns.push({ label: I('check') + (isNew ? 'Submit request' : 'Save'), cls: 'pri', fn: function (bg) { saveReq(bg, q, isNew).then(function () { U.toast('Request saved to Command Post', 'ok'); }).catch(function () {}); return false; } });
    var bg = U.modal(isNew ? 'New resource request (213RR)' : 'Resource request ' + q.number, body, btns, { wide: true, sticky: true, nofocus: true });
    bg.addEventListener('click', function (e) { if (e.target.closest('[data-additem]')) { e.preventDefault(); bg.querySelector('#items tbody').insertAdjacentHTML('beforeend', itemRow({ qty: 1 })); } var rm = e.target.closest('[data-rmrow]'); if (rm) { e.preventDefault(); rm.closest('tr').remove(); } });
  }
  async function saveReq(bg, q, isNew) {
    var g = function (n) { return U.val(bg, n); };
    var items = Array.prototype.map.call(bg.querySelectorAll('#items tbody tr'), function (tr) { var x = function (n) { return tr.querySelector('[name="' + n + '"]').value.trim(); }; var a = x('arrival'); return { id: tr.dataset.id || CP.uid(), u: CP.now(), qty: +x('qty') || 1, kind: x('kind'), type: x('type'), desc: x('desc'), arrival: a ? new Date(a).toISOString() : '', cost: x('cost') }; }).filter(function (i) { return i.kind || i.desc; });
    if (!items.length) { U.toast('Add at least one item', 'err'); throw new Error('no items'); }
    var fields = { priority: g('priority'), status: g('status'), requestor: g('requestor'), deliverTo: g('deliverTo'), source: g('source'), supplier: g('supplier'), substitutes: g('substitutes'), approval: g('approval'), logOrder: g('logOrder'), notes: g('notes') };
    var saved, incDoc;
    try {
      await OPS.cpEdit(OPS.inc.key, function (inc) {
        incDoc = inc;
        if (isNew) { saved = CP.addItem(inc, 'requests', Object.assign({ number: 'RR-' + CP.pad(CP.alive(inc.requests).length + 1), ts: CP.now(), items: items }, fields)); }
        else { saved = CP.byId(inc.requests, q.id); Object.assign(saved, fields); saved.items = items.concat((saved.items || []).filter(function (i) { return !items.some(function (n) { return n.id === i.id; }); }).map(function (i) { i.del = true; i.u = CP.now(); return i; })); saved.u = CP.now(); CP.touch(inc, 'requests'); }
      }, isNew ? 'Resource request submitted: ' + items.map(function (i) { return i.qty + ' × ' + (i.kind || i.desc); }).join('; ') : null);
      await R.mirrorReq(incDoc, saved).catch(function (e) { console.warn(e); });
    } catch (e) { U.toast('Could not save: ' + E(e.message), 'err', 7000); throw e; }
    OPS.bust('cpdoc'); OPS.bust('requests'); U.closeModal(); OPS.repaint(); return saved;
  }
  function fillDlg(q) {
    var inv = OPS.st.cache.resources && OPS.st.cache.resources.data; inv = Array.isArray(inv) ? inv : [];
    var items = CP.alive(q.items), kinds = items.map(function (i) { return (i.kind || '').toLowerCase(); });
    var av = inv.filter(function (r) { return r.status === 'Available'; }).sort(function (a, b) { var ma = kinds.indexOf((a.kind || '').toLowerCase()) >= 0 ? 0 : 1, mb = kinds.indexOf((b.kind || '').toLowerCase()) >= 0 ? 0 : 1; return ma - mb || (a.name || '').localeCompare(b.name || ''); });
    U.modal('Fill ' + q.number + ' from county inventory', '<p class="dim" style="margin-top:0">Needed: ' + E(items.map(function (i) { return i.qty + ' × ' + [i.kind, i.type ? 'Type ' + i.type : '', i.desc].filter(Boolean).join(' '); }).join('; ')) + '. Matching kinds are listed first.</p>' +
      '<div class="multi" id="fillList" style="max-height:340px;overflow:auto">' + (av.map(function (r) { return '<label class="chk"><input type="checkbox" value="' + r.OBJECTID + '"> <b>' + E(r.res_id || '') + '</b> ' + E(r.name) + ' <span class="dim">' + E([r.kind, r.type_level ? 'T' + r.type_level : '', r.owner].filter(Boolean).join(' · ')) + '</span></label>'; }).join('') || '<span class="dim">No available inventory. Choose a different source on the request (mutual aid, vendor, VDEM).</span>') + '</div>' +
      '<div class="grid g2" style="margin-top:10px"><label class="f"><span>Command Post status</span><select class="in" name="st"><option>En Route</option><option>Ordered</option><option>Assigned</option></select></label><label class="f"><span>Report to</span><input class="in" name="to" value="' + E(q.deliverTo || '') + '"></label></div>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Assign selected', cls: 'pri', fn: function (bg) {
        var ids = Array.prototype.map.call(bg.querySelectorAll('#fillList input:checked'), function (x) { return +x.value; }); if (!ids.length) { U.toast('Pick at least one', 'err'); return false; }
        var st = U.val(bg, 'st'), to = U.val(bg, 'to');
        (async function () {
          var names = [];
          for (var oid of ids) { var r = inv.find(function (x) { return x.OBJECTID === oid; }); await R.assign(r, OPS.inc.key, { status: st, assignment: to, loc: to, orderNo: q.number }); names.push(r.res_id || r.name); }
          var incDoc, saved;
          await OPS.cpEdit(OPS.inc.key, function (inc) { incDoc = inc; saved = CP.byId(inc.requests, q.id); saved.assigned = (saved.assigned || []).concat(names); var need = CP.alive(saved.items).reduce(function (n, i) { return n + (+i.qty || 1); }, 0); saved.status = saved.assigned.length >= need ? 'Filled' : 'Ordered'; saved.source = 'County inventory'; saved.u = CP.now(); CP.touch(inc, 'requests'); }, 'Request ' + q.number + ' filled from county inventory: ' + names.join(', '));
          await R.mirrorReq(incDoc, saved).catch(function () {});
          OPS.bust('cpdoc'); OPS.bust('requests'); U.toast(names.length + ' resources assigned to ' + q.number, 'ok'); OPS.repaint();
        })().catch(function (e) { U.toast(E(e.message), 'err', 7000); });
      } }], { wide: true });
  }
  function print213(q) {
    var items = CP.alive(q.items);
    OPS.print('ICS 213RR Resource Request ' + q.number, E(OPS.inc.name) + ' · ' + E(OPS.inc.number),
      OPS.ptable(['Incident', 'Date/time', 'Request #', 'Priority', 'Requested by', 'Deliver/report to'], [[OPS.inc.name, CP.fmtDT(q.ts), q.number, q.priority, q.requestor, q.deliverTo]]) +
      '<h2>Order</h2>' + OPS.ptable(['Qty', 'Kind', 'Type', 'Detailed item description', 'Requested arrival', 'Cost'], items.map(function (i) { return [i.qty, i.kind, i.type, i.desc, CP.fmtDT(i.arrival), i.cost]; })) +
      OPS.ptable(['Suitable substitutes', 'Section chief approval', 'Logistics order #', 'Supplier / POC', 'Source', 'Status'], [[q.substitutes, q.approval, q.logOrder, q.supplier, q.source, q.status]]) +
      ((q.assigned || []).length ? '<h2>Filled with</h2><p>' + E(q.assigned.join(', ')) + '</p>' : '') + (q.notes ? '<h2>Notes</h2><p>' + E(q.notes) + '</p>' : ''));
  }

  OPS.act.resSync = async function () {
    var inv = await OPS.rows('resources', "status='Assigned' AND incident_key IS NOT NULL", { n: 2000 }), by = {}, n = 0;
    inv.forEach(function (r) { (by[r.incident_key] = by[r.incident_key] || []).push(r); });
    for (var k in by) { var d = await A.loadRemote(k).catch(function () { return null; }); if (!d) continue; var closed = d.status === 'Closed';
      for (var r of by[k]) { var row = r.cp_res_id && CP.byId(d.resources, r.cp_res_id); if (closed || !row || row.del || ['Released', 'Demobilized'].indexOf(row.status) >= 0) { await OPS.upd('resources', r.OBJECTID, { status: 'Available', incident_key: null, incident_name: null, cp_res_id: null, assignment: null, status_time: Date.now() }); n++; } } }
    OPS.bust('resources'); U.toast(n + ' items returned to Available', 'ok'); OPS.repaint();
  };
  // ---------- deployed ----------
  function depTab(inv) {
    if (OPS.bad(inv)) return OPS.wait(inv);
    var dep = inv.filter(function (r) { return r.status === 'Assigned'; }), by = {};
    dep.forEach(function (r) { (by[r.incident_name || 'Unknown'] = by[r.incident_name || 'Unknown'] || []).push(r); });
    if (!dep.length) return '<div class="empty">Nothing from county inventory is deployed right now.</div>';
    var tot = 0;
    var h = Object.keys(by).map(function (n) {
      var rows = by[n].map(function (r) { var hr = OPS.hrs(r.status_time), c = (r.rate_hr || 0) * hr; tot += c; return '<tr data-act="edit" data-a="resources|' + r.OBJECTID + '"><td>' + E(r.res_id || '') + '</td><td>' + E(r.name) + '</td><td>' + E(r.kind || r.category || '') + '</td><td>' + E(r.owner || '') + '</td><td>' + E(r.assignment || '') + '</td><td class="mono">' + hr.toFixed(1) + ' h</td><td>' + (r.rate_hr ? OPS.money(c) : '<span class="dim">no rate</span>') + '</td><td onclick="event.stopPropagation()"><button class="btn xs ghost" data-act="resRelease" data-a="' + r.OBJECTID + '">Release</button></td></tr>'; }).join('');
      return '<div class="card" style="margin-bottom:12px"><h3>' + I('flag') + E(n) + '<small>' + by[n].length + ' items</small></h3><div class="tbl-wrap"><table class="t ot"><thead><tr><th>ID</th><th>Name</th><th>Kind</th><th>Owner</th><th>Assignment</th><th>Deployed</th><th>Est. cost</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
    }).join('');
    return '<div class="toolbar"><span class="muted">Released or demobilized in Command Post? Sync puts those items back to Available.</span><span class="sp"></span><button class="btn sm" data-act="resSync">' + I('refresh') + 'Sync with Command Post</button></div><div class="grid g4" style="margin-bottom:12px">' + OPS.stat(dep.length, 'Items deployed', 'gold') + OPS.stat(Object.keys(by).length, 'Incidents') + OPS.stat(OPS.money(tot).replace(/\.\d\d$/, ''), 'Equipment cost so far', 'blue', 'rate × hours since assigned') + '</div>' + h + '<p class="dim" style="font-size:12.5px">Equipment hours go to Cost Recovery with <b>Import equipment</b> on that page.</p>';
  }
})(window.CP);
