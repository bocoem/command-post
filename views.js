/* COMMAND POST — page views */
(function (CP) {
  'use strict';
  var U = CP.ui, E = CP.esc, A = CP.alive, I = U.icon;
  var V = CP.views = {}, AFTER = CP.after = {};

  function phead(title, sub, acts) { return '<div class="phead"><div><h1 class="pg">' + title + '</h1>' + (sub ? '<p class="pgsub" style="margin:0">' + sub + '</p>' : '') + '</div><div class="acts">' + (acts || '') + '</div></div>'; }
  function prevBtn(no, label, o) { return '<button class="btn sm" data-act="preview" data-a="' + no + '"' + (o ? ' data-o="' + E(JSON.stringify(o)) + '"' : '') + '>' + I('eye') + (label || 'ICS ' + no) + '</button>'; }
  function card(title, body, extra, cls) { return '<div class="card ' + (cls || '') + '"><h3>' + title + (extra ? '<span class="x">' + extra + '</span>' : '') + '</h3>' + body + '</div>'; }
  function opts(list) { return list; }
  function resActive(r) { return ['Released', 'Demobilized', 'Ordered'].indexOf(r.status) < 0; }
  function assignOpts(inc) { return A(inc.assignments).map(function (a) { return { v: a.id, label: CP.forms.assignName(inc, a.id) || 'Unnamed assignment' }; }); }
  V.phead = phead;

  // ================= HOME =================
  V.home = function () {
    var local = CP.store.list(), remote = CP.app.remoteList || [];
    var map = {};
    local.forEach(function (i) { map[i.id] = { id: i.id, name: i.name, number: i.number, type: i.type, status: i.status, cx: i.complexity, start: i.start, upd: i.updated, ic: CP.personName(i, 'IC'), local: true }; });
    remote.forEach(function (r) { var x = map[r.incident_key] || (map[r.incident_key] = { id: r.incident_key, local: false }); x.remote = true; if (!x.name) Object.assign(x, { name: r.incident_name, number: r.incident_number, type: r.incident_type, status: r.status, cx: r.complexity, start: r.start_time && new Date(r.start_time).toISOString(), upd: r.EditDate && new Date(r.EditDate).toISOString(), ic: r.ic_name }); });
    var all = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return (b.upd || '').localeCompare(a.upd || ''); });
    var act = all.filter(function (x) { return x.status !== 'Closed'; }), cl = all.filter(function (x) { return x.status === 'Closed'; });
    function row(x) {
      return '<div class="inc-card' + (x.status === 'Closed' ? ' closed' : '') + '" data-act="open" data-a="' + x.id + '"><div style="flex:1;min-width:0"><div class="n">' + E(x.name) + '</div><div class="m">' + E(x.number || '') + ' · ' + E(x.type || '') + ' · started ' + CP.fmtDT(x.start) + (x.ic ? ' · IC ' + E(x.ic) : '') + '</div></div>' +
        '<span class="chip ' + (x.status === 'Closed' ? 'mute' : 'gold') + '">Type ' + (x.cx || '?') + '</span>' + (x.status !== 'Closed' ? '<span class="chip ok"><span class="dot"></span>' + CP.elapsed(x.start) + '</span>' : '<span class="chip mute">Closed</span>') +
        '<span class="chip ' + (x.remote ? 'blue' : 'mute') + '" title="' + (x.remote ? 'Shared through ArcGIS' : 'Only on this device') + '">' + (x.remote ? 'Shared' : 'This device') + '</span></div>';
    }
    var arcCard = CP.arc.signedIn()
      ? '<div class="row"><span class="chip ok"><span class="dot"></span>Signed in</span><b>' + E(CP.arc.user ? CP.arc.user.name : '') + '</b><span class="muted">' + (CP.arc.status === 'on' ? 'Incidents are shared with everyone signed in to the county ArcGIS.' : CP.arc.status === 'nosvc' ? 'Command Post data service not set up yet.' : CP.arc.err ? E(CP.arc.err) : '') + '</span>' + (CP.arc.status === 'nosvc' ? '<button class="btn sm pri" data-nav="arc">Set it up</button>' : '') + '</div>'
      : '<div class="row"><span class="chip mute">Local mode</span><span class="muted grow">Works offline on this device. Sign in to share incidents with the EOC and update the county ArcGIS layers.</span><button class="btn pri sm" data-act="signin">' + I('cloud') + 'Sign in with ArcGIS</button></div>';
    return '<div class="wrap">' +
      '<div class="hero"><h2>Incident Command, one place.</h2><p>Open an incident here and fill it in as it grows. Command Post builds the ICS forms and the Incident Action Plan, and it updates the county map, SitReps, lifelines and public messages in ArcGIS.</p>' +
      '<div class="row"><button class="btn pri big" data-act="new">' + I('plus') + 'Start new incident</button><button class="btn big ghost" data-act="import">' + I('up') + 'Open incident file</button></div></div>' +
      '<div class="grid g3" style="margin-top:16px"><div class="span2"><div class="sec-t">Active incidents <small class="dim">' + act.length + '</small></div>' + (act.length ? '<div class="grid" style="gap:8px">' + act.map(row).join('') + '</div>' : '<div class="empty">No active incidents. Start one when something happens. A Type 5 incident takes about a minute.</div>') +
      (cl.length ? '<details style="margin-top:18px"><summary class="sec-t" style="cursor:pointer;display:list-item">Closed incidents <small class="dim">' + cl.length + '</small></summary><div class="grid" style="gap:8px;margin-top:8px">' + cl.map(row).join('') + '</div></details>' : '') + '</div>' +
      '<div class="grid" style="align-content:start">' + card('ArcGIS', arcCard) + card('EM toolkit', '<div class="tk" style="grid-template-columns:1fr">' + CP.TOOLKIT.slice(0, 7).map(function (t) { return '<a class="' + t.c + '" href="' + t.u + '" target="_blank" rel="noopener"><b>' + E(t.n) + '</b><span>' + E(t.d) + '</span></a>'; }).join('') + '</div>') + '</div></div></div>';
  };

  // ================= OVERVIEW =================
  V.dash = function (inc) {
    var op = CP.curOP(inc), res = A(inc.resources), act = res.filter(resActive), asg = res.filter(function (r) { return r.status === 'Assigned'; });
    var objs = op ? A(op.objectives) : [], done = objs.filter(function (o) { return o.status === 'Done'; }).length;
    var opLeft = op ? new Date(op.end) - Date.now() : 0;
    var log = A(inc.log).slice().sort(function (a, b) { return (b.ts || '').localeCompare(a.ts || ''); }).slice(0, 12);
    var stats = '<div class="grid g6">' +
      '<div class="stat gold"><div class="v">' + CP.elapsed(inc.start) + '</div><div class="l">Elapsed</div><div class="s">Since ' + CP.fmtDT(inc.start) + '</div></div>' +
      '<div class="stat"><div class="v">OP ' + (op ? op.n : '—') + '</div><div class="l">Operational period</div><div class="s">' + (op ? (opLeft > 0 ? 'Ends in ' + Math.floor(opLeft / 3600000) + 'h ' + Math.floor(opLeft % 3600000 / 60000) + 'm' : '<span style="color:#ff8d92">Ended ' + CP.fmtDT(op.end) + '</span>') : '') + '</div></div>' +
      '<div class="stat green"><div class="v">' + asg.length + '<span style="font-size:18px;color:var(--muted)"> / ' + act.length + '</span></div><div class="l">Resources assigned</div><div class="s">' + res.filter(function (r) { return r.status === 'Staged'; }).length + ' staged · ' + res.filter(function (r) { return r.status === 'Ordered' || r.status === 'En Route'; }).length + ' ordered/en route</div></div>' +
      '<div class="stat blue"><div class="v">' + CP.app.personnel(inc) + '</div><div class="l">Personnel</div><div class="s">' + A(inc.org).filter(function (p) { return p.name; }).length + ' in ICS positions</div></div>' +
      '<div class="stat"><div class="v">' + done + '<span style="font-size:18px;color:var(--muted)"> / ' + objs.length + '</span></div><div class="l">Objectives met</div><div class="prog" style="margin-top:6px"><i style="width:' + (objs.length ? 100 * done / objs.length : 0) + '%"></i></div></div>' +
      '<div class="stat"><div class="v">' + A(inc.log).length + '</div><div class="l">Log entries</div><div class="s">' + A(inc.requests).filter(function (r) { return ['Filled', 'Cancelled'].indexOf(r.status) < 0; }).length + ' open resource requests</div></div></div>';
    var qlog = '<div class="qlog"><select class="in" id="qcat">' + CP.LOG_CATS.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select><input class="in" id="qtext" placeholder="Log something… (Enter to save)  e.g. Route 220 closed at Jackson Rd, VDOT notified"><button class="btn pri sm" data-act="qlog">' + I('plus') + 'Log</button></div>';
    var tl = log.length ? '<ul class="tl">' + log.map(function (l) { return '<li><div class="tm">' + CP.fmtTime(l.ts) + '<div class="who" style="font-family:var(--sans)">' + CP.fmtDate(l.ts).slice(0, 5) + '</div></div><div><span class="cat ' + (l.cat || '').split(' ')[0] + '">' + E(l.cat) + '</span>' + E(l.text) + '<div class="who">' + E(l.author || '') + (l.pos ? ' · ' + E(l.pos) : '') + '</div></div></li>'; }).join('') + '</ul>' : '<div class="empty">Nothing logged yet.</div>';
    var objH = objs.length ? objs.map(function (o, i) { return '<div class="obj"><div class="num">' + (i + 1) + '</div><div style="flex:1">' + E(o.text) + '</div><button class="btn xs ' + (o.status === 'Done' ? 'pri' : '') + '" data-act="objToggle" data-a="' + op.id + '|' + o.id + '">' + (o.status === 'Done' ? I('check') + 'Done' : 'Mark done') + '</button></div>'; }).join('') : '<div class="empty">No objectives for this operational period. <a href="#" data-nav="' + (CP.app.visible('objectives') ? 'objectives' : 'brief') + '">Add objectives</a></div>';
    return '<div class="wrap">' + stats +
      '<div class="grid g3" style="margin-top:14px"><div class="span2 grid" style="align-content:start">' + qlog +
      card('Objectives · OP ' + (op ? op.n : ''), objH, '<a class="btn xs" href="#" data-nav="' + (CP.app.visible('objectives') ? 'objectives' : 'brief') + '">Edit</a>') +
      card('Recent activity', tl, '<a class="btn xs" href="#" data-nav="log">Full log</a>') +
      card('Incident map', '<div class="map sm" id="dashmap"></div>', '<a class="btn xs" href="#" data-nav="map">Open map</a>') + '</div>' +
      '<div class="grid" style="align-content:start">' + card('Next steps', nextSteps(inc), '<span class="chip gold">Type ' + inc.complexity + '</span>') +
      card('County picture <small>live from ArcGIS</small>', liveCard(), CP.arc.signedIn() ? '<button class="ibtn" title="Refresh" data-act="live">' + I('refresh') + '</button>' : '') +
      card('Community lifelines', lifelineMini(inc), '<a class="btn xs" href="#" data-nav="lifelines">Update</a>') +
      card('Quick forms', '<div class="row" style="gap:6px">' + ['201', '202', '211', '214', '209'].map(function (n) { return prevBtn(n); }).join('') + '<button class="btn sm pri" data-nav="forms">' + I('forms') + 'All forms &amp; IAP</button></div>') + '</div></div></div>';
  };
  function nextSteps(inc) {
    var op = CP.curOP(inc) || {}, cx = inc.complexity, s = [];
    var has = function (k) { var p = CP.person(inc, k); return !!(p && p.name); };
    s.push(['Set the incident location on the map', !!inc.location.lat, 'map']);
    s.push(['Name the Incident Commander', has('IC'), 'org']);
    s.push(['Write the situation summary', !!(inc.situation || '').trim(), 'brief']);
    s.push(['Set objectives for this operational period', A(op.objectives).length > 0, CP.app.visible('objectives') ? 'objectives' : 'brief']);
    s.push(['Check in resources (ICS 211)', A(inc.resources).length > 0, 'resources']);
    if (cx <= 4) s.push(['Assign a Safety Officer', has('SOFR'), 'org']);
    if (cx <= 4) s.push(['Set up the Incident Command Post / staging', A(inc.facilities).length > 0, 'facilities']);
    if (cx <= 3) {
      s.push(['Fill command & general staff', has('OSC') && has('PSC') && has('LSC'), 'org']);
      s.push(['Build division/group assignments (ICS 204)', A(inc.assignments).length > 0, 'assign']);
      s.push(['Hazard analysis + safety message (215A/208)', A(inc.hazards).length > 0 && !!op.safetyMsg, 'safety']);
      s.push(['Confirm comms and medical plans (205/206)', A(inc.comms).some(function (c) { return c.rx || c.tx; }) || A(inc.medical.aid).length > 0, 'comms']);
      s.push(['Approve and print the IAP', !!(inc.iapPrinted && inc.iapPrinted[op.n]), 'forms']);
    }
    s.push(['Send a SitRep / ICS 209', A(inc.sitreps).length > 0, 'status']);
    if (CP.arc.signedIn()) s.push(['Put the incident on the county map', !!(inc.arc.pushed && inc.arc.pushed.incident), 'arc']);
    s.push(['Public message (if the public is affected)', !!(inc.publicInfo.releases && A(inc.publicInfo.releases).length), 'public']);
    var open = s.filter(function (x) { return !x[1]; }).length;
    return '<div class="steps">' + s.map(function (x) { return '<div class="step' + (x[1] ? ' done' : '') + '" data-nav="' + x[2] + '"><span class="bx">' + (x[1] ? I('check') : '') + '</span>' + E(x[0]) + (x[1] ? '' : '<span class="go">GO ›</span>') + '</div>'; }).join('') + '</div><div class="dim" style="font-size:12px;margin-top:8px">' + open + ' open. Raise the complexity type in Incident Settings to unlock the full IAP workflow.</div>';
  }
  function liveCard() {
    if (!CP.arc.signedIn()) return '<div class="muted" style="font-size:14px">Sign in with ArcGIS to see live CAD calls, storm reports, shelter population, damage assessment and road closures here.</div><button class="btn sm pri" style="margin-top:8px" data-act="signin">Sign in</button>';
    var lv = CP.arc.live || {};
    if (!lv.asof) return '<div class="muted">Loading…</div>';
    function f(v, l, s, col) { return '<div class="feed"><div class="v" style="color:' + (col || '#fff') + '">' + (v == null ? '—' : v) + '</div><div class="l">' + l + (s ? '<small>' + s + '</small>' : '') + '</div></div>'; }
    var units = lv.units ? Object.keys(lv.units).map(function (k) { return k + ' ' + lv.units[k]; }).join(' · ') : '';
    var da = lv.daZones ? Object.keys(lv.daZones).map(function (k) { return k.replace('_', ' ') + ' ' + lv.daZones[k]; }).join(' · ') : '';
    return f(lv.cadCount, 'Active CAD calls', units, '#FDB833') + f(lv.stormCount, 'Storm reports since start', 'Responder, dispatch and public') +
      f(lv.shelterPop, 'People in shelters', (lv.sheltersOpen != null ? lv.sheltersOpen + ' shelters open' : '') + (lv.shelterPets ? ' · ' + lv.shelterPets + ' pets' : ''), '#F0444C') +
      f(lv.closureCount, 'Active road closures', lv.vdot != null ? lv.vdot + ' VDOT incidents county-wide' : '') +
      f(lv.daDestroyed != null ? (lv.daDestroyed || 0) + '/' + (lv.daMajor || 0) : null, 'Destroyed / major damage', da ? 'DA zones: ' + da : (lv.daAsOf ? 'as of ' + lv.daAsOf : 'No damage assessment yet')) +
      f(lv.nws ? lv.nws.length : null, 'NWS alerts over county', lv.nws && lv.nws.length ? E(lv.nws.slice(0, 3).map(function (n) { return n.Event; }).join(', ')) : '') +
      '<div class="dim" style="font-size:11.5px;margin-top:6px">Updated ' + lv.asof + (lv.errors.length ? ' · <span title="' + E(lv.errors.join('\n')) + '">' + lv.errors.length + ' feed(s) unavailable</span>' : '') + '</div>';
  }
  function lifelineMini(inc) {
    return '<div class="ll" style="grid-template-columns:repeat(2,minmax(0,1fr))">' + CP.LIFELINES.map(function (l) { var x = inc.lifelines[l.key] || {}; return '<div class="li" data-nav="lifelines"><span class="b ' + U.llClass(x.status) + '"></span><div><div class="nm">' + E(l.name) + '</div><div class="st">' + E(x.status || 'Unknown') + '</div></div></div>'; }).join('') + '</div>';
  }
  AFTER.dash = function (inc) { CP.app.miniMap('dashmap', inc); if (CP.arc.signedIn() && !(CP.arc.live && CP.arc.live.asof)) CP.app.refreshLive(); };

  // ================= BRIEFING (201) =================
  V.brief = function (inc) {
    var op = CP.curOP(inc);
    var objT = op ? U.table({ key: 'opPeriods@' + op.id + '.objectives', rows: op.objectives, cols: [{ f: 'text', l: 'Objective', ph: 'e.g. Provide for the safety of responders and the public' }, { f: 'status', l: 'Status', t: 'sel', o: ['Open', 'In Progress', 'Done', 'Deferred'], w: '150px', blank: false }], add: 'Add objective', empty: 'No objectives yet.', tpl: 'objective' }) : '';
    var acts = U.table({ key: 'actions', rows: A(inc.actions).sort(function (a, b) { return (a.ts || '').localeCompare(b.ts || ''); }), cols: [{ f: 'ts', l: 'Time', t: 'dt', w: '210px' }, { f: 'text', l: 'Action / strategy / tactic', ph: 'e.g. Engine 1 and Rescue 1 assigned to search the trailer park' }, { f: 'status', l: 'Status', t: 'sel', o: ['Current', 'Planned', 'Done'], w: '130px' }], add: 'Add action', tpl: 'action', empty: 'Add what has been done and what is planned.' });
    return '<div class="wrap">' + phead('Incident Briefing', 'Everything ICS 201 needs. Use it for the initial briefing, for a transfer of command, and as the whole plan on Type 4 and 5 incidents.', prevBtn('201', 'Preview ICS 201') + '<button class="btn sm" data-act="transfer">' + I('users') + 'Transfer of command</button>') +
      '<div class="grid g2"><div class="grid" style="align-content:start">' +
      card('Incident', '<div class="grid g2">' + U.text(inc, 'name', 'Incident name', { rr: 1 }) + U.text(inc, 'number', 'Incident number', { rr: 1 }) + U.sel(inc, 'type', 'Incident type', CP.INCIDENT_TYPES, { rr: 1 }) + U.dt(inc, 'start', 'Date/time initiated', { rr: 1 }) +
        U.text(inc, 'location.desc', 'Location / area', { ph: 'e.g. Rt 220 corridor, Eagle Rock to Iron Gate', cls: 'span2' }) + U.text(inc, 'location.address', 'Address or cross streets') + U.text(inc, 'location.jurisdiction', 'Jurisdiction') +
        '<div class="span2 row">' + (inc.location.lat ? '<span class="chip ok">' + I('pin') + inc.location.lat.toFixed(5) + ', ' + inc.location.lng.toFixed(5) + '</span>' : '<span class="chip warn">No map location</span>') + '<button class="btn sm" data-act="pickLoc">' + I('pin') + (inc.location.lat ? 'Move on map' : 'Set on map') + '</button>' + U.chk(inc, 'publicView', 'Show this incident on public maps', { rr: 1 }) + '</div></div>') +
      card('Situation summary', U.area(inc, 'situation', null, { h: 150, ph: 'What happened, what is threatened, what has been done, current conditions.' }) + '<div style="height:10px"></div>' + U.area(inc, 'healthSafety', 'Health and safety briefing', { h: 80, ph: 'Known hazards, PPE, precautions for responders.' })) +
      '</div><div class="grid" style="align-content:start">' + card('Current and planned objectives · OP ' + (op ? op.n : ''), objT) +
      card('Actions, strategies and tactics', acts + '<div class="dim" style="font-size:12px;margin-top:6px">Decision and Action entries from the activity log are added to ICS 201 automatically.</div>') +
      card('Map / sketch notes', U.area(inc, 'mapNote', null, { h: 60, ph: 'What the map shows: perimeter, hot zone, staging, routes…' }) + '<div class="row" style="margin-top:8px"><button class="btn sm" data-nav="map">' + I('map') + 'Open map</button><span class="dim" style="font-size:12px">' + (CP.app.mapImg(inc) ? 'A map snapshot is attached to ICS 201 and the IAP.' : 'Use "Add map to IAP" on the Map page to put a map on ICS 201.') + '</span></div>') +
      '</div></div></div>';
  };

  // ================= OBJECTIVES / OP PERIODS / IAP (202) =================
  V.objectives = function (inc) {
    var ops = A(inc.opPeriods), sel = CP.app.selOP(inc), op = sel;
    var tabs = '<div class="seg">' + ops.map(function (o) { return '<button class="' + (o.id === op.id ? 'on' : '') + '" data-act="selOP" data-a="' + o.id + '">OP ' + o.n + (o.n === inc.currentOP ? ' ●' : '') + '</button>'; }).join('') + '</div>';
    var p = 'opPeriods@' + op.id;
    var it = op.iapItems || {};
    var meet = U.table({ key: p + '.meetings', rows: op.meetings || [], cols: [{ f: 'what', l: 'Meeting / step', t: 'sel', o: ['Initial UC meeting', 'Objectives meeting', 'Command & General Staff meeting', 'Tactics meeting', 'Planning meeting', 'IAP prep & approval', 'Operations briefing', 'Other'] }, { f: 'ts', l: 'Time', t: 'dt', w: '210px' }, { f: 'where', l: 'Location', w: '200px' }, { f: 'done', l: 'Done', t: 'chk', w: '60px' }], add: 'Add meeting', tpl: 'meeting', empty: 'No planning-cycle meetings scheduled.' });
    return '<div class="wrap">' + phead('Objectives &amp; Operational Periods', 'ICS 202, the safety message (208) and the planning cycle for each operational period.', tabs + '<button class="btn sm" data-act="nextOP">' + I('plus') + 'Start next OP</button>' + prevBtn('202', 'Preview ICS 202', { opId: op.id })) +
      (op.n !== inc.currentOP ? '<div class="warnbox" style="margin-bottom:12px">You are editing OP ' + op.n + '. The current operational period is OP ' + inc.currentOP + '. <button class="btn xs" data-act="setCurOP" data-a="' + op.id + '">Make OP ' + op.n + ' current</button></div>' : '') +
      '<div class="grid g3"><div class="span2 grid" style="align-content:start">' +
      card('Operational period ' + op.n, '<div class="grid g2">' + U.dt(inc, p + '.start', 'Start', { rr: 1 }) + U.dt(inc, p + '.end', 'End', { rr: 1 }) + '</div>') +
      card('3. Objectives', U.table({ key: p + '.objectives', rows: op.objectives, cols: [{ f: 'text', l: 'Objective (specific, measurable, achievable)', ph: 'e.g. Complete welfare checks on all 140 homes in Zone B by 1800' }, { f: 'status', l: 'Status', t: 'sel', o: ['Open', 'In Progress', 'Done', 'Deferred'], w: '140px', blank: false }], add: 'Add objective', tpl: 'objective' }) +
        '<div class="row" style="margin-top:8px;gap:6px"><span class="dim" style="font-size:12px">Starters:</span>' + starterObjs(inc).map(function (t) { return '<button class="btn xs ghost" data-act="addObj" data-a="' + op.id + '" data-t="' + E(t) + '">+ ' + E(t.length > 46 ? t.slice(0, 44) + '…' : t) + '</button>'; }).join('') + '</div>') +
      card('4. Command emphasis &amp; situational awareness', U.area(inc, p + '.emphasis', 'Operational period command emphasis', { h: 80, ph: 'Priorities, safety focus, key messages from the IC.' }) + '<div style="height:10px"></div>' + U.area(inc, p + '.awareness', 'General situational awareness', { h: 80 }) + '<div style="height:10px"></div>' + U.area(inc, p + '.weather', 'Weather forecast', { h: 60, ph: 'NWS Blacksburg forecast for the period.' })) +
      card('Safety message (ICS 208)', U.area(inc, p + '.safetyMsg', null, { h: 110, ph: 'Safety message for this operational period.' }) + '<div class="row" style="margin-top:8px">' + U.chk(inc, p + '.sspRequired', 'Site safety plan required') + '<div class="grow">' + U.text(inc, p + '.sspLocation', null, { ph: 'Approved site safety plan(s) located at…' }) + '</div></div>') +
      '</div><div class="grid" style="align-content:start">' +
      card('6. IAP contents', '<div class="grid" style="gap:6px">' + [['203', 'ICS 203 Organization list'], ['204', 'ICS 204 Assignment lists'], ['205', 'ICS 205 Radio plan'], ['205A', 'ICS 205A Communications list'], ['206', 'ICS 206 Medical plan'], ['207', 'ICS 207 Org chart'], ['208', 'ICS 208 Safety message'], ['map', 'Map/chart'], ['weather', 'Weather forecast']].map(function (x) { return U.chk(inc, p + '.iapItems.' + x[0], x[1]); }).join('') + '</div><div style="height:8px"></div>' + U.text(inc, p + '.otherAttachments', 'Other attachments') +
        '<div class="row" style="margin-top:10px"><button class="btn pri sm" data-act="iap" data-a="' + op.id + '">' + I('print') + 'Build IAP</button></div>') +
      card('Planning cycle', meet + '<div class="row" style="margin-top:8px"><button class="btn xs ghost" data-act="planningP" data-a="' + op.id + '">Fill standard Planning P times</button></div>') +
      '</div></div></div>';
  };
  function starterObjs(inc) {
    var base = ['Provide for the safety of responders and the public', 'Maintain situational awareness and a common operating picture', 'Keep the public informed with timely, accurate information'];
    var t = {
      'Winter Storm': ['Keep primary and secondary roads passable', 'Open warming centers as needed', 'Complete welfare checks on vulnerable residents'],
      'Flooding': ['Close and barricade flooded low-water crossings', 'Complete evacuation of affected areas', 'Rescue persons trapped by flood water'],
      'Severe Thunderstorm': ['Clear trees and debris from primary roads', 'Restore power to critical facilities', 'Complete initial damage assessment within 72 hours'],
      'Tornado': ['Complete search and rescue of the impact area', 'Secure the damage area', 'Complete initial damage assessment within 72 hours'],
      'Wildfire': ['Protect structures in the threatened area', 'Hold the fire within the established control lines', 'Evacuate threatened residents'],
      'Chemical': ['Isolate the hazard area and deny entry', 'Protect the public through evacuation or shelter in place', 'Identify the product and control the release']
    };
    return (t[inc.type] || []).concat(base);
  }

  // ================= ORGANIZATION =================
  V.org = function (inc) {
    var rows = A(inc.org).slice().sort(function (a, b) { return CP.POSITIONS.findIndex(function (p) { return p.k === a.pos; }) - CP.POSITIONS.findIndex(function (p) { return p.k === b.pos; }); });
    var posOpts = CP.POSITIONS.map(function (p) { return { v: p.k, label: p.s + ' — ' + p.t }; });
    var add = '<div class="grid g6" style="align-items:end"><label class="f span2"><span>Position</span><select class="in" id="op_pos">' + CP.SECTIONS.map(function (s) { return '<optgroup label="' + s + '">' + CP.POSITIONS.filter(function (p) { return p.s === s; }).map(function (p) { return '<option value="' + p.k + '">' + p.t + '</option>'; }).join('') + '</optgroup>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Label <i class="dim" style="text-transform:none;letter-spacing:0">Div A, Branch II…</i></span><input class="in" id="op_label"></label><label class="f"><span>Name</span><input class="in" id="op_name"></label><label class="f"><span>Agency</span><input class="in" id="op_agency" list="dl_agency"></label><label class="f"><span>Phone / radio</span><input class="in" id="op_phone"></label></div>' +
      '<div class="row" style="margin-top:10px"><button class="btn pri sm" data-act="orgAdd">' + I('plus') + 'Add to organization</button><span class="dim" style="font-size:12px">Or start from a template:</span><button class="btn xs ghost" data-act="orgTpl" data-a="cmd">Command staff</button><button class="btn xs ghost" data-act="orgTpl" data-a="gen">General staff</button><button class="btn xs ghost" data-act="orgTpl" data-a="t3">Full Type 3 org</button></div>';
    var t = U.table({ key: 'org', rows: rows, cols: [{ f: 'pos', l: 'Position', t: 'sel', o: posOpts, w: '230px', rr: 1, blank: false }, { f: 'label', l: 'Label', w: '110px' }, { f: 'name', l: 'Name' }, { f: 'agency', l: 'Agency', list: 'dl_agency' }, { f: 'phone', l: 'Phone' }, { f: 'radio', l: 'Radio' }, { f: 'email', l: 'Email' }, { f: 'checkin', l: 'Checked in', t: 'dt', w: '200px' }], empty: 'No one in the organization yet. Start with the Incident Commander.' });
    return '<div class="wrap">' + phead('Organization', 'Feeds ICS 201 (block 9), 203, 205A and 207, and the Prepared by / Approved by lines on every form.', prevBtn('203') + prevBtn('207') + prevBtn('205A')) +
      card('Add a person', add) + '<div style="height:14px"></div>' + t + '<div style="height:14px"></div>' + card('Organization chart', orgChartHtml(inc)) + '</div>';
  };
  function orgChartHtml(inc) {
    function box(k, label) { var ps = A(inc.org).filter(function (p) { return p.pos === k && (!label || p.label === label); }); if (!ps.length) return '<div class="obox vac"><div class="p">' + E(CP.POS[k].t) + '</div><div class="n">vacant</div></div>'; return ps.map(function (p) { return '<div class="obox"><div class="p">' + E(CP.POS[k].t) + (p.label ? ' · ' + E(p.label) : '') + '</div><div class="n">' + E(p.name || '—') + '</div><div class="a">' + E(p.agency || '') + '</div></div>'; }).join(''); }
    function subs(keys) { var h = ''; keys.forEach(function (k) { A(inc.org).filter(function (p) { return p.pos === k; }).forEach(function (p) { h += '<div class="obox"><div class="p">' + E(CP.POS[k].t) + (p.label ? ' · ' + E(p.label) : '') + '</div><div class="n">' + E(p.name || '—') + '</div></div>'; }); }); return h ? '<div class="subs">' + h + '</div>' : ''; }
    var sec = function (chief, keys) { return '<div class="ocol">' + box(chief) + subs(keys) + '</div>'; };
    return '<div class="orgc"><div class="lvl">' + box('IC') + '</div><div class="lvl">' + box('SOFR') + box('PIO') + box('LOFR') + '</div><div class="lvl" style="align-items:flex-start">' +
      sec('OSC', ['DOSC', 'STAM', 'OPBD', 'DIVS', 'AOBD', 'TFLD']) + sec('PSC', ['DPSC', 'RESL', 'SITL', 'DOCL', 'DMOB', 'THSP']) + sec('LSC', ['DLSC', 'SUBD', 'SPUL', 'FACL', 'GSUL', 'SVBD', 'COML', 'MEDL', 'FDUL']) + sec('FSC', ['DFSC', 'TIME', 'PROC', 'COMP', 'COST']) + '</div></div>';
  }

  // ================= RESOURCES (211 / 221) =================
  V.resources = function (inc) {
    var f = CP.app.ui.resFilter || 'Active';
    var all = A(inc.resources);
    var groups = { All: all, Active: all.filter(resActive), Staged: all.filter(function (r) { return r.status === 'Staged' || r.status === 'Checked In'; }), Assigned: all.filter(function (r) { return r.status === 'Assigned'; }), 'Ordered/En Route': all.filter(function (r) { return r.status === 'Ordered' || r.status === 'En Route'; }), 'Out of Service': all.filter(function (r) { return r.status === 'Out of Service'; }), Released: all.filter(function (r) { return r.status === 'Released' || r.status === 'Demobilized'; }) };
    var list = groups[f] || all;
    var counts = CP.RES_STATUS.map(function (s) { var n = all.filter(function (r) { return r.status === s.v; }).length; return n ? '<span class="chip ' + s.c + '">' + s.v + ' ' + n + '</span>' : ''; }).join('');
    var ci = '<div class="grid g6" style="align-items:end">' +
      '<label class="f"><span>Kind</span><input class="in" id="r_kind" list="dl_kinds" placeholder="Engine, Dozer…"></label><label class="f"><span>Type</span><input class="in" id="r_type" placeholder="1–5"></label>' +
      '<label class="f"><span>Identifier *</span><input class="in" id="r_name" placeholder="Engine 1, BCSO 214…"></label><label class="f"><span>Agency</span><input class="in" id="r_agency" list="dl_agency"></label>' +
      '<label class="f"><span>Leader</span><input class="in" id="r_leader"></label><label class="f"><span># Personnel</span><input class="in" id="r_persons" type="number" min="0"></label>' +
      '<label class="f"><span>Contact</span><input class="in" id="r_contact" placeholder="Cell / radio"></label><label class="f"><span>Order #</span><input class="in" id="r_order"></label>' +
      '<label class="f"><span>Check-in at</span><select class="in" id="r_loc">' + CP.CHECKIN_LOCS.map(function (l) { return '<option>' + l + '</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Status</span><select class="in" id="r_status"><option>Checked In</option><option>Staged</option><option>Assigned</option><option>En Route</option><option>Ordered</option></select></label>' +
      '<label class="f"><span>Assignment</span><select class="in" id="r_assign"><option value=""></option>' + assignOpts(inc).map(function (o) { return '<option value="' + o.v + '">' + E(o.label) + '</option>'; }).join('') + '</select></label>' +
      '<div><button class="btn pri" style="width:100%" data-act="checkin">' + I('check') + 'Check in</button></div></div>';
    var tbl = U.table({ key: 'resources', rows: list, rr: false, cols: [
      { f: 'name', l: 'Identifier', w: '150px' }, { f: 'kind', l: 'Kind', list: 'dl_kinds', w: '170px' }, { f: 'type', l: 'Type', w: '80px' }, { f: 'agency', l: 'Agency', list: 'dl_agency', w: '210px' }, { f: 'leader', l: 'Leader', w: '140px' }, { f: 'persons', l: '#', t: 'num', w: '80px' },
      { f: 'status', l: 'Status', t: 'sel', o: CP.RES_STATUS.map(function (s) { return s.v; }), rr: 1, blank: false, w: '160px' }, { f: 'assign', l: 'Assignment', t: 'sel', o: function () { return assignOpts(inc); }, rr: 1, w: '170px' },
      { f: 'location', l: 'Location', w: '130px' }, { f: 'checkin', l: 'Checked in', t: 'dt', w: '210px' }, { f: 'contact', l: 'Contact', w: '150px' }],
      extra: function (r) { return '<button class="btn xs ghost" data-act="demob" data-a="' + r.id + '" title="Demobilize (ICS 221)">' + I('demob') + '</button>'; }, empty: 'No resources in this view.' });
    return '<div class="wrap">' + phead('Resources', 'Check-in (ICS 211), status, assignments and demobilization (ICS 221). Feeds 201, 204, 209 and 215.', prevBtn('211') + prevBtn('221') + '<button class="btn sm" data-act="csv" data-a="resources">' + I('down') + 'CSV</button>') +
      card('Check in a resource', ci) + '<div class="row" style="margin:14px 0 10px"><div class="seg">' + Object.keys(groups).map(function (k) { return '<button class="' + (k === f ? 'on' : '') + '" data-act="resFilter" data-a="' + k + '">' + k + ' <span class="mono" style="opacity:.7">' + groups[k].length + '</span></button>'; }).join('') + '</div><div class="row" style="gap:6px">' + counts + '</div></div>' + tbl + '</div>';
  };

  // ================= ASSIGNMENTS (204 / 215) =================
  V.assign = function (inc) {
    var list = A(inc.assignments);
    var divSups = A(inc.org).filter(function (p) { return p.pos === 'DIVS'; });
    var html = list.map(function (a) {
      var p = 'assignments@' + a.id, res = A(inc.resources).filter(function (r) { return r.assign === a.id && ['Released', 'Demobilized'].indexOf(r.status) < 0; });
      var avail = A(inc.resources).filter(function (r) { return !r.assign && ['Checked In', 'Staged', 'Assigned'].indexOf(r.status) >= 0; });
      var name = CP.forms.assignName(inc, a.id) || 'New assignment';
      var sup = divSups.find(function (s) { return s.label && (s.label === a.division || s.label === a.group); });
      var needs = U.table({ key: p + '.needs', rows: a.needs || [], cols: [{ f: 'kind', l: 'Resource kind', list: 'dl_kinds' }, { f: 'req', l: 'Required', t: 'num', w: '90px', rr: 1 }, { f: 'have', l: 'Have', t: 'ro', fmt: function (n) { return '<b>' + res.filter(function (r) { return r.kind === n.kind; }).length + '</b>'; } }, { f: 'need', l: 'Need', t: 'ro', fmt: function (n) { var h = res.filter(function (r) { return r.kind === n.kind; }).length, x = Math.max(0, (+n.req || 0) - h); return x ? '<b style="color:#ff8d92">' + x + '</b>' : '<span style="color:#6ee0a1">0</span>'; } }], add: 'Add need', tpl: 'need', empty: 'Add the resources this assignment needs (ICS 215).' });
      return '<div class="card" style="border-left:4px solid var(--blue)"><h3>' + E(name) + (sup ? ' <small>· ' + E(sup.name) + '</small>' : '') + '<span class="x row" style="gap:6px">' + prevBtn('204', 'ICS 204', { only: a.id }) + '<button class="ibtn del" data-del="assignments|' + a.id + '" title="Remove">' + I('trash') + '</button></span></h3>' +
        '<div class="grid g4">' + U.text(inc, p + '.branch', 'Branch', { rr: 1 }) + U.text(inc, p + '.division', 'Division', { rr: 1, ph: 'A, B, North…' }) + U.text(inc, p + '.group', 'Group', { rr: 1, ph: 'Rescue, Debris…' }) + U.text(inc, p + '.staging', 'Staging area') +
        U.text(inc, p + '.reportTo', 'Reporting location') + U.dt(inc, p + '.arrival', 'Requested arrival') + U.text(inc, p + '.overhead', 'Overhead position(s)') + U.text(inc, p + '.equipment', 'Special equipment & supplies') + '</div>' +
        '<div class="grid g2" style="margin-top:10px">' + U.area(inc, p + '.work', '6. Work assignments', { h: 90 }) + U.area(inc, p + '.special', '7. Special instructions', { h: 90 }) + '</div>' +
        '<div class="grid g2" style="margin-top:10px"><div><div class="flab">5. Resources assigned (' + res.length + ')</div>' + (res.length ? '<div class="row" style="gap:6px">' + res.map(function (r) { return '<span class="chip ok">' + E(r.name) + ' <button class="ibtn" style="width:18px;height:18px" title="Unassign" data-act="unassign" data-a="' + r.id + '">' + I('x') + '</button></span>'; }).join('') + '</div>' : '<div class="dim" style="font-size:13px">None yet.</div>') +
        (avail.length ? '<div class="row" style="margin-top:8px"><select class="in" style="max-width:260px" id="as_' + a.id + '">' + avail.map(function (r) { return '<option value="' + r.id + '">' + E(r.name + (r.kind ? ' · ' + r.kind : '') + ' (' + r.status + ')') + '</option>'; }).join('') + '</select><button class="btn sm" data-act="assignRes" data-a="' + a.id + '">Assign</button></div>' : '') + '</div><div><div class="flab">ICS 215 needs</div>' + needs + '</div></div></div>';
    }).join('<div style="height:12px"></div>');
    return '<div class="wrap">' + phead('Assignments', 'Divisions, groups and staging areas. Each one prints as an ICS 204; resource needs roll up into the ICS 215 worksheet.', prevBtn('204', 'All ICS 204s') + prevBtn('215') + '<button class="btn pri sm" data-add="assignments" data-tpl="assignment">' + I('plus') + 'Add assignment</button>') +
      (list.length ? html : '<div class="empty">No assignments yet. Add one for each division, group or staging area.<div style="margin-top:10px"><button class="btn pri" data-add="assignments" data-tpl="assignment">' + I('plus') + 'Add assignment</button></div></div>') + '</div>';
  };

  // ================= COMMS (205 / 205A) =================
  V.comms = function (inc) {
    return '<div class="wrap">' + phead('Communications', 'Radio plan (ICS 205) and contact list (ICS 205A). Everyone in the organization with a phone or radio is added to the 205A automatically.', prevBtn('205') + prevBtn('205A')) +
      card('4. Basic radio channel use', U.table({ key: 'comms', rows: inc.comms, cols: [{ f: 'zone', l: 'Zone/Grp', w: '80px' }, { f: 'ch', l: 'Ch #', w: '60px' }, { f: 'fn', l: 'Function', t: 'sel', o: ['Command', 'Tactical', 'Support', 'Air-to-Ground', 'Air-to-Air', 'Dispatch', 'Medical', 'Logistics', 'Interop', 'Other'] }, { f: 'name', l: 'Channel name / talkgroup' }, { f: 'assign', l: 'Assignment' }, { f: 'rx', l: 'RX freq', w: '100px' }, { f: 'rxTone', l: 'RX tone', w: '80px' }, { f: 'tx', l: 'TX freq', w: '100px' }, { f: 'txTone', l: 'TX tone', w: '80px' }, { f: 'mode', l: 'Mode', t: 'sel', o: ['A', 'D', 'M'], w: '70px' }, { f: 'remarks', l: 'Remarks' }], add: 'Add channel', tpl: 'channel' }) +
        '<div style="height:10px"></div>' + U.area(inc, 'commsNotes', '5. Special instructions', { h: 70, ph: 'Cell phone backup, interop patches, amateur radio net…' })) +
      '<div style="height:14px"></div>' + card('Additional contacts for ICS 205A', U.table({ key: 'contacts', rows: inc.contacts, cols: [{ f: 'pos', l: 'Incident assigned position / organization' }, { f: 'name', l: 'Name' }, { f: 'how', l: 'Method(s) of contact' }], add: 'Add contact', tpl: 'contact', empty: 'Utilities, VDOT, Red Cross, school division, hospital… anyone not in the ICS organization.' })) + '</div>';
  };

  // ================= MEDICAL (206) =================
  V.medical = function (inc) {
    return '<div class="wrap">' + phead('Medical Plan', 'ICS 206. Area hospitals and county EMS are filled in for you; adjust for the incident.', prevBtn('206')) +
      '<div class="grid">' + card('3. Medical aid stations', U.table({ key: 'medical.aid', rows: inc.medical.aid, cols: [{ f: 'name', l: 'Name' }, { f: 'location', l: 'Location' }, { f: 'contact', l: 'Contact / frequency' }, { f: 'medic', l: 'Paramedics on site?', t: 'sel', o: ['Yes', 'No'], w: '140px' }], add: 'Add aid station', tpl: 'aid' })) +
      card('4. Transportation', U.table({ key: 'medical.transport', rows: inc.medical.transport, cols: [{ f: 'name', l: 'Ambulance service' }, { f: 'air', l: 'Air/Ground', t: 'sel', o: ['Ground', 'Air'], w: '120px' }, { f: 'location', l: 'Location' }, { f: 'contact', l: 'Contact / frequency' }, { f: 'level', l: 'Level', t: 'sel', o: ['ALS', 'BLS'], w: '100px' }], add: 'Add transport', tpl: 'transport' })) +
      card('5. Hospitals', U.table({ key: 'medical.hospitals', rows: inc.medical.hospitals, cols: [{ f: 'name', l: 'Hospital' }, { f: 'address', l: 'Address / lat-long if helipad' }, { f: 'contact', l: 'Contact' }, { f: 'air', l: 'Air min', w: '80px' }, { f: 'ground', l: 'Ground min', w: '90px' }, { f: 'trauma', l: 'Trauma center', t: 'sel', o: ['No', 'Level I', 'Level II', 'Level III', 'Level IV'], w: '130px' }, { f: 'burn', l: 'Burn', t: 'sel', o: ['Yes', 'No'], w: '80px' }, { f: 'helipad', l: 'Helipad', t: 'sel', o: ['Yes', 'No'], w: '90px' }], add: 'Add hospital', tpl: 'hospital' })) +
      card('6. Special medical emergency procedures', U.area(inc, 'medical.procedures', null, { h: 110, ph: 'How to report a responder injury, who to call, rehab location, MCI procedures…' }) + '<div style="margin-top:8px">' + U.chk(inc, 'medical.aviation', 'Aviation assets are used for rescue (coordinate with Air Operations)') + '</div>') + '</div></div>';
  };

  // ================= SAFETY (215A / 208) =================
  V.safety = function (inc) {
    var op = CP.curOP(inc), p = 'opPeriods@' + op.id;
    var common = { 'Winter Storm': ['Ice on roads and walking surfaces', 'Cold stress / hypothermia', 'Carbon monoxide from generators', 'Downed power lines'], 'Flooding': ['Swift water', 'Contaminated flood water', 'Undermined roads and bridges', 'Downed power lines'], 'Severe Thunderstorm': ['Downed power lines', 'Chainsaw operations', 'Hanging limbs / widowmakers', 'Lightning'], 'Tornado': ['Unstable structures', 'Downed power lines', 'Gas leaks', 'Sharp debris / nails'], 'Wildfire': ['Fire behavior and escape routes (LCES)', 'Smoke / reduced visibility', 'Heat stress', 'Rolling material on slopes'] };
    var sugg = (common[inc.type] || []).concat(['Traffic on scene', 'Fatigue / long operating periods', 'Heat or cold stress']);
    return '<div class="wrap">' + phead('Safety', 'Hazard analysis (ICS 215A) and the safety message (ICS 208) for OP ' + op.n + '.', prevBtn('215A') + prevBtn('208')) +
      card('Hazards and mitigations', U.table({ key: 'hazards', rows: inc.hazards, cols: [{ f: 'area', l: '5. Incident area', w: '200px' }, { f: 'hazard', l: '6. Hazards / risks', t: 'area' }, { f: 'mitigation', l: '7. Mitigations', t: 'area' }], add: 'Add hazard', tpl: 'hazard', empty: 'List hazards by area with mitigations.' }) +
        '<div class="row" style="margin-top:8px;gap:6px"><span class="dim" style="font-size:12px">Common for ' + E(inc.type) + ':</span>' + sugg.map(function (s) { return '<button class="btn xs ghost" data-act="addHaz" data-t="' + E(s) + '">+ ' + E(s) + '</button>'; }).join('') + '</div>') +
      '<div style="height:14px"></div>' + card('Safety message · OP ' + op.n + ' (ICS 208)', U.area(inc, p + '.safetyMsg', null, { h: 140 }) + '<div class="row" style="margin-top:8px">' + U.chk(inc, p + '.sspRequired', 'Site safety plan required') + '<div class="grow">' + U.text(inc, p + '.sspLocation', null, { ph: 'Approved site safety plan(s) located at…' }) + '</div><button class="btn sm" data-act="safetyFromHaz">Build message from hazards</button></div>') + '</div>';
  };

  // ================= FACILITIES =================
  V.facilities = function (inc) {
    return '<div class="wrap">' + phead('Facilities', 'Command post, staging, base, shelters and PODs. Facilities with a map location are published to the county Incident Facilities layer.', '<button class="btn pri sm" data-add="facilities" data-tpl="facility">' + I('plus') + 'Add facility</button>') +
      '<div class="grid g3"><div class="span2">' + U.table({ key: 'facilities', rows: inc.facilities, cols: [{ f: 'type', l: 'Type', t: 'sel', o: CP.FAC_TYPES_X, rr: 1, w: '180px', blank: false }, { f: 'name', l: 'Name', rr: 1 }, { f: 'address', l: 'Address' }, { f: 'status', l: 'Status', t: 'sel', o: ['Open', 'Closed', 'Standby'], w: '110px', blank: false }, { f: 'poc', l: 'Contact person' }, { f: 'phone', l: 'Phone', w: '130px' }, { f: 'loc', l: 'Map', t: 'ro', fmt: function (f) { return f.lat ? '<span class="chip ok">set</span>' : '<span class="chip warn">none</span>'; } }],
        extra: function (f) { return '<button class="btn xs" data-act="pickFac" data-a="' + f.id + '">' + I('pin') + 'Place</button>'; }, empty: 'No facilities yet. Add the Incident Command Post first.' }) + '</div><div class="card" style="padding:8px"><div class="map" id="facmap" style="height:420px"></div></div></div></div>';
  };
  AFTER.facilities = function (inc) { CP.app.miniMap('facmap', inc); };

  // ================= ACTIVITY LOG (214) =================
  V.log = function (inc) {
    var f = CP.app.ui.logFilter || {}, all = A(inc.log).slice().sort(function (a, b) { return (b.ts || '').localeCompare(a.ts || ''); });
    var authors = []; all.forEach(function (l) { if (l.author && authors.indexOf(l.author) < 0) authors.push(l.author); });
    var list = all.filter(function (l) { return (!f.cat || l.cat === f.cat) && (!f.author || l.author === f.author) && (!f.q || (l.text || '').toLowerCase().indexOf(f.q.toLowerCase()) >= 0); });
    var qlog = '<div class="qlog"><select class="in" id="qcat">' + CP.LOG_CATS.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select><input class="in" id="qtext" placeholder="Log something… (Enter to save)"><input class="in" id="qtime" type="datetime-local" style="max-width:210px;color-scheme:dark" title="Leave blank for now"><button class="btn pri sm" data-act="qlog">' + I('plus') + 'Log</button></div>';
    var filt = '<div class="row" style="margin:12px 0"><select class="in" style="max-width:180px" data-act-change="logFilter" data-k="cat"><option value="">All categories</option>' + CP.LOG_CATS.map(function (c) { return '<option' + (f.cat === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select><select class="in" style="max-width:220px" data-act-change="logFilter" data-k="author"><option value="">Everyone</option>' + authors.map(function (a) { return '<option' + (f.author === a ? ' selected' : '') + '>' + E(a) + '</option>'; }).join('') + '</select><input class="in" style="max-width:260px" placeholder="Search" value="' + E(f.q || '') + '" data-act-change="logFilter" data-k="q"><span class="dim">' + list.length + ' entries</span></div>';
    var t = U.table({ key: 'log', rows: list, cols: [{ f: 'ts', l: 'Date/time', t: 'dt', w: '200px' }, { f: 'cat', l: 'Category', t: 'sel', o: CP.LOG_CATS, w: '140px', blank: false }, { f: 'text', l: 'Notable activity', t: 'area' }, { f: 'author', l: 'By', w: '160px' }, { f: 'pos', l: 'Position', w: '170px' }], empty: 'No entries match.' });
    return '<div class="wrap">' + phead('Activity Log', 'The running record of the incident (ICS 214). Check-ins, status changes, transfers of command and releases are logged automatically.', prevBtn('214', 'ICS 214 (all)') + (f.author ? prevBtn('214', 'ICS 214 for ' + f.author, { author: f.author }) : '') + '<button class="btn sm" data-act="csv" data-a="log">' + I('down') + 'CSV</button>') + qlog + filt + t + '</div>';
  };

  // ================= MESSAGES & REQUESTS (213 / 213RR) =================
  V.messages = function (inc) {
    var tab = CP.app.ui.msgTab || 'req';
    var reqs = A(inc.requests).slice().reverse(), msgs = A(inc.messages).slice().reverse();
    var body;
    if (tab === 'req') {
      body = (reqs.length ? '<div class="tbl-wrap"><table class="t ro"><thead><tr><th>#</th><th>Requested</th><th>Items</th><th>Priority</th><th>Requested by</th><th>Deliver to</th><th>Status</th><th></th></tr></thead><tbody>' + reqs.map(function (q) {
        return '<tr><td class="mono">' + E(q.number) + '</td><td>' + CP.fmtDT(q.ts) + '</td><td>' + E(A(q.items).map(function (i) { return (i.qty || '') + ' × ' + (i.kind || i.desc || ''); }).join('; ')) + '</td><td>' + (q.priority === 'Urgent' ? '<span class="chip red">Urgent</span>' : E(q.priority)) + '</td><td>' + E(q.requestor) + '</td><td>' + E(q.deliverTo) + '</td><td>' + U.chipFor([{ v: 'Draft', c: 'mute' }, { v: 'Submitted', c: 'blue' }, { v: 'Approved', c: 'gold' }, { v: 'Ordered', c: 'warn' }, { v: 'Filled', c: 'ok' }, { v: 'Cancelled', c: 'mute' }], q.status) + '</td><td class="act"><button class="btn xs" data-act="editReq" data-a="' + q.id + '">Open</button> ' + prevBtn('213RR', '213RR', { only: q.id }).replace('btn sm', 'btn xs') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="empty">No resource requests.</div>');
    } else {
      body = (msgs.length ? '<div class="tbl-wrap"><table class="t ro"><thead><tr><th>Date/time</th><th>To</th><th>From</th><th>Subject</th><th>Reply</th><th></th></tr></thead><tbody>' + msgs.map(function (m) {
        return '<tr><td>' + CP.fmtDT(m.ts) + '</td><td>' + E(m.to) + '</td><td>' + E(m.from) + '</td><td>' + E(m.subject) + '</td><td>' + (m.reply ? '<span class="chip ok">Replied</span>' : '<span class="chip mute">—</span>') + '</td><td class="act"><button class="btn xs" data-act="editMsg" data-a="' + m.id + '">Open</button> ' + prevBtn('213', '213', { only: m.id }).replace('btn sm', 'btn xs') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="empty">No general messages.</div>');
    }
    return '<div class="wrap">' + phead('Requests &amp; Messages', 'Resource requests (ICS 213RR) and general messages (ICS 213). Filled requests can be added to Resources as ordered.', '<button class="btn pri sm" data-act="editReq">' + I('plus') + 'New resource request</button><button class="btn sm" data-act="editMsg">' + I('plus') + 'New message</button>') +
      '<div class="tabs"><button class="' + (tab === 'req' ? 'on' : '') + '" data-act="msgTab" data-a="req">Resource requests (' + reqs.length + ')</button><button class="' + (tab === 'msg' ? 'on' : '') + '" data-act="msgTab" data-a="msg">General messages (' + msgs.length + ')</button></div>' + body + '</div>';
  };

  // ================= PUBLIC INFO =================
  V.public = function (inc) {
    var rel = A(inc.publicInfo.releases).slice().reverse();
    return '<div class="wrap">' + phead('Public Information', 'Messages for the public. Releasing a message logs it and, when signed in, posts it to the county Public Message layer that feeds the public Incident Status dashboard and EM website.', '') +
      '<div class="grid g3"><div class="span2 grid" style="align-content:start">' + card('Current public message', '<div class="grid">' + U.text(inc, 'publicInfo.shortMessage', 'Short message (255 characters)', { ph: 'e.g. Route 220 closed between Eagle Rock and Iron Gate. Use Route 43.' }) + U.area(inc, 'publicInfo.longMessage', 'Full message', { h: 120 }) +
        '<div class="grid g2">' + U.text(inc, 'publicInfo.url', 'More information link') + U.text(inc, 'publicInfo.actionMessage', 'Action message (50 characters)', { ph: 'e.g. Avoid the area' }) + '</div>' + U.chk(inc, 'publicInfo.actionRequired', 'Residents need to take action') + U.chk(inc, 'publicView', 'Show the incident location on public maps', { rr: 1 }) +
        '<div class="row"><button class="btn pri" data-act="release">' + I('news') + 'Release message</button><span class="dim" style="font-size:12px">' + (CP.arc.signedIn() ? 'Posts to ArcGIS and logs the release.' : 'Logs the release. Sign in to post it to ArcGIS.') + '</span></div></div>') + '</div>' +
      '<div>' + card('Release history', rel.length ? '<ul class="tl">' + rel.map(function (r) { return '<li><div class="tm">' + CP.fmtTime(r.ts) + '</div><div>' + E(r.text) + '<div class="who">' + E(r.by || '') + (r.posted ? ' · posted to ArcGIS' : '') + '</div></div></li>'; }).join('') + '</ul>' : '<div class="empty">No releases yet.</div>') + '</div></div></div>';
  };

  // ================= LIFELINES =================
  V.lifelines = function (inc) {
    return '<div class="wrap">' + phead('Community Lifelines', 'FEMA lifeline status using the same values as the county Lifeline Status table, so the EOC dashboards stay in step.', '<button class="btn pri sm" data-act="push" data-a="lifelines">' + I('cloud') + 'Publish to ArcGIS</button>') +
      '<div class="grid g2">' + CP.LIFELINES.map(function (l) {
        var x = inc.lifelines[l.key] || {}, c = U.llClass(x.status), s = CP.LIFELINE_STATUS.find(function (q) { return q.v === x.status; });
        return '<div class="card" style="border-left:5px solid var(--' + ({ ok: 'ok', warn: 'warn', bad: 'bad', unk: 'unk' }[c]) + ')"><h3>' + E(l.name) + '<span class="x"><span class="chip ' + c + '">' + E(s ? s.eop : 'Unknown') + '</span></span></h3><div class="grid" style="grid-template-columns:200px 1fr;gap:10px">' +
          U.sel(inc, 'lifelines.' + l.key + '.status', 'Status', CP.LIFELINE_STATUS.map(function (q) { return q.v; }), { rr: 1 }) + U.area(inc, 'lifelines.' + l.key + '.desc', 'Impacts and expected actions', { h: 60 }) + '</div></div>';
      }).join('') + '</div><div style="height:14px"></div>' + card('Overall summary', U.area(inc, 'lifelineSummary', null, { h: 70, ph: 'One or two sentences for the Lifeline Status description.' })) + '</div>';
  };

  // ================= STATUS: SITREP + 209 =================
  V.status = function (inc) {
    var tab = CP.app.ui.statusTab || 'sitrep';
    var tabs = '<div class="tabs"><button class="' + (tab === 'sitrep' ? 'on' : '') + '" data-act="statusTab" data-a="sitrep">County SitRep</button><button class="' + (tab === '209' ? 'on' : '') + '" data-act="statusTab" data-a="209">ICS 209 Status Summary</button><button class="' + (tab === 'eoc' ? 'on' : '') + '" data-act="statusTab" data-a="eoc">EOC status board</button></div>';
    var body = tab === '209' ? s209(inc) : tab === 'eoc' ? eocBoard(inc) : sitrep(inc);
    return '<div class="wrap">' + phead('Status Reporting', 'SitReps to the county SitRep layer and the ICS 209 for VDEM. Shelter, damage and road numbers come from the live ArcGIS layers.', prevBtn('209') + (tab === '209' ? '<button class="btn sm" data-act="fill209">' + I('refresh') + 'Fill from live data</button>' : '')) + tabs + body + '</div>';
  };
  function eocBoard(inc) {
    return card('Status board', '<div class="grid g2">' + U.sel(inc, 'eoc.eoc_status', 'EOC', CP.EOC_STATUS) + U.sel(inc, 'eoc.declaration_status', 'Declaration', CP.DECLARATION) + U.sel(inc, 'eoc.shelter_status', 'Shelters', CP.SHELTER_STATUS) + U.sel(inc, 'eoc.gov_offices_status', 'County offices', CP.OFFICE_STATUS) + U.sel(inc, 'eoc.schools_status', 'Schools', CP.SCHOOL_STATUS) + U.sel(inc, 'eoc.weather_status', 'Weather', CP.WEATHER_STATUS) + U.sel(inc, 'eoc.fire_academy_status', 'Fire academy', CP.ACADEMY_STATUS) + '</div><div class="dim" style="font-size:12px;margin-top:8px">These go on every SitRep, using the same choices as the SitRep survey.</div>');
  }
  function sitrep(inc) {
    var d = CP.app.ui.sr || (CP.app.ui.sr = CP.app.newSitrep(inc));
    var lv = CP.arc.live || {};
    function t(k, l, o) { return '<label class="f' + (o && o.cls ? ' ' + o.cls : '') + '"><span>' + l + '</span>' + (o && o.area ? '<textarea class="in" data-sr="' + k + '" style="min-height:' + (o.h || 70) + 'px">' + E(d[k]) + '</textarea>' : '<input class="in" data-sr="' + k + '" value="' + E(d[k]) + '"' + (o && o.type ? ' type="' + o.type + '"' : '') + '>') + '</label>'; }
    var st = '<div class="grid g6">' + ['st1', 'st2', 'st3', 'st4', 'st5', 'st7'].map(function (s) { return '<div><div class="flab">Station ' + s.slice(2) + '</div><input class="in" placeholder="EMS" data-sr="stations.' + s + '_ems" value="' + E((d.stations || {})[s + '_ems']) + '" style="margin-bottom:4px"><input class="in" placeholder="Fire" data-sr="stations.' + s + '_fire" value="' + E((d.stations || {})[s + '_fire']) + '"></div>'; }).join('') + '</div>';
    var hist = A(inc.sitreps).slice().reverse();
    return '<div class="grid g3"><div class="span2 grid" style="align-content:start">' +
      card('SitRep ' + E(d.number), '<div class="grid g3">' + t('number', 'SitRep number') + t('preparedBy', 'Prepared by') + '<label class="f"><span>Next report due</span><input class="in" type="datetime-local" data-sr="nextDue" data-t="dt" value="' + CP.localInput(d.nextDue) + '"></label></div>' +
        '<div class="grid" style="margin-top:10px">' + t('changes', 'Changes since last report', { area: 1, h: 90 }) + '<div class="grid g2">' + t('weather', 'Weather conditions', { area: 1 }) + t('roads', 'Road conditions', { area: 1 }) + '</div>' + t('fireEms', 'Fire/EMS augmentation', { area: 1, h: 50 }) + '</div>') +
      card('Power outages', '<div class="grid g3">' + t('aep_outages', 'AEP outages', { type: 'number' }) + t('cb_outages', 'Craig-Botetourt Electric outages', { type: 'number' }) + t('dominion_outages', 'Dominion outages', { type: 'number' }) + t('aep_customers', 'AEP customers', { type: 'number' }) + t('cb_customers', 'CBEC customers', { type: 'number' }) + t('dominion_customers', 'Dominion customers', { type: 'number' }) + '</div>') +
      card('Station staffing', st) + '</div><div class="grid" style="align-content:start">' + eocBoard(inc) +
      card('Pulled in automatically', '<div class="feed"><div class="v">' + (lv.shelterPop != null ? lv.shelterPop : '—') + '</div><div class="l">Shelter population<small>' + E(lv.shelterSummary || '') + '</small></div></div><div class="feed"><div class="v">' + (lv.sheltersOpen != null ? lv.sheltersOpen : '—') + '</div><div class="l">Shelters open</div></div><div class="feed"><div class="v">8</div><div class="l">Lifeline expected actions<small>from the Lifelines page</small></div></div><div class="feed"><div class="v">DA</div><div class="l">Damage assessment<small>carried forward from the latest SitRep</small></div></div>') +
      '<div class="card"><div class="row"><button class="btn pri" data-act="publishSitrep">' + I('report') + 'Publish SitRep</button><button class="btn" data-act="saveSitrep">Save without publishing</button></div><div class="dim" style="font-size:12px;margin-top:8px">' + (CP.arc.signedIn() ? 'Adds a record to the county SitRep layer (EOC Situation Report dashboard).' : 'Sign in to publish to the county SitRep layer.') + '</div></div>' +
      card('History', hist.length ? '<ul class="tl">' + hist.map(function (s) { return '<li><div class="tm">' + CP.fmtTime(s.ts) + '</div><div><b>' + E(s.number) + '</b> ' + (s.posted ? '<span class="chip ok">in ArcGIS</span>' : '<span class="chip mute">local</span>') + '<div class="who">' + E((s.changes || '').slice(0, 120)) + '</div></div></li>'; }).join('') + '</ul>' : '<div class="empty">No SitReps yet.</div>') + '</div></div>';
  }
  function s209(inc) {
    var p = 's209.', s = inc.s209;
    function num(k, l) { return '<input class="in" type="number" data-t="n" data-p="' + p + k + '" value="' + E(CP.getPath(inc, p + k)) + '" placeholder="' + (l || '') + '">'; }
    function pairT(obj, rows) { return '<div class="tbl-wrap"><table class="t"><thead><tr><th></th><th>This period</th><th>Total to date</th></tr></thead><tbody>' + rows.map(function (r) { return '<tr><td>' + r[1] + '</td><td>' + num(obj + '.' + r[0] + '.a') + '</td><td>' + num(obj + '.' + r[0] + '.b') + '</td></tr>'; }).join('') + '</tbody></table></div>'; }
    var TM = ['No Likely Threat', 'Potential Future Threat', 'Mass Notifications in Progress', 'Mass Notifications Completed', 'No Evacuation(s) Imminent', 'Planning for Evacuation', 'Planning for Shelter-in-Place', 'Evacuation(s) in Progress', 'Shelter-in-Place in Progress', 'Repopulation in Progress', 'Mass Immunization in Progress', 'Mass Immunization Complete', 'Quarantine in Progress', 'Area Restriction in Effect'];
    function hz(pre, l) { return card(l, '<div class="grid" style="grid-template-columns:110px 1fr;gap:6px;align-items:center">' + [['12', '12 hours'], ['24', '24 hours'], ['48', '48 hours'], ['72', '72 hours'], ['After', 'After 72 hrs']].map(function (x) { return '<span class="flab" style="margin:0">' + x[1] + '</span>' + U.text(inc, p + pre + x[0], null); }).join('') + '</div>'); }
    return '<div class="grid g2">' +
      card('Report', '<div class="grid g3">' + U.sel(inc, p + 'version', 'Version', ['Initial', 'Update', 'Final']) + U.num(inc, p + 'reportNo', 'Report #') + U.text(inc, p + 'sentTo', 'Sent to') + U.text(inc, p + 'size', 'Current size / area involved') + U.text(inc, p + 'pctComplete', '% contained / completed') + U.text(inc, p + 'definition', 'Incident definition', { ph: inc.type }) + '</div>') +
      card('Summary', U.area(inc, p + 'events', '28. Significant events this period', { h: 90, ph: 'Defaults to the situation summary if blank.' }) + '<div style="height:8px"></div>' + U.area(inc, p + 'hazards', '29. Primary materials or hazards involved', { h: 50 })) +
      card('30. Damage assessment (structures)', '<div class="tbl-wrap"><table class="t"><thead><tr><th></th><th>Threatened (72h)</th><th>Damaged</th><th>Destroyed</th></tr></thead><tbody>' + [['res', 'Single residences'], ['com', 'Nonresidential commercial'], ['minor', 'Other minor structures'], ['other', 'Other']].map(function (r) { return '<tr><td>' + r[1] + '</td><td>' + num('dmg.' + r[0] + '.thr') + '</td><td>' + num('dmg.' + r[0] + '.dmg') + '</td><td>' + num('dmg.' + r[0] + '.des') + '</td></tr>'; }).join('') + '</tbody></table></div>') +
      card('34. Life, safety and health threat management', '<div class="grid g2" style="gap:6px">' + TM.map(function (t) { return U.chk(inc, p + 'threatMgmt.' + t, t); }).join('') + '</div><div style="height:8px"></div>' + U.area(inc, p + 'lshRemarks', '33. Remarks', { h: 50 })) +
      card('31. Public status', pairT('pub', [['fat', 'Fatalities'], ['inj', 'With injuries/illness'], ['trap', 'Trapped / in need of rescue'], ['miss', 'Missing'], ['evac', 'Evacuated'], ['sip', 'Sheltering in place'], ['shel', 'In temporary shelters'], ['tot', 'Total civilians affected']])) +
      card('32. Responder status', pairT('resp', [['fat', 'Fatalities'], ['inj', 'With injuries/illness'], ['trap', 'Trapped / in need of rescue'], ['miss', 'Missing'], ['tot', 'Total responders affected']])) +
      hz('proj', '36. Projected incident activity') + hz('threat', '38. Threat summary and risk') + hz('need', '39. Critical resource needs') +
      card('Outlook', U.area(inc, p + 'weatherConcerns', '35. Weather concerns', { h: 50 }) + U.area(inc, p + 'strategic', '37. Strategic objectives (planned end state)', { h: 60 }) + U.area(inc, p + 'strategicDiscussion', '40. Strategic discussion', { h: 60 }) + U.area(inc, p + 'nextActions', '41. Planned actions for next operational period', { h: 60 })) +
      card('Projections and cost', '<div class="grid g2">' + U.text(inc, p + 'finalSize', '42. Projected final size') + U.text(inc, p + 'completion', '43. Anticipated completion') + U.text(inc, p + 'demobStart', '44. Demobilization start') + U.text(inc, p + 'costToDate', '45. Estimated cost to date') + U.text(inc, p + 'costFinal', '46. Projected final cost') + '</div>' + U.area(inc, p + 'remarks', '47. Remarks', { h: 50 }) + U.area(inc, p + 'cooperating', '52. Cooperating and assisting organizations', { h: 50 })) + '</div>';
  }

  // ================= MAP =================
  V.map = function (inc) {
    var lay = CP.app.ui.layers || (CP.app.ui.layers = { cad: true, storm: true, shelters: true, closures: true, nws: true, units: false, caltopo: false, notices: true });
    var names = { cad: ['CAD calls (active)', '#FDB833'], storm: ['Storm reports (3 days)', '#3D7BFF'], shelters: ['Shelters', '#F0444C'], closures: ['Road closures', '#ff8d92'], nws: ['NWS warnings', '#F28C28'], notices: ['Evacuation notices', '#c77dff'], units: ['CAD units', '#2FBF71'], caltopo: ['CalTopo team', '#7fe3ab'] };
    var tog = Object.keys(names).map(function (k) { return '<label class="chk" style="font-size:13px"><input type="checkbox" data-act-change="layer" data-k="' + k + '"' + (lay[k] ? ' checked' : '') + (CP.arc.signedIn() ? '' : ' disabled') + '><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + names[k][1] + '"></i>' + names[k][0] + '</label>'; }).join('');
    return '<div class="wrap">' + phead('Incident Map', 'Set the incident location and area, place facilities, and see the county layers. Snapshot the map into ICS 201 and the IAP.',
      '<button class="btn sm" data-act="mapPick">' + I('pin') + 'Set incident location</button><button class="btn sm" data-act="mapDraw">' + I('map') + (inc.perimeter ? 'Redraw' : 'Draw') + ' incident area</button>' + (inc.perimeter ? '<button class="btn sm ghost" data-act="mapClearArea">Clear area</button>' : '') + '<button class="btn sm" data-act="mapFac">' + I('flag') + 'Add facility here</button><button class="btn sm pri" data-act="mapSnap">' + I('print') + 'Add map to IAP</button>') +
      '<div id="maphint"></div><div class="map" id="bigmap" style="height:calc(100vh - 330px);min-height:420px"></div><div class="mlegend" style="margin-top:10px">' + (CP.arc.signedIn() ? tog : '<span>Sign in with ArcGIS to add CAD, storm reports, shelters, closures and NWS warnings.</span>') + '</div>' +
      (CP.app.mapImg(inc) ? '<div class="card flat" style="margin-top:12px"><h3>Map attached to IAP<span class="x"><button class="btn xs ghost" data-act="mapSnapClear">Remove</button></span></h3><img src="' + CP.app.mapImg(inc) + '" style="max-width:420px;border-radius:8px;border:1px solid var(--line)"></div>' : '') + '</div>';
  };
  AFTER.map = function (inc) { CP.app.bigMap(inc); };

  // ================= FORMS & IAP =================
  V.forms = function (inc) {
    var op = CP.curOP(inc), it = op.iapItems || {};
    var iapList = [['cover', 'IAP cover'], ['202', 'ICS 202'], ['203', 'ICS 203'], ['204', 'ICS 204s'], ['205', 'ICS 205'], ['205A', 'ICS 205A'], ['206', 'ICS 206'], ['207', 'ICS 207'], ['208', 'ICS 208'], ['215A', 'ICS 215A'], ['map', 'Map']];
    var def = { cover: true, '202': true, '215A': false };
    var iap = '<div class="row" style="gap:12px">' + iapList.map(function (x) { var on = x[0] in def ? def[x[0]] : !!it[x[0]]; if (x[0] === 'map') on = !!CP.app.mapImg(inc) || !!it.map; return '<label class="chk"><input type="checkbox" class="iapck" value="' + x[0] + '"' + (on ? ' checked' : '') + '>' + x[1] + '</label>'; }).join('') + '</div>' +
      '<div class="row" style="margin-top:12px"><select class="in" id="iapop" style="max-width:240px">' + A(inc.opPeriods).map(function (o) { return '<option value="' + o.id + '"' + (o.id === op.id ? ' selected' : '') + '>OP ' + o.n + ' · ' + CP.fmtDT(o.start) + '</option>'; }).join('') + '</select><button class="btn pri" data-act="iapPreview">' + I('eye') + 'Preview IAP</button><button class="btn" data-act="iapPrint">' + I('print') + 'Print / Save PDF</button><button class="btn" data-act="iapHtml">' + I('down') + 'Download</button></div>';
    var small = inc.complexity >= 4 && !inc.showAll;
    var lib = '<div class="flib">' + CP.FORMS.map(function (f) { var p = CP.formFill(inc, f.no); return '<div class="fcard" data-act="preview" data-a="' + f.no + '"><div class="fn">ICS ' + f.no + (f.iap ? ' · IAP' : '') + (f.small ? ' · Type 4/5' : '') + '</div><div class="ft">' + f.t + '</div><div class="fd">' + f.d + '</div><div class="fr"><div class="meter"><i style="width:' + p + '%;background:' + (p >= 80 ? 'var(--green)' : p >= 40 ? 'var(--gold)' : 'var(--red2)') + '"></i></div><span class="pct">' + p + '%</span></div></div>'; }).join('') + '</div>';
    return '<div class="wrap">' + phead('ICS Forms &amp; IAP', 'Every form fills itself from this incident. Preview, print, save as PDF or download. The percentage shows how much of each form has data.', '<button class="btn sm" data-act="package">' + I('down') + 'Full incident package</button>') +
      (small ? '<div class="hint" style="margin-bottom:12px"><b>Type ' + inc.complexity + ' incident:</b> ICS 201 is normally the whole plan. Add ICS 211 (check-in) and 214 (log) as needed. A written IAP is optional.</div>' : '') +
      card('Incident Action Plan', iap) + '<div style="height:14px"></div><div class="sec-t">Form library</div>' + lib + '</div>';
  };

  // ================= ARCGIS =================
  V.arc = function (inc) {
    var a = CP.arc, pushed = (inc && inc.arc && inc.arc.pushed) || {};
    var acct = a.signedIn() ? '<div class="row"><span class="chip ok"><span class="dot"></span>Signed in</span><b>' + E(a.user ? a.user.name + ' (' + a.user.username + ')' : '') + '</b><button class="btn sm ghost" data-act="signout">Sign out</button></div>' :
      '<div class="row"><span class="chip mute">Not signed in</span><button class="btn pri" data-act="signin">' + I('cloud') + 'Sign in with ArcGIS</button></div>' + (a.configured() ? '' : '<div class="warnbox" style="margin-top:10px">ArcGIS sign-in has not been configured on this copy of Command Post (missing client ID in js/config.js).</div>');
    var svc = !a.signedIn() ? '<div class="muted">Sign in first.</div>' : a.status === 'on' ? '<div class="row"><span class="chip ok">Connected</span><span class="mono dim" style="font-size:12px;word-break:break-all">' + E(a.own.url) + '</span></div><div class="muted" style="font-size:13px;margin-top:6px">Incidents save here automatically, so anyone signed in can open them. The log and resources are mirrored into the CP_Log and CP_Resources tables for dashboards.</div>' :
      a.status === 'nosvc' ? '<div class="muted" style="margin-bottom:8px">The shared Command Post service does not exist yet (or is not shared with you). An administrator or publisher can create it once.</div>' + (a.user && a.user.canPublish ? '<button class="btn pri" data-act="createSvc">' + I('build') + 'Create the Command Post service</button>' : '<div class="warnbox">Ask an ArcGIS administrator to sign in here and create it, then share it with the EM groups.</div>') : '<div class="warnbox">' + E(a.err || 'Not connected') + '</div><button class="btn sm" style="margin-top:8px" data-act="reconnect">Retry</button>';
    function out(key, title, desc, auto) { var p = pushed[key]; return '<div class="out"><div style="flex:1"><div class="ttl">' + title + '</div><div class="d">' + desc + '</div><div class="when">' + (p ? 'Last sent ' + CP.fmtDT(p.ts) + ' · ' + E(p.result || '') : 'Not sent yet') + '</div></div>' + (auto ? U.chk(inc, 'arc.auto.' + key, 'Auto') : '') + '<button class="btn sm pri" data-act="push" data-a="' + key + '"' + (a.signedIn() && inc ? '' : ' disabled') + '>' + I('up') + 'Send</button></div>'; }
    var outs = inc ? '<div class="grid" style="gap:8px">' + out('incident', 'Incident on the county map', 'Point (and area, if drawn) in the county Incidents layer: Overwatch, the Internal Map and, if public, the Incident Status dashboard.', true) +
      out('facilities', 'Incident facilities', 'ICP, staging, base and camp locations to the Incident Facilities layer.', true) +
      out('lifelines', 'Lifeline status', 'A new record in the Lifeline Status table (EOC Lifeline dashboard).') +
      out('publicMessage', 'Public message', 'Current public message to the Public Message table (public dashboard, EM site).') +
      out('damage', 'Activate damage assessment', 'Creates or updates this incident in the Damage Assessment configuration so DA teams can work it.') +
      '<div class="out"><div style="flex:1"><div class="ttl">SitRep</div><div class="d">Published from the Status page.</div></div><button class="btn sm" data-nav="status">Open Status</button></div></div>' : '<div class="muted">Open an incident to send it to the county layers.</div>';
    var lv = a.live || {};
    return '<div class="wrap">' + phead('ArcGIS', 'How Command Post connects to the county ArcGIS Online: shared incident records, write-through to the EM layers, and live feeds.', '') +
      '<div class="grid g2"><div class="grid" style="align-content:start">' + card('Account', acct) + card('Shared incident records', svc) + card('Live feeds', a.signedIn() ? '<div class="muted" style="font-size:13px">CAD calls and units, Stormwatch reports (responder, dispatch, public), shelters and registrations, road closures, evacuation notices, damage assessment zones, the latest SitRep, NWS warnings, VDOT and CalTopo.</div><div class="row" style="margin-top:8px"><button class="btn sm" data-act="live">' + I('refresh') + 'Refresh now</button><span class="dim" style="font-size:12px">' + (lv.asof ? 'Updated ' + lv.asof : '') + '</span></div>' + (lv.errors && lv.errors.length ? '<div class="warnbox" style="margin-top:8px;font-size:12px">' + lv.errors.map(E).join('<br>') + '</div>' : '') : '<div class="muted">Sign in to load.</div>') + '</div>' +
      '<div>' + card('Send to county layers', outs) + '</div></div><div style="height:14px"></div>' + card('EM toolkit', '<div class="tk">' + CP.TOOLKIT.map(function (t) { return '<a class="' + t.c + '" href="' + t.u + '" target="_blank" rel="noopener"><b>' + E(t.n) + '</b><span>' + E(t.d) + '</span></a>'; }).join('') + '</div>') + '</div>';
  };

  // ================= SETTINGS =================
  V.settings = function (inc) {
    var me = CP.me || {};
    return '<div class="wrap">' + phead('Incident Settings', 'Identity, complexity, closing out, and files.', '') +
      '<div class="grid g2"><div class="grid" style="align-content:start">' +
      card('Complexity', '<div class="cx">' + CP.COMPLEXITY.map(function (c) { return '<button class="' + (inc.complexity === c.v ? 'on' : '') + '" data-act="setCx" data-a="' + c.v + '"><b>' + c.label + '</b><span>' + c.d.split('.')[0] + '.</span></button>'; }).join('') + '</div><div style="margin-top:10px">' + U.chk(inc, 'showAll', 'Show every module, whatever the type', { rr: 1 }) + '</div><div class="dim" style="font-size:12px;margin-top:6px">Types 4 and 5 keep things short: briefing, org, resources, log and ICS 201. Type 3 and up add objectives, assignments, comms, medical, safety and the IAP.</div>') +
      card('Incident', '<div class="grid g2">' + U.text(inc, 'name', 'Name', { rr: 1 }) + U.text(inc, 'number', 'Number', { rr: 1 }) + U.sel(inc, 'type', 'Type', CP.INCIDENT_TYPES, { rr: 1 }) + U.dt(inc, 'start', 'Start', { rr: 1 }) + '</div>') +
      card('Status', inc.status === 'Closed' ? '<div class="row"><span class="chip mute">Closed ' + CP.fmtDT(inc.closed) + '</span><button class="btn" data-act="reopen">Reopen incident</button></div>' : '<div class="row"><span class="chip ok">Active</span><button class="btn red" data-act="close">Close incident</button></div><div class="dim" style="font-size:12px;margin-top:6px">Closing logs the time, closes it on the county map and facilities layers (if signed in), and prompts for the final ICS 209 and package.</div>') +
      '</div><div class="grid" style="align-content:start">' +
      card('You', '<div class="grid g2"><label class="f"><span>Your name</span><input class="in" id="me_name" value="' + E(me.name) + '"></label><label class="f"><span>Your ICS position</span><input class="in" id="me_pos" value="' + E(me.pos) + '" list="dl_pos"></label></div><button class="btn sm" style="margin-top:8px" data-act="saveMe">Save</button><div class="dim" style="font-size:12px;margin-top:6px">Used for log entries and Prepared by lines on this device.</div>') +
      card('Files', '<div class="row"><button class="btn" data-act="export">' + I('down') + 'Download incident file (.json)</button><button class="btn" data-act="import">' + I('up') + 'Open incident file</button></div><div class="dim" style="font-size:12px;margin-top:6px">Use the file to move an incident between devices without ArcGIS, or to archive it with the final package.</div>') +
      card('Danger zone', '<button class="btn red sm" data-act="deleteLocal">' + I('trash') + 'Remove from this device</button><div class="dim" style="font-size:12px;margin-top:6px">Removes only this device\'s copy. A shared copy in ArcGIS is kept.</div>') + '</div></div></div>';
  };
})(window.CP);
