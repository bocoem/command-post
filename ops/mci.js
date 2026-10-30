/* EM OPS — MCI: START/JumpSTART triage, patient tracking to hospital, hospital board, EOP MCI levels; patients feed reunification */
(function (CP) {
  'use strict';
  var OPS = CP.ops, A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon, K = OPS.LISTS;
  var TRI = [['Immediate (Red)', 'r', 'RED'], ['Delayed (Yellow)', 'y', 'YELLOW'], ['Minor (Green)', 'g', 'GREEN'], ['Expectant (Gray)', 'x', 'GRAY'], ['Deceased (Black)', 'k', 'BLACK']];
  function short(t) { var x = TRI.find(function (z) { return z[0] === t; }); return x ? x[2] : '?'; }
  OPS.mciLevel = function (n) { return n >= 101 ? 1 : n >= 31 ? 2 : n >= 16 ? 3 : 4; };
  function pts() { return OPS.load('patients:' + OPS.inc.key, function () { return OPS.rows('patients', OPS.incWhere(), { order: 'triage_time DESC', n: 3000 }); }, 15000); }
  function hosp() { return OPS.load('hospitals', function () { return OPS.rows('hospitals', '1=1', { order: 'drive_min,name', n: 200 }); }, 60000); }
  function units() { return OPS.load('mci:units', function () { return A.query(A.L.cadUnits, '1=1', { fields: 'UnitID,StatusName,UnitTypeDesc,DeptName', n: 1000 }).then(function (r) { return r.map(function (f) { return f.attributes; }).filter(function (u) { return /amb|medic|ems|rescue|als|bls/i.test([u.UnitTypeDesc, u.UnitID].join(' ')); }); }).catch(function () { return []; }); }, 60000); }

  // start a Command Post incident from the field (MCI app can stand alone)
  OPS.newIncident = async function (o) {
    if (A.status !== 'on') throw new Error('Command Post service is not connected');
    var inc = CP.newIncident(o); inc.updatedBy = OPS.me();
    CP.addItem(inc, 'log', { ts: CP.now(), author: OPS.me(), pos: '', cat: 'Event', text: 'Incident started from EM Ops (' + (o.from || 'Ops') + ')', op: 1 });
    await A.save(inc); await OPS.loadIncidents(); OPS.setInc(inc.id); return inc;
  };

  OPS.tool('mci', {
    n: 'MCI', sub: 'Triage · Patient Tracking · Hospitals', icon: 'med', color: 'red', live: 'patients', d: 'Mass casualty incident triage and patient tracking to the hospital, with the EOP MCI level, hospital destination board and RHCC call-out. Named patients show up in Reunification.',
    nums: async function () { var n = await OPS.count('patients', OPS.incWhere()); return [[n, 'patients'], [n ? 'Level ' + OPS.mciLevel(n) : '—', 'MCI level']]; },
    render: function () {
      if (!OPS.svc.ems) return '<h1 class="pg">MCI</h1><div class="warnbox">The EMS Patient Care service (patient records) is not set up or not shared with you. Ask EM to add you to the ' + E(OPS.EMS_GROUP) + ' group. <a href="#setup" data-act="go" data-a="setup">Setup</a></div>' + OPS.eopCard('mci', true);
      if (!OPS.inc) return '<h1 class="pg">Mass Casualty Incident</h1>' + OPS.needInc('track patients') + '<div class="card" style="margin-top:12px"><h3>' + I('warn') + 'Declare an MCI</h3><p class="dim" style="margin-top:0">No incident yet? Start one here. It is created in Command Post so the EOC, Check-In and Reunification see it right away.</p><button class="btn big red" data-act="mciDeclare">' + I('plus') + 'Declare MCI</button></div>' + OPS.eopCard('mci', true);
      var p = pts(), hs = hosp(), u = OPS.st.ui, tab = u.mt || 'board';
      var h = '<div class="phead"><div><h1 class="pg">MCI · ' + E(OPS.inc.name) + '</h1><p class="pgsub" style="margin:0">Patients in ArcGIS (PROT_MCI_Patients). Each transport is logged to Command Post without names.</p></div><div class="acts"><button class="btn sm" data-act="mciPrint">' + I('print') + 'Patient report</button><button class="btn pri big" data-act="mciAdd">' + I('plus') + 'Triage patient</button></div></div>';
      if (OPS.bad(p)) return h + OPS.wait(p, 'patients');
      var n = p.length, lv = OPS.mciLevel(n), cnt = {}; TRI.forEach(function (t) { cnt[t[0]] = p.filter(function (x) { return x.triage === t[0]; }).length; });
      var tx = p.filter(function (x) { return /Transported|Arrived/.test(x.status || ''); }).length, wait = p.filter(function (x) { return !/Transported|Arrived|Released|Refused|Deceased/.test(x.status || '') && /Red|Yellow/.test(x.triage); });
      h += '<div class="grid g4" style="margin-bottom:10px">' + OPS.stat('Level ' + lv, 'MCI level (EOP)', lv <= 2 ? 'red' : 'gold', ['', '101+ patients', '31–100 patients', '16–30 patients', 'up to 15 patients'][lv]) + OPS.stat(n, 'Patients') + OPS.stat(tx, 'Transported', 'blue') + OPS.stat(wait.length, 'Red/yellow waiting', wait.length ? 'red' : '') + '</div>';
      if (lv <= 2) h += '<div class="warnbox" style="margin-bottom:10px;color:#ffb3b8;border-color:rgba(240,68,76,.6);background:rgba(208,33,41,.12)">' + I('warn') + ' <b>Level ' + lv + ': call RHCC 1-866-679-7422.</b> Tell them: entity, callback number, radio channel, level and patient count, needs, hospitals contacted, actions taken, what happened.</div>';
      h += '<div class="tribig" style="margin-bottom:12px">' + TRI.map(function (t) { return '<div class="stat ' + t[1] + '"><div class="v">' + cnt[t[0]] + '</div><div class="l">' + t[2] + '</div><div class="s">' + p.filter(function (x) { return x.triage === t[0] && /Transported|Arrived/.test(x.status || ''); }).length + ' transported</div></div>'; }).join('') + '</div>';
      h += OPS.tabs('mt', [['board', 'Patients', n], ['hosp', 'Hospitals'], ['eop', 'EOP quick card']], tab);
      if (tab === 'board') {
        h += '<div class="toolbar">' + OPS.searchBox('pt', 'Search tag, name, unit, hospital') + OPS.seg('pf', ['Not transported', 'All', 'Transported'], u.pf || 'Not transported') + '</div>';
        var order = { 'Immediate (Red)': 0, 'Delayed (Yellow)': 1, 'Minor (Green)': 2, 'Expectant (Gray)': 3, 'Deceased (Black)': 4 };
        var list = p.filter(function (x) { var f = u.pf || 'Not transported', t = /Transported|Arrived/.test(x.status || ''); return f === 'All' || (f === 'Transported' ? t : !t); }).sort(function (a, b) { return order[a.triage] - order[b.triage] || (a.triage_time || 0) - (b.triage_time || 0); });
        h += OPS.table({ k: 'patients', rows: list, q: u.q_pt, cols: [{ f: 'tag_no', l: 'Tag', fmt: function (x) { return '<span class="tri ' + OPS.triCls(x.triage) + '">' + E(short(x.triage)) + '</span> <b class="mono">' + E(x.tag_no) + '</b>'; } }, { f: 'n', l: 'Patient', fmt: function (x) { return E([x.first_name, x.last_name].filter(Boolean).join(' ') || 'Unknown') + '<div class="dim" style="font-size:12px">' + E([x.age_group, x.age != null ? x.age : '', x.sex].filter(Boolean).join(' · ')) + '</div>'; } }, { f: 'injuries', l: 'Injuries' }, 'status', { f: 'tr', l: 'Transport', fmt: function (x) { return x.unit || x.hospital ? E((x.unit || '') + (x.hospital ? ' → ' + x.hospital : '')) + '<div class="dim mono" style="font-size:12px">' + E(OPS.dt(x.transport_time)) + '</div>' : ''; } }, { f: 'w', l: 'On scene', fmt: function (x) { return '<span class="mono">' + E(OPS.ago(x.triage_time)) + '</span>'; } }],
          actions: function (x) { return /Transported|Arrived|Deceased|Released|Refused/.test(x.status || '') ? (x.status === 'Transported' ? '<button class="btn xs ghost" data-act="mciArr" data-a="' + x.OBJECTID + '">Arrived</button>' : '') : '<button class="btn xs pri" data-act="mciTx" data-a="' + x.OBJECTID + '">Transport</button>'; }, empty: 'No patients yet. Use Triage patient.' });
      } else if (tab === 'hosp') h += hospTab(p, hs);
      else h += '<div class="card">' + OPS.eopHtml('mci') + '</div>';
      return h;
    },
    edit: { patients: function (x) { ptForm(x); }, hospitals: function (x) { OPS.edit('hospitals', x, { before: function (at) { at.updated = Date.now(); return at; } }); } }
  });
  function hospTab(p, hs) {
    if (OPS.bad(hs)) return OPS.wait(hs, 'hospitals');
    var h = '<div class="toolbar"><span class="muted">Update capacity after each call with the hospital or RHCC. Check VHASS for live status.</span><span class="sp"></span>' + (hs.length ? '' : '<button class="btn sm" data-act="mciSeedHosp">Add EOP hospitals</button>') + '<button class="btn sm pri" data-act="mciHospNew">' + I('plus') + 'Hospital</button></div>';
    return h + '<div class="tbl-wrap"><table class="t ot"><thead><tr><th>Hospital</th><th>Status</th><th>Red sent / can take</th><th>Yellow</th><th>Green</th><th>Drive</th><th>Phone</th><th>Updated</th></tr></thead><tbody>' + hs.map(function (x) {
      var s = function (t) { return p.filter(function (q) { return q.hospital === x.name && q.triage === t; }).length; };
      var c = function (t, cap) { var n = s(t); return '<span class="mono ' + (cap != null && n >= cap ? 'bad-t' : '') + '">' + n + ' / ' + (cap != null ? cap : '?') + '</span>'; };
      return '<tr data-act="edit" data-a="hospitals|' + x.OBJECTID + '"><td><b>' + E(x.name) + '</b><div class="dim" style="font-size:12px">' + E(x.level || '') + '</div></td><td>' + OPS.chip(x.status) + '</td><td>' + c('Immediate (Red)', x.cap_red) + '</td><td>' + c('Delayed (Yellow)', x.cap_yellow) + '</td><td>' + c('Minor (Green)', x.cap_green) + '</td><td class="mono">' + (x.drive_min != null ? x.drive_min + ' min' : '') + '</td><td class="mono">' + E(x.phone || '') + '</td><td class="dim">' + E(OPS.ago(x.updated)) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  OPS.act.mciHospNew = function () { OPS.edit('hospitals', null, { defaults: { status: 'Open' }, before: function (at) { at.updated = Date.now(); return at; } }); };
  OPS.act.mciSeedHosp = async function () {
    await OPS.saveMany('hospitals', [{ name: 'Carilion Roanoke Memorial Hospital', level: 'Level I trauma', status: 'Unknown', updated: Date.now() }, { name: 'LewisGale Medical Center', level: 'Level II trauma', status: 'Unknown', updated: Date.now() }]);
    U.toast('Added the two trauma centers named in the EOP. Add others and set locations.', 'ok', 6000); OPS.repaint();
  };
  OPS.act.mciDeclare = function () {
    U.modal('Declare a mass casualty incident', '<div class="grid g2"><label class="f spanall"><span>Incident name</span><input class="in" name="name" placeholder="I-81 MM 150 multi-vehicle"></label><label class="f"><span>Type</span><select class="in" name="type">' + CP.INCIDENT_TYPES.map(function (t) { return '<option' + (t === 'Vehicle' ? ' selected' : '') + '>' + E(t) + '</option>'; }).join('') + '</select></label><label class="f"><span>Estimated patients</span><input class="in" type="number" name="n"></label><label class="f spanall"><span>Location</span><input class="in" name="loc"></label></div>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Declare MCI', cls: 'red', fn: function (bg) { var g = function (n) { return U.val(bg, n); }; if (!g('name')) { U.toast('Name it', 'err'); return false; } var est = +g('n') || 0; var go = function (ll) { OPS.newIncident({ name: g('name'), type: g('type'), locdesc: g('loc'), lat: ll && ll[0], lng: ll && ll[1], complexity: est > 30 ? 2 : 3, situation: 'Mass casualty incident declared' + (est ? ', about ' + est + ' patients (MCI Level ' + OPS.mciLevel(est) + ')' : '') + '.', from: 'MCI app' }).then(function () { U.toast('MCI declared in Command Post', 'ok'); }).catch(function (e) { U.toast(E(e.message), 'err', 8000); }); }; if (navigator.geolocation) navigator.geolocation.getCurrentPosition(function (p) { go([p.coords.latitude, p.coords.longitude]); }, function () { go(null); }, { timeout: 6000 }); else go(null); } }]);
  };
  // fast triage entry
  OPS.act.mciAdd = function () {
    var p = pts(), next = (Array.isArray(p) ? p.length : 0) + 1;
    var bg = U.modal('Triage patient', '<label class="f"><span>Triage tag #</span><input class="in" name="tag" value="' + next + '" style="font-size:22px;font-weight:800;max-width:220px"></label><div class="tribig" style="margin:12px 0">' + TRI.map(function (t) { return '<button class="stat ' + t[1] + '" data-tri="' + E(t[0]) + '" style="cursor:pointer;text-align:center"><div class="v">' + t[2] + '</div></button>'; }).join('') + '</div><div class="grid g3"><label class="f"><span>Age group</span><select class="in" name="ag">' + K.ageGroup.map(function (a) { return '<option>' + a + '</option>'; }).join('') + '</select></label><label class="f"><span>Sex</span><select class="in" name="sex"><option></option>' + K.sex.map(function (a) { return '<option>' + a + '</option>'; }).join('') + '</select></label><label class="f"><span>Found at / sector</span><input class="in" name="at"></label><label class="f spanall"><span>Injuries (optional)</span><input class="in" name="inj"></label></div><p class="dim" style="font-size:12.5px">Tap a color to save. Add names and details later. JumpSTART for children under 8 (or under about 100 lb).</p>',
      [{ label: 'Close', cls: 'ghost' }], { nofocus: true });
    bg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tri]'); if (!b) return; e.preventDefault();
      var g = function (n) { return U.val(bg, n); }, tag = g('tag');
      if (!tag) { U.toast('Tag number needed', 'err'); return; }
      var at = Object.assign(OPS.incFix(), { tag_no: tag, triage: b.dataset.tri, status: /Black/.test(b.dataset.tri) ? 'Deceased' : 'On scene', age_group: g('ag'), sex: g('sex') || null, found_at: g('at') || null, injuries: g('inj') || null, triage_time: Date.now() });
      var go = function (ll) { OPS.save('patients', at, ll || OPS.inc.ll).then(function () { U.toast('Tag ' + E(tag) + ' · ' + short(at.triage), 'ok'); OPS.bust('patients'); var p2 = pts(); var cnt = (Array.isArray(p2) ? p2.length : 0) + 1; if ([1, 16, 31, 101].indexOf(cnt) >= 0) OPS.cpEdit(OPS.inc.key, function () {}, 'MCI: ' + cnt + ' patients, MCI Level ' + OPS.mciLevel(cnt), 'Event').catch(function () {}); bg.querySelector('[name="tag"]').value = /^\d+$/.test(tag) ? +tag + 1 : ''; bg.querySelector('[name="inj"]').value = ''; OPS.repaint(); }).catch(function (er) { U.toast(E(er.message), 'err', 7000); }); };
      if (navigator.geolocation) navigator.geolocation.getCurrentPosition(function (q) { go([q.coords.latitude, q.coords.longitude]); }, function () { go(null); }, { timeout: 4000, maximumAge: 60000 }); else go(null);
    });
  };
  function ptForm(x) {
    OPS.edit('patients', x, { noMap: true, title: 'Tag ' + x.tag_no + ' · ' + short(x.triage),
      buttons: [{ label: 'Transport', fn: function () { setTimeout(function () { OPS.act.mciTx(x.OBJECTID); }, 30); } }, { label: 'Reunification record', fn: function () { setTimeout(function () { reunRec(x); }, 30); } }] });
  }
  function reunRec(x) {
    if (!x.last_name) { U.toast('Add the patient\'s last name first', 'err'); return; }
    OPS.save('reunify', Object.assign(OPS.incFix(), { case_no: OPS.id('R-'), rec_type: 'Hospitalized', status: 'Hospitalized', first_name: x.first_name, last_name: x.last_name, age: x.age, sex: x.sex, located_at: x.hospital ? 'Transported to ' + x.hospital : 'MCI scene (tag ' + x.tag_no + ')', is_minor: x.age != null && x.age < 18 ? 'Yes' : null, notes: 'From MCI tag ' + x.tag_no }))
      .then(function () { OPS.bust('reunify'); U.toast('Reunification record created', 'ok'); }).catch(function (e) { U.toast(E(e.message), 'err'); });
  }
  OPS.act.mciTx = function (oid) {
    var x = OPS.arr(pts()).find(function (p) { return p.OBJECTID === +oid; }), hs = OPS.arr(hosp()), us = OPS.arr(units()); if (!x) return;
    var sent = function (h) { return OPS.arr(pts()).filter(function (q) { return q.hospital === h.name && q.triage === x.triage; }).length; };
    var capF = /Red/.test(x.triage) ? 'cap_red' : /Yellow/.test(x.triage) ? 'cap_yellow' : 'cap_green';
    U.modal('Transport tag ' + x.tag_no + ' (' + short(x.triage) + ')', '<datalist id="dl_units">' + us.map(function (u) { return '<option value="' + E(u.UnitID) + '">' + E((u.StatusName || '') + ' · ' + (u.DeptName || '')) + '</option>'; }).join('') + '</datalist><div class="grid g2"><label class="f"><span>Transport unit</span><input class="in" name="unit" list="dl_units" placeholder="Medic 12"></label><label class="f"><span>Destination</span><select class="in" name="hosp">' + hs.filter(function (h) { return h.status !== 'Closed'; }).map(function (h) { var n = sent(h), cap = h[capF]; return '<option value="' + E(h.name) + '"' + (h.status === 'Diversion' ? ' disabled' : '') + '>' + E(h.name) + ' · ' + n + ' / ' + (cap != null ? cap : '?') + (h.status === 'Diversion' ? ' (diversion)' : '') + '</option>'; }).join('') + '<option value="Other">Other</option></select></label></div><p class="dim" style="font-size:12.5px">EOP: RED to the highest-level trauma center; mix YELLOW / GREEN to the nearest open EDs; move GREENs early by bus or van.</p>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Transported', cls: 'pri', fn: function (bg) { var at = { unit: U.val(bg, 'unit') || null, hospital: U.val(bg, 'hosp'), status: 'Transported', transport_time: Date.now() }; OPS.upd('patients', x.OBJECTID, at).then(function () { OPS.cpEdit(OPS.inc.key, function () {}, 'MCI transport: tag ' + x.tag_no + ' (' + short(x.triage) + ')' + (at.unit ? ' by ' + at.unit : '') + ' to ' + at.hospital, 'Action').catch(function () {}); OPS.bust('patients'); U.toast('Transport logged', 'ok'); OPS.repaint(); }).catch(function (e) { U.toast(E(e.message), 'err'); }); } }]);
  };
  OPS.act.mciArr = function (oid) { OPS.upd('patients', +oid, { status: 'Arrived at hospital', arrive_time: Date.now() }).then(function () { OPS.bust('patients'); OPS.repaint(); }); };
  OPS.act.mciPrint = function () { var p = pts(); if (!Array.isArray(p)) return; OPS.print('MCI Patient Tracking (RESTRICTED)', E(OPS.inc.name) + ' · ' + p.length + ' patients · MCI Level ' + OPS.mciLevel(p.length), OPS.ptable(['Tag', 'Triage', 'Name', 'Age/sex', 'Injuries', 'Status', 'Unit', 'Hospital', 'Triaged', 'Transported'], p.map(function (x) { return [x.tag_no, short(x.triage), [x.first_name, x.last_name].filter(Boolean).join(' '), [x.age, x.sex].filter(Boolean).join(' '), x.injuries, x.status, x.unit, x.hospital, OPS.dt(x.triage_time), OPS.dt(x.transport_time)]; }))); };
})(window.CP);
