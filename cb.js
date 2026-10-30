/* BEACON — Command Board (commandboard.html)
   A tap-first tactical board for the first hour: fire alarms and structure fires most often, any incident when needed.
   It is a Command Post incident from the first tap: units are the incident's resources, assignments are its
   teams & areas (ICS 204), benchmarks, PAR, MAYDAY and CAN reports go in its activity log, and the IC goes in the org.
   "Move to Command Post" opens the same incident in Command Post with nothing to re-enter.
   Tablet or computer: full board. Phone: live read-only view (or ?view=1). Works offline like the rest of BEACON. */
(function (CP) {
  'use strict';
  var A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon, AL = CP.alive;
  var CB = CP.cb = { inc: null, sel: null, list: null, saving: false };
  var TEMPLATES = {
    alarm: { n: 'Fire alarm', type: 'Fire', assign: [['group', 'Investigation'], ['staging', 'Staging']],
      marks: ['Arrived · nothing showing', 'Investigation started', 'Panel checked / zone found', 'Cause found', 'Area clear · no fire', 'System reset or turned over to owner'] },
    structure: { n: 'Structure fire', type: 'Fire', assign: [['group', 'Fire Attack'], ['group', 'Search'], ['group', 'Water Supply'], ['group', 'RIT'], ['group', 'Ventilation'], ['staging', 'Staging'], ['group', 'Rehab']],
      marks: ['360 / size-up complete', 'Water supply established', 'Primary search all clear', 'Fire under control', 'Secondary search all clear', 'Utilities secured', 'Loss stopped', 'Overhaul complete'] },
    vehicle: { n: 'Vehicle fire', type: 'Vehicle', assign: [['group', 'Fire Attack'], ['group', 'Traffic Control'], ['staging', 'Staging']], marks: ['Scene protected', 'Fire under control', 'Hazards mitigated', 'Overhaul complete'] },
    brush: { n: 'Brush / wildland', type: 'Wildfire', assign: [['division', 'Division A'], ['division', 'Division Z'], ['group', 'Water Supply'], ['staging', 'Staging']], marks: ['Size-up / anchor point', 'Water supply established', 'Forward spread stopped', 'Contained', 'Mop-up complete'] },
    other: { n: 'Other incident', type: 'Other', assign: [['staging', 'Staging']], marks: ['Scene size-up complete', 'Hazards identified', 'Incident stabilized', 'Scene cleared'] }
  };
  var ADD_ASSIGN = { Groups: ['Fire Attack', 'Search', 'Ventilation', 'Water Supply', 'RIT', 'Salvage', 'Overhaul', 'Utilities', 'Exposure', 'Medical', 'Rehab', 'Traffic Control', 'Investigation'], Divisions: ['Division 1', 'Division 2', 'Division 3', 'Roof', 'Basement', 'Side A', 'Side B', 'Side C', 'Side D'], Staging: ['Staging', 'Level 2 Staging'] };
  var KINDS = [['E', 'Engine', 'Engine'], ['L', 'Ladder', 'Ladder/Truck'], ['T', 'Tanker', 'Tanker/Tender'], ['R', 'Rescue', 'Rescue'], ['M', 'Medic', 'Ambulance (ALS)'], ['BR', 'Brush', 'Brush Truck'], ['BC', 'Chief', 'Overhead (single person)'], ['PD', 'Police', 'Law Enforcement'], ['U', 'Other', 'Other']];
  var MODES = ['Investigating', 'Offensive', 'Defensive', 'Transitional', 'Marginal'];
  var COND = ['Nothing showing', 'Smoke showing', 'Fire showing', 'Working fire', 'Under control'];

  // ---------- data helpers (all merge-safe items in the Command Post record) ----------
  function inc() { return CB.inc; }
  function kv(k, d) { var x = CP.byId(inc().cbKV || [], k); return x ? x.v : d; }
  function setKV(k, v) { var i = inc(); i.cbKV = i.cbKV || []; var x = CP.byId(i.cbKV, k); if (x) { x.v = v; x.u = CP.now(); } else i.cbKV.push({ id: k, v: v, u: CP.now() }); CP.touch(i, 'cbKV'); }
  function marks() { return AL(inc().cbMarks || []); }
  function log(text, cat) { var i = inc(), op = CP.curOP(i); CP.addItem(i, 'log', { ts: CP.now(), author: CP.me.name || '', pos: 'Command Board', cat: cat || 'Event', text: text, op: op ? op.n : 1 }); }
  function units() { return AL(inc().resources).filter(function (r) { return ['Released', 'Demobilized'].indexOf(r.status) < 0; }); }
  function asgs() { return AL(inc().assignments); }
  function aName(a) { return a.division || a.group || a.branch || a.staging || 'Assignment'; }
  function unitsIn(id) { return units().filter(function (r) { return r.assign === id; }); }
  function since(iso) { if (!iso) return ''; var s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000)); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + CP.pad(m) : m) + ':' + CP.pad(x); }
  function kindOf(name) { var n = String(name || '').toUpperCase().replace(/[^A-Z]/g, ''); var k = KINDS.find(function (x) { return n === x[0] || (x[0].length === 1 && n[0] === x[0] && n.length <= 2); }); return k ? k[2] : 'Other'; }

  var saveT = null;
  function commit(text, cat, quiet) {
    var i = inc(); if (text) log(text, cat);
    i.updatedBy = CP.me.name || ''; i.updated = CP.now(); CP.store.put(i);
    if (A.status === 'on') { clearTimeout(saveT); saveT = setTimeout(push, 900); } else if (A.signedIn() && CP.sync) CP.sync.markIncident(i.id);
    if (!quiet) render();
  }
  async function push() {
    if (!inc() || A.status !== 'on') return; CB.saving = true; paintSync();
    try { var before = inc().updated, merged = await A.save(CP.clone(inc())); CB.inc = inc().updated === before ? merged : CP.merge(inc(), merged); CP.store.put(CB.inc); }
    catch (e) { if (e.offline && CP.sync) CP.sync.markIncident(inc().id); else U.toast('Save to ArcGIS failed: ' + E(e.message) + '. Saved on this device; it will retry.', 'err'); }
    CB.saving = false; paintSync();
  }
  function paintSync() { var el = document.getElementById('cbSync'); if (el) el.innerHTML = I('cloud') + (A.status === 'on' ? (CB.saving ? 'Saving…' : 'Shared live') : A.signedIn() ? 'Offline · saved here' : 'Not signed in'); }

  // ---------- start screen ----------
  function startScreen() {
    var l = CB.list, cad = CB.cad;
    var h = '<div class="cbstart"><div class="cbhero"><h1>' + I('flag') + 'Command Board</h1><p>Start a board for a new incident, or open an incident that is already running. Everything you tap here is the Command Post incident, so you can move it to Command Post at any time.</p></div>';
    h += '<div class="cbcols"><section class="card"><h3>' + I('plus') + 'New board</h3><div class="cbtypes">' + Object.keys(TEMPLATES).map(function (k) { return '<button class="cbtype' + (CB.tpl === k ? ' on' : '') + '" data-cb="tpl" data-a="' + k + '">' + E(TEMPLATES[k].n) + '</button>'; }).join('') + '</div>' +
      '<label class="f"><span>Address / location</span><input class="in big" id="cbAddr" placeholder="e.g. 123 Main St, Daleville" value="' + E(CB.addr || '') + '"></label>' +
      '<label class="f"><span>Incident Commander</span><input class="in" id="cbIC" value="' + E(CP.me.name || '') + '" placeholder="Your name / unit"></label>' +
      '<label class="chk" style="margin:6px 0 12px"><input type="checkbox" id="cbEx"> Practice / training</label>' +
      '<button class="btn big pri" style="width:100%" data-cb="start">' + I('play') + 'Start command board</button></section>';
    h += '<section class="card"><h3>' + I('radio') + 'From an active CAD call</h3><p class="dim" style="margin-top:0">Tap a call to fill the address and bring its units onto the board.</p>' +
      (cad === undefined ? '<div class="empty">Loading CAD…</div>' : !cad || !cad.length ? '<div class="dim">No active CAD calls' + (A.signedIn() ? '' : ' (sign in to see CAD)') + '.</div>' : cad.slice(0, 20).map(function (c) { return '<button class="cbcad' + (CB.cadPick && CB.cadPick.callid === c.callid ? ' on' : '') + '" data-cb="cad" data-a="' + E(c.callid) + '"><b>' + E(c.type || c.cat || 'Call') + '</b><span>' + E(c.addr || '') + '</span><i>' + E((c.units || []).map(function (u) { return u.id; }).join(' ') || 'no units yet') + '</i></button>'; }).join('')) + '</section>';
    h += '<section class="card"><h3>' + I('list') + 'Open a running incident</h3>' + (l === undefined ? '<div class="empty">Loading incidents…</div>' : !l || !l.length ? '<div class="dim">No open incidents' + (A.signedIn() ? '' : ' (sign in to see shared incidents)') + '.</div>' : l.map(function (x) { return '<button class="cbcad" data-cb="open" data-a="' + E(x.incident_key) + '"><b>' + E(x.incident_name) + '</b><span>' + E(x.incident_number || '') + ' · ' + E(x.incident_type || '') + '</span><i>' + (x.exercise === 'Yes' ? 'PRACTICE · ' : '') + 'started ' + E(CP.fmtDT(new Date(x.start_time).toISOString())) + '</i></button>'; }).join('')) + '</section></div></div>';
    return h;
  }
  async function loadLists() {
    if (!A.signedIn()) { CB.list = []; CB.cad = []; return; }
    try { var r = await A.listRemote(); CB.list = r.filter(function (x) { return x.status !== 'Closed'; }).sort(function (a, b) { return (b.start_time || 0) - (a.start_time || 0); }).slice(0, 25); } catch (e) { CB.list = CP.store.list().filter(function (x) { return x.status !== 'Closed'; }).map(function (x) { return { incident_key: x.id, incident_name: x.name, incident_number: x.number, incident_type: x.type, start_time: Date.parse(x.start) }; }); }
    try {
      var f = await A.query(A.L.cad, '1=1', { geom: true, order: 'calldate DESC', n: 60, fields: 'callid,callcat,calltype,fulladdr,city,calldate,agency' });
      var u = await A.query(A.L.cadUnits, "CFSNumber IS NOT NULL AND CFSNumber<>'' AND CFSNumber<>'0'", { fields: 'UnitID,StatusName,UnitTypeDesc,DeptName,CFSNumber', n: 1000 }).catch(function () { return []; });
      var by = {}; u.forEach(function (x) { var a = x.attributes; (by[a.CFSNumber] = by[a.CFSNumber] || []).push({ id: a.UnitID, st: a.StatusName, type: a.UnitTypeDesc, dept: a.DeptName }); });
      CB.cad = f.map(function (x) { var a = x.attributes; return { callid: String(a.callid), type: a.calltype, cat: a.callcat, addr: [a.fulladdr, a.city].filter(Boolean).join(', '), ll: x.geometry ? toLL(x.geometry) : null, units: by[String(a.callid)] || [] }; })
        .sort(function (a, b) { return (/fire|alarm|smoke/i.test(b.type + ' ' + b.cat) ? 1 : 0) - (/fire|alarm|smoke/i.test(a.type + ' ' + a.cat) ? 1 : 0); });
    } catch (e) { CB.cad = []; }
  }
  function toLL(g) { if (g.x == null) return null; if (Math.abs(g.x) > 180) { var R = 6378137; return [Math.atan(Math.exp(g.y / R)) * 360 / Math.PI - 90, g.x / R * 180 / Math.PI]; } return [g.y, g.x]; }

  async function startBoard() {
    var tk = CB.tpl || 'structure', T = TEMPLATES[tk], addr = (document.getElementById('cbAddr').value || '').trim(), ic = (document.getElementById('cbIC').value || '').trim(), ex = document.getElementById('cbEx').checked;
    if (!addr) { U.toast('Enter the address or location', 'err'); return; }
    if (ic) { CP.me = Object.assign({}, CP.me, { name: CP.me.name || ic }); CP.store.setPref('me', CP.me); }
    var ll = CB.cadPick && CB.cadPick.ll;
    if (!ll && A.status === 'on') { try { var g = await A.req('https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates', { singleLine: addr + (/va|virginia/i.test(addr) ? '' : ', Botetourt County, VA'), maxLocations: 1, outFields: 'Score' }); var c = (g.candidates || [])[0]; if (c && c.score >= 80) ll = [c.location.y, c.location.x]; } catch (e) {} }
    var i = CP.newIncident({ name: (ex ? 'PRACTICE: ' : '') + T.n + ' · ' + addr, type: T.type, start: CP.now(), locdesc: addr, lat: ll ? +ll[0].toFixed(6) : null, lng: ll ? +ll[1].toFixed(6) : null, icName: ic, complexity: 5, opHours: 12, author: ic });
    if (ex) i.exercise = true;
    i.arc.auto = { incident: false, facilities: false }; // a fire alarm is not posted to the public incident map unless the IC turns it on in Command Post
    i.cbKV = [{ id: 'tpl', v: tk, u: CP.now() }, { id: 'mode', v: tk === 'alarm' ? 'Investigating' : 'Offensive', u: CP.now() }, { id: 'cond', v: tk === 'alarm' ? 'Nothing showing' : 'Smoke showing', u: CP.now() }, { id: 'parEvery', v: 20, u: CP.now() }, { id: 'parT', v: CP.now(), u: CP.now() }];
    i.cbMarks = T.marks.map(function (m, n) { return { id: 'm' + n, label: m, t: '', by: '', u: CP.now() }; });
    T.assign.forEach(function (a) { var o = { branch: '', division: '', group: '', staging: '', work: '', special: '', needs: [], reportTo: '' }; o[a[0]] = a[1]; CP.addItem(i, 'assignments', o); });
    CB.inc = i;
    if (CB.cadPick) { CP.addItem(i, 'calls', { callid: CB.cadPick.callid, type: CB.cadPick.type, addr: CB.cadPick.addr, linked: CP.now() }); (CB.cadPick.units || []).forEach(function (u) { addUnit(u.id, kindOf(u.id), u.dept || '', /arriv|on ?scene/i.test(u.st || '') ? 'Checked In' : 'En Route', true); }); }
    log('Command Board started: ' + T.n + ' at ' + addr + (ic ? '. ' + ic + ' has command.' : '') + (CB.cadPick ? ' CAD ' + CB.cadPick.callid + '.' : ''), 'Event');
    CP.store.setPref('curInc', { key: i.id, t: Date.now() }); history.replaceState(null, '', location.pathname + '?incident=' + encodeURIComponent(i.id));
    commit(null);
    if (A.status === 'on') push();
  }
  async function openBoard(key) {
    var i = CP.store.get(key);
    if (A.status === 'on') { try { var r = await A.loadRemote(key); if (r) i = i ? CP.merge(i, r) : r; } catch (e) { console.warn(e); } }
    if (!i) { U.toast('Could not open that incident here yet. Connect once to load it.', 'err'); return; }
    if (!i.cbMarks) { var T = TEMPLATES[/fire|wildfire/i.test(i.type) ? 'structure' : 'other']; i.cbMarks = T.marks.map(function (m, n) { return { id: 'm' + n, label: m, t: '', by: '', u: CP.now() }; }); i.cbKV = i.cbKV || [{ id: 'parEvery', v: 20, u: CP.now() }, { id: 'mode', v: 'Offensive', u: CP.now() }]; }
    CB.inc = i; CP.store.put(i); CP.store.setPref('curInc', { key: key, t: Date.now() });
    history.replaceState(null, '', location.pathname + '?incident=' + encodeURIComponent(key) + (phone() ? '&view=1' : '')); render();
  }

  // ---------- units ----------
  function addUnit(name, kind, agency, status, quiet) {
    name = String(name || '').trim().toUpperCase(); if (!name) return null;
    var ex = units().find(function (r) { return (r.name || '').toUpperCase() === name; }); if (ex) return ex;
    var r = CP.addItem(inc(), 'resources', { name: name, kind: kind || kindOf(name), type: '', agency: agency || '', leader: '', persons: 0, contact: '', orderNo: '', checkinLoc: 'Scene', status: status || 'Checked In', assign: '', checkin: CP.now() });
    if (!quiet) log(name + (status === 'En Route' ? ' responding' : ' on scene'), 'Resource');
    return r;
  }
  function moveUnit(r, aid) {
    var a = aid ? CP.byId(inc().assignments, aid) : null;
    r.assign = aid || ''; r.status = !a ? 'Checked In' : a.staging ? 'Staged' : 'Assigned'; r.u = CP.now(); if (r.status !== 'En Route' && !r.arrived) r.arrived = CP.now(); CP.touch(inc(), 'resources');
    commit(r.name + (a ? ' assigned to ' + aName(a) : ' available (unassigned)'), 'Resource');
  }

  // ---------- the board ----------
  function phone() { return window.innerWidth < 720 || new URLSearchParams(location.search).get('view') === '1'; }
  function board() {
    var i = inc(), mode = kv('mode', ''), cond = kv('cond', ''), parEvery = +kv('parEvery', 20), parT = kv('parT', i.start), parDue = new Date(parT).getTime() + parEvery * 60000, parLeft = Math.round((parDue - Date.now()) / 1000);
    var may = kv('mayday', null), ic = CP.personName(i, 'IC');
    var h = '<div class="cbtop' + (may ? ' mayday' : '') + '"><div class="cbaddr"><b>' + E(i.location.desc || i.name) + '</b><span>' + E(i.number) + ' · ' + E(TEMPLATES[kv('tpl', 'other')] ? TEMPLATES[kv('tpl', 'other')].n : i.type) + (ic ? ' · IC ' + E(ic) : '') + (i.exercise ? ' · <span class="chip practice">PRACTICE</span>' : '') + '</span></div>' +
      '<div class="cbclock"><span>ELAPSED</span><b id="cbEl">' + since(i.start) + '</b></div>' +
      '<button class="cbpar' + (parLeft <= 0 ? ' due' : parLeft < 120 ? ' soon' : '') + '" data-cb="par"><span>PAR every ' + parEvery + ' min</span><b id="cbPar">' + (parLeft <= 0 ? 'DUE ' + since(new Date(parDue).toISOString()) : Math.floor(parLeft / 60) + ':' + CP.pad(parLeft % 60)) + '</b></button>' +
      '<button class="cbmay" data-cb="mayday">' + I('warn') + (may ? 'MAYDAY ACTIVE' : 'MAYDAY') + '</button></div>';
    if (may) h += '<div class="cbmaybar">' + I('warn') + ' MAYDAY ' + E(since(may.t)) + ' · ' + E(may.who || '') + ' · ' + E(may.where || '') + ' · ' + E(may.air || '') + (may.rit ? ' · RIT: ' + E(may.rit) : '') + ' <button class="btn sm" data-cb="mayclear">Clear MAYDAY</button></div>';
    h += '<div class="cbbar"><div class="cbseg">' + MODES.map(function (m) { return '<button class="' + (m === mode ? 'on' : '') + (m === 'Defensive' ? ' def' : '') + '" data-cb="mode" data-a="' + m + '">' + m + '</button>'; }).join('') + '</div>' +
      '<div class="cbseg">' + COND.map(function (c) { return '<button class="' + (c === cond ? 'on' : '') + '" data-cb="cond" data-a="' + c + '">' + c + '</button>'; }).join('') + '</div>' +
      '<span class="sp"></span><span class="sync on" id="cbSync"></span><button class="btn sm" data-cb="can">' + I('msg') + 'CAN report</button><button class="btn sm" data-cb="note">' + I('log') + 'Log</button><button class="btn sm" data-cb="more">' + I('menu') + 'More</button><a class="btn sm pri" href="index.html?incident=' + encodeURIComponent(i.id) + '" target="_blank" rel="noopener" data-cb="tocp">' + I('link') + 'Move to Command Post</a></div>';
    // units rack
    var free = units().filter(function (r) { return !r.assign; }), enr = free.filter(function (r) { return r.status === 'En Route'; }), avail = free.filter(function (r) { return r.status !== 'En Route'; });
    h += '<div class="cbmain"><section class="cbrack"><div class="cbh">' + I('truck') + 'Units <span class="ct">' + units().length + '</span></div>' +
      '<div class="cbadd">' + KINDS.map(function (k) { return '<button data-cb="addk" data-a="' + k[0] + '" title="' + E(k[2]) + '">+' + k[0] + '</button>'; }).join('') + '</div>' +
      '<div class="cbsub">On scene · not assigned</div>' + (avail.length ? avail.map(tile).join('') : '<div class="dim cbempty">Tap a unit type above, or a unit below to assign it.</div>') +
      '<div class="cbsub">Responding</div>' + (enr.length ? enr.map(tile).join('') : '<div class="dim cbempty">—</div>') +
      '<button class="btn sm ghost" style="width:100%;margin-top:8px" data-cb="cadunits">' + I('radio') + 'Pull units from CAD</button></section>';
    // assignments
    h += '<section class="cbgrid">' + asgs().map(function (a) {
      var us = unitsIn(a.id), sup = a.reportTo || '', par = kv('par_' + a.id, null), can = a.cbCan || '';
      return '<div class="cbasg' + (a.staging ? ' stg' : a.division ? ' div' : '') + (CB.sel ? ' target' : '') + '" data-cb="drop" data-a="' + a.id + '"><div class="cbah"><b>' + E(aName(a)) + '</b>' + (sup ? '<span>' + E(sup) + '</span>' : '') + '<button class="ibtn" data-cb="amenu" data-a="' + a.id + '" title="Assignment options">' + I('menu') + '</button></div>' +
        '<div class="cbau">' + (us.length ? us.map(tile).join('') : '<div class="dim">' + (CB.sel ? 'Tap to assign here' : 'No units') + '</div>') + '</div>' +
        (can || a.work ? '<div class="cbcan">' + E(can || a.work).slice(0, 140) + '</div>' : '') + (par ? '<div class="cbpok">' + I('check') + 'PAR ' + E(since(par)) + ' ago</div>' : '') + '</div>';
    }).join('') + '<button class="cbasg cbnew" data-cb="newasg">' + I('plus') + 'Add division / group</button></section>';
    // benchmarks + log
    h += '<section class="cbside"><div class="cbh">' + I('check') + 'Benchmarks</div>' + marks().map(function (m) { return '<button class="cbmark' + (m.t ? ' done' : '') + '" data-cb="mark" data-a="' + m.id + '"><span>' + I(m.t ? 'check' : 'clock') + E(m.label) + '</span><i>' + (m.t ? E(CP.fmtTime(m.t)) + ' · +' + Math.round((new Date(m.t) - new Date(i.start)) / 60000) + ' min' : 'tap when done') + '</i></button>'; }).join('') +
      '<button class="btn xs ghost" data-cb="addmark">' + I('plus') + 'Benchmark</button>' +
      '<div class="cbh" style="margin-top:12px">' + I('log') + 'Activity</div><div class="cblog">' + AL(i.log).slice(-14).reverse().map(function (l) { return '<div><span class="mono">' + E(CP.fmtTime(l.ts)) + '</span> ' + E(l.text) + '</div>'; }).join('') + '</div></section></div>';
    return h;
  }
  function tile(r) {
    var on = CB.sel === r.id, st = r.status === 'En Route' ? 'enr' : r.status === 'Out of Service' ? 'oos' : r.assign ? 'asg' : 'av';
    var t = r.arrived || r.checkin; var mins = t ? Math.floor((Date.now() - new Date(t).getTime()) / 60000) : 0;
    return '<button class="cbunit ' + st + (on ? ' sel' : '') + '" data-cb="unit" data-a="' + r.id + '"><b>' + E(r.name) + '</b><span>' + E((r.kind || '').replace(/ \(.*\)/, '').replace('Overhead', 'Chief')) + (r.status === 'En Route' ? ' · resp.' : mins ? ' · ' + mins + 'm' : '') + '</span></button>';
  }

  // ---------- phone view (read-only, live) ----------
  function phoneView() {
    var i = inc(), may = kv('mayday', null), parEvery = +kv('parEvery', 20), parDue = new Date(kv('parT', i.start)).getTime() + parEvery * 60000, left = Math.round((parDue - Date.now()) / 1000);
    var h = '<div class="cbph"><div class="cbaddr"><b>' + E(i.location.desc || i.name) + '</b><span>' + E(kv('mode', '')) + ' · ' + E(kv('cond', '')) + (i.exercise ? ' · PRACTICE' : '') + '</span></div>' +
      '<div class="cbphrow"><div><span>Elapsed</span><b id="cbEl">' + since(i.start) + '</b></div><div class="' + (left <= 0 ? 'bad-t' : '') + '"><span>PAR</span><b id="cbPar">' + (left <= 0 ? 'DUE' : Math.floor(left / 60) + ':' + CP.pad(left % 60)) + '</b></div><div><span>Units</span><b>' + units().length + '</b></div></div>' +
      (may ? '<div class="cbmaybar">' + I('warn') + ' MAYDAY · ' + E(may.who || '') + ' · ' + E(may.where || '') + '</div>' : '') +
      asgs().map(function (a) { var us = unitsIn(a.id); return '<div class="cbphasg"><b>' + E(aName(a)) + '</b>' + (a.reportTo ? ' <span class="dim">· ' + E(a.reportTo) + '</span>' : '') + '<div>' + (us.length ? us.map(function (r) { return '<span class="chip">' + E(r.name) + '</span>'; }).join(' ') : '<span class="dim">—</span>') + '</div></div>'; }).join('') +
      '<div class="cbphasg"><b>Not assigned</b><div>' + units().filter(function (r) { return !r.assign; }).map(function (r) { return '<span class="chip' + (r.status === 'En Route' ? ' blue' : '') + '">' + E(r.name) + (r.status === 'En Route' ? ' (resp.)' : '') + '</span>'; }).join(' ') + '</div></div>' +
      '<div class="cbh">Benchmarks</div>' + marks().map(function (m) { return '<div class="cbphm ' + (m.t ? 'ok-t' : 'dim') + '">' + I(m.t ? 'check' : 'clock') + E(m.label) + (m.t ? ' · ' + E(CP.fmtTime(m.t)) : '') + '</div>'; }).join('') +
      '<div class="cbh">Activity</div><div class="cblog">' + AL(i.log).slice(-10).reverse().map(function (l) { return '<div><span class="mono">' + E(CP.fmtTime(l.ts)) + '</span> ' + E(l.text) + '</div>'; }).join('') + '</div>' +
      '<div class="row" style="margin-top:12px;gap:8px"><a class="btn" href="commandboard.html?incident=' + encodeURIComponent(i.id) + '&view=0">Full board</a><a class="btn" href="index.html?incident=' + encodeURIComponent(i.id) + '">Command Post</a></div><p class="dim" style="font-size:12px">Updates every few seconds.</p></div>';
    return h;
  }

  // ---------- render ----------
  function render() {
    var m = document.getElementById('cbmain'); if (!m) return;
    if (!A.signedIn() && !inc() && !CB.localOk) { m.innerHTML = '<div class="cbstart"><div class="cbhero"><h1>' + I('flag') + 'Command Board</h1><p>Sign in with your county ArcGIS account so the board is shared live with Command Post, the EOC and phones on scene. You can also start offline; it shares once you sign in.</p><button class="btn big pri" data-cb="signin">' + I('cloud') + 'Sign in with ArcGIS</button> <button class="btn big" data-cb="local">Start without signing in</button></div></div>'; return; }
    if (!inc()) { m.innerHTML = startScreen(); return; }
    var y = window.scrollY;
    var force = new URLSearchParams(location.search).get('view');
    m.innerHTML = (force === '0' ? false : phone()) ? phoneView() : board();
    document.body.classList.toggle('practice', !!inc().exercise); CP.practice = !!inc().exercise;
    paintSync(); window.scrollTo(0, y);
  }
  setInterval(function () {
    if (!inc()) return; var i = inc();
    var el = document.getElementById('cbEl'); if (el) el.textContent = since(i.start);
    var p = document.getElementById('cbPar'); if (p) { var due = new Date(kv('parT', i.start)).getTime() + (+kv('parEvery', 20)) * 60000, left = Math.round((due - Date.now()) / 1000); p.textContent = left <= 0 ? 'DUE ' + since(new Date(due).toISOString()) : Math.floor(left / 60) + ':' + CP.pad(left % 60); var b = p.closest('.cbpar'); if (b) { b.classList.toggle('due', left <= 0); b.classList.toggle('soon', left > 0 && left < 120); if (left === 0 && navigator.vibrate) navigator.vibrate([200, 100, 200]); } }
  }, 1000);
  // pull others' changes (phones and other tablets stay in step)
  setInterval(async function () {
    if (!inc() || A.status !== 'on' || CB.saving || document.getElementById('modal')) return;
    try { var m = await A.checkRemote(inc()); if (m) { CB.inc = m; CP.store.put(m); render(); } } catch (e) {}
  }, 5000);

  // ---------- actions ----------
  var act = {};
  act.signin = function () { A.signIn(); };
  act.local = function () { CB.localOk = true; CB.list = []; CB.cad = []; render(); };
  act.tpl = function (k) { CB.tpl = k; CB.addr = (document.getElementById('cbAddr') || {}).value || CB.addr; render(); };
  act.cad = function (id) { var c = (CB.cad || []).find(function (x) { return x.callid === id; }); CB.cadPick = c; CB.addr = c.addr; if (/alarm/i.test(c.type + ' ' + c.cat)) CB.tpl = 'alarm'; else if (/struct|resid|commerc|building|house/i.test(c.type)) CB.tpl = 'structure'; else if (/vehicle|car/i.test(c.type)) CB.tpl = 'vehicle'; else if (/brush|woods|grass|wild/i.test(c.type)) CB.tpl = 'brush'; render(); };
  act.start = function () { startBoard().catch(function (e) { U.toast(E(e.message), 'err'); }); };
  act.open = function (k) { openBoard(k); };
  act.mode = function (m) { setKV('mode', m); commit('Strategy: ' + m.toUpperCase(), 'Decision'); };
  act.cond = function (c) { setKV('cond', c); if (c === 'Working fire' && kv('tpl') === 'alarm') return upgrade(); commit('Conditions: ' + c, 'Event'); };
  act.unit = function (id) {
    if (CB.sel === id) { unitMenu(id); return; }
    CB.sel = id; render();
  };
  act.drop = function (aid, el, e) {
    if (e && e.target.closest('[data-cb="unit"],[data-cb="amenu"]')) return;
    if (!CB.sel) return;
    var r = CP.byId(inc().resources, CB.sel); CB.sel = null; if (r) moveUnit(r, aid);
  };
  act.addk = function (k) {
    var kind = KINDS.find(function (x) { return x[0] === k; });
    var bg = U.modal('Add ' + kind[1], '<div class="cbpad"><input class="in big" id="cbUn" value="' + (k === 'U' ? '' : k) + '" style="font-size:28px;font-weight:800;text-transform:uppercase;text-align:center"><div class="cbkeys">' + '1 2 3 4 5 6 7 8 9 ⌫ 0 ✓'.split(' ').map(function (d) { return '<button data-k="' + d + '">' + d + '</button>'; }).join('') + '</div>' +
      '<label class="chk"><input type="checkbox" id="cbEnr"> Responding (not on scene yet)</label><input class="in" id="cbAg" placeholder="Agency (optional)" style="margin-top:8px"></div>', [{ label: 'Cancel', cls: 'ghost' }, { label: 'Add unit', cls: 'pri', fn: function (b) { go(b); } }], { nofocus: true });
    function go(b) { var n = b.querySelector('#cbUn').value; if (!n || n === k) { U.toast('Unit number?', 'err'); return false; } var r = addUnit(n, kind[2], b.querySelector('#cbAg').value, b.querySelector('#cbEnr').checked ? 'En Route' : 'Checked In'); U.closeModal(); CB.sel = r && r.id; commit(null); }
    bg.addEventListener('click', function (e) { var b = e.target.closest('[data-k]'); if (!b) return; e.preventDefault(); var i = bg.querySelector('#cbUn'); if (b.dataset.k === '⌫') i.value = i.value.slice(0, -1); else if (b.dataset.k === '✓') go(bg); else i.value += b.dataset.k; });
  };
  function unitMenu(id) {
    var r = CP.byId(inc().resources, id); if (!r) return;
    var opts = [['onscene', 'On scene (unassigned)'], ['oos', 'Out of service'], ['release', 'Release from incident'], ['rename', 'Rename / agency'], ['cancel', 'Deselect']];
    var bg = U.modal(r.name, '<div class="cbmenu">' + opts.map(function (o) { return '<button data-um="' + o[0] + '"' + (o[0] === 'release' ? ' class="red"' : '') + '>' + E(o[1]) + '</button>'; }).join('') + '</div><p class="dim" style="font-size:12.5px">Tip: tap a unit, then tap an assignment to move it.</p>', [{ label: 'Close', cls: 'ghost' }], { nofocus: true });
    bg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-um]'); if (!b) return; e.preventDefault(); U.closeModal(); CB.sel = null; var k = b.dataset.um;
      if (k === 'onscene') { r.status = 'Checked In'; r.assign = ''; if (!r.arrived) r.arrived = CP.now(); r.u = CP.now(); CP.touch(inc(), 'resources'); commit(r.name + ' on scene', 'Resource'); }
      else if (k === 'oos') { r.status = 'Out of Service'; r.u = CP.now(); CP.touch(inc(), 'resources'); commit(r.name + ' out of service', 'Resource'); }
      else if (k === 'release') { r.status = 'Released'; r.assign = ''; r.released = CP.now(); r.u = CP.now(); CP.touch(inc(), 'resources'); commit(r.name + ' released', 'Resource'); }
      else if (k === 'rename') { var n = prompt('Unit name', r.name); if (n) { r.name = n.toUpperCase(); var ag = prompt('Agency', r.agency || ''); if (ag != null) r.agency = ag; r.u = CP.now(); CP.touch(inc(), 'resources'); commit(null); } }
      else render();
    });
  }
  act.amenu = function (aid) {
    var a = CP.byId(inc().assignments, aid); if (!a) return;
    var bg = U.modal(aName(a), '<label class="f"><span>Supervisor (officer / unit)</span><input class="in" id="amSup" value="' + E(a.reportTo || '') + '"></label><label class="f"><span>Task / objective</span><input class="in" id="amWork" value="' + E(a.work || '') + '" placeholder="e.g. Interior attack, 1st floor, Side A"></label>' +
      '<div class="cbmenu"><button data-am="can">CAN report from ' + E(aName(a)) + '</button><button data-am="par">PAR: all accounted</button><button data-am="rename">Rename</button><button data-am="free" class="ghost">Release all units to unassigned</button><button data-am="del" class="red">Remove assignment</button></div>',
      [{ label: 'Close', cls: 'ghost' }, { label: 'Save', cls: 'pri', fn: function (b) { var s = b.querySelector('#amSup').value.trim(), w = b.querySelector('#amWork').value.trim(); var ch = []; if (s !== (a.reportTo || '')) ch.push(s + ' supervising ' + aName(a)); if (w !== (a.work || '')) ch.push(aName(a) + ': ' + w); a.reportTo = s; a.work = w; a.u = CP.now(); CP.touch(inc(), 'assignments'); commit(ch.join('. ') || null, 'Action'); } }], { nofocus: true });
    bg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-am]'); if (!b) return; e.preventDefault(); var k = b.dataset.am; U.closeModal();
      if (k === 'can') return canReport(a);
      if (k === 'par') { setKV('par_' + a.id, CP.now()); commit('PAR ' + aName(a) + ': all accounted (' + unitsIn(a.id).map(function (r) { return r.name; }).join(', ') + ')', 'Safety'); }
      if (k === 'rename') { var n = prompt('Name', aName(a)); if (n) { ['division', 'group', 'staging', 'branch'].forEach(function (f) { if (a[f]) a[f] = n; }); a.u = CP.now(); CP.touch(inc(), 'assignments'); commit(null); } }
      if (k === 'free') { unitsIn(a.id).forEach(function (r) { r.assign = ''; r.status = 'Checked In'; r.u = CP.now(); }); CP.touch(inc(), 'resources'); commit('Units released from ' + aName(a), 'Resource'); }
      if (k === 'del') { if (!confirm('Remove ' + aName(a) + '? Its units become unassigned.')) return; unitsIn(a.id).forEach(function (r) { r.assign = ''; r.status = 'Checked In'; r.u = CP.now(); }); a.del = true; a.u = CP.now(); CP.touch(inc(), 'assignments'); CP.touch(inc(), 'resources'); commit(aName(a) + ' removed', 'Action'); }
    });
  };
  act.newasg = function () {
    var bg = U.modal('Add division / group', Object.keys(ADD_ASSIGN).map(function (g) { return '<div class="fgrp">' + g + '</div><div class="cbmenu grid">' + ADD_ASSIGN[g].map(function (n) { return '<button data-na="' + E(g) + '|' + E(n) + '">' + E(n) + '</button>'; }).join('') + '</div>'; }).join('') + '<div class="row" style="margin-top:10px"><input class="in grow" id="naOther" placeholder="Other name"><button class="btn" data-na="Groups|">Add</button></div>', [{ label: 'Close', cls: 'ghost' }], { nofocus: true });
    bg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-na]'); if (!b) return; e.preventDefault(); var p = b.dataset.na.split('|'), n = p[1] || bg.querySelector('#naOther').value.trim(); if (!n) return;
      var o = { branch: '', division: '', group: '', staging: '', work: '', special: '', needs: [], reportTo: '' }; o[p[0] === 'Divisions' ? 'division' : p[0] === 'Staging' ? 'staging' : 'group'] = n;
      CP.addItem(inc(), 'assignments', o); U.closeModal(); commit(n + ' established', 'Action');
    });
  };
  act.mark = function (id) {
    var m = CP.byId(inc().cbMarks, id); if (!m) return;
    if (m.t) { if (!confirm('Clear "' + m.label + '"?')) return; m.t = ''; m.by = ''; m.u = CP.now(); CP.touch(inc(), 'cbMarks'); return commit('Benchmark cleared: ' + m.label, 'Note'); }
    m.t = CP.now(); m.by = CP.me.name || ''; m.u = CP.now(); CP.touch(inc(), 'cbMarks');
    if (/under control/i.test(m.label) && kv('cond') !== 'Under control') setKV('cond', 'Under control');
    commit('BENCHMARK: ' + m.label + ' (' + since(inc().start) + ' into the incident)', 'Event');
  };
  act.addmark = function () { var n = prompt('Benchmark'); if (!n) return; inc().cbMarks = inc().cbMarks || []; inc().cbMarks.push({ id: CP.uid(), label: n, t: '', by: '', u: CP.now() }); CP.touch(inc(), 'cbMarks'); commit(null); };
  act.par = function () {
    var list = asgs().filter(function (a) { return unitsIn(a.id).length; }), every = +kv('parEvery', 20);
    var bg = U.modal('PAR · Personnel Accountability', '<div class="cbmenu">' + list.map(function (a) { return '<label class="cbparrow"><input type="checkbox" data-pa="' + a.id + '"> <b>' + E(aName(a)) + '</b> <span class="dim">' + E(unitsIn(a.id).map(function (r) { return r.name; }).join(', ')) + '</span></label>'; }).join('') + '</div>' +
      '<div class="row" style="margin-top:10px;gap:8px"><span class="dim">PAR timer every</span>' + [10, 15, 20, 30].map(function (n) { return '<button class="btn xs' + (n === every ? ' pri' : '') + '" data-pe="' + n + '">' + n + ' min</button>'; }).join('') + '</div>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Record PAR', cls: 'pri', fn: function (b) {
        var ok = [], miss = []; b.querySelectorAll('[data-pa]').forEach(function (x) { var a = CP.byId(inc().assignments, x.dataset.pa); (x.checked ? ok : miss).push(aName(a)); if (x.checked) setKV('par_' + a.id, CP.now()); });
        setKV('parT', CP.now()); commit('PAR: ' + ok.length + ' of ' + list.length + ' assignments accounted' + (miss.length ? '. NOT ACCOUNTED: ' + miss.join(', ') : ''), 'Safety');
        if (miss.length) U.toast('NOT ACCOUNTED: ' + E(miss.join(', ')), 'err', 9000);
      } }], { nofocus: true });
    bg.addEventListener('click', function (e) { var p = e.target.closest('[data-pe]'); if (!p) return; e.preventDefault(); setKV('parEvery', +p.dataset.pe); bg.querySelectorAll('[data-pe]').forEach(function (x) { x.classList.toggle('pri', x === p); }); commit(null, null, true); });
  };
  act.mayday = function () {
    var may = kv('mayday', null); if (may) { U.toast('MAYDAY already active. Clear it from the red bar.', 'err'); return; }
    var rit = asgs().find(function (a) { return /RIT/i.test(aName(a)); });
    U.modal('MAYDAY', '<div class="warnbox" style="margin-bottom:10px">Clear the channel, acknowledge, get LUNAR, commit RIT, call a PAR.</div><div class="grid g2"><label class="f"><span>Who (unit / name)</span><input class="in big" name="who"></label><label class="f"><span>Location</span><input class="in big" name="where" placeholder="Floor, side, room"></label><label class="f"><span>Air remaining</span><input class="in" name="air"></label><label class="f"><span>Assignment</span><input class="in" name="asg"></label><label class="f spanall"><span>Needs</span><input class="in" name="needs"></label></div>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Declare MAYDAY', cls: 'red', fn: function (b) {
        var g = function (n) { return U.val(b, n); }, m = { t: CP.now(), who: g('who'), where: g('where'), air: g('air'), asg: g('asg'), rit: rit ? unitsIn(rit.id).map(function (r) { return r.name; }).join(', ') : '' };
        setKV('mayday', m); commit('MAYDAY: ' + [m.who, m.where, m.air && 'air ' + m.air, m.asg, g('needs')].filter(Boolean).join(' · ') + (m.rit ? '. RIT committed: ' + m.rit : ''), 'Safety');
        if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]);
      } }]);
  };
  act.mayclear = function () { var m = kv('mayday', null); if (!m || !confirm('Clear the MAYDAY? Only when the member is out and accounted for.')) return; setKV('mayday', null); commit('MAYDAY cleared after ' + since(m.t) + ': ' + (m.who || ''), 'Safety'); };
  function canReport(a) {
    U.modal('CAN report' + (a ? ' · ' + aName(a) : ''), '<label class="f"><span>Conditions</span><input class="in" name="c" placeholder="What you see"></label><label class="f"><span>Actions</span><input class="in" name="a" placeholder="What you are doing"></label><label class="f"><span>Needs</span><input class="in" name="n" placeholder="What you need"></label>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Log it', cls: 'pri', fn: function (b) { var t = ['C: ' + U.val(b, 'c'), 'A: ' + U.val(b, 'a'), 'N: ' + U.val(b, 'n')].filter(function (x) { return x.length > 3; }).join(' · '); if (!t) return false; if (a) { a.cbCan = t; a.u = CP.now(); CP.touch(inc(), 'assignments'); } commit('CAN' + (a ? ' ' + aName(a) : '') + ': ' + t, 'Communication'); } }]);
  }
  act.can = function () { canReport(null); };
  act.note = function () { U.modal('Log entry', '<textarea class="in" id="cbNote" style="min-height:90px"></textarea><div class="cbmenu grid" style="margin-top:8px">' + ['Command transferred', 'Requested 2nd alarm', 'Utilities on scene', 'Fire marshal requested', 'Red Cross requested', 'Occupants accounted for'].map(function (q) { return '<button data-q="' + E(q) + '">' + E(q) + '</button>'; }).join('') + '</div>', [{ label: 'Cancel', cls: 'ghost' }, { label: 'Log', cls: 'pri', fn: function (b) { var t = b.querySelector('#cbNote').value.trim(); if (!t) return false; commit(t, /command/i.test(t) ? 'Decision' : 'Event'); } }], { onOpen: function (b) { b.addEventListener('click', function (e) { var q = e.target.closest('[data-q]'); if (!q) return; e.preventDefault(); var n = b.querySelector('#cbNote'); n.value = (n.value ? n.value + '. ' : '') + q.dataset.q; }); } }); };
  act.more = function () {
    var bg = U.modal('More', '<div class="cbmenu">' + [['ic', 'Transfer command (new IC)'], ['upgrade', kv('tpl') === 'alarm' ? 'Upgrade: alarm is a working fire' : 'Add structure-fire assignments'], ['phonelink', 'Phone view link / QR'], ['tocp', 'Move to Command Post (full ICS)'], ['close', 'Terminate command / close incident'], ['exit', 'Back to board list']].map(function (o) { return '<button data-mo="' + o[0] + '"' + (o[0] === 'close' ? ' class="red"' : '') + '>' + E(o[1]) + '</button>'; }).join('') + '</div>', [{ label: 'Close', cls: 'ghost' }], { nofocus: true });
    bg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-mo]'); if (!b) return; e.preventDefault(); var k = b.dataset.mo; U.closeModal();
      if (k === 'ic') { var n = prompt('New Incident Commander (name / unit)'); if (!n) return; var p = CP.person(inc(), 'IC'); if (p) { p.name = n; p.u = CP.now(); } else CP.addItem(inc(), 'org', { pos: 'IC', label: '', name: n, agency: '', phone: '', radio: '', email: '', checkin: CP.now() }); CP.touch(inc(), 'org'); commit('Command transferred to ' + n, 'Decision'); }
      if (k === 'upgrade') upgrade();
      if (k === 'phonelink') phoneLink();
      if (k === 'tocp') toCP();
      if (k === 'close') { if (!confirm('Terminate command and close this incident?')) return; CP.setPath(inc(), 'status', 'Closed'); CP.setPath(inc(), 'closed', CP.now()); units().forEach(function (r) { r.status = 'Released'; r.released = CP.now(); r.u = CP.now(); }); CP.touch(inc(), 'resources'); commit('Command terminated. Incident closed after ' + since(inc().start) + '.', 'Decision'); }
      if (k === 'exit') { CB.inc = null; history.replaceState(null, '', location.pathname); CB.list = undefined; render(); loadLists().then(render); }
    });
  };
  function upgrade() {
    var T = TEMPLATES.structure, have = asgs().map(aName);
    T.assign.forEach(function (a) { if (have.indexOf(a[1]) >= 0) return; var o = { branch: '', division: '', group: '', staging: '', work: '', special: '', needs: [], reportTo: '' }; o[a[0]] = a[1]; CP.addItem(inc(), 'assignments', o); });
    var hm = marks().map(function (m) { return m.label; }); T.marks.forEach(function (m) { if (hm.indexOf(m) < 0) inc().cbMarks.push({ id: CP.uid(), label: m, t: '', by: '', u: CP.now() }); }); CP.touch(inc(), 'cbMarks');
    setKV('tpl', 'structure'); setKV('mode', 'Offensive'); setKV('cond', 'Working fire');
    var nm = inc().name.replace(/Fire alarm/, 'Structure fire'); if (nm !== inc().name) CP.setPath(inc(), 'name', nm);
    commit('UPGRADED to working structure fire', 'Decision');
  }
  function toCP() {
    var i = inc(); if (i.complexity >= 5) CP.setPath(i, 'complexity', 4);
    commit('Moved to Command Post (full ICS). Units, assignments and log carried over.', 'Decision', true);
    window.open('index.html?incident=' + encodeURIComponent(i.id) + '&view=dash', '_blank');
  }
  act.tocp = function (a, el, e) { e && e.preventDefault(); toCP(); };
  function phoneLink() {
    var url = location.origin + location.pathname + '?incident=' + encodeURIComponent(inc().id) + '&view=1', img = '';
    try { var q = window.qrcode(0, 'M'); q.addData(url); q.make(); img = q.createImgTag(5, 8); } catch (e) {}
    U.modal('Phone view', '<div style="text-align:center">' + img + '<p class="mono" style="word-break:break-all;font-size:12px">' + E(url) + '</p><p class="dim">Read-only live view for chiefs, officers and the EOC. Needs a county ArcGIS sign-in.</p></div>', [{ label: 'Copy link', fn: function () { navigator.clipboard.writeText(url); U.toast('Copied', 'ok'); return false; } }, { label: 'Close', cls: 'ghost' }]);
  }
  act.cadunits = async function () {
    var ids = AL(inc().calls).map(function (c) { return c.callid; }); if (!CB.cad) await loadLists();
    var calls = (CB.cad || []).filter(function (c) { return !ids.length || ids.indexOf(c.callid) >= 0; });
    if (!calls.length) { U.toast('No linked CAD call with units. Add units by tapping a type.', 'err'); return; }
    var n = 0; calls.forEach(function (c) { (c.units || []).forEach(function (u) { if (!units().some(function (r) { return (r.name || '').toUpperCase() === String(u.id).toUpperCase(); })) { addUnit(u.id, kindOf(u.id), u.dept || '', /arriv|on ?scene/i.test(u.st || '') ? 'Checked In' : 'En Route', true); n++; } }); });
    commit(n ? n + ' unit(s) added from CAD' : null, 'Resource'); U.toast(n ? n + ' unit(s) added from CAD' : 'All CAD units are already on the board', 'ok');
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-cb]'); if (!el) return;
    var f = act[el.dataset.cb]; if (!f) return;
    if (el.tagName === 'A' && el.dataset.cb !== 'tocp') return;
    e.preventDefault(); e.stopPropagation();
    try { var r = f(el.dataset.a, el, e); if (r && r.catch) r.catch(function (er) { U.toast(E(er.message), 'err'); }); } catch (er) { console.error(er); U.toast(E(er.message), 'err'); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && CB.sel && !document.getElementById('modal')) { CB.sel = null; render(); } });
  window.addEventListener('resize', function () { clearTimeout(CB._rz); CB._rz = setTimeout(render, 200); });
  window.addEventListener('cp-incident-synced', function (ev) { if (inc() && inc().id === ev.detail) { var s = CP.store.get(ev.detail); if (s) { CB.inc = CP.merge(inc(), s); render(); } } });
  window.addEventListener('cp-reconnected', function () { if (inc()) push(); });

  // ---------- boot ----------
  CB.boot = async function () {
    CP.me = CP.store.prefs().me || {};
    document.getElementById('app').innerHTML = '<header class="hdr cbhdr"><img class="seal" src="seal.png" alt="Botetourt County Emergency Management seal"><div class="lock ops"><div class="k">' + E(CP.BRAND) + ' · BOTETOURT COUNTY EMERGENCY MANAGEMENT</div><div class="t">COMMAND BOARD</div></div><span class="sp" style="flex:1"></span>' + CP.beaconMark() + '</header><main id="cbmain" class="cbwrap"></main>';
    try { if (await A.handleRedirect() === 'away') return; } catch (e) {}
    var qs = new URLSearchParams(location.search), want = qs.get('incident');
    render();
    if (A.signedIn()) await A.connect();
    if (want) await openBoard(want); else { await loadLists(); render(); }
  };
})(window.CP);
