/* COMMAND POST — app shell, routing, events, actions */
(function (CP) {
  'use strict';
  var U = CP.ui, E = CP.esc, A = CP.alive, I = U.icon;
  var app = CP.app = { inc: null, view: 'home', ui: {}, remoteList: [], dirty: false };
  CP.me = CP.store.prefs().me || {};

  var NAV = [
    ['Incident', [['dash', 'Overview', 'dash'], ['brief', 'Situation', 'brief'], ['map', 'Map', 'map'], ['log', 'Activity Log', 'log'], ['monitor', 'EOC Monitor', 'eye']]],
    ['People & Resources', [['org', 'People & Roles', 'org'], ['resources', 'Resources', 'truck'], ['assign', 'Teams & Areas', 'list', 3], ['messages', 'Requests & Messages', 'req'], ['facilities', 'Facilities', 'flag']]],
    ['Community', [['roads', 'Roads & Evacuations', 'warn'], ['shelters', 'Shelters & Distribution', 'build'], ['field', 'Field Reports', 'pin'], ['da', 'Damage Assessment', 'home'], ['lifelines', 'Lifelines', 'lifeline'], ['checklist', 'EOC Checklist', 'check'], ['public', 'Public Updates', 'news']]],
    ['Planning', [['objectives', 'Shift Plan', 'target', 3], ['safety', 'Safety', 'shield', 3], ['comms', 'Radio & Contacts', 'radio', 3], ['medical', 'Medical Plan', 'med', 3]]],
    ['Reports', [['status', 'Status Reports', 'report'], ['forms', 'Reports & Forms', 'forms']]],
    ['Setup', [['arc', 'Connections', 'cloud'], ['settings', 'Settings', 'gear']]]
  ];
  var MINCX = {}; NAV.forEach(function (g) { g[1].forEach(function (n) { if (n[3]) MINCX[n[0]] = n[3]; }); });
  app.visible = function (v) { var inc = app.inc; if (!inc) return true; return !MINCX[v] || inc.showAll || inc.complexity <= MINCX[v]; };

  // ---------- shell ----------
  function headerArt() {
    var g = ''; for (var x = 0; x <= 2000; x += 40) g += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="120"/>'; for (var y = 0; y <= 120; y += 40) g += '<line x1="0" y1="' + y + '" x2="2000" y2="' + y + '"/>';
    return '<div class="art"><svg viewBox="0 0 2000 120" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="hg" x1="0" x2="1"><stop offset="0" stop-color="#08131F"/><stop offset=".55" stop-color="#0d2238"/><stop offset="1" stop-color="#16365c"/></linearGradient><radialGradient id="hr" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FDB833" stop-opacity=".22"/><stop offset="1" stop-color="#FDB833" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="2000" height="120" fill="url(#hg)"/><g stroke="#ffffff" stroke-opacity=".035" stroke-width="1">' + g + '</g>' +
      '<g transform="translate(1250 58)"><circle r="120" fill="url(#hr)"/><g fill="none" stroke="#FDB833" stroke-opacity=".22"><circle r="26"/><circle r="52"/><circle r="80" stroke-opacity=".14"/><circle r="110" stroke-opacity=".08"/></g>' +
      '<g stroke="#FDB833" stroke-opacity=".35"><line x1="-130" y1="0" x2="-30" y2="0"/><line x1="30" y1="0" x2="130" y2="0"/><line x1="0" y1="-70" x2="0" y2="-30"/><line x1="0" y1="30" x2="0" y2="70"/></g>' +
      '<path d="M-6 16 V-18 H14 L9 -11 L14 -4 H-6" fill="#FDB833" stroke="#FDB833" stroke-width="2" stroke-linejoin="round"/><circle cx="-6" cy="16" r="2.5" fill="#FDB833"/>' +
      '<circle cx="-62" cy="-22" r="4.5" fill="#D02129" stroke="#fff" stroke-width="1.5"/><circle cx="48" cy="30" r="4.5" fill="#3D7BFF" stroke="#fff" stroke-width="1.5"/><circle cx="70" cy="-34" r="4" fill="#2FBF71" stroke="#fff" stroke-width="1.5"/><circle cx="-40" cy="40" r="3.5" fill="#FDB833" stroke="#fff" stroke-width="1.5"/></g>' +
      '<g stroke="#3D7BFF" stroke-opacity=".18" fill="none"><path d="M1500 120 L1640 0"/><path d="M1560 120 L1700 0"/><path d="M1620 120 L1760 0"/></g></svg></div>';
  }
  app.mount = function () {
    document.getElementById('app').innerHTML =
      '<header class="hdr">' + headerArt() + '<button class="ibtn mnav" data-act="menu" style="position:relative;margin-left:8px;color:#fff">' + I('menu') + '</button><img class="seal" src="seal.png" alt="Botetourt County Emergency Management seal"><div class="lock" data-act="home" title="All incidents"><div class="k">BOTETOURT COUNTY EMERGENCY MANAGEMENT</div><div class="t">COMMAND POST<span>Incident Management</span></div></div>' +
      '<div class="right"><div class="clock" id="clock"></div></div></header>' +
      '<div id="ibar"></div><div class="body"><nav class="nav" id="nav"></nav><main class="main" id="main"></main><aside class="calls" id="calls"></aside><aside class="apps" id="apps"></aside></div><button class="callstab" id="callstab" data-act="callsToggle" title="Live CAD calls"></button><button class="callstab appstab" id="appstab" data-act="appsToggle" title="Overwatch, Stormwatch and other live apps"></button>' +
      '<datalist id="dl_kinds">' + CP.RES_KINDS.map(function (k) { return '<option value="' + E(k) + '">'; }).join('') + '</datalist>' +
      '<datalist id="dl_agency">' + ['Botetourt County Fire & EMS', 'Botetourt County Sheriff\'s Office', 'Botetourt County Emergency Management', 'Botetourt County Emergency Communications', 'Botetourt County Public Works', 'Botetourt County Public Schools', 'Town of Buchanan', 'Town of Fincastle', 'Town of Troutville', 'Virginia State Police', 'VDOT', 'VDEM', 'American Red Cross', 'AEP', 'Craig-Botetourt Electric Cooperative', 'Carilion Clinic', 'Roanoke County', 'Rockbridge County', 'Craig County', 'Bedford County', 'Virginia Dept. of Forestry', 'Virginia Dept. of Health'].map(function (k) { return '<option value="' + E(k) + '">'; }).join('') + '</datalist>' +
      '<datalist id="dl_pos">' + CP.POSITIONS.map(function (p) { return '<option value="' + E(p.t) + '">'; }).join('') + '</datalist>';
    tickClock(); setInterval(tickClock, 15000);
  };
  function tickClock() { var d = new Date(), el = document.getElementById('clock'); if (el) el.innerHTML = CP.pad(d.getHours()) + CP.pad(d.getMinutes()) + '<small>' + d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase() + '</small>'; }

  app.paintChrome = function () {
    var inc = app.inc, ib = document.getElementById('ibar'), nav = document.getElementById('nav');
    if (!ib) return;
    var a = CP.arc, st = a.status, sync = !a.signedIn() ? '<span class="sync" title="Saved on this device only">' + I('cloud') + 'Local</span>' : st === 'on' ? '<span class="sync on" title="Shared through ArcGIS">' + I('cloud') + (app.saving ? 'Saving…' : 'Synced') + '</span>' : st === 'busy' ? '<span class="sync busy">' + I('cloud') + 'Connecting…</span>' : st === 'nosvc' ? '<span class="sync busy" title="Command Post service not set up">' + I('cloud') + 'Signed in · no service</span>' : '<span class="sync err" title="' + E(a.err) + '">' + I('cloud') + 'Offline</span>';
    if (!inc) { ib.innerHTML = '<div class="ibar"><span class="nm" style="font-size:16px;color:var(--muted)">Incident board</span><span class="sp"></span>' + sync + (a.signedIn() ? '' : '<button class="btn sm" data-act="signin">Sign in</button>') + '</div>'; nav.innerHTML = navHtml(); return; }
    var op = CP.curOP(inc);
    ib.innerHTML = '<div class="ibar"><div style="min-width:0"><div class="nm" title="' + E(inc.name) + '">' + E(inc.name) + '</div><div class="no">' + E(inc.number) + ' · ' + E(inc.type) + '</div></div>' +
      '<span class="chip gold">Type ' + inc.complexity + '</span>' + (inc.status === 'Closed' ? '<span class="chip mute">Closed</span>' : '<span class="chip ok"><span class="dot"></span>Active ' + CP.elapsed(inc.start) + '</span>') +
      (op ? '<span class="chip">Shift ' + op.n + ' · ' + CP.fmtTime(op.start) + '–' + CP.fmtTime(op.end) + '</span>' : '') + '<span class="chip blue">' + E(inc.eoc.eoc_status) + '</span>' +
      '<span class="sp"></span>' + sync + '<button class="btn sm pri" data-act="actions">' + I('plus') + 'Action</button><button class="btn sm" data-act="quicklog">' + I('log') + 'Log</button><button class="btn sm ghost" data-act="home" title="All incidents">' + I('home') + '</button></div>';
    nav.innerHTML = navHtml();
  };
  function navHtml() {
    var inc = app.inc;
    var on = function (v) { return app.view === v ? ' class="on"' : ''; };
    if (!inc) return '<div class="grp">Command Post</div><a href="#"' + on('home') + ' data-act="home">' + I('home') + 'Incident board</a><a href="#" data-act="new">' + I('plus') + 'New incident</a><a href="#"' + on('monitor') + ' data-nav="monitor">' + I('eye') + 'EOC Monitor</a><a href="#"' + on('checklist') + ' data-nav="checklist">' + I('check') + 'EOC Checklist</a><a href="#"' + on('arc') + ' data-nav="arc">' + I('cloud') + 'Connections</a><div class="grp">EM toolkit</div>' + CP.TOOLKIT.map(function (t) { return '<a href="' + t.u + '" target="_blank" rel="noopener">' + I('link') + E(t.n) + '</a>'; }).join('');
    var cnt = { resources: A(inc.resources).filter(function (r) { return ['Released', 'Demobilized'].indexOf(r.status) < 0; }).length, log: A(inc.log).length, messages: A(inc.requests).filter(function (r) { return ['Filled', 'Cancelled'].indexOf(r.status) < 0; }).length, assign: A(inc.assignments).length, org: A(inc.org).filter(function (p) { return p.name; }).length, facilities: A(inc.facilities).length };
    var h = '', hidden = 0;
    NAV.forEach(function (g) {
      var items = g[1].filter(function (n) { var vis = app.visible(n[0]); if (!vis) hidden++; return vis; });
      if (!items.length) return;
      h += '<div class="grp">' + g[0] + '</div>' + items.map(function (n) { return '<a href="#' + n[0] + '" data-nav="' + n[0] + '" class="' + (app.view === n[0] ? 'on' : '') + '">' + I(n[2]) + E(n[1]) + (cnt[n[0]] ? '<span class="ct">' + cnt[n[0]] + '</span>' : '') + '</a>'; }).join('');
    });
    if (hidden) h += '<div class="hidden-note">Quick mode: ' + hidden + ' planning pages hidden. <a href="#" data-act="showAll">Switch to Full mode</a></div>';
    return h;
  };

  app.render = function () {
    var main = document.getElementById('main'); if (!main) return;
    var v = app.view, inc = app.inc;
    if (!inc && ['home', 'arc', 'monitor', 'checklist'].indexOf(v) < 0) v = app.view = 'home';
    if (inc && !app.visible(v)) v = app.view = 'dash';
    var html;
    try { html = (CP.views[v] || CP.views.home)(inc); } catch (e) { console.error(e); html = '<div class="wrap"><div class="warnbox">This page hit an error: ' + E(e.message) + '</div></div>'; }
    var y = main.scrollTop; main.innerHTML = html; if (app._keepScroll) main.scrollTop = y; app._keepScroll = false;
    app.paintChrome();
    if (CP.after[v] && (inc || v === 'monitor')) try { CP.after[v](inc); } catch (e) { console.error(e); }
    document.getElementById('nav').classList.remove('open');
  };
  app.rerender = function () { app._keepScroll = true; app.render(); };
  app.go = function (v) { app.view = v; if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v); document.getElementById('main').scrollTop = 0; app.render(); };

  // ---------- data ----------
  app.personnel = function (inc) { return A(inc.resources).filter(function (r) { return ['Released', 'Demobilized', 'Ordered', 'En Route'].indexOf(r.status) < 0; }).reduce(function (s, r) { return s + (+r.persons || 0); }, 0) + A(inc.org).filter(function (p) { return p.name; }).length; };
  app.selOP = function (inc) { var ops = A(inc.opPeriods); return ops.find(function (o) { return o.id === app.ui.opSel; }) || CP.curOP(inc); };
  app.mapImg = function (inc) { try { return localStorage.getItem('bcem.cp.map.' + inc.id) || ''; } catch (e) { return ''; } };
  app.setMe = function (me) { CP.me = Object.assign({}, CP.me, me); CP.store.setPref('me', CP.me); };
  app.log = function (text, cat, extra) {
    if (!app.inc) return;
    var op = CP.curOP(app.inc);
    CP.addItem(app.inc, 'log', Object.assign({ ts: CP.now(), author: CP.me.name || '', pos: CP.me.pos || '', cat: cat || 'Event', text: text, op: op ? op.n : 1 }, extra || {}));
  };
  var saveT = null;
  app.commit = function (render) {
    var inc = app.inc; if (!inc) return;
    inc.updatedBy = CP.me.name || ''; CP.store.put(inc);
    if (render) app.rerender(); else app.paintChrome();
    if (CP.arc.status === 'on') { clearTimeout(saveT); saveT = setTimeout(app.pushRemote, 1800); }
    autoPush();
  };
  app.pushRemote = async function () {
    if (!app.inc || CP.arc.status !== 'on') return;
    app.saving = true; app.paintChrome();
    try {
      var before = app.inc.updated, merged = await CP.arc.save(CP.clone(app.inc));
      if (app.inc.updated === before) { app.inc = merged; } else { app.inc = CP.merge(app.inc, merged); }
      CP.store.put(app.inc);
    } catch (e) { console.warn(e); CP.arc.err = e.message; U.toast('ArcGIS save failed: ' + E(e.message) + '. Your changes are safe on this device and will retry.', 'err', 5000); clearTimeout(saveT); saveT = setTimeout(app.pushRemote, 20000); }
    app.saving = false; app.paintChrome();
  };
  // auto-push incident point/facilities when those sections change
  var autoT = null, lastAuto = {};
  function autoPush() {
    var inc = app.inc; if (!inc || !CP.arc.signedIn() || !inc.arc || !inc.arc.auto) return;
    clearTimeout(autoT); autoT = setTimeout(async function () {
      var sig = { incident: JSON.stringify([inc.name, inc.type, inc.status, inc.location, inc.perimeter, inc.publicView, inc.situation]), facilities: JSON.stringify(A(inc.facilities)) };
      for (var k of ['incident', 'facilities']) { if (inc.arc.auto[k] && lastAuto[inc.id + k] !== sig[k]) { lastAuto[inc.id + k] = sig[k]; try { await doPush(k, true); } catch (e) {} } }
    }, 4000);
  }

  app.open = async function (id, view) {
    var inc = CP.store.get(id);
    if (CP.arc.status === 'on') {
      try { var remote = await CP.arc.loadRemote(id); if (remote) inc = inc ? CP.merge(inc, remote) : remote; } catch (e) { console.warn(e); }
    }
    if (!inc) { U.toast('Could not open that incident.', 'err'); return; }
    inc = migrate(inc);
    app.inc = inc; CP.store.put(inc); CP.store.setPref('last', id);
    app.ui = {}; CP.arc.live = {};
    app.go(view || 'dash');
    if (CP.arc.signedIn()) app.refreshLive();
  };
  function migrate(inc) {
    var t = CP.newIncident({});
    Object.keys(t).forEach(function (k) { if (inc[k] === undefined) inc[k] = t[k]; });
    ['medical', 'publicInfo', 's209', 'eoc', 'arc'].forEach(function (k) { Object.keys(t[k]).forEach(function (j) { if (inc[k][j] === undefined) inc[k][j] = t[k][j]; }); });
    CP.LIFELINES.forEach(function (l) { if (!inc.lifelines[l.key]) inc.lifelines[l.key] = { status: 'Unknown', desc: '' }; });
    return inc;
  }
  app.closeIncident = function () { app.inc = null; app.view = 'home'; CP.store.setPref('last', null); history.replaceState(null, '', '#'); app.render(); app.loadRemoteList(); };
  app.loadRemoteList = async function () {
    if (CP.arc.status !== 'on') return;
    try { var l = await CP.arc.listRemote(); var ch = JSON.stringify(l) !== JSON.stringify(app.remoteList); app.remoteList = l; if (ch && !app.inc) app.render(); } catch (e) { console.warn(e); }
  };
  app.refreshLive = async function () {
    if (!CP.arc.signedIn()) return;
    try { await CP.arc.refreshLive(app.inc); } catch (e) { console.warn(e); }
    if (app.inc && (app.view === 'dash' || app.view === 'status' || app.view === 'arc') && !editing()) app.rerender();
    if (app.view === 'map' && app._big) app.loadOverlays();
  };
  function editing() { var a = document.activeElement; return a && a.closest && a.closest('#main') && /INPUT|TEXTAREA|SELECT/.test(a.tagName); }
  app.newSitrep = function (inc) {
    var n = A(inc.sitreps).length + 1, last = A(inc.sitreps).slice(-1)[0] || {}, op = CP.curOP(inc);
    return { number: inc.number.replace(/^\d{4}-/, '') + '-' + n, ts: CP.now(), preparedBy: CP.me.name || CP.personName(inc, 'SITL') || CP.personName(inc, 'PSC'), nextDue: op ? op.end : '', changes: '', weather: (op && op.weather) || last.weather || '', roads: last.roads || '', fireEms: last.fireEms || '',
      aep_customers: last.aep_customers || '', aep_outages: '', cb_customers: last.cb_customers || '', cb_outages: '', dominion_customers: last.dominion_customers || '', dominion_outages: '', stations: Object.assign({}, last.stations || {}) };
  };

  // ---------- maps ----------
  app.miniMap = function (id, inc) {
    var el = document.getElementById(id); if (!el || !window.L) return;
    var m = CP.map.create(el, {}); var g = L.layerGroup().addTo(m);
    var pts = CP.map.drawIncident(m, inc, g);
    if (pts.length > 1) m.fitBounds(pts, { padding: [30, 30], maxZoom: 15 }); else if (pts.length) m.setView(pts[0], 14);
    app._mini = m;
  };
  app.bigMap = function (inc) {
    var el = document.getElementById('bigmap'); if (!el || !window.L) return;
    var m = app._big = CP.map.create(el, {}); var g = app._bigG = L.layerGroup().addTo(m); app._ov = {};
    var pts = CP.map.drawIncident(m, inc, g);
    if (pts.length > 1) m.fitBounds(pts, { padding: [40, 40], maxZoom: 15 }); else if (pts.length) m.setView(pts[0], 14);
    var mode = app.ui.mapMode; app.ui.mapMode = null;
    if (mode === 'loc') app.act.mapPick();
    else if (mode && mode.indexOf('fac:') === 0) pickFacility(mode.slice(4));
    if (CP.arc.signedIn()) app.loadOverlays();
    var fc = app.ui.focusCall; app.ui.focusCall = null;
    if (fc && fc.lat != null) { m.setView([fc.lat, fc.lng], 15); L.popup().setLatLng([fc.lat, fc.lng]).setContent('<b>CAD #' + E(fc.callid) + '</b><br>' + E(fc.type || '') + '<br>' + E(fc.addr || '')).openOn(m); }
  };
  function hint(msg, cancel) { var h = document.getElementById('maphint'); if (h) h.innerHTML = msg ? '<div class="hint" style="margin-bottom:10px;display:flex;gap:10px;align-items:center">' + msg + (cancel ? '<button class="btn xs" style="margin-left:auto" data-act="' + cancel + '">' + (cancel === 'mapDrawDone' ? 'Finish' : 'Cancel') + '</button>' : '') + '</div>' : ''; }
  function pickFacility(fid) {
    var m = app._big, f = CP.byId(app.inc.facilities, fid); if (!m || !f) return;
    hint('<b>Click the map</b> to place <b>' + E(f.name || f.type) + '</b>.');
    CP.map.pick(m, function (ll) { CP.setPath(app.inc, 'facilities@' + fid + '.lat', +ll.lat.toFixed(6)); CP.setPath(app.inc, 'facilities@' + fid + '.lng', +ll.lng.toFixed(6)); app.log('Facility placed on map: ' + (f.name || f.type), 'Event'); hint(''); app.commit(true); });
  }
  app.loadOverlays = async function () {
    var m = app._big; if (!m) return; var lay = app.ui.layers || {}, lv = CP.arc.live || {}, ov = app._ov;
    function set(k, build) { if (ov[k]) { m.removeLayer(ov[k]); delete ov[k]; } if (!lay[k]) return; var g = build(); if (g) { ov[k] = g.addTo(m); } }
    function grp() { return L.layerGroup(); }
    set('cad', function () { var g = grp(); (lv.cadCalls || []).forEach(function (c) { if (c.lat) g.addLayer(L.marker([c.lat, c.lng], { icon: CP.map.dotIcon('#FDB833', 13) }).bindPopup('<b>' + E(c.type) + '</b><br>' + E(c.addr) + '<br>' + CP.fmtDT(c.ts && new Date(c.ts).toISOString()) + (c.agency ? '<br>' + E(c.agency) : ''))); }); return g; });
    set('shelters', function () { var g = grp(); (lv.shelters || []).forEach(function (s) { if (s.lat) g.addLayer(L.marker([s.lat, s.lng], { icon: CP.map.pinIcon('#F0444C', 'SH', 24) }).bindPopup('<b>' + E(s.name) + '</b><br>' + E(s.status) + (s.cap ? '<br>' + (s.occ || 0) + ' / ' + s.cap : ''))); }); return g; });
    set('closures', function () { var g = grp(); (lv.closures || []).forEach(function (c) { (c.paths || []).forEach(function (p) { g.addLayer(L.polyline(p.map(function (q) { return [q[1], q[0]]; }), { color: '#ff4d58', weight: 5, opacity: .9 }).bindPopup('<b>' + E(c.street) + '</b><br>' + E(c.reason || '') + '<br>' + E(c.desc || ''))); }); }); return g; });
    var async = { storm: ['storm', function (f) { var a = f.attributes, gm = f.geometry; return gm && L.marker([gm.y, gm.x], { icon: CP.map.dotIcon({ Responder: '#3D7BFF', Dispatch: '#9cbcff', Public: '#5ad1ff' }[f._src], 11) }).bindPopup('<b>' + f._src + ' storm report</b><br>' + E(a.report_type || a.type || a.situation_type || '') + '<br>' + E((a.comments || a.description || a.details || '').toString().slice(0, 200)) + '<br>' + (a.CreationDate ? CP.fmtDT(new Date(a.CreationDate).toISOString()) : '')); }],
      units: ['cadUnits', function (f) { var a = f.attributes, gm = f.geometry; return gm && L.marker([gm.y, gm.x], { icon: CP.map.dotIcon('#2FBF71', 12) }).bindPopup('<b>' + E(a.UnitID) + '</b><br>' + E(a.StatusName || '') + '<br>' + E(a.DeptName || '')); }],
      caltopo: ['caltopo', function (f) { var a = f.attributes, gm = f.geometry; return gm && L.marker([gm.y, gm.x], { icon: CP.map.dotIcon('#7fe3ab', 11) }).bindPopup('<b>' + E(a.unit_name || a.device) + '</b><br>' + E(a.status || '')); }],
      nws: ['nws', function (f) { var gm = f.geometry, a = f.attributes; return gm && gm.rings && L.polygon(gm.rings.map(function (r) { return r.map(function (q) { return [q[1], q[0]]; }); }), { color: '#F28C28', weight: 1.5, fillOpacity: .12 }).bindPopup('<b>' + E(a.Event) + '</b><br>' + E(a.Severity || '')); }],
      notices: ['notices', function (f) { var gm = f.geometry, a = f.attributes; return gm && gm.rings && L.polygon(gm.rings.map(function (r) { return r.map(function (q) { return [q[1], q[0]]; }); }), { color: '#c77dff', weight: 2, fillOpacity: .15 }).bindPopup('<b>' + E(a.zonename || 'Evacuation zone') + '</b><br>' + E(a.evactype || '')); }] };
    Object.keys(async).forEach(function (k) {
      if (ov[k]) { m.removeLayer(ov[k]); delete ov[k]; }
      if (!lay[k]) return;
      CP.arc.overlay(async[k][0]).then(function (feats) { if (!app._big || app._big !== m || !app.ui.layers[k]) return; var g = L.layerGroup(); feats.forEach(function (f) { var l = async[k][1](f); if (l) g.addLayer(l); }); if (ov[k]) m.removeLayer(ov[k]); ov[k] = g.addTo(m); }).catch(function (e) { console.warn(k, e); });
    });
  };

  // ---------- preview / print / download ----------
  function pagesFor(list, o) { var inc = app.inc; o = o || {}; var mi = app.mapImg(inc); return list.map(function (no) { return CP.renderForm(inc, no, Object.assign({ mapImg: mi, forms: list }, o)); }).join(''); }
  app.preview = function (title, list, o) {
    var html = pagesFor(list, o);
    var bg = U.modal(title, '<div class="row" style="margin-bottom:12px"><button class="btn pri" data-act="printNow">' + I('print') + 'Print / Save as PDF</button><button class="btn" data-act="dlNow">' + I('down') + 'Download (HTML)</button><span class="dim" style="font-size:12px">To make a PDF, choose "Save as PDF" as the printer.</span></div><div class="viewer" id="viewer">' + html + '</div>', [], { wide: true, nofocus: true });
    app._pv = { title: title, list: list, o: o };
    bg.querySelector('.modal').style.maxWidth = '9.6in';
  };
  app.print = function (list, o) {
    var pr = document.getElementById('printroot'); pr.innerHTML = pagesFor(list, o);
    setTimeout(function () { window.print(); }, 250);
  };
  var cssCache = null, sealCache = null;
  app.downloadHtml = async function (name, list, o) {
    if (!cssCache) cssCache = await fetch('app.css?v=6').then(function (r) { return r.text(); }).catch(function () { return ''; });
    if (!sealCache) sealCache = await fetch('seal.png').then(function (r) { return r.blob(); }).then(function (b) { return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsDataURL(b); }); }).catch(function () { return ''; });
    var css = cssCache.slice(cssCache.indexOf('/* ===================== ICS FORM PAPER')).replace('#printroot{display:none}', '');
    var body = pagesFor(list, o).split('seal.png').join(sealCache);
    var doc = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + E(name) + '</title><style>body{margin:0;background:#525d6b}.ics-page{margin:20px auto;box-shadow:0 6px 24px rgba(0,0,0,.4)}@media print{body{background:#fff}.ics-page{margin:0;box-shadow:none;page-break-after:always;height:11in;overflow:hidden}}' + css.replace(/#printroot /g, '') + '</style></head><body>' + body + '</body></html>';
    U.download(name.replace(/[^\w\-]+/g, '_') + '.html', doc, 'text/html');
  };
  function iapSel() { var l = []; document.querySelectorAll('.iapck').forEach(function (c) { if (c.checked) l.push(c.value); }); var opId = (document.getElementById('iapop') || {}).value; var op = CP.byId(app.inc.opPeriods, opId); var order = ['cover', '202', '203', '204', '205', '205A', '206', '207', '208', '215A', 'map']; return { list: order.filter(function (x) { return l.indexOf(x) >= 0; }), o: { op: op } }; }

  // ---------- events ----------
  function setValue(el) {
    var inc = app.inc; if (!inc) return;
    var p = el.dataset.p, t = el.dataset.t, v;
    if (t === 'b') v = el.checked; else if (t === 'n') v = el.value === '' ? '' : +el.value; else if (t === 'dt') v = CP.fromLocalInput(el.value); else v = el.value;
    var old = CP.getPath(inc, p);
    if (old === v) return;
    CP.setPath(inc, p, v);
    var m;
    if ((m = p.match(/^resources@(\w+)\.status$/))) { var r = CP.byId(inc.resources, m[1]); app.log((r.name || 'Resource') + ' status: ' + (old || '—') + ' → ' + v, 'Resource'); if ((v === 'Released' || v === 'Demobilized') && r) { r.demob = r.demob || {}; r.demob.released = r.demob.released || CP.now(); } }
    if ((m = p.match(/^resources@(\w+)\.assign$/))) { var r2 = CP.byId(inc.resources, m[1]); if (v && r2 && ['Checked In', 'Staged', 'Available', ''].indexOf(r2.status || '') >= 0) r2.status = 'Assigned'; app.log((r2.name || 'Resource') + (v ? ' assigned to ' + CP.forms.assignName(inc, v) : ' unassigned'), 'Resource'); }
    if ((m = p.match(/objectives@(\w+)\.status$/)) && v === 'Done') { var ob = CP.getPath(inc, p.replace(/\.status$/, '')); app.log('Objective met: ' + (ob && ob.text), 'Decision'); }
    if (p === 'publicView') CP.touch(inc, 'publicView');
    app.commit(el.dataset.rr === '1' && (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'datetime-local'));
  }
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.dataset && el.dataset.p && el.tagName !== 'SELECT' && el.type !== 'checkbox' && el.type !== 'datetime-local') { setValue(el); }
    if (el.dataset && el.dataset.sr) { var sr = app.ui.sr, k = el.dataset.sr; if (k.indexOf('stations.') === 0) { sr.stations = sr.stations || {}; sr.stations[k.slice(9)] = el.value; } else sr[k] = el.dataset.t === 'dt' ? CP.fromLocalInput(el.value) : el.value; }
  });
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.dataset && el.dataset.p && (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'datetime-local')) setValue(el);
    else if (el.dataset && el.dataset.p && el.dataset.rr === '1') app.rerender();
    if (el.dataset && el.dataset.actChange) { var fn = app.change[el.dataset.actChange]; if (fn) fn(el); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.id === 'qtext') { e.preventDefault(); app.act.qlog(); }
    if (e.key === 'Escape') U.closeModal();
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-nav],[data-act],[data-add],[data-del]'); if (!t) return;
    if (t.tagName === 'A' && t.getAttribute('target') === '_blank') return;
    if (t.tagName === 'INPUT' && t.type === 'checkbox') return;
    e.preventDefault();
    if (t.dataset.nav) { if (!app.inc && ['arc', 'monitor', 'checklist'].indexOf(t.dataset.nav) < 0) return; U.closeModal(); return app.go(t.dataset.nav); }
    if (t.dataset.add) return addRow(t.dataset.add, t.dataset.tpl);
    if (t.dataset.del) { var p = t.dataset.del.split('|'); CP.delItem(app.inc, p[0], p[1]); app.commit(true); if (app._modalRefresh) app._modalRefresh(); return; }
    var fn = app.act[t.dataset.act]; if (fn) fn(t.dataset.a, t);
  });

  var TPL = {
    objective: function () { return { text: '', status: 'Open' }; }, action: function () { return { ts: CP.now(), text: '', status: 'Current' }; }, meeting: function () { return { what: 'Tactics meeting', ts: '', where: 'ICP', done: false }; },
    need: function () { return { kind: '', req: 1 }; }, assignment: function () { return { branch: '', division: '', group: '', staging: '', work: '', special: '', needs: [], reportTo: '' }; },
    channel: function () { return { zone: '', ch: String(A(app.inc.comms).length + 1), fn: 'Tactical', name: '', assign: '', rx: '', rxTone: '', tx: '', txTone: '', mode: 'D', remarks: '' }; },
    contact: function () { return { pos: '', name: '', how: '' }; }, aid: function () { return { name: '', location: '', contact: '', medic: 'No' }; }, transport: function () { return { name: '', location: '', contact: '', level: 'ALS', air: 'Ground' }; },
    hospital: function () { return { name: '', address: '', contact: '', air: '', ground: '', trauma: 'No', burn: 'No', helipad: 'No' }; }, hazard: function () { return { area: 'All areas', hazard: '', mitigation: '' }; },
    facility: function () { return { type: A(app.inc.facilities).length ? 'Staging Area' : 'Incident Command Post', name: '', address: '', status: 'Open', poc: '', phone: '', opened: CP.now() }; },
    item: function () { return { qty: 1, kind: '', type: '', desc: '', arrival: '', cost: '' }; }
  };
  function addRow(key, tpl) {
    var inc = app.inc; if (!inc) return;
    var leaf = key.split('.').pop().split('@')[0];
    var item = (TPL[tpl] || TPL[leaf] || function () { return {}; })();
    if (key.indexOf('.') > 0) { var arrPath = key, parent = CP.getPath(inc, arrPath.split('.').slice(0, -1).join('.')); if (parent && !parent[leaf]) parent[leaf] = []; }
    CP.addItem(inc, key, item);
    if (key === 'assignments') app.log('Assignment created', 'Action');
    app.commit(true); if (app._modalRefresh) app._modalRefresh();
    setTimeout(function () { var el = document.querySelector('[data-p^="' + key + '@' + item.id + '"]'); if (el && el.focus) el.focus(); }, 30);
  }

  app.change = {
    logFilter: function (el) { app.ui.logFilter = app.ui.logFilter || {}; app.ui.logFilter[el.dataset.k] = el.value; app.rerender(); },
    layer: function (el) { app.ui.layers[el.dataset.k] = el.checked; app.loadOverlays(); }
  };

  // ---------- actions ----------
  var act = app.act = {};
  act.home = function () { app.closeIncident(); };
  act.menu = function () { document.getElementById('nav').classList.toggle('open'); };
  act.open = function (id) { app.open(id); };
  act.signin = function () { CP.arc.signIn(); };
  act.signout = function () { CP.arc.signOut(); app.remoteList = []; U.toast('Signed out. Incidents stay on this device.'); app.render(); };
  act.reconnect = async function () { await CP.arc.connect(); app.render(); };
  act.showAll = function () { CP.setPath(app.inc, 'showAll', true); app.commit(true); };
  act.live = function () { U.toast('Refreshing live county data…'); app.refreshLive(); };
  act.createSvc = async function () {
    try { U.toast('Creating the Command Post service…'); await CP.arc.createOwn(); U.toast('Service created. Share it with the EM groups in ArcGIS so others can open incidents.', 'ok', 7000); if (app.inc) await app.pushRemote(); app.render(); }
    catch (e) { U.toast('Could not create it: ' + E(e.message), 'err', 7000); }
  };

  act['new'] = function () {
    var me = CP.me || {};
    var body = '<div class="grid g2"><label class="f span2"><span>Incident name *</span><input class="in" name="name" placeholder="e.g. Route 220 Flooding, Nov 2026 Winter Storm"></label>' +
      '<label class="f"><span>Type</span><select class="in" name="type">' + CP.INCIDENT_TYPES.map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select></label><label class="f"><span>Start</span><input class="in" type="datetime-local" name="start" value="' + CP.localInput(CP.now()) + '"></label>' +
      '<label class="f span2"><span>Location</span><input class="in" name="loc" placeholder="Address, crossroads or area"></label><div class="span2"><div class="map" id="qsmap" style="height:220px"></div><div class="dim" style="font-size:12px;margin-top:4px" id="qsll">Click the map to drop the incident location (optional).</div></div>' +
      '<label class="f"><span>Incident Commander</span><input class="in" name="ic" value="' + E(me.pos === 'Incident Commander' ? me.name : '') + '"></label><label class="f"><span>IC agency</span><input class="in" name="icag" list="dl_agency"></label>' +
      '<label class="f span2"><span>What happened</span><textarea class="in" name="sit" style="min-height:70px" placeholder="Situation in a sentence or two"></textarea></label>' +
      '<label class="f span2"><span>Initial objectives <i class="dim" style="text-transform:none;letter-spacing:0">one per line, optional</i></span><textarea class="in" name="obj" style="min-height:60px"></textarea></label>' +
      '<div class="span2"><div class="flab">Complexity</div><div class="cx" id="qscx">' + CP.COMPLEXITY.map(function (c) { return '<button type="button" class="' + (c.v === 5 ? 'on' : '') + '" data-v="' + c.v + '"><b>' + c.label + '</b><span>' + c.d.split('.')[0] + '.</span></button>'; }).join('') + '</div></div>' +
      '<label class="f"><span>Operational period</span><select class="in" name="oph"><option value="12">12 hours</option><option value="24">24 hours</option><option value="8">8 hours</option></select></label><div></div>' +
      '<label class="f"><span>Your name</span><input class="in" name="me" value="' + E(me.name) + '"></label><label class="f"><span>Your position</span><input class="in" name="mepos" value="' + E(me.pos) + '" list="dl_pos" placeholder="e.g. Incident Commander"></label></div>';
    var ll = null, cx = 5;
    U.modal('Start new incident', body, [{ label: 'Cancel', cls: 'ghost' }, { label: I('play') + 'Start incident', cls: 'pri', fn: function (bg) {
      var v = function (n) { return U.val(bg, n); };
      if (!v('name')) { U.toast('Give the incident a name.', 'err'); return false; }
      if (v('me')) app.setMe({ name: v('me'), pos: v('mepos') });
      var inc = CP.newIncident({ name: v('name'), type: v('type'), start: CP.fromLocalInput(v('start')) || CP.now(), locdesc: v('loc'), lat: ll && +ll.lat.toFixed(6), lng: ll && +ll.lng.toFixed(6), icName: v('ic'), icAgency: v('icag'), situation: v('sit'), objectives: v('obj'), complexity: cx, opHours: +v('oph'), author: v('me') });
      inc.updatedBy = CP.me.name || '';
      if (cx <= 3) inc.eoc.eoc_status = 'Partial Activation';
      CP.store.put(inc);
      app.open(inc.id, 'dash').then(function () { if (CP.arc.status === 'on') app.pushRemote(); U.toast('Incident started. The briefing packet is ready in Reports.', 'ok'); });
    } }], { sticky: true, onOpen: function (bg) {
      bg.querySelector('#qscx').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; cx = +b.dataset.v; bg.querySelectorAll('#qscx button').forEach(function (x) { x.classList.toggle('on', x === b); }); });
      setTimeout(function () { if (!window.L) return; var m = CP.map.create(bg.querySelector('#qsmap'), {}); var mk = null; m.on('click', function (e) { ll = e.latlng; if (mk) mk.setLatLng(ll); else mk = L.marker(ll, { icon: CP.map.pinIcon('#FDB833', '★', 30) }).addTo(m); bg.querySelector('#qsll').textContent = 'Location: ' + ll.lat.toFixed(5) + ', ' + ll.lng.toFixed(5); }); }, 50);
    } });
  };

  act.qlog = function () {
    var t = document.getElementById('qtext'), c = document.getElementById('qcat'), tm = document.getElementById('qtime');
    if (!t || !t.value.trim()) return;
    app.log(t.value.trim(), c ? c.value : 'Event', tm && tm.value ? { ts: CP.fromLocalInput(tm.value) } : null);
    t.value = ''; app.commit(true); setTimeout(function () { var x = document.getElementById('qtext'); if (x) x.focus(); }, 20);
  };
  act.quicklog = function () {
    U.modal('Log entry', '<div class="grid"><div class="row"><select class="in" name="cat" style="max-width:180px">' + CP.LOG_CATS.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select><input class="in grow" type="datetime-local" name="ts" value="' + CP.localInput(CP.now()) + '" style="max-width:220px"></div><textarea class="in" name="text" style="min-height:100px" placeholder="What happened, what was decided, who was notified…"></textarea><div class="dim" style="font-size:12px">Logged as ' + E(CP.me.name || 'unknown (set your name in Incident Settings)') + '</div></div>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Save entry', cls: 'pri', fn: function (bg) { var x = U.val(bg, 'text'); if (!x) return false; app.log(x, U.val(bg, 'cat'), { ts: CP.fromLocalInput(U.val(bg, 'ts')) || CP.now() }); app.commit(true); U.toast('Logged.', 'ok'); } }]);
  };
  act.objToggle = function (a) { var p = a.split('|'), op = CP.byId(app.inc.opPeriods, p[0]), o = CP.byId(op.objectives, p[1]); var nv = o.status === 'Done' ? 'Open' : 'Done'; CP.setPath(app.inc, 'opPeriods@' + p[0] + '.objectives@' + p[1] + '.status', nv); if (nv === 'Done') app.log('Objective met: ' + o.text, 'Decision'); app.commit(true); };
  act.addObj = function (opId, t) { CP.addItem(app.inc, 'opPeriods@' + opId + '.objectives', { text: t.dataset.t, status: 'Open' }); app.commit(true); };
  act.addHaz = function (a, t) { CP.addItem(app.inc, 'hazards', { area: 'All areas', hazard: t.dataset.t, mitigation: '' }); app.commit(true); };
  act.safetyFromHaz = function () {
    var op = CP.curOP(app.inc), hz = A(app.inc.hazards);
    if (!hz.length) return U.toast('Add hazards first.', 'err');
    var msg = 'Safety message for Operational Period ' + op.n + ' (' + app.inc.name + ')\n\nKey hazards and what we are doing about them:\n' + hz.map(function (h) { return '• ' + h.hazard + (h.area && h.area !== 'All areas' ? ' (' + h.area + ')' : '') + (h.mitigation ? ': ' + h.mitigation : ''); }).join('\n') + '\n\nEveryone has the authority to stop unsafe work. Report injuries and near misses to your supervisor and the Safety Officer' + (CP.personName(app.inc, 'SOFR') ? ' (' + CP.personName(app.inc, 'SOFR') + ')' : '') + ' immediately.';
    CP.setPath(app.inc, 'opPeriods@' + op.id + '.safetyMsg', (op.safetyMsg ? op.safetyMsg + '\n\n' : '') + msg); app.commit(true);
  };
  act.selOP = function (id) { app.ui.opSel = id; app.rerender(); };
  act.setCurOP = function (id) { var op = CP.byId(app.inc.opPeriods, id); CP.setPath(app.inc, 'currentOP', op.n); app.log('Operational Period ' + op.n + ' is now current', 'Event'); app.commit(true); };
  act.nextOP = function () {
    var inc = app.inc, ops = A(inc.opPeriods), last = ops[ops.length - 1], hrs = (new Date(last.end) - new Date(last.start)) / 3600000 || 12;
    var nop = CP.newOP(last.n + 1, last.end, hrs);
    nop.objectives = A(last.objectives).filter(function (o) { return o.status !== 'Done' && o.status !== 'Deferred'; }).map(function (o) { return { id: CP.uid(), text: o.text, status: 'Open' }; });
    nop.emphasis = last.emphasis; nop.sspRequired = last.sspRequired; nop.sspLocation = last.sspLocation; nop.iapItems = Object.assign({}, last.iapItems);
    CP.addItem(inc, 'opPeriods', nop); app.ui.opSel = nop.id;
    U.confirm('Operational Period ' + nop.n + ' added', 'Open objectives were carried over. Make OP ' + nop.n + ' the current operational period now?', 'Make current', function () { CP.setPath(inc, 'currentOP', nop.n); app.log('Operational Period ' + nop.n + ' started', 'Event'); app.commit(true); });
    app.commit(true);
  };
  act.planningP = function (opId) {
    var op = CP.byId(app.inc.opPeriods, opId), end = new Date(op.end).getTime(), H = 3600000;
    [['Tactics meeting', -7 * H], ['Planning meeting', -5 * H], ['IAP prep & approval', -3 * H], ['Operations briefing', 0]].forEach(function (x) { CP.addItem(app.inc, 'opPeriods@' + opId + '.meetings', { what: x[0], ts: new Date(end + x[1]).toISOString(), where: 'ICP', done: false }); });
    app.commit(true);
  };
  act.iap = function (opId) { app.go('forms'); setTimeout(function () { var s = document.getElementById('iapop'); if (s) s.value = opId; }, 30); };

  act.orgAdd = function () {
    var g = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var pos = g('op_pos'), name = g('op_name');
    if (!name) return U.toast('Enter a name.', 'err');
    var ph = g('op_phone');
    CP.addItem(app.inc, 'org', { pos: pos, label: g('op_label'), name: name, agency: g('op_agency'), phone: ph, radio: '', email: '', checkin: CP.now() });
    app.log(name + ' assigned as ' + CP.POS[pos].t + (g('op_label') ? ' (' + g('op_label') + ')' : ''), 'Resource');
    app.commit(true);
  };
  act.orgTpl = function (k) {
    var sets = { cmd: ['IC', 'SOFR', 'PIO', 'LOFR'], gen: ['OSC', 'PSC', 'LSC', 'FSC'], t3: ['IC', 'SOFR', 'PIO', 'LOFR', 'OSC', 'STAM', 'PSC', 'RESL', 'SITL', 'DOCL', 'LSC', 'COML', 'MEDL', 'SPUL', 'FSC'] };
    var n = 0; sets[k].forEach(function (p) { if (!CP.person(app.inc, p)) { CP.addItem(app.inc, 'org', { pos: p, label: '', name: '', agency: '', phone: '', radio: '', email: '' }); n++; } });
    U.toast(n + ' positions added. Fill in names as people arrive.'); app.commit(true);
  };
  act.transfer = function () {
    var cur = CP.person(app.inc, 'IC');
    U.modal('Transfer of command', '<p class="muted" style="margin-top:0">Outgoing IC: <b>' + E(cur ? cur.name : 'none') + '</b>. Brief the incoming IC with ICS 201, then record the transfer here.</p><div class="grid g2"><label class="f"><span>Incoming IC *</span><input class="in" name="n"></label><label class="f"><span>Agency</span><input class="in" name="a" list="dl_agency"></label><label class="f"><span>Phone / radio</span><input class="in" name="p"></label><label class="f"><span>Effective</span><input class="in" type="datetime-local" name="t" value="' + CP.localInput(CP.now()) + '"></label><label class="f span2"><span>Notes</span><textarea class="in" name="x" style="min-height:60px"></textarea></label></div>',
      [{ label: 'Preview ICS 201', cls: 'ghost', fn: function () { app.preview('ICS 201 — Incident Briefing', ['201']); } }, { label: 'Record transfer', cls: 'pri', fn: function (bg) {
        var n = U.val(bg, 'n'); if (!n) return false; var ts = CP.fromLocalInput(U.val(bg, 't')) || CP.now();
        if (cur) CP.delItem(app.inc, 'org', cur.id);
        CP.addItem(app.inc, 'org', { pos: 'IC', label: '', name: n, agency: U.val(bg, 'a'), phone: U.val(bg, 'p'), radio: '', email: '', checkin: ts });
        app.log('Command transferred' + (cur ? ' from ' + cur.name : '') + ' to ' + n + (U.val(bg, 'a') ? ' (' + U.val(bg, 'a') + ')' : '') + '. ' + U.val(bg, 'x'), 'Decision', { ts: ts });
        app.commit(true); U.toast('Transfer of command recorded.', 'ok');
      } }]);
  };

  act.checkin = function () {
    var g = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var name = g('r_name'); if (!name) return U.toast('Enter the resource identifier.', 'err');
    var st = g('r_status'), asg = g('r_assign');
    var r = CP.addItem(app.inc, 'resources', { name: name, kind: g('r_kind'), type: g('r_type'), agency: g('r_agency'), leader: g('r_leader'), persons: g('r_persons') === '' ? '' : +g('r_persons'), contact: g('r_contact'), orderNo: g('r_order'), checkinLoc: g('r_loc'), status: asg && st === 'Checked In' ? 'Assigned' : st, assign: asg, checkin: st === 'Ordered' || st === 'En Route' ? '' : CP.now(), ordered: st === 'Ordered' ? CP.now() : '', location: g('r_loc'), notes: '' });
    app.log((st === 'Ordered' ? 'Ordered: ' : st === 'En Route' ? 'En route: ' : 'Checked in at ' + g('r_loc') + ': ') + name + (g('r_kind') ? ' (' + g('r_kind') + ')' : '') + (g('r_agency') ? ', ' + g('r_agency') : '') + (g('r_persons') ? ', ' + g('r_persons') + ' personnel' : '') + (asg ? ', assigned to ' + CP.forms.assignName(app.inc, asg) : ''), 'Resource');
    app.commit(true); U.toast(E(name) + ' checked in.', 'ok');
    setTimeout(function () { var el = document.getElementById('r_kind'); if (el) el.focus(); }, 30);
  };
  act.resFilter = function (k) { app.ui.resFilter = k; app.rerender(); };
  act.assignRes = function (aid) { var s = document.getElementById('as_' + aid); if (!s || !s.value) return; var r = CP.byId(app.inc.resources, s.value); CP.setPath(app.inc, 'resources@' + r.id + '.assign', aid); CP.setPath(app.inc, 'resources@' + r.id + '.status', 'Assigned'); app.log(r.name + ' assigned to ' + CP.forms.assignName(app.inc, aid), 'Resource'); app.commit(true); };
  act.unassign = function (rid) { var r = CP.byId(app.inc.resources, rid); CP.setPath(app.inc, 'resources@' + rid + '.assign', ''); CP.setPath(app.inc, 'resources@' + rid + '.status', 'Staged'); app.log(r.name + ' unassigned (staged)', 'Resource'); app.commit(true); };
  act.demob = function (rid) {
    var inc = app.inc, r = CP.byId(inc.resources, rid), d = r.demob || (r.demob = { checks: {} }); d.checks = d.checks || {};
    var units = [['SPUL', 'Supply Unit'], ['COML', 'Communications Unit'], ['FACL', 'Facilities Unit'], ['GSUL', 'Ground Support Unit'], ['DOCL', 'Documentation Unit'], ['TIME', 'Time Unit'], ['SOFR', 'Safety Officer']];
    var body = '<div class="grid g2"><label class="f"><span>Planned release</span><input class="in" type="datetime-local" name="planned" value="' + CP.localInput(d.planned || CP.now()) + '"></label><label class="f"><span>Destination</span><input class="in" name="destination" value="' + E(d.destination || r.agency || '') + '"></label><label class="f"><span>Estimated departure</span><input class="in" type="datetime-local" name="etd" value="' + CP.localInput(d.etd) + '"></label><label class="f"><span>Estimated arrival</span><input class="in" type="datetime-local" name="eta" value="' + CP.localInput(d.eta) + '"></label><label class="f"><span>Travel method</span><input class="in" name="method" value="' + E(d.method || r.travel || 'Own vehicle') + '"></label><label class="f"><span>Contact while traveling</span><input class="in" name="contact" value="' + E(d.contact || r.contact || '') + '"></label></div>' +
      '<div class="flab" style="margin-top:12px">Sign-offs</div><div class="grid g2" style="gap:6px">' + units.map(function (u) { return '<label class="chk"><input type="checkbox" name="ck_' + u[0] + '"' + ((d.checks[u[0]] || {}).ok ? ' checked' : '') + '>' + u[1] + (CP.personName(inc, u[0]) ? ' <span class="dim">· ' + E(CP.personName(inc, u[0])) + '</span>' : '') + '</label>'; }).join('') + '</div>' +
      '<label class="f" style="margin-top:10px"><span>Remarks</span><textarea class="in" name="remarks" style="min-height:50px">' + E(d.remarks || '') + '</textarea></label><label class="chk" style="margin-top:8px"><input type="checkbox" name="release"' + (r.status === 'Released' || r.status === 'Demobilized' ? ' checked' : '') + '> Release this resource now</label>';
    function save(bg) { ['planned', 'etd', 'eta'].forEach(function (k) { d[k] = CP.fromLocalInput(U.val(bg, k)); }); ['destination', 'method', 'contact', 'remarks'].forEach(function (k) { d[k] = U.val(bg, k); }); units.forEach(function (u) { d.checks[u[0]] = { ok: U.val(bg, 'ck_' + u[0]), by: CP.personName(inc, u[0]) }; }); if (U.val(bg, 'release') && ['Released', 'Demobilized'].indexOf(r.status) < 0) { r.status = 'Released'; d.released = CP.now(); app.log(r.name + ' released from the incident' + (d.destination ? ' to ' + d.destination : ''), 'Resource'); } r.u = CP.now(); CP.touch(inc, 'resources'); app.commit(true); }
    U.modal('Demobilize ' + (r.name || ''), body, [{ label: 'Cancel', cls: 'ghost' }, { label: 'Save & preview ICS 221', fn: function (bg) { save(bg); setTimeout(function () { app.preview('ICS 221 — ' + r.name, ['221'], { only: rid }); }, 50); } }, { label: 'Save', cls: 'pri', fn: save }]);
  };

  act.pickLoc = function () { app.ui.mapMode = 'loc'; app.go('map'); };
  act.pickFac = function (fid) { var f = CP.byId(app.inc.facilities, fid); if (!f.name) { U.toast('Name the facility first.', 'err'); return; } app.ui.mapMode = 'fac:' + fid; app.go('map'); };
  act.mapPick = function () {
    var m = app._big; if (!m) return; hint('<b>Click the map</b> to set the incident location.', 'mapCancel');
    CP.map.pick(m, function (ll) { var inc = app.inc; CP.setPath(inc, 'location.lat', +ll.lat.toFixed(6)); CP.setPath(inc, 'location.lng', +ll.lng.toFixed(6)); app.log('Incident location set: ' + ll.lat.toFixed(5) + ', ' + ll.lng.toFixed(5), 'Event'); hint(''); app.commit(true); });
  };
  act.mapCancel = function () { hint(''); app.rerender(); };
  act.mapDraw = function () {
    var m = app._big; if (!m) return;
    hint('<b>Click to add corners</b> of the incident area. Double-click or press Finish to close it.', 'mapDrawDone');
    app._draw = CP.map.drawPolygon(m, function (pts) { app._draw = null; hint(''); if (pts && pts.length > 2) { CP.setPath(app.inc, 'perimeter', pts.map(function (p) { return [+p[0].toFixed(6), +p[1].toFixed(6)]; })); app.log('Incident area drawn on the map', 'Event'); app.commit(true); } else app.rerender(); });
  };
  act.mapDrawDone = function () { if (app._draw) app._draw.finish(false); };
  act.mapClearArea = function () { CP.setPath(app.inc, 'perimeter', null); app.commit(true); };
  act.mapFac = function () {
    var m = app._big; if (!m) return;
    hint('<b>Click the map</b> where the facility is.', 'mapCancel');
    CP.map.pick(m, function (ll) {
      hint('');
      U.modal('New facility', '<div class="grid g2"><label class="f"><span>Type</span><select class="in" name="type">' + CP.FAC_TYPES_X.map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select></label><label class="f"><span>Name *</span><input class="in" name="name" placeholder="e.g. ICP – Buchanan Fire Station"></label><label class="f span2"><span>Address</span><input class="in" name="addr"></label><label class="f"><span>Contact</span><input class="in" name="poc"></label><label class="f"><span>Phone</span><input class="in" name="ph"></label></div>',
        [{ label: 'Cancel', cls: 'ghost' }, { label: 'Add facility', cls: 'pri', fn: function (bg) { if (!U.val(bg, 'name')) return false; CP.addItem(app.inc, 'facilities', { type: U.val(bg, 'type'), name: U.val(bg, 'name'), address: U.val(bg, 'addr'), poc: U.val(bg, 'poc'), phone: U.val(bg, 'ph'), status: 'Open', lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6), opened: CP.now() }); app.log(U.val(bg, 'type') + ' established: ' + U.val(bg, 'name'), 'Event'); app.commit(true); } }]);
    });
  };
  act.mapSnap = async function () {
    var m = app._big; if (!m) return;
    var r = await CP.map.snapshot(m, app.inc);
    if (!r.url) return U.toast('The basemap blocked the snapshot. Try the Topographic or Streets basemap.', 'err', 5000);
    try { localStorage.setItem('bcem.cp.map.' + app.inc.id, r.url); } catch (e) { return U.toast('Not enough storage on this device for the map image.', 'err'); }
    var op = CP.curOP(app.inc); CP.setPath(app.inc, 'opPeriods@' + op.id + '.iapItems.map', true);
    app.commit(true); U.toast('Map added to ICS 201 and the IAP.' + (r.tainted ? ' Some map tiles could not be copied.' : ''), 'ok');
  };
  act.mapSnapClear = function () { localStorage.removeItem('bcem.cp.map.' + app.inc.id); app.rerender(); };

  act.msgTab = function (t) { app.ui.msgTab = t; app.rerender(); };
  act.statusTab = function (t) { app.ui.statusTab = t; app.rerender(); };
  act.editReq = function (id) {
    var inc = app.inc, q = id ? CP.byId(inc.requests, id) : null;
    if (!q) { var n = A(inc.requests).length + 1; q = CP.addItem(inc, 'requests', { number: 'RR-' + CP.pad(n), ts: CP.now(), priority: 'Routine', requestor: (CP.me.name || '') + (CP.me.pos ? ' / ' + CP.me.pos : ''), deliverTo: (A(inc.facilities)[0] || {}).name || '', substitutes: '', status: 'Draft', items: [{ id: CP.uid(), u: CP.now(), qty: 1, kind: '', type: '', desc: '', arrival: '', cost: '' }], notes: '' }); app.commit(false); }
    var p = 'requests@' + q.id;
    function body() {
      q = CP.byId(inc.requests, q.id);
      return '<div class="grid g3">' + U.text(inc, p + '.number', 'Request #') + U.dt(inc, p + '.ts', 'Date/time') + U.sel(inc, p + '.priority', 'Priority', CP.PRIORITY) + U.text(inc, p + '.requestor', 'Requested by') + U.text(inc, p + '.deliverTo', 'Deliver / report to') + U.sel(inc, p + '.status', 'Status', CP.REQ_STATUS, { rr: 1 }) + '</div><div style="height:10px"></div>' +
        U.table({ key: p + '.items', rows: q.items, cols: [{ f: 'qty', l: 'Qty', t: 'num', w: '70px' }, { f: 'kind', l: 'Kind', list: 'dl_kinds' }, { f: 'type', l: 'Type', w: '70px' }, { f: 'desc', l: 'Detailed description' }, { f: 'arrival', l: 'Needed by', t: 'dt', w: '200px' }, { f: 'cost', l: 'Cost', w: '90px' }], add: 'Add item', tpl: 'item' }) +
        '<div class="grid g2" style="margin-top:10px">' + U.text(inc, p + '.substitutes', 'Suitable substitutes / sources') + U.text(inc, p + '.approval', 'Section chief approval') + U.text(inc, p + '.logOrder', 'Logistics order #') + U.text(inc, p + '.supplier', 'Supplier / POC') + U.text(inc, p + '.supplierContact', 'Supplier phone/email') + U.sel(inc, p + '.placedBy', 'Order placed by', ['SPUL', 'PROC']) + U.area(inc, p + '.notes', 'Notes', { h: 50 }) + U.area(inc, p + '.financeReply', 'Finance reply', { h: 50 }) + '</div>';
    }
    var bg = U.modal('Resource request ' + q.number, body(), [{ label: 'Preview 213RR', cls: 'ghost', fn: function () { setTimeout(function () { app.preview('ICS 213RR', ['213RR'], { only: q.id }); }, 30); } }, { label: 'Filled → add to Resources', fn: function () {
      A(q.items).forEach(function (it) { for (var i = 0; i < (+it.qty || 1) && i < 50; i++) CP.addItem(inc, 'resources', { name: (it.kind || it.desc || 'Resource') + ((+it.qty || 1) > 1 ? ' #' + (i + 1) : ''), kind: it.kind, type: it.type, agency: q.supplier || '', status: 'Ordered', orderNo: q.number, ordered: q.ts, eta: it.arrival, persons: '' }); });
      CP.setPath(inc, p + '.status', 'Filled'); app.log('Resource request ' + q.number + ' filled; resources added as ordered', 'Resource'); app.commit(true); app._modalRefresh = null;
    } }, { label: 'Done', cls: 'pri', fn: function () { app.log('Resource request ' + q.number + ' (' + q.status + '): ' + A(q.items).map(function (i) { return (i.qty || '') + ' × ' + (i.kind || i.desc); }).join('; '), 'Resource'); app.commit(true); app._modalRefresh = null; } }], { wide: true, nofocus: true });
    app._modalRefresh = function () { var mb = document.querySelector('#modal .mb'); if (mb) mb.innerHTML = body(); else app._modalRefresh = null; };
  };
  act.editMsg = function (id) {
    var inc = app.inc, m = id ? CP.byId(inc.messages, id) : null;
    if (!m) { m = CP.addItem(inc, 'messages', { ts: CP.now(), to: '', from: (CP.me.name || '') + (CP.me.pos ? ', ' + CP.me.pos : ''), subject: '', body: '', reply: '' }); app.commit(false); }
    var p = 'messages@' + m.id;
    U.modal('General message (ICS 213)', '<div class="grid g2">' + U.text(inc, p + '.to', 'To (name and position)') + U.text(inc, p + '.from', 'From (name and position)') + U.text(inc, p + '.subject', 'Subject') + U.dt(inc, p + '.ts', 'Date/time') + '</div><div style="height:8px"></div>' + U.area(inc, p + '.body', 'Message', { h: 130 }) + '<div class="grid g2" style="margin-top:8px">' + U.text(inc, p + '.approvedBy', 'Approved by') + U.text(inc, p + '.approvedPos', 'Approver position') + '</div><div style="height:8px"></div>' + U.area(inc, p + '.reply', 'Reply', { h: 80 }) + '<div class="grid g3" style="margin-top:8px">' + U.text(inc, p + '.replyBy', 'Replied by') + U.text(inc, p + '.replyPos', 'Position') + U.dt(inc, p + '.replyTs', 'Reply date/time') + '</div>',
      [{ label: 'Preview 213', cls: 'ghost', fn: function () { setTimeout(function () { app.preview('ICS 213', ['213'], { only: m.id }); }, 30); } }, { label: 'Done', cls: 'pri', fn: function () { var x = CP.byId(inc.messages, m.id); app.log('Message to ' + (x.to || '?') + ': ' + (x.subject || ''), 'Communication'); app.commit(true); } }], { wide: true });
  };

  act.release = async function () {
    var inc = app.inc, p = inc.publicInfo;
    if (!p.shortMessage) return U.toast('Write the short message first.', 'err');
    var rel = { id: CP.uid(), u: CP.now(), ts: CP.now(), text: p.shortMessage, by: CP.me.name || '', posted: false };
    if (CP.arc.signedIn()) { try { await doPush('publicMessage'); rel.posted = true; } catch (e) { U.toast('Not posted to ArcGIS: ' + E(e.message), 'err', 6000); } }
    p.releases = p.releases || []; p.releases.push(rel); CP.touch(inc, 'publicInfo');
    app.log('Public information released: ' + p.shortMessage, 'Public Info'); app.commit(true); U.toast('Release recorded' + (rel.posted ? ' and posted to ArcGIS.' : '.'), 'ok');
  };
  act.saveSitrep = function () { var sr = app.ui.sr; sr.ts = CP.now(); sr.id = CP.uid(); sr.u = CP.now(); CP.addItem(app.inc, 'sitreps', sr); app.log('SitRep ' + sr.number + ' prepared' + (sr.changes ? ': ' + sr.changes.slice(0, 200) : ''), 'Briefing'); app.ui.sr = null; app.commit(true); U.toast('SitRep saved.', 'ok'); return sr; };
  act.publishSitrep = async function () {
    if (!CP.arc.signedIn()) { act.saveSitrep(); return U.toast('Saved locally. Sign in to publish to the county SitRep layer.', '', 5000); }
    var sr = app.ui.sr; sr.ts = CP.now();
    try { if (!CP.arc.live.asof) await CP.arc.refreshLive(app.inc); var res = await CP.arc.push.sitrep(app.inc, sr); sr.posted = true; markPushed('sitrep', res); U.toast(res + ' to the county SitRep layer.', 'ok');
      try { var lr = await CP.arc.push.lifelines(app.inc); markPushed('lifelines', lr); } catch (e2) { U.toast('Lifelines not updated: ' + E(e2.message), 'err', 5000); } }
    catch (e) { U.toast('SitRep not published: ' + E(e.message), 'err', 7000); }
    act.saveSitrep();
  };
  act.fill209 = async function () {
    var inc = app.inc, s = inc.s209;
    if (CP.arc.signedIn()) await CP.arc.refreshLive(inc);
    var lv = CP.arc.live || {};
    s.pub = s.pub || {}; s.dmg = s.dmg || {};
    if (lv.shelterPop != null) s.pub.shel = { a: (s.pub.shel || {}).a, b: lv.shelterPop };
    if (lv.daDestroyed != null) s.dmg.res = { thr: (s.dmg.res || {}).thr, dmg: (lv.daMajor || 0) + (lv.daMinor || 0) + (lv.daAffected || 0), des: lv.daDestroyed || 0 };
    if (!s.events) s.events = inc.situation;
    if (!s.weatherConcerns) { var op = CP.curOP(inc); s.weatherConcerns = (op && op.weather) || ''; }
    if (lv.nws && lv.nws.length && !s.weatherConcerns) s.weatherConcerns = 'Active NWS: ' + lv.nws.map(function (n) { return n.Event; }).join(', ');
    var cost = A(inc.resources).length; if (!s.cooperating) s.cooperating = Array.from(new Set(A(inc.resources).map(function (r) { return r.agency; }).filter(Boolean))).join(', ');
    CP.touch(inc, 's209'); app.commit(true); U.toast(lv.asof ? 'Filled shelter, damage, weather and agencies from live data.' : 'Filled from the incident record. Sign in for live shelter and damage numbers.', 'ok', 5000);
  };

  function markPushed(k, res) { var inc = app.inc; inc.arc = inc.arc || {}; inc.arc.pushed = inc.arc.pushed || {}; inc.arc.pushed[k] = { ts: CP.now(), result: res }; CP.store.put(inc); }
  async function doPush(k, quiet) {
    var res = await CP.arc.push[k](app.inc);
    markPushed(k, res); if (!quiet) app.log('Sent to ArcGIS: ' + k + ' (' + res + ')', 'Event');
    return res;
  }
  act.push = async function (k) {
    if (!CP.arc.signedIn()) return U.toast('Sign in with ArcGIS first.', 'err');
    try { U.toast('Sending…'); var r = await doPush(k); app.commit(true); U.toast('Done: ' + E(r), 'ok'); }
    catch (e) { U.toast('Could not send: ' + E(e.message), 'err', 7000); }
  };

  act.preview = function (no, t) {
    var o = {}; try { o = t && t.dataset.o ? JSON.parse(t.dataset.o) : {}; } catch (e) {}
    if (o.opId) o.op = CP.byId(app.inc.opPeriods, o.opId);
    if (no === '209' && CP.arc.signedIn() && !CP.arc.live.asof) CP.arc.refreshLive(app.inc).then(function () {});
    app.preview('ICS ' + no + ' — ' + (CP.FORM[no] ? CP.FORM[no].t : ''), [no], o);
  };
  act.printNow = function () { var p = app._pv; app.print(p.list, p.o); };
  act.dlNow = function () { var p = app._pv; app.downloadHtml(app.inc.number + ' ' + p.title, p.list, p.o); };
  act.iapPreview = function () { var s = iapSel(); if (!s.list.length) return U.toast('Pick at least one item.', 'err'); app.preview('Incident Action Plan · OP ' + s.o.op.n, s.list, s.o); };
  act.iapPrint = function () { var s = iapSel(); markIap(s.o.op); app.print(s.list, s.o); };
  act.iapHtml = function () { var s = iapSel(); markIap(s.o.op); app.downloadHtml(app.inc.number + ' IAP OP' + s.o.op.n, s.list, s.o); };
  function markIap(op) { var inc = app.inc; inc.iapPrinted = inc.iapPrinted || {}; if (!inc.iapPrinted[op.n]) { inc.iapPrinted[op.n] = CP.now(); CP.touch(inc, 'iapPrinted'); app.log('IAP for Operational Period ' + op.n + ' produced', 'Briefing'); app.commit(false); } }
  act.package = function () {
    var inc = app.inc, l = ['201'];
    if (inc.complexity <= 3 || inc.showAll) l = l.concat(['202', '203', '204', '205', '205A', '206', '207', '208', '215', '215A']);
    l = l.concat(['209', '211', '214']);
    if (A(inc.messages).length) l.push('213'); if (A(inc.requests).length) l.push('213RR');
    if (A(inc.resources).some(function (r) { return r.demob; })) l.push('221');
    U.modal('Full incident package', '<p style="margin-top:0">Every form with data, for the after-action file or the next shift: ' + l.map(function (x) { return 'ICS ' + x; }).join(', ') + '.</p>', [{ label: 'Preview', fn: function () { setTimeout(function () { app.preview('Incident package', l, {}); }, 30); } }, { label: 'Print / PDF', fn: function () { app.print(l, {}); } }, { label: 'Download', cls: 'pri', fn: function () { app.downloadHtml(inc.number + ' Incident Package', l, {}); } }]);
  };
  act.csv = function (k) {
    var inc = app.inc, rows;
    if (k === 'log') rows = [['Date/Time', 'Category', 'Entry', 'Author', 'Position', 'OP']].concat(A(inc.log).sort(function (a, b) { return (a.ts || '').localeCompare(b.ts || ''); }).map(function (l) { return [CP.fmtDT(l.ts), l.cat, l.text, l.author, l.pos, l.op]; }));
    else rows = [['Identifier', 'Kind', 'Type', 'Agency', 'Leader', 'Personnel', 'Status', 'Assignment', 'Location', 'Checked in', 'Contact', 'Order #']].concat(A(inc.resources).map(function (r) { return [r.name, r.kind, r.type, r.agency, r.leader, r.persons, r.status, CP.forms.assignName(inc, r.assign), r.location, CP.fmtDT(r.checkin), r.contact, r.orderNo]; }));
    U.download(inc.number + '_' + k + '.csv', U.csv(rows), 'text/csv');
  };

  act.setCx = function (v) { var inc = app.inc, old = inc.complexity; CP.setPath(inc, 'complexity', +v); app.log('Complexity changed from Type ' + old + ' to Type ' + v, 'Decision'); app.commit(true); };
  act.close = function () {
    U.confirm('Close this incident?', 'This logs the closing time, marks it Closed and, if you are signed in, closes it on the county map and facilities layers. You can reopen it later.', 'Close incident', async function () {
      var inc = app.inc; CP.setPath(inc, 'status', 'Closed'); CP.setPath(inc, 'closed', CP.now()); CP.setPath(inc, 's209.version', 'Final');
      app.log('Incident closed', 'Decision'); app.commit(true);
      if (CP.arc.signedIn()) { try { if (inc.location.lat) await doPush('incident', true); if (A(inc.facilities).some(function (f) { return f.lat; })) await doPush('facilities', true); } catch (e) {} }
      U.toast('Incident closed. Print the final ICS 209 and the full package for the record.', 'ok', 6000);
    }, true);
  };
  act.reopen = function () { CP.setPath(app.inc, 'status', 'Active'); CP.setPath(app.inc, 'closed', ''); app.log('Incident reopened', 'Decision'); app.commit(true); };
  act.saveMe = function () { app.setMe({ name: document.getElementById('me_name').value.trim(), pos: document.getElementById('me_pos').value.trim() }); U.toast('Saved.', 'ok'); };
  act.export = function () { var inc = app.inc; U.download(inc.number + '_' + inc.name.replace(/\W+/g, '_') + '.cpincident.json', JSON.stringify(inc, null, 1), 'application/json'); };
  act['import'] = function () {
    var i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
    i.onchange = function () { var f = i.files[0]; if (!f) return; f.text().then(function (t) { try { var inc = JSON.parse(t); if (!inc.id || !inc.opPeriods) throw new Error('Not a Command Post incident file'); var ex = CP.store.get(inc.id); CP.store.put(ex ? CP.merge(ex, inc) : inc); app.open(inc.id); U.toast('Incident opened from file.', 'ok'); } catch (e) { U.toast('Could not open: ' + E(e.message), 'err'); } }); };
    i.click();
  };
  act.deleteLocal = function () { U.confirm('Remove from this device?', 'This removes this device\'s copy of <b>' + E(app.inc.name) + '</b>. Shared copies in ArcGIS are not affected.', 'Remove', function () { CP.store.remove(app.inc.id); app.closeIncident(); }, true); };

  if (CP.extendActs) CP.extendActs(act);
  if (CP.extendChange) CP.extendChange(app.change);
  if (CP.extendCallActs) CP.extendCallActs(act, app.change);
  if (CP.extendEocActs) CP.extendEocActs(act, app.change);
  if (CP.extendAppsActs) CP.extendAppsActs(act);
  act.actions = function () { U.modal('What do you need to do?', CP.views.qaGrid(3), [], { wide: true, nofocus: true }); };
  act.mode = function (m) { var inc = app.inc; if (m === 'quick') { CP.setPath(inc, 'showAll', false); if (inc.complexity <= 3) CP.setPath(inc, 'complexity', 4); } else CP.setPath(inc, 'showAll', true); app.log('Switched to ' + m + ' mode', 'Note'); app.commit(true); };
  function packetList(k) {
    var inc = app.inc;
    if (k === 'all') { var l = ['201']; if (inc.complexity <= 3 || inc.showAll) l = l.concat(['202', '203', '204', '205', '205A', '206', '207', '208', '215', '215A']); l = l.concat(['209', '211', '214']); if (A(inc.messages).length) l.push('213'); if (A(inc.requests).length) l.push('213RR'); if (A(inc.resources).some(function (r) { return r.demob; })) l.push('221'); return l; }
    if (k === 'iap') { var op = CP.curOP(inc), it = op.iapItems || {}; return ['cover', '202'].concat(['203', '204', '205', '205A', '206', '207', '208'].filter(function (x) { return it[x]; })).concat(app.mapImg(inc) ? ['map'] : []); }
    var p = CP.views.PACKETS.find(function (x) { return x.k === k; }); return p ? p.forms : ['201'];
  }
  function packetName(k) { var p = CP.views.PACKETS.find(function (x) { return x.k === k; }); return p ? p.n : 'Report'; }
  act.packet = function (k) { if (k === 'iap') return act.iap(CP.curOP(app.inc).id); app.preview(packetName(k), packetList(k), {}); };
  act.packetPrint = function (k) { app.print(packetList(k), {}); };
  act.packetDl = function (k) { app.downloadHtml(app.inc.number + ' ' + packetName(k), packetList(k), {}); };

  // ---------- boot ----------
  app.boot = async function () {
    app.mount();
    var h = location.hash.replace('#', '');
    try { await CP.arc.handleRedirect(); } catch (e) { console.warn(e); }
    h = location.hash.replace('#', '') || h;
    var qs = new URLSearchParams(location.search), want = qs.get('incident'), wantView = qs.get('view');
    if (want || wantView) history.replaceState(null, '', location.pathname + (wantView ? '#' + wantView : location.hash));
    if (wantView) h = wantView;
    var last = want && CP.store.get(want) ? want : CP.store.prefs().last;
    if (want) { CP.store.setPref('last', want); app._wantRemote = want; }
    if (last && CP.store.get(last)) { app.inc = migrate(CP.store.get(last)); app.view = h && CP.views[h] ? h : 'dash'; } else app.view = ['monitor', 'checklist', 'arc'].indexOf(h) >= 0 ? h : 'home';
    app.render();
    if (CP.arc.signedIn()) {
      await CP.arc.connect();
      if (app.inc && CP.arc.status === 'on') { try { var r = await CP.arc.loadRemote(app.inc.id); if (r) { app.inc = CP.merge(app.inc, r); CP.store.put(app.inc); } else app.pushRemote(); } catch (e) {} }
      if (app._wantRemote && (!app.inc || app.inc.id !== app._wantRemote) && CP.arc.status === 'on') { try { await app.open(app._wantRemote, h && CP.views[h] ? h : 'dash'); } catch (e) {} }
      app.render(); app.loadRemoteList(); app.refreshLive(); if (CP.calls) CP.calls.refresh();
    }
    if (CP.calls) CP.calls.paint();
    if (CP.liveApps) CP.liveApps.paint();
    window.addEventListener('hashchange', function () { var v = location.hash.replace('#', ''); if (v && v !== app.view && CP.views[v] && (app.inc || ['arc', 'monitor', 'checklist'].indexOf(v) >= 0)) { app.view = v; app.render(); } });
    setInterval(async function () { // pull others' changes
      if (!app.inc || CP.arc.status !== 'on' || app.saving) return;
      try { var m = await CP.arc.checkRemote(app.inc); if (m) { app.inc = m; CP.store.put(m); if (!editing() && !document.getElementById('modal')) app.rerender(); else app.paintChrome(); } } catch (e) { console.warn(e); }
    }, 15000);
    setInterval(function () { if (app.inc && CP.arc.signedIn()) app.refreshLive(); else app.paintChrome(); }, 90000);
    setInterval(function () { if (!app.inc) app.loadRemoteList(); }, 30000);
  };
})(window.CP);
