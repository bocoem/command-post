/* EM OPS — Check-In & Accountability (ICS 211, PAR). Every check-in is a Command Post incident resource. */
(function (CP) {
  'use strict';
  var OPS = CP.ops, A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon, K = OPS.LISTS;
  var C = OPS.ci = {};
  var CP_STATUS = { 'On Scene': 'Checked In', 'Staged': 'Staged', 'Assigned': 'Assigned', 'Rest': 'Out of Service', 'Checked Out': 'Released' };

  C.rows = function () { return OPS.load('checkins:' + OPS.inc.key, function () { return OPS.rows('checkins', OPS.incWhere(), { order: 'checkin_time DESC', n: 2000 }); }, 30000); };
  C.quals = async function (name) { if (!OPS.ready('training') || !name) return ''; var r = await OPS.rows('training', 'UPPER(person)=' + A.sq(name.toUpperCase()), { fields: 'course,course_other,expires', n: 50 }).catch(function () { return []; }); return r.filter(function (t) { return !t.expires || t.expires > Date.now(); }).map(function (t) { return t.course === 'Other' ? t.course_other : t.course; }).filter(Boolean).join(', '); };

  // check someone in: ArcGIS check-in record + Command Post resource row (+ inventory / volunteer links)
  C.checkIn = async function (a, ll, link) {
    link = link || {}; var inc = OPS.inc;
    a = Object.assign({ incident_key: inc.key, incident_name: inc.name, status: a.assignment ? 'Assigned' : 'On Scene', checkin_time: Date.now(), method: a.method || 'Staff' }, a);
    a.quals = (await C.quals(a.person)) || null;
    if (link.res) { a.res_id = String(link.res.OBJECTID); a.cp_res_id = await OPS.res.assign(link.res, inc.key, { status: CP_STATUS[a.status] || 'Checked In', assignment: a.assignment, loc: a.checkin_loc, leader: a.person }); }
    else {
      a.cp_res_id = await OPS.cpEdit(inc.key, function (d) {
        var row = CP.addItem(d, 'resources', { name: a.person, kind: a.role === 'Volunteer' ? 'Volunteer Team' : (a.persons > 1 ? (a.position || 'Other') : 'Overhead (single person)'), type: '', agency: a.agency || '', leader: a.person, persons: a.persons || 1, contact: a.phone || '', orderNo: '', checkinLoc: a.checkin_loc || '', status: CP_STATUS[a.status] || 'Checked In', assign: '', checkin: CP.now(), location: a.assignment || a.checkin_loc || '', notes: [a.position, a.quals].filter(Boolean).join(' · '), ciOid: true });
        return row.id;
      }, a.person + (a.agency ? ' (' + a.agency + ')' : '') + ' checked in' + (a.position ? ' as ' + a.position : '') + (a.checkin_loc ? ' at ' + a.checkin_loc : ''));
    }
    if (link.vol) { a.vol_id = link.vol.vol_id; await OPS.upd('volunteers', link.vol.OBJECTID, { status: 'Deployed', incident_key: inc.key, incident_name: inc.name }).catch(function () {}); }
    var oid = await OPS.save('checkins', a, ll);
    OPS.bust('checkins'); OPS.bust('cpdoc');
    return oid;
  };
  // status / assignment change mirrors into Command Post
  C.update = async function (r, at, logText) {
    if (r.cp_res_id) await OPS.cpEdit(r.incident_key, function (d) { var x = CP.byId(d.resources, r.cp_res_id); if (!x) return; if (at.status) x.status = CP_STATUS[at.status] || x.status; if (at.assignment != null) x.location = at.assignment; if (at.status === 'Checked Out') x.released = CP.now(); x.u = CP.now(); CP.touch(d, 'resources'); }, logText || null).catch(function (e) { console.warn(e); });
    await OPS.upd('checkins', r.OBJECTID, at); OPS.bust('checkins'); OPS.bust('cpdoc');
  };
  C.checkOut = async function (r) {
    var now = Date.now();
    await C.update(r, { status: 'Checked Out', checkout_time: now }, r.person + ' checked out (' + OPS.hrs(r.checkin_time, now).toFixed(1) + ' h on scene)');
    if (r.res_id) { var res = (await OPS.rows('resources', 'OBJECTID=' + (+r.res_id)))[0]; if (res && res.status === 'Assigned') { await OPS.upd('resources', res.OBJECTID, { status: 'Available', incident_key: null, incident_name: null, cp_res_id: null, assignment: null, status_time: now }); OPS.bust('resources'); } }
    if (r.vol_id && OPS.ready('volunteers')) {
      var v = (await OPS.rows('volunteers', 'vol_id=' + A.sq(r.vol_id)))[0], hrs = Math.round(OPS.hrs(r.checkin_time, now) * 4) / 4;
      if (v) { await OPS.save('volhours', { incident_key: r.incident_key, incident_name: r.incident_name, vol_id: v.vol_id, volunteer: v.first_name + ' ' + v.last_name, work_date: r.checkin_time, hours: hrs, task: r.assignment || r.position || 'Incident support', rate: OPS.volRate() }); await OPS.upd('volunteers', v.OBJECTID, { status: 'Active', incident_key: null, incident_name: null, total_hours: (v.total_hours || 0) + hrs }); }
    }
  };

  OPS.tool('checkin', {
    n: 'Check-In', sub: 'Accountability · ICS 211 · PAR', icon: 'users', d: 'Check people and units in and out of an incident. Each check-in shows up in Command Post Resources and ICS 211; PAR roll calls are logged.', live: 'checkins',
    nums: async function () { var w = OPS.incWhere("status<>'Checked Out'"); var on = await OPS.q('checkins', w, { fields: 'persons,checkin_time', n: 2000 }); var p = on.reduce(function (n, f) { return n + (f.attributes.persons || 1); }, 0), long = on.filter(function (f) { return OPS.hrs(f.attributes.checkin_time) > 12; }).length; return [[on.length, 'checked in'], [p, 'people'], [long, 'over 12 h', long ? 'bad-t' : '']]; },
    render: function () {
      var P = OPS.st.params;
      if (!OPS.inc) return '<h1 class="pg">Check-In</h1>' + OPS.needInc('check people in');
      if (OPS.st.solo || (P && P.get('self') === '1')) return selfView();
      var rows = C.rows(), u = OPS.st.ui;
      var h = '<div class="phead"><div><h1 class="pg">Check-In · ' + E(OPS.inc.name) + '</h1><p class="pgsub" style="margin:0">Everyone here is also on the Command Post Resources page and ICS 211. Times over 12 hours on scene are flagged.</p></div><div class="acts"><button class="btn sm" data-act="ciQR">' + I('copy') + 'QR / phone link</button><button class="btn sm" data-act="ci211">' + I('print') + 'ICS 211</button><button class="btn sm red" data-act="parStart">' + I('shield') + 'Start PAR</button><button class="btn" data-act="ciScan">' + I('qr') + 'Scan tag</button><button class="btn pri" data-act="ciNew">' + I('plus') + 'Check in</button></div></div>';
      if (OPS.bad(rows)) return h + OPS.wait(rows, 'check-ins');
      var on = rows.filter(function (r) { return r.status !== 'Checked Out'; }), ppl = on.reduce(function (n, r) { return n + (r.persons || 1); }, 0);
      var long = on.filter(function (r) { return OPS.hrs(r.checkin_time) > 12; }), lastPar = on.reduce(function (m, r) { return Math.max(m, r.last_par || 0); }, 0), missing = on.filter(function (r) { return r.par_ok === 'No'; });
      h += '<div class="grid g6" style="margin-bottom:12px">' + OPS.stat(on.length, 'Checked in', 'gold') + OPS.stat(ppl, 'People') + OPS.stat(on.filter(function (r) { return r.status === 'Assigned'; }).length, 'Assigned', 'green') + OPS.stat(on.filter(function (r) { return r.status === 'Staged' || r.status === 'On Scene'; }).length, 'Staged / available', 'blue') + OPS.stat(long.length, 'Over 12 hours', long.length ? 'red' : '') + OPS.stat(lastPar ? OPS.ago(lastPar) : '—', 'Since last PAR', missing.length ? 'red' : '', missing.length ? missing.length + ' unaccounted' : '') + '</div>';
      if (missing.length) h += '<div class="warnbox" style="margin-bottom:12px;color:#ffb3b8;border-color:rgba(240,68,76,.6);background:rgba(208,33,41,.12)">' + I('warn') + ' <b>Unaccounted at last PAR:</b> ' + missing.map(function (r) { return E(r.person) + (r.assignment ? ' (' + E(r.assignment) + ')' : ''); }).join(', ') + '</div>';
      h += '<div class="toolbar">' + OPS.searchBox('ci', 'Search name, agency, assignment') + OPS.seg('cv', [['board', 'By assignment'], ['list', 'List'], ['out', 'Checked out']], u.cv || 'board') + '<span class="sp"></span><button class="btn sm ghost" data-act="ciSync">' + I('refresh') + 'Match Command Post</button></div>';
      var view = u.cv || 'board', q = (u.q_ci || '').toLowerCase();
      var list = (view === 'out' ? rows.filter(function (r) { return r.status === 'Checked Out'; }) : on).filter(function (r) { return !q || [r.person, r.agency, r.assignment, r.position].join(' ').toLowerCase().indexOf(q) >= 0; });
      if (view === 'board') {
        var g = {}; list.forEach(function (r) { var k = r.status === 'Rest' ? 'Rest / rehab' : r.assignment || (r.status === 'Staged' ? 'Staging' : 'Unassigned'); (g[k] = g[k] || []).push(r); });
        h += '<div class="kb">' + Object.keys(g).sort().map(function (k) { return '<div class="col"><h4>' + E(k) + '<span class="ct">' + g[k].reduce(function (n, r) { return n + (r.persons || 1); }, 0) + '</span></h4>' + g[k].map(card).join('') + '</div>'; }).join('') + (list.length ? '' : '<div class="empty">Nobody checked in yet.</div>') + '</div>';
      } else h += OPS.table({ k: 'checkins', rows: list, cols: ['person', 'agency', 'position', 'assignment', 'status', { f: 'checkin_time', l: 'In', fmt: function (r) { return '<span class="mono">' + E(OPS.dt(r.checkin_time)) + '</span>'; } }, { f: 'hrs', l: 'Hours', fmt: function (r) { var x = OPS.hrs(r.checkin_time, r.checkout_time); return '<span class="mono ' + (x > 16 ? 'bad-t' : x > 12 ? 'warn-t' : '') + '">' + x.toFixed(1) + '</span>'; } }, { f: 'quals', l: 'Quals' }], rowCls: function (r) { return r.par_ok === 'No' ? 'row-bad' : OPS.hrs(r.checkin_time, r.checkout_time) > 12 && !r.checkout_time ? 'row-warn' : ''; },
        actions: function (r) { return r.status !== 'Checked Out' ? '<button class="btn xs ghost" data-act="ciOut" data-a="' + r.OBJECTID + '">Check out</button>' : ''; } });
      var pars = OPS.load('par:' + OPS.inc.key, function () { return OPS.rows('par', OPS.incWhere(), { order: 'par_time DESC', n: 20 }); });
      if (Array.isArray(pars) && pars.length) h += '<div class="card" style="margin-top:14px"><h3>' + I('shield') + 'PAR history</h3>' + OPS.table({ k: 'par', rows: pars }) + '</div>';
      return h;
    },
    edit: { checkins: function (r) { ciEdit(r); } }
  });
  function card(r) {
    var hrs = OPS.hrs(r.checkin_time);
    return '<div class="kc' + (r.par_ok === 'No' ? ' urgent' : '') + '" data-act="edit" data-a="checkins|' + r.OBJECTID + '"><b>' + E(r.person) + (r.persons > 1 ? ' <span class="dim">(' + r.persons + ')</span>' : '') + '</b><div class="m">' + E([r.position, r.agency].filter(Boolean).join(' · ')) + '</div><div class="m"><span class="mono ' + (hrs > 16 ? 'bad-t' : hrs > 12 ? 'warn-t' : '') + '">' + hrs.toFixed(1) + ' h</span> · ' + E(r.status) + (r.last_par ? ' · PAR ' + (r.par_ok === 'No' ? '<span class="bad-t">MISSING</span>' : OPS.ago(r.last_par)) : '') + '</div></div>';
  }
  function ciEdit(r) {
    OPS.edit('checkins', r, { title: r.person, skip: ['checkin_time'], buttons: r.status !== 'Checked Out' ? [{ label: 'Check out', fn: function () { setTimeout(function () { OPS.act.ciOut(r.OBJECTID); }, 30); } }] : [],
      top: '<div class="hint" style="margin-bottom:10px">Checked in ' + E(OPS.dt(r.checkin_time)) + ' · ' + OPS.hrs(r.checkin_time, r.checkout_time).toFixed(1) + ' h' + (r.cp_res_id ? ' · <a href="' + OPS.cpLink('resources') + '" target="_blank">on Command Post Resources</a>' : '') + '</div>',
      before: async function (at) { if (at.status !== r.status || at.assignment !== r.assignment) { await C.update(r, { status: at.status, assignment: at.assignment }, at.status !== r.status ? r.person + ' now ' + at.status + (at.assignment ? ' · ' + at.assignment : '') : r.person + ' assigned to ' + at.assignment); } return at; } });
  }

  // check-in dialog with pickers for inventory and volunteers
  OPS.act.ciNew = async function () {
    var inv = await OPS.rows('resources', "status='Available'", { order: 'name', n: 1000 }).catch(function () { return []; });
    var vols = await OPS.rows('volunteers', "status IN ('Active','Deployed')", { order: 'last_name', n: 2000 }).catch(function () { return []; });
    var dl = '<datalist id="dl_ci">' + inv.map(function (r) { return '<option value="INV ' + E(r.res_id || r.OBJECTID) + ' · ' + E(r.name) + '">'; }).join('') + vols.map(function (v) { return '<option value="VOL ' + E(v.vol_id) + ' · ' + E(v.first_name + ' ' + v.last_name) + '">' + E(v.team || ''); }).join('') + '</datalist>';
    var bg = U.modal('Check in to ' + OPS.inc.name, dl + '<label class="f"><span>Find county inventory or a volunteer (optional)</span><input class="in" id="ciPick" list="dl_ci" placeholder="Type a unit number, name, or volunteer"></label><div id="ciLinked" class="dim" style="font-size:13px;margin:4px 0 8px"></div>' +
      OPS.fieldsHtml('checkins', { role: 'Responder', status: 'On Scene', persons: 1, checkin_loc: 'ICP' }, { skip: ['checkin_time', 'checkout_time', 'last_par', 'par_ok', 'status'] }) + '<label class="chk" style="margin-top:8px"><input type="checkbox" id="ciGps"> Record my current location</label>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: I('check') + 'Check in', cls: 'pri', fn: function (b) { doCheckIn(b); return false; } }], { wide: true, sticky: true });
    bg._link = {};
    bg.querySelector('#ciPick').addEventListener('change', function (e) {
      var v = e.target.value, m = /^(INV|VOL) ([^ ]+) · /.exec(v); if (!m) return;
      var set = function (n, x) { var el = bg.querySelector('[name="' + n + '"]'); if (el && x != null) el.value = x; };
      if (m[1] === 'INV') { var r = inv.find(function (x) { return String(x.res_id || x.OBJECTID) === m[2]; }); bg._link = { res: r }; set('person', (r.res_id ? r.res_id + ' ' : '') + r.name); set('agency', r.owner); set('position', [r.kind, r.type_level ? 'Type ' + r.type_level : ''].filter(Boolean).join(' ')); set('persons', r.persons || 1); set('phone', r.phone); bg.querySelector('#ciLinked').innerHTML = I('link') + ' County inventory item: it will be marked Assigned to this incident.'; }
      else { var vv = vols.find(function (x) { return x.vol_id === m[2]; }); bg._link = { vol: vv }; set('person', vv.first_name + ' ' + vv.last_name); set('agency', vv.team); set('role', 'Volunteer'); set('phone', vv.phone); set('persons', 1); bg.querySelector('#ciLinked').innerHTML = I('link') + ' Volunteer record: hours are logged automatically at check-out.'; }
    });
  };
  async function doCheckIn(bg) {
    var c = OPS.collect(bg, 'checkins'); if (c.miss.length) { U.toast('Fill in: ' + c.miss.join(', '), 'err'); return; }
    var go = function (ll) { C.checkIn(Object.assign(c.attrs, { method: 'Staff' }), ll, bg._link).then(function () { U.closeModal(); U.toast(E(c.attrs.person) + ' checked in · added to Command Post', 'ok'); OPS.repaint(); }).catch(function (e) { U.toast('Check-in failed: ' + E(e.message), 'err', 8000); }); };
    if (bg.querySelector('#ciGps').checked && navigator.geolocation) navigator.geolocation.getCurrentPosition(function (p) { go([p.coords.latitude, p.coords.longitude]); }, function () { go(null); }, { timeout: 8000 }); else go(OPS.inc.ll || null);
  }
  OPS.act.ciOut = function (oid) { var r = OPS.findRow('checkins', oid); if (!r) return; U.confirm('Check out ' + E(r.person) + '?', OPS.hrs(r.checkin_time).toFixed(1) + ' hours on scene. Command Post shows them Released' + (r.res_id ? ' and the inventory item goes back to Available' : '') + (r.vol_id ? '; volunteer hours are logged' : '') + '.', 'Check out', function () { C.checkOut(r).then(function () { U.toast(E(r.person) + ' checked out', 'ok'); OPS.repaint(); }).catch(function (e) { U.toast(E(e.message), 'err'); }); }); };

  // pull Command Post resources that were added there (not through Check-In) into the check-in list
  OPS.act.ciSync = async function () {
    var d = await A.loadRemote(OPS.inc.key), rows = await OPS.rows('checkins', OPS.incWhere(), { n: 2000 });
    var have = {}; rows.forEach(function (r) { if (r.cp_res_id) have[r.cp_res_id] = r; });
    var add = CP.alive(d.resources).filter(function (x) { return !have[x.id] && ['Ordered', 'En Route', 'Released', 'Demobilized'].indexOf(x.status) < 0; });
    var rel = rows.filter(function (r) { var x = r.cp_res_id && CP.byId(d.resources, r.cp_res_id); return r.status !== 'Checked Out' && x && ['Released', 'Demobilized'].indexOf(x.status) >= 0; });
    var inv = { 'Checked In': 'On Scene', Staged: 'Staged', Assigned: 'Assigned', 'Out of Service': 'Rest' };
    await OPS.saveMany('checkins', add.map(function (x) { return { incident_key: OPS.inc.key, incident_name: OPS.inc.name, person: (x.name || '').slice(0, 150), agency: (x.agency || '').slice(0, 150), position: (x.kind || '').slice(0, 150), persons: +x.persons || 1, phone: (x.contact || '').slice(0, 30), cp_res_id: x.id, status: inv[x.status] || 'On Scene', assignment: (x.location || '').slice(0, 150) || null, checkin_time: x.checkin ? Date.parse(x.checkin) : Date.now(), method: 'Command Post', role: 'Responder' }; }).concat(rel.map(function (r) { return { OBJECTID: r.OBJECTID, status: 'Checked Out', checkout_time: Date.now() }; })));
    OPS.bust('checkins'); U.toast(add.length + ' added from Command Post, ' + rel.length + ' checked out to match', 'ok'); OPS.repaint();
  };

  // PAR
  OPS.act.parStart = function () {
    var rows = OPS.arr(C.rows()).filter(function (r) { return r.status !== 'Checked Out'; }); if (!rows.length) { U.toast('Nobody is checked in', 'err'); return; }
    var g = {}; rows.forEach(function (r) { (g[r.assignment || r.status] = g[r.assignment || r.status] || []).push(r); });
    U.modal('PAR · Personnel Accountability Report', '<div class="grid g2"><label class="f"><span>Reason</span><select class="in" name="reason"><option>Scheduled (every 30 min)</option><option>Change in strategy</option><option>Mayday / emergency</option><option>Evacuation signal</option><option>Fire under control</option><option>End of operational period</option><option>Other</option></select></label><label class="f"><span>Called by</span><input class="in" name="by" value="' + E(OPS.me()) + '"></label></div><div class="toolbar" style="margin-top:10px"><button class="btn xs" data-parall>Mark all accounted</button><span class="dim">Uncheck anyone not accounted for.</span></div>' +
      Object.keys(g).map(function (k) { return '<div class="fgrp">' + E(k) + '</div><div class="multi">' + g[k].map(function (r) { return '<label class="chk"><input type="checkbox" data-par="' + r.OBJECTID + '"> ' + E(r.person) + (r.persons > 1 ? ' (' + r.persons + ')' : '') + '</label>'; }).join('') + '</div>'; }).join(''),
      [{ label: 'Cancel', cls: 'ghost' }, { label: I('check') + 'Record PAR', cls: 'pri', fn: function (bg) {
        var now = Date.now(), ok = [], bad = [];
        bg.querySelectorAll('[data-par]').forEach(function (x) { var r = rows.find(function (y) { return y.OBJECTID === +x.dataset.par; }); (x.checked ? ok : bad).push(r); });
        var reason = U.val(bg, 'reason'), by = U.val(bg, 'by');
        (async function () {
          await OPS.saveMany('checkins', ok.map(function (r) { return { OBJECTID: r.OBJECTID, last_par: now, par_ok: 'Yes' }; }).concat(bad.map(function (r) { return { OBJECTID: r.OBJECTID, last_par: now, par_ok: 'No' }; })));
          await OPS.save('par', { incident_key: OPS.inc.key, incident_name: OPS.inc.name, par_time: now, called_by: by, reason: reason, expected: rows.length, accounted: ok.length, missing: bad.length, missing_names: bad.map(function (r) { return r.person + (r.assignment ? ' (' + r.assignment + ')' : ''); }).join('; ') || null, closed_time: bad.length ? null : now });
          await OPS.cpEdit(OPS.inc.key, function () {}, 'PAR (' + reason + '): ' + ok.length + ' of ' + rows.length + ' accounted' + (bad.length ? '. UNACCOUNTED: ' + bad.map(function (r) { return r.person; }).join(', ') : ''), 'Safety').catch(function () {});
          OPS.bust('checkins'); OPS.bust('par'); U.toast(bad.length ? bad.length + ' UNACCOUNTED. Logged to Command Post.' : 'All ' + ok.length + ' accounted. Logged to Command Post.', bad.length ? 'err' : 'ok', 8000); OPS.repaint();
        })().catch(function (e) { U.toast(E(e.message), 'err'); });
      } }], { wide: true, sticky: true, onOpen: function (bg) { bg.querySelector('[data-parall]').addEventListener('click', function (e) { e.preventDefault(); bg.querySelectorAll('[data-par]').forEach(function (x) { x.checked = true; }); }); } });
  };
  OPS.act.ci211 = function () {
    var rows = OPS.arr(C.rows()).slice().sort(function (a, b) { return (a.checkin_time || 0) - (b.checkin_time || 0); });
    OPS.print('ICS 211 Check-In List', E(OPS.inc.name) + ' · ' + E(OPS.inc.number), OPS.ptable(['#', 'Name / unit', 'Agency', 'Position / kind', 'Persons', 'Contact', 'Check-in loc', 'Time in', 'Assignment', 'Status', 'Time out', 'Hours'], rows.map(function (r, i) { return [i + 1, r.person, r.agency, r.position, r.persons || 1, r.phone, r.checkin_loc, OPS.dt(r.checkin_time), r.assignment, r.status, OPS.dt(r.checkout_time), OPS.hrs(r.checkin_time, r.checkout_time).toFixed(1)]; })));
  };
  OPS.act.ciQR = function () {
    var url = location.origin + location.pathname.replace(/[^\/]*$/, '') + 'checkin.html?incident=' + encodeURIComponent(OPS.inc.key);
    var img = '';
    try { var qr = window.qrcode(0, 'M'); qr.addData(url); qr.make(); img = qr.createImgTag(6, 8); } catch (e) { img = '<div class="dim">QR library did not load.</div>'; }
    U.modal('Phone check-in for ' + OPS.inc.name, '<div style="text-align:center"><div class="qr">' + img + '</div><p class="mono" style="word-break:break-all;font-size:12px">' + E(url) + '</p><p class="dim">Post this at the ICP, staging and the EOC. People sign in with their county ArcGIS account and check themselves in; it lands here and in Command Post. Check in people without accounts from this screen.</p></div>',
      [{ label: I('copy') + 'Copy link', cls: 'ghost', fn: function () { navigator.clipboard.writeText(url); U.toast('Copied', 'ok'); return false; } }, { label: I('print') + 'Print poster', fn: function () { OPS.print('Check in here', E(OPS.inc.name), '<div style="text-align:center;margin-top:30px">' + img.replace(/width="\d+"/, 'width="360"').replace(/height="\d+"/, 'height="360"') + '<p style="font-size:20px;font-weight:700">Scan to check in and out</p><p>' + E(url) + '</p></div>'); } }, { label: 'Done', cls: 'pri' }]);
  };

  // phone self check-in (checkin.html)
  function selfView() {
    var me = OPS.me(), rows = C.rows(), mine = Array.isArray(rows) ? rows.find(function (r) { return r.status !== 'Checked Out' && (r.person || '').toLowerCase() === me.toLowerCase(); }) : null;
    var h = '<div class="selfci"><h1 class="pg">' + E(OPS.inc.name) + '</h1><p class="pgsub">' + E(OPS.inc.number) + (OPS.inc.loc ? ' · ' + E(OPS.inc.loc) : '') + '</p>';
    if (rows === undefined) return h + OPS.wait(rows, 'check-in') + '</div>';
    if (mine) return h + '<div class="card"><h3>' + I('check') + 'You are checked in</h3><p style="margin:0 0 6px"><b>' + E(mine.person) + '</b> · ' + E(mine.agency || '') + '</p><p class="dim" style="margin:0 0 12px">Since ' + E(OPS.dt(mine.checkin_time)) + ' · ' + OPS.hrs(mine.checkin_time).toFixed(1) + ' h · ' + E(mine.status) + (mine.assignment ? ' · ' + E(mine.assignment) : '') + '</p>' +
      '<div class="row"><button class="btn" data-act="selfRest" data-a="' + mine.OBJECTID + '">Going to rest / rehab</button><button class="btn" data-act="selfBack" data-a="' + mine.OBJECTID + '">Back available</button><button class="btn red" data-act="ciOut" data-a="' + mine.OBJECTID + '">Check out</button></div></div></div>';
    return h + '<div class="card"><h3>' + I('users') + 'Check in</h3>' + '<div id="selfForm">' + OPS.fieldsHtml('checkins', { person: me, role: 'Responder', persons: 1, checkin_loc: 'ICP' }, { skip: ['checkin_time', 'checkout_time', 'last_par', 'par_ok', 'status', 'assignment', 'notes'] }) + '</div><label class="chk" style="margin:10px 0"><input type="checkbox" id="selfGps" checked> Share my location at check-in</label><button class="btn big pri" style="width:100%" data-act="selfIn">' + I('check') + 'Check in</button></div>' +
      '<p class="dim" style="font-size:12.5px;margin-top:10px">You will show on the incident check-in list and Command Post. Check out here when you leave.</p></div>';
  }
  OPS.act.selfIn = function () {
    var box = document.getElementById('selfForm'), c = OPS.collect(box, 'checkins'); if (c.miss.length) { U.toast('Fill in: ' + c.miss.join(', '), 'err'); return; }
    var go = function (ll) { C.checkIn(Object.assign(c.attrs, { method: 'Phone' }), ll).then(function () { U.toast('Checked in', 'ok'); OPS.repaint(); }).catch(function (e) { U.toast(E(e.message), 'err', 8000); }); };
    if (document.getElementById('selfGps').checked && navigator.geolocation) navigator.geolocation.getCurrentPosition(function (p) { go([p.coords.latitude, p.coords.longitude]); }, function () { go(null); }, { timeout: 8000 }); else go(null);
  };
  OPS.act.selfRest = function (oid) { var r = OPS.findRow('checkins', oid); C.update(r, { status: 'Rest' }, r.person + ' to rest / rehab').then(OPS.repaint); };
  OPS.act.selfBack = function (oid) { var r = OPS.findRow('checkins', oid); C.update(r, { status: 'On Scene' }, r.person + ' back available').then(OPS.repaint); };
})(window.CP);
