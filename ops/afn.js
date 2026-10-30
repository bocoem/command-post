/* EM OPS — Access & Functional Needs registry (protected service) with evacuation-area matching and welfare checks */
(function (CP) {
  'use strict';
  var OPS = CP.ops, A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon, K = OPS.LISTS;
  var YEAR = 365 * 864e5;
  function reg() { return OPS.load('afn', function () { return OPS.rows('afn', "active='Yes' OR active IS NULL", { order: 'last_name,first_name', n: 5000 }); }); }
  // hazard areas: active evacuation notices + Command Post incident areas / affected areas
  function areas() {
    return OPS.load('afn:areas', async function () {
      var n = await A.query(A.L.notices, "activeincid='Yes'", { geom: true, fields: 'OBJECTID,evactype,incidentnm,dateissued', n: 200 }).catch(function () { return []; });
      var af = await A.query(A.L.affected, "activeincid='Yes'", { geom: true, fields: 'OBJECTID,incidentnm,description', n: 100 }).catch(function () { return []; });
      var ia = await A.query(A.L.incAreas, "activeincid='Yes'", { geom: true, fields: 'OBJECTID,incidentnm', n: 100 }).catch(function () { return []; });
      return n.map(function (f) { return { kind: 'Evacuation ' + (f.attributes.evactype || ''), inc: f.attributes.incidentnm, rings: f.geometry && f.geometry.rings, c: '#F0444C' }; })
        .concat(af.map(function (f) { return { kind: 'Affected area', inc: f.attributes.incidentnm, rings: f.geometry && f.geometry.rings, c: '#F28C28' }; }))
        .concat(ia.map(function (f) { return { kind: 'Incident area', inc: f.attributes.incidentnm, rings: f.geometry && f.geometry.rings, c: '#FDB833' }; })).filter(function (x) { return x.rings; });
    }, 120000);
  }
  function hits(people, ar) { return people.filter(function (p) { return p._ll; }).map(function (p) { var m = ar.filter(function (a) { return OPS.inRings(p._ll[0], p._ll[1], a.rings); }); return m.length ? Object.assign({}, p, { _areas: m }) : null; }).filter(Boolean); }

  OPS.tool('afn', { eop: 'afn',
    n: 'AFN Registry', sub: 'Access & Functional Needs', icon: 'med', color: 'red', d: 'Voluntary registry of residents who need help in an emergency, matched against evacuation areas and incident areas, with welfare-check tracking.',
    nums: async function () { var n = await OPS.count('afn', "active='Yes' OR active IS NULL"), p = await OPS.count('afn', "power_dependent='Yes' AND (active='Yes' OR active IS NULL)"), o = await OPS.count('afn', 'review_due < CURRENT_TIMESTAMP'); return [[n, 'registered'], [p, 'power-dependent'], [o, 'review overdue', o ? 'warn-t' : '']]; },
    render: function () {
      if (!OPS.svc.prot) return '<h1 class="pg">AFN Registry</h1><div class="warnbox">The protected EM service is not set up or not shared with you. Registry data is restricted. <a href="#setup" data-act="go" data-a="setup">Setup</a></div>';
      var d = reg(), ar = areas(), u = OPS.st.ui, tab = u.at || (OPS.inc ? 'imp' : 'reg');
      var h = '<div class="phead"><div><h1 class="pg">Access & Functional Needs Registry</h1><p class="pgsub" style="margin:0">Restricted. Stored in BOCO_EM_Protected. Use only for emergency response; share the minimum needed.</p></div><div class="acts"><button class="btn sm" data-act="refresh">' + I('refresh') + 'Refresh</button><button class="btn pri" data-act="afnNew">' + I('plus') + 'Register someone</button></div></div>';
      if (OPS.bad(d)) return h + OPS.wait(d, 'registry');
      var inArea = Array.isArray(ar) ? hits(d, ar) : null;
      h += OPS.tabs('at', [['imp', 'In hazard areas', inArea ? inArea.length : '…'], ['reg', 'Registry', d.length], ['pwr', 'Power-dependent', d.filter(function (p) { return p.power_dependent === 'Yes'; }).length], ['map', 'Map']], tab);
      if (tab === 'reg') {
        var nf = u.nf || '';
        h += '<div class="toolbar">' + OPS.searchBox('afn', 'Search name, address, phone') + '<select class="in" style="max-width:260px" data-chg="nf"><option value="">All needs</option>' + K.afnNeeds.map(function (n) { return '<option' + (nf === n ? ' selected' : '') + '>' + E(n) + '</option>'; }).join('') + '</select><span class="sp"></span><button class="btn sm" data-act="afnCsv">' + I('down') + 'CSV</button></div>';
        h += OPS.table({ k: 'afn', rows: d.filter(function (p) { return !nf || (p.needs || '').indexOf(nf) >= 0; }), q: u.q_afn, cols: ['reg_id', { f: 'name', l: 'Name', fmt: function (p) { return '<b>' + E(p.last_name + ', ' + p.first_name) + '</b>'; } }, 'address', 'phone', 'needs', 'transport', { f: 'review_due', l: 'Review due', fmt: function (p) { return p.review_due ? '<span class="' + (p.review_due < Date.now() ? 'bad-t' : '') + '">' + E(OPS.d(p.review_due)) + '</span>' : ''; } }], rowCls: function (p) { return !p._ll ? 'row-warn' : ''; }, empty: 'No one registered yet.' });
        h += '<p class="dim" style="font-size:12.5px">Rows marked gold have no map location, so they cannot be matched to hazard areas. Open them and set the address on the map.</p>';
      } else if (tab === 'pwr') {
        h += '<div class="hint" style="margin-bottom:10px">People who depend on power for oxygen, ventilators, dialysis or refrigerated medicine. During outages, check on them first and share with the utility only through official channels.</div>' + OPS.table({ k: 'afn', rows: d.filter(function (p) { return p.power_dependent === 'Yes'; }), cols: [{ f: 'n', l: 'Name', fmt: function (p) { return E(p.last_name + ', ' + p.first_name); } }, 'address', 'phone', 'needs', 'oxygen_hours', 'alt_contact'] });
      } else if (tab === 'imp') h += impact(inArea, ar);
      else h += OPS.wait(ar, 'areas') + OPS.mapPage('afnMap', 560);
      return h;
    },
    after: function () {
      var tab = OPS.st.ui.at || (OPS.inc ? 'imp' : 'reg'); if (tab !== 'map') return;
      var d = reg(), ar = areas(); if (!Array.isArray(d)) return;
      OPS.drawMap('afnMap', d.map(function (p) { return { ll: p._ll, dot: true, c: p.power_dependent === 'Yes' ? '#c77dff' : '#F0444C', pop: '<b>' + E(p.first_name + ' ' + p.last_name) + '</b><br>' + E(p.address || '') + '<br>' + E(p.needs || ''), act: ['edit', 'afn|' + p.OBJECTID] }; }), { polys: (Array.isArray(ar) ? ar : []).map(function (a) { return { ll: OPS.ringsLL({ rings: a.rings }), c: a.c, pop: E(a.kind + ' · ' + (a.inc || '')) }; }) });
    },
    edit: { afn: function (r) { afnForm(r); } }
  });
  OPS.chg.nf = function (el) { OPS.st.ui.nf = el.value; OPS.repaint(); };
  function afnForm(r) {
    OPS.edit('afn', r, { addrField: 'address', defaults: r ? null : { active: 'Yes', consent_date: Date.now(), review_due: Date.now() + YEAR, household: 1, transport: 'None needed' },
      before: function (at, old) { if (!old.OBJECTID) at.reg_id = OPS.id('AFN-'); if ((at.needs || '').match(/Oxygen|Ventilator|Dialysis|refrigeration/) && !at.power_dependent) at.power_dependent = 'Yes'; return at; } });
  }
  OPS.act.afnNew = function () { afnForm(null); };
  OPS.act.afnCsv = function () { var d = reg(); if (Array.isArray(d)) OPS.csv('AFN registry (RESTRICTED)', 'afn', d); };

  function impact(inArea, ar) {
    if (inArea == null) return OPS.wait(ar, 'hazard areas');
    var checks = OPS.inc ? OPS.load('afnchecks:' + OPS.inc.key, function () { return OPS.rows('afnchecks', OPS.incWhere(), { order: 'check_time DESC', n: 3000 }); }) : [];
    var last = {}; (Array.isArray(checks) ? checks : []).forEach(function (c) { if (!last[c.reg_id]) last[c.reg_id] = c; });
    var h = '<div class="toolbar"><span class="muted">' + (ar.length ? ar.length + ' active evacuation notices, affected areas and incident areas.' : 'No active evacuation notices or incident areas are drawn right now.') + '</span><span class="sp"></span>' + (inArea.length ? '<button class="btn sm" data-act="afnPrint">' + I('print') + 'Welfare check list</button>' + (OPS.inc ? '<button class="btn sm" data-act="afnLog">' + I('log') + 'Summary to Command Post</button>' : '') : '') + '</div>';
    if (!OPS.inc) h += OPS.needInc('record welfare checks') + '<div style="height:8px"></div>';
    if (!inArea.length) return h + '<div class="empty">Nobody on the registry is inside an active hazard area.</div>';
    var done = inArea.filter(function (p) { var c = last[p.reg_id]; return c && /safe|Evacuated|Transported/.test(c.result); }).length;
    h += '<div class="grid g4" style="margin-bottom:12px">' + OPS.stat(inArea.length, 'In hazard areas', 'red') + OPS.stat(inArea.filter(function (p) { return /Wheelchair|Stretcher/.test(p.transport || ''); }).length, 'Need special transport', 'gold') + OPS.stat(inArea.filter(function (p) { return p.power_dependent === 'Yes'; }).length, 'Power-dependent') + OPS.stat(done + ' / ' + inArea.length, 'Checked & safe', done === inArea.length ? 'green' : '') + '</div>';
    return h + '<div class="tbl-wrap"><table class="t ot"><thead><tr><th>Name</th><th>Address / phone</th><th>Needs</th><th>Transport</th><th>Area</th><th>Last check</th><th></th></tr></thead><tbody>' + inArea.map(function (p) { var c = last[p.reg_id]; return '<tr data-act="edit" data-a="afn|' + p.OBJECTID + '"><td><b>' + E(p.last_name + ', ' + p.first_name) + '</b><div class="dim" style="font-size:12px">' + E(p.reg_id || '') + ' · ' + (p.household || 1) + ' in home</div></td><td>' + E(p.address || '') + '<div class="mono" style="font-size:12px">' + E(p.phone || '') + (p.alt_phone ? ' / ' + E(p.alt_phone) : '') + '</div></td><td>' + E(p.needs || '') + '</td><td>' + E(p.transport || '') + '</td><td>' + p._areas.map(function (a) { return '<span class="chip red" style="margin:1px">' + E(a.kind) + '</span>'; }).join('') + '</td><td>' + (c ? OPS.chip(c.result) + '<div class="dim" style="font-size:12px">' + E(OPS.ago(c.check_time)) + ' · ' + E(c.checked_by || '') + '</div>' : OPS.chip('Not checked')) + '</td><td onclick="event.stopPropagation()">' + (OPS.inc ? '<button class="btn xs" data-act="afnCheck" data-a="' + p.OBJECTID + '">Record check</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  OPS.act.afnCheck = function (oid) {
    var p = OPS.findRow('afn', oid); if (!p) return;
    OPS.edit('afnchecks', null, { title: 'Welfare check · ' + p.first_name + ' ' + p.last_name, defaults: { reg_id: p.reg_id, person: p.first_name + ' ' + p.last_name, check_time: Date.now(), checked_by: OPS.me() }, noMap: true,
      top: '<div class="hint" style="margin-bottom:10px">' + E(p.address || '') + ' · ' + E(p.phone || '') + ' · ' + E(p.needs || '') + '</div>',
      after: function (oid2, at) { OPS.bust('afnchecks'); if (/needs help|EMS|No answer/.test(at.result)) return OPS.cpEdit(OPS.inc.key, function () {}, 'AFN welfare check ' + p.reg_id + ': ' + at.result + (at.notes ? ' · ' + at.notes : ''), 'Action').catch(function () {}); } });
  };
  OPS.act.afnPrint = function () {
    var d = reg(), ar = areas(); var list = hits(d, ar);
    OPS.print('Welfare Check List (RESTRICTED)', (OPS.inc ? E(OPS.inc.name) + ' · ' : '') + list.length + ' registrants in active hazard areas', OPS.ptable(['Reg #', 'Name', 'Address', 'Phone / alt', 'In home', 'Needs', 'Transport', 'Pets', 'Area', 'Result / time / initials'], list.map(function (p) { return [p.reg_id, p.last_name + ', ' + p.first_name, p.address, [p.phone, p.alt_contact, p.alt_phone].filter(Boolean).join(' / '), p.household, p.needs, p.transport, p.pets, p._areas.map(function (a) { return a.kind; }).join(', '), '']; })) + '<p><b>Contains personal and medical information. Return to EM after use; do not post or photograph.</b></p>');
  };
  OPS.act.afnLog = function () {
    var list = hits(reg(), areas());
    OPS.cpEdit(OPS.inc.key, function () {}, 'AFN registry: ' + list.length + ' registrants inside active hazard areas (' + list.filter(function (p) { return /Wheelchair|Stretcher/.test(p.transport || ''); }).length + ' need special transport, ' + list.filter(function (p) { return p.power_dependent === 'Yes'; }).length + ' power-dependent). Welfare checks tracked in EM Ops.', 'Event').then(function () { U.toast('Logged to Command Post (no names)', 'ok'); });
  };
})(window.CP);
