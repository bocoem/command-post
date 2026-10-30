/* EM OPS — Public Hotline desk (desktop and tablet)
   Call takers log every inbound, outbound and callback call in ArcGIS (OPS_HotlineCalls), answer from PIO-approved
   talking points (OPS_HotlineInfo) and live county data (open shelters, PODs, road closures, evacuation notices),
   and route what needs action straight into the other tools:
     welfare / missing person → Reunification inquiry      access & functional needs → AFN registry
     volunteering → Volunteers                               rumor / unanswered question → PIO draft talking point
     needs help, damage, roads, utilities → Command Post activity log (no caller details) and the follow-up queue
   Priority and urgent calls, routed calls and rumors are logged to the Command Post incident. */
(function (CP) {
  'use strict';
  var OPS = CP.ops, A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon, K = OPS.LISTS;
  var HL = OPS.hl = { cur: null, t0: 0 };
  var ROUTE_FOR = { 'Welfare check / missing person': 'Reunification', 'Access & functional needs': 'AFN team', 'Rumor / misinformation': 'PIO', 'Media': 'PIO', 'Damage report': 'Damage assessment', 'Road / closure': 'Public Works / VDOT', 'Utilities / power': 'Utilities', 'Needs help (not 911)': 'EOC Operations', 'Donations / volunteering': 'Volunteer / donations', 'Shelter': 'Mass Care / Shelter', 'Commodities / POD': 'EOC Logistics' };
  var ICON = { 'Information request': 'list', 'Shelter': 'home', 'Evacuation': 'warn', 'Road / closure': 'truck', 'Utilities / power': 'lifeline', 'Damage report': 'build', 'Needs help (not 911)': 'flag', 'Welfare check / missing person': 'users', 'Access & functional needs': 'med', 'Commodities / POD': 'flag', 'Donations / volunteering': 'users', 'Rumor / misinformation': 'warn', 'Media': 'report', 'Other': 'list' };

  function calls() { return OPS.load('calls:' + (OPS.inc ? OPS.inc.key : ''), function () { return OPS.rows('calls', OPS.inc ? OPS.incWhere() : 'call_time > ' + (Date.now() - 7 * 864e5), { order: 'call_time DESC', n: 3000 }); }, 20000); }
  function info() { return OPS.load('info:' + (OPS.inc ? OPS.inc.key : ''), function () { return OPS.rows('info', OPS.inc ? "incident_key IS NULL OR incident_key=" + A.sq(OPS.inc.key) : '1=1', { order: 'topic', n: 2000, raw: false }); }, 60000); }
  function facts() {
    return OPS.load('hl:facts', async function () {
      var q = function (u, w, f) { return u ? A.query(u, w, { fields: f, n: 200 }).then(function (fs) { return fs.map(function (x) { return x.attributes; }); }).catch(function () { return null; }) : Promise.resolve(null); };
      var r = await Promise.all([q(A.L.shelters, "status IN ('Open','Alert')", 'facname,fulladdr,status,capacity,occupancy,allowpets,handicap'), q(A.L.pods, "status='Open'", 'name,fulladdr,status'), q(A.L.closures, "activeincid='Yes'", 'street,reason,description,accessallowed,altroute'), q(A.L.notices, "activeincid='Yes'", 'evactype,incidentnm,dateissued,description')]);
      return { shelters: r[0], pods: r[1], closures: r[2], notices: r[3], t: Date.now() };
    }, 120000);
  }
  var OPEN = function (c) { return ['Closed', 'Answered'].indexOf(c.status) < 0; };
  var DUE = function (c) { return c.status === 'Callback needed' && c.followup_due && c.followup_due < Date.now(); };

  OPS.tool('hotline', {
    n: 'Hotline', sub: 'Public Information Line', icon: 'phone', color: 'blue', live: 'calls', eop: 'general',
    d: 'Log hotline calls, answer from PIO-approved talking points and live county data, and route what needs action into Reunification, AFN, Volunteers, the PIO and Command Post.',
    nums: async function () { var w = OPS.incWhere('call_time > ' + (Date.now() - 864e5)); var n = await OPS.count('calls', w); var cb = await OPS.count('calls', OPS.incWhere("status IN ('Callback needed','Open','Routed')")); return [[n, 'calls in 24 h'], [cb, 'open / callbacks', cb ? 'warn-t' : '']]; },
    render: function () {
      var u = OPS.st.ui, tab = u.ht || 'desk';
      var h = '<div class="phead"><div><h1 class="pg">Hotline' + (OPS.inc ? ' · ' + E(OPS.inc.name) : '') + '</h1><p class="pgsub" style="margin:0">' + (OPS.inc ? 'Calls are tied to this incident. Priority calls, routed calls and rumors are logged to Command Post without caller details.' : 'County-wide (no incident): pick the incident at the top to tie calls to it.') + '</p></div>' +
        '<div class="acts"><button class="btn" data-act="hlOut">' + I('phone') + 'Outbound call</button><button class="btn pri big" data-act="hlNew" title="Shortcut: N">' + I('plus') + 'New call</button></div></div>';
      var c = calls(); if (OPS.bad(c)) return h + OPS.wait(c, 'calls');
      var day = c.filter(function (x) { return x.call_time > Date.now() - 864e5; }), open = c.filter(OPEN), due = c.filter(DUE), urg = c.filter(function (x) { return x.priority === 'Urgent' && OPEN(x); });
      h += '<div class="grid g4" style="margin-bottom:10px">' + OPS.stat(day.length, 'Calls, last 24 h', 'gold', day.filter(function (x) { return x.direction !== 'Inbound'; }).length + ' outbound / callbacks') + OPS.stat(open.length, 'Open / follow-up', open.length ? 'blue' : '') + OPS.stat(due.length, 'Callbacks overdue', due.length ? 'red' : '') + OPS.stat(urg.length, 'Urgent open', urg.length ? 'red' : '') + '</div>';
      h += OPS.tabs('ht', [['desk', 'Desk', ''], ['queue', 'Follow-up queue', open.length], ['log', 'Call log', c.length], ['info', 'Talking points', ''], ['trend', 'Trends']], tab);
      if (tab === 'desk') h += desk(c);
      else if (tab === 'queue') h += queue(c);
      else if (tab === 'log') h += '<div class="toolbar">' + OPS.searchBox('hl', 'Search caller, topic, summary, call #') + '<span class="sp"></span><button class="btn sm" data-act="hlCsv">' + I('down') + 'CSV</button><button class="btn sm" data-act="hlPrint">' + I('print') + 'Call report</button></div>' + table(c, u.q_hl);
      else if (tab === 'info') h += infoTab();
      else h += trends(c);
      return h;
    },
    after: function () { var f = document.getElementById('hlq'); if (f && OPS.st.ui.hlq) { f.value = OPS.st.ui.hlq; } },
    edit: { calls: function (r) { HL.open(r); }, info: function (r) { infoForm(r); } }
  });

  // ---------- desk: queue | quick facts | talking points ----------
  function desk(c) {
    var open = c.filter(OPEN).sort(function (a, b) { return (DUE(b) - DUE(a)) || (pri(b) - pri(a)) || ((a.followup_due || a.call_time) - (b.followup_due || b.call_time)); });
    var h = '<div class="hldesk"><section class="hlcol"><h3>' + I('flag') + 'Needs follow-up <span class="ct">' + open.length + '</span></h3>' + (open.length ? open.slice(0, 40).map(qcard).join('') : '<div class="empty">Nothing waiting. New calls show here until closed.</div>') +
      '<h3 style="margin-top:12px">' + I('phone') + 'Recent calls</h3>' + c.filter(function (x) { return !OPEN(x); }).slice(0, 12).map(qcard).join('') + '</section>';
    h += '<section class="hlcol">' + factsHtml() + '</section>';
    h += '<section class="hlcol">' + tpHtml(true) + '</section></div>';
    return h;
  }
  function pri(c) { return { Urgent: 2, Priority: 1 }[c.priority] || 0; }
  function qcard(c) {
    return '<div class="hlq ' + (DUE(c) ? 'due' : '') + (c.priority === 'Urgent' ? ' urg' : '') + (c._pending ? ' pend' : '') + '" data-act="edit" data-a="calls|' + c.OBJECTID + '"><div class="row" style="justify-content:space-between;gap:6px"><b>' + I(ICON[c.category] || 'list') + E(c.category || 'Call') + '</b>' + OPS.chip(c.status) + '</div>' +
      '<div class="m">' + E((c.summary || '').slice(0, 110)) + '</div><div class="m dim">' + E([c.call_id, c.direction !== 'Inbound' ? c.direction : '', c.town, OPS.ago(c.call_time) + ' ago', c.routed_to ? '→ ' + c.routed_to : ''].filter(Boolean).join(' · ')) + (c.followup_due && OPEN(c) ? ' · <span class="' + (DUE(c) ? 'bad-t' : 'warn-t') + '">call back ' + E(OPS.dt(c.followup_due)) + '</span>' : '') + '</div></div>';
  }
  function factsHtml() {
    var f = facts();
    var h = '<h3>' + I('map') + 'Live county facts <span class="x"><button class="btn xs ghost" data-act="hlFacts" title="Refresh">' + I('refresh') + '</button></span></h3>';
    if (f === undefined) return h + '<div class="empty">Loading shelters, PODs, closures and notices…</div>';
    var sec = function (t, arr, fmt, none) { return '<div class="hlf"><div class="fgrp">' + E(t) + (arr ? ' <span class="ct">' + arr.length + '</span>' : '') + '</div>' + (arr == null ? '<div class="dim">Not available to your account.</div>' : arr.length ? arr.map(fmt).join('') : '<div class="dim">' + E(none) + '</div>') + '</div>'; };
    var ins = function (txt) { return ' <button class="btn xs ghost" data-act="hlIns" data-a="' + E(txt) + '" title="Add to what we told them">' + I('plus') + '</button>'; };
    h += sec('Open shelters', f.shelters, function (s) { var t = s.facname + ' is open at ' + (s.fulladdr || 'the posted address') + '.' + (s.allowpets === 'Yes' ? ' Pets are welcome.' : s.allowpets === 'No' ? ' Pets are not allowed (service animals are).' : '') + (s.handicap === 'Yes' ? ' It is wheelchair accessible.' : ''); return '<div class="hlfi"><b>' + E(s.facname) + '</b>' + ins(t) + '<div class="dim">' + E(s.fulladdr || '') + (s.capacity ? ' · ' + (s.occupancy || 0) + '/' + s.capacity : '') + (s.allowpets === 'Yes' ? ' · pets OK' : '') + '</div></div>'; }, 'No shelters open.');
    h += sec('Open PODs', f.pods, function (p) { var t = 'Supplies are being handed out at ' + p.name + (p.fulladdr ? ', ' + p.fulladdr : '') + '.'; return '<div class="hlfi"><b>' + E(p.name) + '</b>' + ins(t) + '<div class="dim">' + E(p.fulladdr || '') + '</div></div>'; }, 'No PODs open.');
    h += sec('Road closures', f.closures, function (r) { var t = r.street + ' is closed' + (r.reason ? ' (' + r.reason + ')' : '') + '.' + (r.altroute ? ' Detour: ' + r.altroute + '.' : ''); return '<div class="hlfi"><b>' + E(r.street) + '</b>' + ins(t) + '<div class="dim">' + E([r.reason, r.accessallowed, r.altroute ? 'detour ' + r.altroute : ''].filter(Boolean).join(' · ')) + '</div></div>'; }, 'No active closures.');
    h += sec('Evacuation notices', f.notices, function (n) { var t = 'There is an active ' + (n.evactype || 'evacuation notice') + ' for ' + (n.incidentnm || 'the affected area') + '.'; return '<div class="hlfi"><b>' + E(n.evactype || 'Notice') + '</b>' + ins(t) + '<div class="dim">' + E(n.incidentnm || '') + '</div></div>'; }, 'No active evacuation notices.');
    return h + '<div class="dim" style="font-size:12px">Updated ' + E(OPS.ago(f.t)) + ' ago from the county public layers.</div>';
  }
  function tpHtml(compact) {
    var d = info(), q = (OPS.st.ui.hlq || '').toLowerCase();
    var h = '<h3>' + I('report') + 'Talking points' + (compact ? '<span class="x"><button class="btn xs ghost" data-act="seg" data-a="ht|info">Manage</button></span>' : '') + '</h3><input class="in" id="hlq" placeholder="Search: shelter, water, power, pets…" data-chg="hlq" style="margin-bottom:8px">';
    if (OPS.bad(d)) return h + OPS.wait(d, 'talking points');
    var list = d.filter(function (x) { return (compact ? x.status === 'Approved' && (!x.expires || x.expires > Date.now()) : true) && (!q || [x.topic, x.question, x.answer].join(' ').toLowerCase().indexOf(q) >= 0); }).sort(function (a, b) { return (b.pinned || 0) - (a.pinned || 0) || (b.times_used || 0) - (a.times_used || 0); });
    if (!list.length) return h + '<div class="empty">' + (q ? 'No approved answer for that. Log the call as "Information request" and route it to the PIO; it becomes a draft for them to answer.' : 'No approved talking points yet. Add them under Manage (PIO approves).') + '</div>';
    return h + list.slice(0, compact ? 30 : 500).map(function (x) {
      return '<div class="hltp' + (x.status !== 'Approved' ? ' draft' : '') + '"><div class="row" style="justify-content:space-between;gap:6px"><b>' + E(x.question) + '</b>' + (x.status !== 'Approved' ? OPS.chip(x.status) : '') + '</div><div class="ans">' + E(x.answer || '') + '</div>' +
        (x.spanish ? '<details><summary class="dim">Español</summary><div class="ans">' + E(x.spanish) + '</div></details>' : '') +
        '<div class="row" style="gap:6px;margin-top:6px"><span class="dim" style="font-size:12px">' + E(x.topic || '') + (x.approved_by ? ' · approved ' + E(x.approved_by) : '') + '</span><span class="sp"></span>' + (x.status === 'Approved' ? '<button class="btn xs" data-act="hlUse" data-a="' + x.OBJECTID + '">' + I('plus') + 'Use</button>' : '') + '<button class="btn xs ghost" data-act="edit" data-a="info|' + x.OBJECTID + '">Edit</button></div></div>';
    }).join('');
  }
  OPS.chg.hlq = function (el) { OPS.st.ui.hlq = el.value; clearTimeout(HL._q); HL._q = setTimeout(function () { var y = el.selectionStart; OPS.repaint(); var n = document.getElementById('hlq'); if (n) { n.value = OPS.st.ui.hlq; n.focus(); n.setSelectionRange(y, y); } }, 250); };
  document.addEventListener('input', function (e) { if (e.target && e.target.id === 'hlq') OPS.chg.hlq(e.target); });
  OPS.act.hlFacts = function () { OPS.bust('hl:facts'); OPS.repaint(); };

  // ---------- the call card (dialog; wide on desktop, full-screen on tablets in portrait) ----------
  OPS.act.hlNew = function (dir) { HL.open(null, { direction: typeof dir === 'string' && dir ? dir : 'Inbound' }); };
  OPS.act.hlOut = function () { HL.open(null, { direction: 'Outbound' }); };
  HL.open = function (r, def) {
    r = r || null; def = def || {}; var isNew = !r;
    var x = Object.assign({ direction: 'Inbound', priority: 'Routine', status: 'Open', language: 'English', callback_ok: 'Yes', taker: OPS.me() }, def, r || {});
    HL.t0 = isNew ? Date.now() : x.call_time; HL.used = (x.info_ids || '').split(',').filter(Boolean);
    var chip = function (name, opts, cur, cls) { return '<div class="hlchips" data-chips="' + name + '">' + opts.map(function (o) { return '<button type="button" class="hlchip ' + (cls ? cls(o) : '') + (o === cur ? ' on' : '') + '" data-v="' + E(o) + '">' + (name === 'category' ? I(ICON[o] || 'list') : '') + E(o) + '</button>'; }).join('') + '</div><input type="hidden" name="' + name + '" value="' + E(cur || '') + '">'; };
    var inp = function (n, l, v, o) { o = o || {}; return '<label class="f' + (o.wide ? ' spanall' : '') + '"><span>' + E(l) + '</span>' + (o.area ? '<textarea class="in" name="' + n + '" style="min-height:' + (o.h || 80) + 'px" placeholder="' + E(o.ph || '') + '">' + E(v || '') + '</textarea>' : o.sel ? '<select class="in" name="' + n + '">' + o.sel.map(function (s) { return '<option' + (s === v ? ' selected' : '') + '>' + E(s) + '</option>'; }).join('') + '</select>' : '<input class="in" name="' + n + '" value="' + E(v || '') + '"' + (o.type ? ' type="' + o.type + '"' : '') + (o.list ? ' list="' + o.list + '"' : '') + ' placeholder="' + E(o.ph || '') + '">') + '</label>'; };
    var body = '<div class="hlcall"><div class="hlmain">' +
      '<div class="row hltop"><div class="hltimer" id="hlTimer">' + (isNew ? '0:00' : E(OPS.dt(x.call_time))) + '</div>' + chip('direction', K.callDir, x.direction) + '<span class="sp"></span>' + chip('priority', K.callPri, x.priority, function (o) { return o === 'Urgent' ? 'red' : o === 'Priority' ? 'gold' : ''; }) + '</div>' +
      '<div class="warnbox hl911">' + I('warn') + ' Life-threatening emergency? Tell the caller to hang up and dial <b>9-1-1</b>, or transfer to dispatch now.</div>' +
      '<div class="fgrp">Topic</div>' + chip('category', K.callCat, x.category) +
      '<div class="grid g3 fgrid" style="margin-top:8px">' + inp('caller_name', 'Caller name', x.caller_name) + inp('caller_phone', 'Callback number', x.caller_phone, { type: 'tel' }) + inp('callback_ok', 'OK to call back', x.callback_ok, { sel: ['Yes', 'No'] }) +
      inp('address', 'Address / location', x.address, { ph: 'Street, crossroads or landmark' }) + inp('town', 'Community', x.town, { list: 'dl_town' }) + inp('language', 'Language', x.language, { sel: K.lang }) + '</div>' +
      '<div class="grid g2 fgrid">' + inp('summary', 'What they said / need *', x.summary, { area: 1, wide: 1, h: 90, ph: 'In their words: what happened, what they need, who is affected' }) + inp('response', 'What we told them', x.response, { area: 1, wide: 1, h: 90, ph: 'Use a talking point or a live fact from the right, or type what you said' }) + '</div>' +
      '<div class="grid g3 fgrid">' + inp('people', 'People affected', x.people, { ph: 'e.g. 2 adults, 1 child' }) + inp('routed_to', 'Route to', x.routed_to || '', { sel: K.callRoute }) + inp('assigned_to', 'Follow-up by', x.assigned_to) +
      '<label class="f"><span>Status</span><select class="in" name="status">' + K.callStatus.map(function (s) { return '<option' + (s === x.status ? ' selected' : '') + '>' + E(s) + '</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Call back by</span><input class="in" type="datetime-local" name="followup_due" value="' + (x.followup_due ? CP.localInput(new Date(x.followup_due).toISOString()) : '') + '"></label>' + inp('notes', 'Internal notes (not read to callers)', x.notes) + '</div>' +
      '<input type="hidden" name="related_call" value="' + E(x.related_call || '') + '"><div id="hlRoute" class="hlroute"></div>' + (x.routed_ref ? '<div class="hint">' + I('link') + ' ' + E(x.routed_ref) + '</div>' : '') +
      '</div><aside class="hlside"><div id="hlSideTp"></div></aside></div>' +
      '<datalist id="dl_town">' + K.town.map(function (t) { return '<option value="' + E(t) + '">'; }).join('') + '</datalist>';
    var btns = [{ label: 'Cancel', cls: 'ghost' }];
    if (!isNew && OPEN(x)) btns.push({ label: I('phone') + 'Call back now', fn: function () { setTimeout(function () { HL.open(null, { direction: 'Callback', related_call: x.call_id, caller_name: x.caller_name, caller_phone: x.caller_phone, address: x.address, town: x.town, category: x.category, language: x.language, summary: 'Callback on ' + x.call_id + ': ' + (x.summary || '') }); }, 40); } });
    btns.push({ label: I('check') + 'Save & close call', cls: 'ghost', fn: function (bg) { return save(bg, r, 'Closed'); } });
    btns.push({ label: I('check') + 'Save' + (isNew ? ' (Ctrl+Enter)' : ''), cls: 'pri', fn: function (bg) { return save(bg, r); } });
    var bg = U.modal((isNew ? (x.direction === 'Inbound' ? 'New hotline call' : x.direction + ' call') : 'Call ' + (x.call_id || '')) + (OPS.inc ? ' · ' + OPS.inc.name : ''), body, btns, { wide: true, sticky: true, nofocus: !isNew });
    bg.querySelector('.modal').classList.add('hlmodal');
    bg.addEventListener('click', function (e) {
      var b = e.target.closest('.hlchip'); if (b) { e.preventDefault(); var box = b.closest('[data-chips]'), n = box.dataset.chips; box.querySelectorAll('.hlchip').forEach(function (y) { y.classList.toggle('on', y === b); }); bg.querySelector('[name="' + n + '"]').value = b.dataset.v; if (n === 'category') routeHint(bg); return; }
      var u = e.target.closest('[data-hluse]'); if (u) { e.preventDefault(); useTp(bg, +u.dataset.hluse); return; }
      var ro = e.target.closest('[data-hlroute]'); if (ro) { e.preventDefault(); routeNow(bg, ro.dataset.hlroute, x); }
    });
    bg.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); save(bg, r); } });
    var side = bg.querySelector('#hlSideTp'); side.innerHTML = sideTp('');
    side.addEventListener('input', function (e) { if (e.target.id === 'hlSideQ') { var v = e.target.value; side.querySelector('#hlSideList').innerHTML = sideList(v); } });
    if (isNew) { clearInterval(HL._tm); HL._tm = setInterval(function () { var t = document.getElementById('hlTimer'); if (!t) return clearInterval(HL._tm); var s = Math.floor((Date.now() - HL.t0) / 1000); t.textContent = Math.floor(s / 60) + ':' + CP.pad(s % 60); }, 1000); setTimeout(function () { var el = bg.querySelector('[name="caller_name"]'); if (el) el.focus(); }, 60); }
    routeHint(bg);
    HL.bg = bg;
    return bg;
  };
  function sideTp(q) { return '<div class="fgrp">Talking points</div><input class="in" id="hlSideQ" placeholder="Search answers" value="' + E(q) + '"><div id="hlSideList" style="margin-top:6px">' + sideList(q) + '</div>'; }
  function sideList(q) {
    var d = info(); if (!Array.isArray(d)) return '<div class="dim">Loading…</div>'; q = (q || '').toLowerCase();
    var cat = HL.bg && (HL.bg.querySelector('[name="category"]') || {}).value;
    var l = d.filter(function (x) { return x.status === 'Approved' && (!x.expires || x.expires > Date.now()) && (!q || [x.topic, x.question, x.answer].join(' ').toLowerCase().indexOf(q) >= 0); }).sort(function (a, b) { return ((b.topic === cat) - (a.topic === cat)) || (b.pinned || 0) - (a.pinned || 0) || (b.times_used || 0) - (a.times_used || 0); });
    return l.length ? l.slice(0, 25).map(function (x) { return '<div class="hltp sm"><b>' + E(x.question) + '</b><div class="ans">' + E((x.answer || '').slice(0, 260)) + ((x.answer || '').length > 260 ? '…' : '') + '</div><button class="btn xs" data-hluse="' + x.OBJECTID + '">' + I('plus') + 'Use</button></div>'; }).join('') : '<div class="dim">No approved answer. Route to PIO to get one.</div>';
  }
  function useTp(bg, oid) {
    var x = OPS.arr(info()).find(function (y) { return y.OBJECTID === oid; }); if (!x) return;
    var lang = (bg.querySelector('[name="language"]') || {}).value, txt = lang === 'Spanish' && x.spanish ? x.spanish : x.answer;
    var t = bg.querySelector('[name="response"]'); t.value = (t.value ? t.value.replace(/\s+$/, '') + '\n' : '') + txt;
    if (HL.used.indexOf(String(oid)) < 0) HL.used.push(String(oid));
    OPS.upd('info', oid, { times_used: (x.times_used || 0) + 1 }).catch(function () {}); x.times_used = (x.times_used || 0) + 1;
    U.toast('Added: ' + E(x.question), 'ok', 1800);
  }
  OPS.act.hlUse = function (oid) { if (HL.bg && document.body.contains(HL.bg)) return useTp(HL.bg, +oid); HL.open(null); setTimeout(function () { useTp(HL.bg, +oid); }, 80); };
  OPS.act.hlIns = function (txt) {
    if (!(HL.bg && document.body.contains(HL.bg))) { HL.open(null); }
    setTimeout(function () { var t = HL.bg.querySelector('[name="response"]'); t.value = (t.value ? t.value.replace(/\s+$/, '') + '\n' : '') + txt; }, 80);
  };

  // ---------- routing ----------
  function routeHint(bg) {
    var cat = bg.querySelector('[name="category"]').value, box = bg.querySelector('#hlRoute'), sel = bg.querySelector('[name="routed_to"]');
    if (sel && !sel.value && ROUTE_FOR[cat]) sel.value = ROUTE_FOR[cat];
    var acts = [];
    if (cat === 'Welfare check / missing person' && OPS.ready('reunify')) acts.push(['reunify', 'Open a reunification inquiry', 'users']);
    if (cat === 'Access & functional needs' && OPS.ready('afn')) acts.push(['afn', 'Add to the AFN registry', 'med']);
    if (cat === 'Donations / volunteering' && OPS.ready('volunteers')) acts.push(['vol', 'Register as a volunteer', 'users']);
    if (cat === 'Rumor / misinformation' || cat === 'Information request' || cat === 'Media') acts.push(['pio', 'Send to PIO as a question to answer', 'report']);
    if (cat === 'Commodities / POD' || cat === 'Shelter' || cat === 'Road / closure' || cat === 'Evacuation') acts.push(['facts', 'Show live county facts', 'map']);
    box.innerHTML = acts.length ? '<div class="fgrp">Route this call</div><div class="row" style="gap:6px;flex-wrap:wrap">' + acts.map(function (a) { return '<button class="btn sm" data-hlroute="' + a[0] + '">' + I(a[2]) + E(a[1]) + '</button>'; }).join('') + '</div>' : '';
    var side = bg.querySelector('#hlSideList'); if (side) side.innerHTML = sideList((bg.querySelector('#hlSideQ') || {}).value || '');
  }
  async function routeNow(bg, kind, x) {
    var v = function (n) { return (bg.querySelector('[name="' + n + '"]') || {}).value || ''; };
    var nm = v('caller_name').trim().split(/\s+/), saved = await save(bg, x && x.OBJECTID ? x : null, null, true); if (saved === false) return;
    var ref = '';
    if (kind === 'reunify') { OPS.ru.caseForm(null, { rec_type: 'Missing (inquiry)', status: 'Open inquiry', rp_name: v('caller_name'), rp_phone: v('caller_phone'), description: v('summary'), home_address: v('address'), language: v('language') !== 'English' ? v('language') : null, notes: 'From hotline call ' + saved.call_id }); ref = 'Reunification inquiry from ' + saved.call_id; }
    else if (kind === 'afn') { OPS.afnForm({ person: v('caller_name'), first_name: nm[0], last_name: nm.slice(1).join(' '), phone: v('caller_phone'), address: v('address'), notes: 'From hotline call ' + saved.call_id + ': ' + v('summary') }); ref = 'AFN registry entry from ' + saved.call_id; }
    else if (kind === 'vol') { OPS.volForm(null, { status: 'Pending background check', team: 'Spontaneous', first_name: nm[0], last_name: nm.slice(1).join(' '), phone: v('caller_phone'), notes: 'From hotline call ' + saved.call_id }); ref = 'Volunteer registration from ' + saved.call_id; }
    else if (kind === 'pio') { await OPS.save('info', Object.assign(OPS.incFix(), { topic: v('category') || 'Information request', question: v('summary').slice(0, 500), answer: '(PIO: write the approved answer)', status: 'Draft', effective: Date.now() })); OPS.bust('info'); ref = 'Sent to PIO as a draft talking point'; U.toast('Sent to the PIO. It shows as a Draft under Talking points until approved.', 'ok', 5000); }
    else if (kind === 'facts') { U.closeModal(); OPS.st.ui.ht = 'desk'; OPS.repaint(); return; }
    if (ref) await OPS.upd('calls', saved.OBJECTID, { routed_ref: ref, status: saved.status === 'Open' ? 'Routed' : saved.status }).catch(function () {});
    OPS.bust('calls');
  }

  // ---------- save ----------
  async function save(bg, r, forceStatus, keepOpen) {
    r = r && r.OBJECTID ? r : bg._rec || null; // a call already saved from this card (e.g. when routing) is updated, not duplicated
    var c = OPS.collect(bg, 'calls'), at = c.attrs;
    if (!at.category) { U.toast('Pick a topic', 'err'); return false; }
    if (!at.summary) { U.toast('Write what the caller said', 'err'); return false; }
    var fu = bg.querySelector('[name="followup_due"]').value; at.followup_due = fu ? new Date(fu).getTime() : null;
    if (forceStatus) at.status = forceStatus;
    if (at.status === 'Open' && at.routed_to) at.status = 'Routed';
    if (at.callback_ok === 'Yes' && at.status === 'Callback needed' && !at.followup_due) at.followup_due = Date.now() + 2 * 3600e3;
    if (at.status === 'Closed' && !(r && r.closed_time)) at.closed_time = Date.now();
    at.info_ids = HL.used.join(',') || null;
    var isNew = !r || !r.OBJECTID;
    if (isNew) Object.assign(at, OPS.incFix(), { call_id: OPS.id('H'), call_time: HL.t0 || Date.now(), end_time: Date.now(), taker: OPS.me() });
    else at.OBJECTID = r.OBJECTID;
    if (!isNew && r.call_id) at.call_id = r.call_id;
    try {
      var oid = await OPS.save('calls', at, null); at.OBJECTID = oid; bg._rec = Object.assign({}, r || {}, at);
      clearInterval(HL._tm); OPS.bust('calls'); OPS.bust('home');
      // Command Post: priority / urgent / routed / rumor calls go in the activity log, without caller details
      var worth = isNew && (at.priority !== 'Routine' || at.routed_to || /Rumor|Media/.test(at.category));
      if (worth && OPS.inc) OPS.cpEdit(OPS.inc.key, function () {}, 'Hotline ' + at.call_id + ' · ' + at.category + (at.priority !== 'Routine' ? ' · ' + at.priority.toUpperCase() : '') + (at.town ? ' · ' + at.town : '') + (at.routed_to ? ' → ' + at.routed_to : '') + ': ' + (at.summary || '').replace(/\s+/g, ' ').slice(0, 160), at.priority === 'Urgent' ? 'Safety' : 'Hotline').catch(function (e) { console.warn(e); });
      U.toast((isNew ? 'Call ' + at.call_id + ' logged' : 'Call saved') + (CP.net && !CP.net.ok ? ' on this device (offline)' : ''), 'ok');
      if (!keepOpen) { U.closeModal(); OPS.repaint(); }
      return at;
    } catch (e) { U.toast('Save failed: ' + E(e.message), 'err', 7000); return false; }
  }

  // ---------- follow-up queue, log, trends ----------
  function queue(c) {
    var open = c.filter(OPEN), by = {};
    open.forEach(function (x) { var k = x.routed_to || (x.status === 'Callback needed' ? 'Callbacks' : 'Unassigned'); (by[k] = by[k] || []).push(x); });
    if (!open.length) return '<div class="empty">Nothing open. Every call has been answered or closed.</div>';
    return '<div class="kb">' + Object.keys(by).sort().map(function (k) { return '<div class="col"><h4>' + E(k) + '<span class="ct">' + by[k].length + '</span></h4>' + by[k].sort(function (a, b) { return pri(b) - pri(a) || (a.followup_due || a.call_time) - (b.followup_due || b.call_time); }).map(qcard).join('') + '</div>'; }).join('') + '</div>';
  }
  function table(c, q) {
    return OPS.table({ k: 'calls', rows: c, q: q, cols: [{ f: 'call_time', l: 'Time', fmt: function (x) { return '<span class="mono" style="font-size:12.5px">' + E(OPS.dt(x.call_time)) + '</span>'; } }, 'call_id', 'direction', 'category', 'priority', { f: 'summary', l: 'Summary', fmt: function (x) { return E((x.summary || '').slice(0, 90)); } }, 'town', 'routed_to', 'status', 'taker'],
      rowCls: function (x) { return DUE(x) ? 'warnrow' : ''; }, empty: 'No calls logged yet.' });
  }
  function trends(c) {
    var since = Date.now() - 864e5, day = c.filter(function (x) { return x.call_time > since; }), by = {}, hrs = [];
    day.forEach(function (x) { by[x.category] = (by[x.category] || 0) + 1; });
    for (var i = 23; i >= 0; i--) { var a = Date.now() - (i + 1) * 3600e3, b = a + 3600e3; hrs.push(day.filter(function (x) { return x.call_time >= a && x.call_time < b; }).length); }
    var mx = Math.max.apply(null, hrs.concat([1])), top = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; });
    var unanswered = c.filter(function (x) { return x.call_time > since && /Information request|Rumor/.test(x.category) && !x.info_ids; });
    return '<div class="grid g2"><div class="card"><h3>' + I('report') + 'Topics, last 24 h</h3>' + (top.length ? top.map(function (k) { return '<div class="hlbar"><span>' + E(k) + '</span><div><i style="width:' + Math.round(100 * by[k] / day.length) + '%"></i></div><b>' + by[k] + '</b></div>'; }).join('') : '<div class="dim">No calls in the last 24 hours.</div>') + '</div>' +
      '<div class="card"><h3>' + I('clock') + 'Calls per hour</h3><div class="hlspark">' + hrs.map(function (n, i) { return '<i title="' + n + ' calls" style="height:' + Math.max(3, Math.round(100 * n / mx)) + '%"></i>'; }).join('') + '</div><div class="dim" style="font-size:12px;display:flex;justify-content:space-between"><span>24 h ago</span><span>now</span></div></div></div>' +
      '<div class="card" style="margin-top:12px"><h3>' + I('warn') + 'Questions without an approved answer <span class="ct">' + unanswered.length + '</span></h3><p class="dim" style="margin-top:0">For the PIO: what people are asking that the hotline could not answer from a talking point.</p>' + (unanswered.length ? unanswered.slice(0, 40).map(function (x) { return '<div class="hlq" data-act="edit" data-a="calls|' + x.OBJECTID + '"><b>' + E(x.category) + '</b><div class="m">' + E((x.summary || '').slice(0, 160)) + '</div></div>'; }).join('') : '<div class="dim">None.</div>') + '</div>';
  }
  OPS.act.hlCsv = function () { var c = calls(); if (Array.isArray(c)) OPS.csv('Hotline calls', 'calls', c); };
  OPS.act.hlPrint = function () {
    var c = OPS.arr(calls()); var by = {}; c.forEach(function (x) { by[x.category] = (by[x.category] || 0) + 1; });
    OPS.print('Hotline call report', (OPS.inc ? E(OPS.inc.name) + ' · ' : '') + c.length + ' calls', '<h2>By topic</h2>' + OPS.ptable(['Topic', 'Calls'], Object.keys(by).sort(function (a, b) { return by[b] - by[a]; }).map(function (k) { return [k, by[k]]; })) +
      '<h2>Calls</h2>' + OPS.ptable(['Time', 'Call #', 'Dir', 'Topic', 'Priority', 'Community', 'Summary', 'Routed', 'Status'], c.map(function (x) { return [OPS.dt(x.call_time), x.call_id, x.direction, x.category, x.priority, x.town, (x.summary || '').slice(0, 140), x.routed_to, x.status]; })));
  };

  // ---------- talking points (PIO) ----------
  function infoTab() {
    return '<div class="toolbar"><span class="muted">The PIO writes and approves these. Call takers only see Approved answers that have not expired. Leave Incident blank for county-wide answers.</span><span class="sp"></span><button class="btn pri" data-act="hlInfoNew">' + I('plus') + 'Talking point</button></div>' + tpHtml(false);
  }
  function infoForm(r) {
    OPS.edit('info', r, { defaults: r ? null : { status: 'Draft', effective: Date.now(), topic: 'Information request' },
      top: '<label class="chk" style="margin-bottom:8px"><input type="checkbox" id="hlCounty"' + (r && !r.incident_key ? ' checked' : '') + '> County-wide (use in every incident)</label>',
      before: function (at, old, bg) { var cw = bg.querySelector('#hlCounty').checked; if (cw) { at.incident_key = null; at.incident_name = null; at.practice = null; } else if (!old.OBJECTID) Object.assign(at, OPS.incFix()); if (at.status === 'Approved' && !at.approved_by) at.approved_by = OPS.me(); return at; },
      after: function () { OPS.bust('info'); } });
  }
  OPS.act.hlInfoNew = function () { infoForm(null); };

  // keyboard: N starts a new call from anywhere in the Hotline
  document.addEventListener('keydown', function (e) {
    if (OPS.st.tool !== 'hotline' || document.getElementById('modal') || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
    if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); OPS.act.hlNew(); }
  });
})(window.CP);
