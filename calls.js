/* COMMAND POST — live CAD calls side panel.
   Active calls from "CAD Calls For Service - Active" with units from "CAD Units" (matched on call number).
   Link a call to the incident, log it, check its units in as resources, or show it on the map. */
(function (CP) {
  'use strict';
  var U = CP.ui, E = CP.esc, A = CP.alive, I = U.icon;
  var C = CP.calls = { open: false, filter: 'near', calls: [], units: {}, seen: null, asof: '', err: '', radius: 5 };
  function app() { return CP.app; }
  try { var pr = CP.store.prefs(); C.open = !!pr.callsOpen; C.filter = pr.callsFilter || 'near'; C.radius = pr.callsRadius || 5; } catch (e) {}

  function miles(a, b, c, d) { var R = 3958.8, r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2); return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y)); }
  function inPoly(lat, lng, poly) { var ins = false; for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) { var yi = poly[i][0], xi = poly[i][1], yj = poly[j][0], xj = poly[j][1]; if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) ins = !ins; } return ins; }
  C.dist = function (call) {
    var inc = app().inc; if (!inc || call.lat == null) return null;
    if (inc.perimeter && inc.perimeter.length > 2 && inPoly(call.lat, call.lng, inc.perimeter)) return 0;
    var best = null;
    [[inc.location.lat, inc.location.lng]].concat(A(inc.facilities).map(function (f) { return [f.lat, f.lng]; })).forEach(function (p) { if (p[0] == null) return; var d = miles(p[0], p[1], call.lat, call.lng); if (best == null || d < best) best = d; });
    return best;
  };
  function linked(id) { var inc = app().inc; return inc && A(inc.calls).find(function (c) { return c.callid === id; }); }

  C.refresh = async function (quiet) {
    if (!CP.arc.signedIn()) return;
    try {
      var f = await CP.arc.query(CP.arc.L.cad, '1=1', { geom: true, order: 'calldate DESC', n: 300, fields: 'callid,callcat,calltype,priority,description,fulladdr,city,locdesc,calldate,dispatchdate,arrivaldate,agency,firstunit,unittotal,disposition,comments' });
      var u = await CP.arc.query(CP.arc.L.cadUnits, "CFSNumber IS NOT NULL AND CFSNumber<>'' AND CFSNumber<>'0'", { fields: 'UnitID,StatusName,UnitTypeDesc,DeptName,CFSNumber', n: 1000 }).catch(function () { return []; });
      var units = {}; u.forEach(function (x) { var a = x.attributes; (units[a.CFSNumber] = units[a.CFSNumber] || []).push({ id: a.UnitID, st: a.StatusName, type: a.UnitTypeDesc, dept: a.DeptName }); });
      C.units = units;
      C.calls = f.map(function (x) { var a = x.attributes; return { callid: String(a.callid), cat: a.callcat, type: a.calltype, pri: a.priority, desc: a.description, addr: a.fulladdr, city: a.city, loc: a.locdesc, ts: a.calldate, disp: a.dispatchdate, arr: a.arrivaldate, agency: a.agency, comments: a.comments, lat: x.geometry && x.geometry.y, lng: x.geometry && x.geometry.x }; });
      // new calls near the incident -> alert
      var ids = C.calls.map(function (c) { return c.callid; });
      if (C.seen && app().inc) {
        var fresh = C.calls.filter(function (c) { return C.seen.indexOf(c.callid) < 0; });
        var near = fresh.filter(function (c) { var d = C.dist(c); return d != null && d <= C.radius; });
        if (near.length) { C.newNear = (C.newNear || 0) + near.length; U.toast(I('radio') + ' New CAD call near the incident: <b>' + E(near[0].type) + '</b> at ' + E(near[0].addr) + (near.length > 1 ? ' (+' + (near.length - 1) + ' more)' : ''), '', 7000); }
      }
      C.seen = ids; C.asof = CP.fmtTime(CP.now()); C.err = '';
      // keep linked calls' snapshots current and note when they clear
      var inc = app().inc;
      if (inc) A(inc.calls).forEach(function (l) { var live = C.calls.find(function (c) { return c.callid === l.callid; }); if (!live && !l.cleared) { l.cleared = CP.now(); l.u = CP.now(); CP.touch(inc, 'calls'); app().log('CAD call ' + l.callid + ' (' + l.type + ') is no longer active in CAD', 'Event'); app().commit(false); } });
    } catch (e) { C.err = e.message; }
    C.paint();
  };

  C.toggle = function () { C.open = !C.open; if (C.open) C.newNear = 0; CP.store.setPref('callsOpen', C.open); C.paint(); setTimeout(function () { if (app()._big) app()._big.invalidateSize(); }, 250); };

  C.list = function () {
    var inc = app().inc;
    return C.calls.map(function (c) { c._d = C.dist(c); return c; }).filter(function (c) {
      if (C.filter === 'linked') return !!linked(c.callid);
      if (C.filter === 'near') return inc ? (c._d != null && c._d <= C.radius) || !!linked(c.callid) : true;
      if (C.filter === 'fire') return /FIRE|EMS|RESCUE/i.test(c.cat || '');
      if (C.filter === 'law') return /LAW|POLICE|SO/i.test(c.cat || '');
      return true;
    });
  };

  C.paint = function () {
    var el = document.getElementById('calls'); if (!el) return;
    document.body.classList.toggle('calls-open', C.open);
    var tab = document.getElementById('callstab');
    var n = C.calls.length;
    if (tab) tab.innerHTML = I('radio') + '<span>CAD CALLS</span><b>' + (CP.arc.signedIn() ? n : '–') + '</b>' + (C.newNear ? '<i>' + C.newNear + ' new</i>' : '');
    if (!C.open) { el.innerHTML = ''; return; }
    var inc = app().inc;
    if (!CP.arc.signedIn()) { el.innerHTML = head() + '<div class="cbody"><div class="empty">Sign in with ArcGIS to see live CAD calls.<div style="margin-top:8px"><button class="btn pri sm" data-act="signin">Sign in</button></div></div></div>'; return; }
    var list = C.list();
    var flt = [['near', inc ? 'Near incident' : 'All'], ['all', 'All'], ['fire', 'Fire/EMS'], ['law', 'Law'], ['linked', 'Linked']].filter(function (x, i) { return inc || (i !== 0 && i !== 4); });
    var h = head() + '<div class="cfilt">' + flt.map(function (x) { return '<button class="' + (C.filter === x[0] ? 'on' : '') + '" data-act="callsFilter" data-a="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      (inc && C.filter === 'near' ? '<div class="crad">Within <select data-act-change="callsRadius">' + [1, 2, 5, 10, 25].map(function (r) { return '<option' + (r === C.radius ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select> miles of the incident, its area and facilities' + (inc.location.lat ? '' : ' <span style="color:#ffd27a">(set the incident location)</span>') + '</div>' : '') +
      '<div class="cbody">' + (C.err ? '<div class="warnbox" style="font-size:12px">' + E(C.err) + '</div>' : '') +
      (list.length ? list.map(card).join('') : '<div class="empty" style="font-size:13px">' + (C.filter === 'near' ? 'No active calls near the incident.' : C.filter === 'linked' ? 'No calls linked to this incident yet.' : 'No active calls.') + '</div>') +
      (inc && C.filter === 'linked' ? clearedLinked() : '') + '</div><div class="cfoot">Updated ' + (C.asof || '…') + ' · refreshes every 30 seconds</div>';
    el.innerHTML = h;
  };
  function head() { return '<div class="chead"><b>' + I('radio') + ' Live CAD calls</b><button class="ibtn" data-act="callsRefresh" title="Refresh">' + I('refresh') + '</button><button class="ibtn" data-act="callsToggle" title="Close">' + I('x') + '</button></div>'; }
  function ago(ms) { if (!ms) return ''; var m = Math.round((Date.now() - ms) / 60000); return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; }
  function card(c) {
    var inc = app().inc, L = linked(c.callid), u = C.units[c.callid] || [];
    var col = /FIRE/i.test(c.cat) ? '#F0444C' : /EMS|RESCUE/i.test(c.cat) ? '#ff8d3a' : /LAW|SO|POLICE/i.test(c.cat) ? '#3D7BFF' : '#93A9C3';
    return '<div class="ccard' + (L ? ' linked' : '') + '" style="border-left-color:' + col + '"><div class="ct1"><span class="ctype">' + E(c.type || 'CALL') + '</span>' + (c.pri ? '<span class="cpri p' + c.pri + '">P' + c.pri + '</span>' : '') + '<span class="cago">' + ago(c.ts) + '</span></div>' +
      '<div class="caddr">' + E(c.addr || c.loc || 'No address') + '</div>' +
      (c.desc ? '<div class="cdesc">' + E(String(c.desc).slice(0, 160)) + '</div>' : '') +
      '<div class="cmeta">#' + E(c.callid) + (c.cat ? ' · ' + E(c.cat) : '') + (c.agency ? ' · ' + E(c.agency) : '') + (c._d != null ? ' · ' + (c._d === 0 ? 'inside incident area' : c._d.toFixed(1) + ' mi away') : '') + '</div>' +
      (u.length ? '<div class="cunits">' + u.map(function (x) { return '<span class="cu" title="' + E((x.type || '') + ' · ' + (x.dept || '')) + '">' + E(x.id) + ' <i>' + E(x.st || '') + '</i></span>'; }).join('') + '</div>' : '<div class="cunits dim" style="font-size:11.5px">No units assigned</div>') +
      (inc ? '<div class="cact">' + (L ? '<span class="chip ok" style="font-size:10.5px">Linked</span>' : '<button class="btn xs pri" data-act="callLink" data-a="' + E(c.callid) + '">Link to incident</button>') +
        '<button class="btn xs" data-act="callLog" data-a="' + E(c.callid) + '">Log</button>' + (u.length ? '<button class="btn xs" data-act="callUnits" data-a="' + E(c.callid) + '" title="Check these units in as incident resources">Check in units</button>' : '') + (c.lat != null ? '<button class="ibtn" data-act="callMap" data-a="' + E(c.callid) + '" title="Show on map">' + I('pin') + '</button>' : '') + '</div>' : '') + '</div>';
  }
  function clearedLinked() {
    var cl = A(app().inc.calls).filter(function (c) { return c.cleared; });
    return cl.length ? '<div class="sec-t" style="margin:12px 0 6px;font-size:12px">Cleared linked calls</div>' + cl.map(function (c) { return '<div class="ccard" style="opacity:.6;border-left-color:#4b6584"><div class="ct1"><span class="ctype">' + E(c.type) + '</span><span class="cago">cleared ' + CP.fmtTime(c.cleared) + '</span></div><div class="caddr">' + E(c.addr || '') + '</div><div class="cmeta">#' + E(c.callid) + '</div></div>'; }).join('') : '';
  }
  function byId(id) { return C.calls.find(function (c) { return c.callid === id; }); }

  // actions
  CP.extendCallActs = function (act, change) {
    act.callsToggle = function () { C.toggle(); };
    act.callsRefresh = function () { C.refresh(); };
    act.callsFilter = function (f) { C.filter = f; CP.store.setPref('callsFilter', f); C.paint(); };
    change.callsRadius = function (el) { C.radius = +el.value; CP.store.setPref('callsRadius', C.radius); C.paint(); };
    act.callLink = function (id) {
      var c = byId(id), inc = app().inc; if (!c || !inc) return;
      inc.calls = inc.calls || [];
      CP.addItem(inc, 'calls', { callid: c.callid, type: c.type, cat: c.cat, addr: c.addr, desc: c.desc, ts: c.ts ? new Date(c.ts).toISOString() : '', lat: c.lat, lng: c.lng, agency: c.agency, units: (C.units[id] || []).map(function (u) { return u.id; }).join(', '), linkedBy: CP.me.name || '' });
      app().log('CAD call #' + c.callid + ' linked to incident: ' + c.type + ' at ' + (c.addr || '') + ((C.units[id] || []).length ? ' (units ' + C.units[id].map(function (u) { return u.id; }).join(', ') + ')' : ''), 'Event');
      app().commit(true); C.paint(); U.toast('Call #' + E(c.callid) + ' linked to the incident.', 'ok');
    };
    act.callLog = function (id) {
      var c = byId(id); if (!c) return;
      app().log('CAD #' + c.callid + ': ' + c.type + ' at ' + (c.addr || '') + (c.desc ? ' — ' + c.desc : '') + ((C.units[id] || []).length ? ' [units ' + C.units[id].map(function (u) { return u.id + ' ' + (u.st || ''); }).join(', ') + ']' : ''), 'Communication', { ts: c.ts ? new Date(c.ts).toISOString() : CP.now() });
      app().commit(true); U.toast('Added to the log.', 'ok');
    };
    act.callUnits = function (id) {
      var c = byId(id), inc = app().inc, us = C.units[id] || []; if (!inc) return;
      var added = [];
      us.forEach(function (u) {
        if (A(inc.resources).some(function (r) { return r.name === u.id; })) return;
        CP.addItem(inc, 'resources', { name: u.id, kind: u.type ? u.type.replace(/\b\w+/g, function (w) { return w[0] + w.slice(1).toLowerCase(); }) : '', agency: u.dept || '', status: /SCENE|ARRIV/i.test(u.st || '') ? 'Assigned' : /ENROUTE|DISP/i.test(u.st || '') ? 'En Route' : 'Checked In', checkin: CP.now(), checkinLoc: 'Other', location: c ? c.addr : '', notes: 'From CAD call #' + id, cadCall: id });
        added.push(u.id);
      });
      if (!added.length) return U.toast('Those units are already on the incident.');
      app().log('Checked in from CAD call #' + id + ': ' + added.join(', '), 'Resource'); app().commit(true); U.toast(added.length + ' unit' + (added.length > 1 ? 's' : '') + ' added to Resources.', 'ok');
    };
    act.callMap = function (id) {
      var c = byId(id); if (!c) return;
      app().ui.layers = app().ui.layers || {}; app().ui.layers.cad = true; app().ui.focusCall = c;
      if (app().view !== 'map') app().go('map'); else app().bigMap(app().inc);
    };
  };

  setInterval(function () { if (CP.arc.signedIn()) C.refresh(true); }, 30000);
})(window.CP);
