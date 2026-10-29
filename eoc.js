/* COMMAND POST — EOC side: lifeline checklists (shared with the EOC app), the EOC Monitor,
   damage assessment status and the stakeholder tool list. */
(function (CP) {
  'use strict';
  var U = CP.ui, E = CP.esc, A = CP.alive, I = U.icon, V = CP.views, AFTER = CP.after;
  var B = 'https://services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/';
  function app() { return CP.app; }
  function arc() { return CP.arc; }
  function card(t, b, x, cls) { return '<div class="card ' + (cls || '') + '"><h3>' + t + (x ? '<span class="x">' + x + '</span>' : '') + '</h3>' + b + '</div>'; }
  function when(ms) { return ms ? CP.fmtDT(new Date(ms).toISOString()) : ''; }
  function ago(ms) { if (!ms) return ''; var m = Math.round((Date.now() - ms) / 60000); return m < 60 ? m + 'm ago' : m < 1440 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm ago' : Math.floor(m / 1440) + 'd ago'; }
  function fail(e) { U.toast('ArcGIS said: ' + E(e.message), 'err', 7000); }

  // ---------- data ----------
  var D = CP.eoc = {
    tasks: function () { return arc().query(arc().L.lifelineTasks, '1=1', { order: 'lifeline_no,sort_order', n: 2000 }); },
    updTask: function (oid, a) { return arc().updOne(arc().L.lifelineTasks, oid, a); },
    lifelinesLatest: function () { return arc().query(arc().L.lifelines, '1=1', { order: 'CreationDate DESC', n: 1 }); },
    da: async function () {
      var cfg = await arc().query(arc().L.daConfig, "active='Yes'", { order: 'incident_start DESC', n: 5 }).catch(function () { return []; });
      var name = cfg.length ? cfg[0].attributes.incident_name : null;
      var w = name ? 'incident_name=' + arc().sq(name) : '1=1';
      var zones = await arc().query(arc().L.daZones, w, { fields: 'zone_name,zone_status,assigned_team,est_structures,assessed_count,priority', order: 'priority,zone_name', n: 500 }).catch(function () { return []; });
      var teams = await arc().query(arc().L.daTeams, name ? w : "team_status<>'demobilized'", { fields: 'team_name,team_type,team_status,current_zone,team_lead', order: 'team_name', n: 200 }).catch(function () { return []; });
      return { incident: name, config: cfg.length ? cfg[0].attributes : null, zones: zones.map(function (z) { return z.attributes; }), teams: teams.map(function (t) { return t.attributes; }) };
    },
    activity: function () { if (!arc().own) return Promise.resolve([]); return arc().query(arc().own.url + '/1', '1=1', { order: 'entry_time DESC', n: 40, fields: 'incident_name,entry_time,author,category,entry_text' }); },
    incidents: function () { if (!arc().own) return Promise.resolve([]); return arc().query(arc().own.url + '/0', "status<>'Closed'", { geom: true, fields: 'OBJECTID,incident_key,incident_number,incident_name,incident_type,complexity,status,start_time,op_period,ic_name,location_desc,eoc_status,resources_count,personnel_count,EditDate,Editor', order: 'EditDate DESC' }); }
  };
  function load(key, fn, maxAge) {
    var c = app().ui.cache = app().ui.cache || {}, x = c[key];
    if (x && x.data && (!maxAge || Date.now() - x.t < maxAge)) return x.data;
    if (!x || !x.loading) { c[key] = { loading: true, data: x && x.data, t: x && x.t }; fn().then(function (d) { c[key] = { data: d, t: Date.now() }; if (document.getElementById('main')) app().rerender(); }).catch(function (e) { c[key] = { data: { _err: e.message }, t: Date.now() }; app().rerender(); }); }
    return x && x.data ? x.data : null;
  }
  function needSignIn(w) { return '<div class="empty">' + E(w) + ' come from the county ArcGIS layers. <button class="btn pri sm" data-act="signin" style="margin-left:8px">Sign in with ArcGIS</button></div>'; }

  // ---------- EOC CHECKLIST ----------
  var LL_ORDER = ['Safety and Security', 'Food, Hydration, Shelter', 'Health and Medical', 'Energy', 'Communications', 'Transportation', 'Hazardous Materials', 'Water Systems'];
  var TS = ['Open', 'In Progress', 'Done', 'Not Applicable'];
  V.checklist = function (inc) {
    var head = V.phead('EOC Checklist', 'The lifeline task lists from the Emergency Operations Plan. This is the same list as the Checklists page in the EOC app, so a change here shows there too, and the other way around.', '<button class="btn sm" data-act="cacheRefresh">' + I('refresh') + 'Refresh</button><a class="btn sm ghost" href="https://experience.arcgis.com/experience/0ed836c463984dcc86ab3e1a6d36831a" target="_blank" rel="noopener">' + I('link') + 'EOC app</a>');
    if (!arc().signedIn()) return '<div class="wrap">' + head + needSignIn('EOC checklists') + '</div>';
    var d = load('tasks', D.tasks);
    if (!d) return '<div class="wrap">' + head + '<div class="muted">Loading…</div></div>';
    if (d._err) return '<div class="wrap">' + head + '<div class="warnbox">' + E(d._err) + '</div></div>';
    var ph = app().ui.taskPhase || 'Response', only = app().ui.taskOpen;
    var tasks = d.map(function (f) { return f.attributes; });
    var tr = tasks.filter(function (t) { return t.phase === 'Response'; });
    var doneR = tr.filter(function (t) { return t.status === 'Done' || t.status === 'Not Applicable'; }).length;
    var other = tasks.filter(function (t) { return t.incident_name && inc && t.incident_name !== inc.name && t.status !== 'Open'; }).length;
    var seg = '<div class="row" style="margin-bottom:12px"><div class="seg">' + ['Response', 'Preparedness', 'Recovery', 'All'].map(function (p) { return '<button class="' + (p === ph ? 'on' : '') + '" data-act="taskPhase" data-a="' + p + '">' + p + '</button>'; }).join('') + '</div><label class="chk"><input type="checkbox" data-act-change="taskOpen"' + (only ? ' checked' : '') + '> Hide finished tasks</label><span class="dim" style="font-size:13px">Response tasks: <b style="color:var(--text)">' + doneR + ' of ' + tr.length + '</b> done</span></div>' +
      (other ? '<div class="warnbox" style="margin-bottom:12px">' + other + ' tasks are marked for a different incident. They may not have been reset since the last event (see the Lifeline Checklist Reset Runbook).</div>' : '');
    var groups = LL_ORDER.map(function (ll) {
      var ts = tasks.filter(function (t) { return t.lifeline === ll && (ph === 'All' || t.phase === ph) && (!only || (t.status !== 'Done' && t.status !== 'Not Applicable')); });
      if (!ts.length) return '';
      var all = tasks.filter(function (t) { return t.lifeline === ll && (ph === 'All' || t.phase === ph); }), dn = all.filter(function (t) { return t.status === 'Done' || t.status === 'Not Applicable'; }).length;
      return '<div class="card" style="margin-bottom:12px"><h3>' + E(ll) + '<span class="x" style="min-width:160px"><div class="prog"><i style="width:' + (all.length ? 100 * dn / all.length : 0) + '%"></i></div><small style="display:block;text-align:right;margin-top:3px">' + dn + '/' + all.length + '</small></span></h3><div class="tbl-wrap"><table class="t"><tbody>' + ts.map(function (t) {
        var oid = arc().oidOf(t);
        return '<tr><td style="width:46%"><div style="font-weight:600">' + E(t.action) + '</div><div class="dim" style="font-size:12px">' + E(t.lead_agency || '') + (t.eop_section ? ' · EOP ' + E(t.eop_section) : '') + (ph === 'All' ? ' · ' + E(t.phase) : '') + '</div></td>' +
          '<td style="width:150px"><select class="in" data-act-change="taskStatus" data-k="' + oid + '">' + TS.map(function (s) { return '<option' + (s === (t.status || 'Open') ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></td>' +
          '<td><input class="in" placeholder="Notes" value="' + E(t.notes || '') + '" data-act-change="taskNotes" data-k="' + oid + '"></td>' +
          '<td style="width:150px;font-size:11.5px" class="dim">' + (t.completed_by ? E(t.completed_by) + '<br>' + (when(t.completed_at) || E(t.completed_time || '')) : '') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    }).join('');
    return '<div class="wrap">' + head + seg + (groups || '<div class="empty">Nothing to show.</div>') + '</div>';
  };

  // ---------- DAMAGE ASSESSMENT STATUS ----------
  function daHtml(da) {
    if (!da) return '<div class="muted">Loading…</div>';
    if (da._err) return '<div class="warnbox">' + E(da._err) + '</div>';
    var zs = {}, ts = {}; da.zones.forEach(function (z) { zs[z.zone_status || 'not_started'] = (zs[z.zone_status || 'not_started'] || 0) + 1; }); da.teams.forEach(function (t) { ts[t.team_status || '?'] = (ts[t.team_status || '?'] || 0) + 1; });
    var est = da.zones.reduce(function (s, z) { return s + (+z.est_structures || 0); }, 0), done = da.zones.reduce(function (s, z) { return s + (+z.assessed_count || 0); }, 0);
    var lv = arc().live || {};
    var ZL = [['not_started', 'Not started', 'mute'], ['assigned', 'Assigned', 'blue'], ['in_progress', 'In progress', 'warn'], ['complete', 'Complete', 'ok'], ['qc_complete', 'QC complete', 'ok']];
    return (da.incident ? '<div class="row" style="margin-bottom:8px"><span class="chip gold">Active: ' + E(da.incident) + '</span>' + (da.config && da.config.fema_declaration ? '<span class="chip">' + E(da.config.fema_declaration) + '</span>' : '') + '</div>' : '<div class="muted" style="margin-bottom:8px">No damage assessment is active. Use Connections → Activate damage assessment.</div>') +
      '<div class="grid g4" style="gap:8px">' + '<div class="stat"><div class="v">' + da.zones.length + '</div><div class="l">Zones</div></div><div class="stat green"><div class="v">' + done + (est ? '<span style="font-size:15px;color:var(--muted)"> / ' + est + '</span>' : '') + '</div><div class="l">Structures assessed</div></div>' +
      '<div class="stat red"><div class="v">' + (lv.daDestroyed != null ? lv.daDestroyed : '—') + '</div><div class="l">Destroyed</div><div class="s">from latest SitRep</div></div><div class="stat gold"><div class="v">' + (lv.daMajor != null ? lv.daMajor : '—') + '</div><div class="l">Major</div></div></div>' +
      '<div class="row" style="margin-top:10px;gap:6px">' + ZL.map(function (z) { return zs[z[0]] ? '<span class="chip ' + z[2] + '">' + z[1] + ' ' + zs[z[0]] + '</span>' : ''; }).join('') + '</div>' +
      (da.teams.length ? '<div class="row" style="margin-top:8px;gap:6px">' + da.teams.filter(function (t) { return t.team_status === 'deployed'; }).map(function (t) { return '<span class="chip blue" title="' + E((t.team_lead || '') + ' · ' + (t.current_zone || '')) + '">' + E(t.team_name) + (t.current_zone ? ' → ' + E(t.current_zone) : '') + '</span>'; }).join('') + '<span class="dim" style="font-size:12px">' + (ts.available || 0) + ' teams available, ' + (ts.deployed || 0) + ' deployed</span></div>' : '') +
      '<div class="row" style="margin-top:10px"><a class="btn xs" href="https://experience.arcgis.com/experience/4191928dcb0448ed85a379a69a1ef304" target="_blank" rel="noopener">' + I('link') + 'DA Operations</a><a class="btn xs" href="https://botetourt.maps.arcgis.com/apps/dashboards/0a099702212a479ea445f2c8d8370468" target="_blank" rel="noopener">' + I('link') + '72-hour IDA report</a></div>';
  }
  V.daCard = function () { return arc().signedIn() ? daHtml(load('da', D.da, 120000)) : needSignIn('Damage assessment numbers'); };

  // ---------- MONITOR ----------
  V.monitor = function (inc) {
    var head = '<div class="phead"><div><h1 class="pg">EOC Monitor</h1><p class="pgsub" style="margin:0">Every active incident and the whole county picture in one view. Read-only; refreshes every minute.</p></div><div class="acts"><button class="btn sm" data-act="monFull">' + I('eye') + 'Full screen</button><button class="btn sm" data-act="cacheRefresh">' + I('refresh') + 'Refresh</button></div></div>';
    if (!arc().signedIn()) return '<div class="wrap">' + head + needSignIn('Monitor data') + '</div>';
    if (arc().status !== 'on' || !arc().own) return '<div class="wrap">' + head + '<div class="muted">Connecting to ArcGIS…</div></div>';
    var incs = load('monInc', D.incidents, 55000), act = load('monAct', D.activity, 55000), ll = load('monLL', D.lifelinesLatest, 55000), da = load('da', D.da, 120000);
    var roads = load('roads', arc().roads.list, 55000), evac = load('evac', arc().evac.list, 55000), sites = load('sites', arc().sites.list, 55000), field = load('field', function () { return arc().field.recent(1); }, 55000);
    if (!(arc().live && arc().live.asof)) app().refreshLive();
    var lv = arc().live || {}, cad = CP.calls || { calls: [] };
    function ok(x) { return x && !x._err; }
    var tiles = [
      ['Active incidents', ok(incs) ? incs.length : '…', 'gold'], ['CAD calls', cad.calls.length || lv.cadCount || 0, ''], ['Road closures', ok(roads) ? roads.closures.length + roads.blocks.length : '…', 'red'], ['Evacuation notices', ok(evac) ? evac.length : '…', 'red'],
      ['Shelters open', ok(sites) ? sites.shelters.filter(function (s) { return s.attributes.status === 'Open'; }).length : '…', ''], ['People sheltered', lv.shelterPop != null ? lv.shelterPop : '…', 'blue'], ['Field reports 24h', ok(field) ? field.length : '…', ''], ['NWS alerts', lv.nws ? lv.nws.length : '…', lv.nws && lv.nws.length ? 'red' : '']
    ].map(function (t) { return '<div class="stat ' + t[2] + '"><div class="v">' + t[1] + '</div><div class="l">' + t[0] + '</div></div>'; }).join('');
    var incH = !incs ? '<div class="muted">Loading…</div>' : incs._err ? '<div class="warnbox">' + E(incs._err) + '</div>' : incs.length ? incs.map(function (f) {
      var a = f.attributes;
      return '<div class="inc-card" data-act="open" data-a="' + E(a.incident_key) + '"><div style="flex:1;min-width:0"><div class="n">' + E(a.incident_name) + '</div><div class="m">' + E(a.incident_type || '') + ' · IC ' + E(a.ic_name || '—') + ' · shift ' + (a.op_period || 1) + (a.location_desc ? ' · ' + E(a.location_desc) : '') + '</div><div class="m">' + (a.resources_count || 0) + ' units · ' + (a.personnel_count || 0) + ' people · updated ' + ago(a.EditDate) + (a.Editor ? ' by ' + E(a.Editor) : '') + '</div></div><span class="chip gold">Type ' + (a.complexity || '?') + '</span><span class="chip ok"><span class="dot"></span>' + CP.elapsed(a.start_time && new Date(a.start_time).toISOString()) + '</span></div>';
    }).join('') : '<div class="empty">No active incidents in Command Post.</div>';
    var actH = !act ? '<div class="muted">Loading…</div>' : act._err ? '<div class="warnbox">' + E(act._err) + '</div>' : act.length ? '<ul class="tl">' + act.map(function (f) { var a = f.attributes; return '<li><div class="tm">' + (a.entry_time ? CP.fmtTime(new Date(a.entry_time).toISOString()) : '') + '</div><div><span class="cat ' + (a.category || '').split(' ')[0] + '">' + E(a.category || '') + '</span>' + E(a.entry_text) + '<div class="who">' + E(a.incident_name || '') + (a.author ? ' · ' + E(a.author) : '') + '</div></div></li>'; }).join('') + '</ul>' : '<div class="empty">No activity yet.</div>';
    var llH = '';
    if (ok(ll) && ll.length) { var l = ll[0].attributes; llH = '<div class="ll" style="grid-template-columns:repeat(2,minmax(0,1fr))">' + CP.LIFELINES.map(function (x) { var st = l[x.key] || 'Unknown'; return '<div class="li" title="' + E(l[x.key + 'desc'] || '') + '"><span class="b ' + U.llClass(st) + '"></span><div><div class="nm">' + E(x.name) + '</div><div class="st">' + E(st) + '</div></div></div>'; }).join('') + '</div><div class="dim" style="font-size:11.5px;margin-top:6px">County Lifeline Status, ' + ago(l.CreationDate) + '</div>'; } else llH = '<div class="muted">' + (ll ? 'No lifeline status yet.' : 'Loading…') + '</div>';
    var sr = lv.lastSitrep;
    var srH = sr ? '<div style="font-weight:700">' + E(sr.incident_name || '') + ' · SitRep ' + E(sr.sitrep_number || '') + '</div><div class="dim" style="font-size:12px">' + when(sr.report_time) + ' · ' + E(sr.eoc_status || '') + ' · ' + E(sr.declaration_status || '') + '</div><div style="font-size:13.5px;margin-top:6px">' + E((sr.changes_summary || '').slice(0, 400)) + '</div>' : '<div class="muted">No SitRep yet.</div>';
    var roadH = ok(roads) ? (roads.closures.concat(roads.blocks).slice(0, 8).map(function (x) { var a = x.attributes; return '<div class="feed"><div class="l"><b>' + E(a.street) + '</b> <span class="dim">' + E(a.accessallowed || '') + '</span><small>' + E(a.description || '') + '</small></div></div>'; }).join('') || '<div class="muted">No road closures.</div>') + (ok(evac) && evac.length ? '<div class="sec-t" style="margin-top:10px;font-size:12px">Evacuation notices</div>' + evac.map(function (x) { var a = x.attributes; return '<div class="feed"><div class="l"><span class="chip ' + (/Level 3/.test(a.evactype) ? 'red' : 'warn') + '">' + E(a.evactype) + '</span> ' + E(a.zonename || a.incidentnm || '') + '</div></div>'; }).join('') : '') : '<div class="muted">Loading…</div>';
    var shH = ok(sites) ? (sites.shelters.filter(function (s) { return s.attributes.status !== 'Closed'; }).map(function (x) { var a = x.attributes; return '<div class="feed"><div class="v" style="font-size:18px">' + (a.occupancy || 0) + (a.capacity ? '<span style="font-size:12px;color:var(--muted)">/' + a.capacity + '</span>' : '') + '</div><div class="l"><b>' + E(a.facname) + '</b><small>' + E(a.status) + '</small></div></div>'; }).join('') || '<div class="muted">No shelters open or on standby.</div>') : '<div class="muted">Loading…</div>';
    return '<div class="wrap" id="monwrap">' + head + '<div class="grid g4" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">' + tiles + '</div>' +
      '<div class="grid g3" style="margin-top:14px"><div class="span2 grid" style="align-content:start">' + card('Active incidents', incH) + '<div class="card" style="padding:8px"><div class="map" id="monmap" style="height:430px"></div><div class="mlegend"><span><i style="background:#FDB833"></i>Incidents</span><span><i style="background:#ff4d58"></i>Road closures</span><span><i style="background:#c77dff"></i>Evacuation areas</span><span><i style="background:#F0444C"></i>Shelters</span><span><i style="background:#ffb066"></i>CAD calls</span><span><i style="background:#3D7BFF"></i>Field reports (24h)</span></div></div>' + card('Recent activity · all incidents', actH) + '</div>' +
      '<div class="grid" style="align-content:start">' + card('Latest SitRep', srH) + card('Lifelines', llH) + card('Roads &amp; evacuations', roadH) + card('Shelters', shH) + card('Damage assessment', daHtml(da)) + '</div></div></div>';
  };
  AFTER.monitor = function () {
    var el = document.getElementById('monmap'); if (!el || !window.L) return;
    var m = CP.map.create(el, {}), all = L.featureGroup().addTo(m), c = app().ui.cache || {};
    function d(k) { return c[k] && c[k].data && !c[k].data._err ? c[k].data : null; }
    var incs = d('monInc'), roads = d('roads'), evac = d('evac'), sites = d('sites'), field = d('field');
    if (evac) evac.forEach(function (x) { var l = CP.map.esri(x.geometry); if (l) all.addLayer(l.bindPopup('<b>' + E(x.attributes.zonename || '') + '</b><br>' + E(x.attributes.evactype))); });
    if (roads) roads.closures.concat(roads.blocks).forEach(function (x) { var l = CP.map.esri(x.geometry, x.geometry && x.geometry.x != null ? { icon: CP.map.pinIcon('#ff4d58', '✕', 20) } : null); if (l) all.addLayer(l.bindPopup('<b>' + E(x.attributes.street) + '</b><br>' + E(x.attributes.description || ''))); });
    if (sites) sites.shelters.filter(function (s) { return s.attributes.status !== 'Closed' && s.geometry; }).forEach(function (x) { all.addLayer(L.marker([x.geometry.y, x.geometry.x], { icon: CP.map.pinIcon('#F0444C', 'SH', 22) }).bindPopup('<b>' + E(x.attributes.facname) + '</b><br>' + E(x.attributes.status))); });
    if (field) field.forEach(function (x) { if (x.geometry) all.addLayer(L.marker([x.geometry.y, x.geometry.x], { icon: CP.map.dotIcon('#3D7BFF', 10) }).bindPopup('<b>' + x._src + '</b><br>' + E(x.attributes.comments || ''))); });
    ((CP.calls && CP.calls.calls) || []).forEach(function (x) { if (x.lat != null) all.addLayer(L.marker([x.lat, x.lng], { icon: CP.map.dotIcon('#ffb066', 11) }).bindPopup('<b>' + E(x.type) + '</b><br>' + E(x.addr || ''))); });
    if (incs) incs.forEach(function (x) { if (x.geometry) all.addLayer(L.marker([x.geometry.y, x.geometry.x], { icon: CP.map.pinIcon('#FDB833', '★', 30), zIndexOffset: 1000 }).bindPopup('<b>' + E(x.attributes.incident_name) + '</b><br>Type ' + (x.attributes.complexity || '?') + ' · IC ' + E(x.attributes.ic_name || '') + '<br><a href="#" data-act="open" data-a="' + E(x.attributes.incident_key) + '">Open in Command Post</a>')); });
    if (all.getLayers().length) m.fitBounds(all.getBounds().pad(0.15), { maxZoom: 13 });
  };
  setInterval(function () { if (app() && app().view === 'monitor' && arc().signedIn()) { var c = app().ui.cache || {}; ['monInc', 'monAct', 'monLL', 'roads', 'evac', 'sites', 'field'].forEach(function (k) { if (c[k]) c[k].t = 0; }); app().refreshLive(); app().rerender(); } }, 60000);

  // ---------- STAKEHOLDERS ----------
  V.stakeholders = function () {
    var rows = [
      ['Field crews (Fire/EMS, Sheriff, Public Works)', 'Stormwatch Responder', 'https://experience.arcgis.com/experience/0f7a1564b1db45c2adcb469b56973330', 'Field Reports page, Monitor, map'],
      ['Welfare check teams', 'Responder House Checks (Survey123)', 'https://survey123.arcgis.com/share/3c05a771c9124f6096c7de50b40201b5', 'Field Reports page (house checks)'],
      ['Emergency Communications / dispatch', 'Storm Situation Updates – Dispatch (Survey123)', 'https://survey123.arcgis.com/share/25c0b913f91447e88a85ccf562bdfcbb', 'Field Reports page'],
      ['CAD (automatic)', 'CAD feed', '', 'CAD calls panel, Monitor'],
      ['Shelter staff and kiosks', 'Shelter check-in / check-out and staff sign-in', 'https://survey123.arcgis.com/share/09f6597a0cb441d097419b7236b4fde7', 'Shelters & Distribution (live counts), SitRep'],
      ['Damage assessment teams', 'Field Maps + DA Operations', 'https://experience.arcgis.com/experience/4191928dcb0448ed85a379a69a1ef304', 'Damage assessment status, SitRep'],
      ['EOC staff (lifeline leads)', 'Botetourt County EOC app', 'https://experience.arcgis.com/experience/0ed836c463984dcc86ab3e1a6d36831a', 'EOC Checklist page (same task list)'],
      ['Public', 'Stormwatch (public)', 'https://experience.arcgis.com/experience/c8f438b974da4e2b9d9fd01893687ec4', 'Field Reports page'],
      ['Public (read only)', 'Incident Status dashboard and EM website', 'https://bocoem-botetourt.hub.arcgis.com', 'Fed by Command Post: incident, closures, notices, shelters, public message']
    ];
    return '<div class="tbl-wrap"><table class="t ro"><thead><tr><th>Who</th><th>Gets this tool</th><th>Shows up in Command Post</th></tr></thead><tbody>' + rows.map(function (r) { return '<tr><td><b>' + E(r[0]) + '</b></td><td>' + (r[2] ? '<a href="' + r[2] + '" target="_blank" rel="noopener">' + E(r[1]) + '</a>' : E(r[1])) + '</td><td>' + E(r[3]) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  };

  // ---------- actions ----------
  CP.extendEocActs = function (act, change) {
    act.taskPhase = function (p) { app().ui.taskPhase = p; app().rerender(); };
    change.taskOpen = function (el) { app().ui.taskOpen = el.checked; app().rerender(); };
    function rec(oid) { var d = (app().ui.cache || {}).tasks; d = d && d.data; var f = d && d.find(function (x) { return arc().oidOf(x.attributes) === oid; }); return f && f.attributes; }
    change.taskStatus = function (el) {
      var oid = +el.dataset.k, t = rec(oid), st = el.value, inc = app().inc, me = CP.me.name || (arc().user && arc().user.name) || '';
      var a = { status: st, incident_name: inc ? inc.name : (t && t.incident_name) || null };
      if (st === 'Done' || st === 'Not Applicable') { a.completed_by = me; a.completed_at = Date.now(); a.completed_time = CP.fmtDT(CP.now()); } else if (st === 'Open') { a.completed_by = null; a.completed_at = null; a.completed_time = null; }
      D.updTask(oid, a).then(function () {
        if (t) Object.assign(t, a);
        if (inc && t && st !== 'Open') { app().log('EOC task ' + st.toLowerCase() + ': ' + t.lifeline + ' — ' + t.action, st === 'Done' ? 'Action' : 'Note'); app().commit(false); }
        U.toast('Task updated in the EOC checklist.', 'ok'); app().rerender();
      }).catch(fail);
    };
    change.taskNotes = function (el) { var oid = +el.dataset.k, t = rec(oid); D.updTask(oid, { notes: el.value }).then(function () { if (t) t.notes = el.value; U.toast('Note saved.', 'ok'); }).catch(fail); };
    act.monFull = function () { var el = document.documentElement; if (el.requestFullscreen) el.requestFullscreen(); };
  };
})(window.CP);
