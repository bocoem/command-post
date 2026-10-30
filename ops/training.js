/* EM OPS — Training & Exercises: NIMS training records, HSEEP exercises and AARs, improvement plan */
(function (CP) {
  'use strict';
  var OPS = CP.ops, A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon, K = OPS.LISTS;
  var CORE = ['IS-100', 'IS-200', 'IS-700', 'IS-800', 'ICS-300', 'ICS-400'];
  function tr() { return OPS.load('training:all', function () { return OPS.rows('training', '1=1', { order: 'person', n: 10000 }); }); }
  function ex() { return OPS.load('exercises', function () { return OPS.rows('exercises', '1=1', { order: 'ex_date DESC', n: 1000 }); }); }
  function ip() { return OPS.load('improve', function () { return OPS.rows('improve', '1=1', { order: 'due', n: 3000 }); }); }

  OPS.tool('training', {
    n: 'Training & Exercises', sub: 'NIMS · HSEEP · Improvement Plan', icon: 'target', d: 'NIMS/ICS training records and expirations, HSEEP exercises and after-action reports (including real incidents), and the improvement plan.',
    nums: async function () { var o = await OPS.count('improve', "status IN ('Open','In Progress')"), od = await OPS.count('improve', "status IN ('Open','In Progress') AND due < CURRENT_TIMESTAMP"), e = await OPS.count('exercises', "status IN ('Planning','Scheduled')"); return [[o, 'open IP items'], [od, 'overdue', od ? 'bad-t' : ''], [e, 'exercises planned']]; },
    render: function () {
      var u = OPS.st.ui, tab = u.tt || 'ex';
      var h = '<div class="phead"><div><h1 class="pg">Training & Exercises</h1><p class="pgsub" style="margin:0">Records in ArcGIS (OPS_Training, OPS_Exercises, OPS_ImprovementPlan). Training feeds volunteer credentials and check-in qualifications.</p></div><div class="acts"><button class="btn sm" data-act="aarFromInc">' + I('report') + 'AAR from an incident</button><button class="btn sm" data-act="trNew">' + I('plus') + 'Training record</button><button class="btn pri" data-act="exNew">' + I('plus') + 'Exercise</button></div></div>';
      var t = tr(), e = ex(), p = ip();
      h += OPS.tabs('tt', [['ex', 'Exercises & AARs', Array.isArray(e) ? e.length : ''], ['ip', 'Improvement plan', Array.isArray(p) ? p.filter(function (x) { return x.status === 'Open' || x.status === 'In Progress'; }).length : ''], ['tr', 'Training records', Array.isArray(t) ? t.length : ''], ['nims', 'NIMS matrix']], tab);
      if (tab === 'ex') h += OPS.bad(e) ? OPS.wait(e) : OPS.table({ k: 'exercises', rows: e, cols: ['name', 'ex_type', 'ex_date', 'hazard', 'status', { f: 'ipn', l: 'IP items', fmt: function (x) { var n = (Array.isArray(p) ? p : []).filter(function (i) { return i.exercise_id === String(x.OBJECTID); }); return n.length ? n.filter(function (i) { return i.status !== 'Complete'; }).length + ' open / ' + n.length : ''; } }], actions: function (x) { return '<button class="btn xs ghost" data-act="exPrint" data-a="' + x.OBJECTID + '">' + I('print') + 'AAR/IP</button>'; }, empty: 'No exercises yet.' });
      else if (tab === 'ip') {
        h += '<div class="toolbar">' + OPS.seg('ipf', ['Open', 'All', 'Complete'], u.ipf || 'Open') + '<span class="sp"></span><button class="btn sm pri" data-act="ipNew">' + I('plus') + 'Improvement item</button></div>';
        h += OPS.bad(p) ? OPS.wait(p) : OPS.table({ k: 'improve', rows: p.filter(function (x) { var f = u.ipf || 'Open'; return f === 'All' || (f === 'Open' ? x.status !== 'Complete' && x.status !== 'Deferred' : x.status === f); }), cols: ['source', 'capability', 'issue', 'action', 'owner', { f: 'due', l: 'Due', fmt: function (x) { return x.due ? '<span class="' + (x.due < Date.now() && x.status !== 'Complete' ? 'bad-t' : '') + '">' + E(OPS.d(x.due)) + '</span>' : ''; } }, 'status'], rowCls: function (x) { return x.due && x.due < Date.now() && x.status !== 'Complete' ? 'row-bad' : ''; }, empty: 'No improvement items.' });
      } else if (tab === 'tr') {
        h += '<div class="toolbar">' + OPS.searchBox('tr', 'Search person, course, agency') + '<span class="sp"></span><button class="btn sm" data-act="trCsv">' + I('down') + 'CSV</button></div>';
        h += OPS.bad(t) ? OPS.wait(t) : OPS.table({ k: 'training', rows: t, q: u.q_tr, rowCls: function (x) { return x.expires && x.expires < Date.now() ? 'row-bad' : ''; } });
      } else h += OPS.bad(t) ? OPS.wait(t) : matrix(t);
      return h;
    }
  });
  function matrix(t) {
    var ppl = {}; t.forEach(function (x) { var k = x.person; (ppl[k] = ppl[k] || { agency: x.agency, c: {} }).c[x.course] = x; });
    var names = Object.keys(ppl).sort();
    if (!names.length) return '<div class="empty">No training records yet.</div>';
    var full = names.filter(function (n) { return CORE.slice(0, 4).every(function (c) { return ppl[n].c[c]; }); }).length;
    return '<div class="grid g4" style="margin-bottom:10px">' + OPS.stat(names.length, 'People') + OPS.stat(full, 'Have 100/200/700/800', 'green') + OPS.stat(names.filter(function (n) { return ppl[n].c['ICS-300']; }).length, 'ICS-300') + OPS.stat(names.filter(function (n) { return ppl[n].c['ICS-400']; }).length, 'ICS-400') + '</div>' +
      '<div class="tbl-wrap"><table class="t"><thead><tr><th>Person</th><th>Agency</th>' + CORE.map(function (c) { return '<th style="text-align:center">' + c + '</th>'; }).join('') + '<th>Other</th></tr></thead><tbody>' + names.map(function (n) { var p = ppl[n]; return '<tr><td><b>' + E(n) + '</b></td><td>' + E(p.agency || '') + '</td>' + CORE.map(function (c) { var x = p.c[c]; return '<td style="text-align:center">' + (x ? '<span class="' + (x.expires && x.expires < Date.now() ? 'bad-t' : 'ok-t') + '">' + I('check') + '</span>' : '<span class="dim">—</span>') + '</td>'; }).join('') + '<td style="font-size:12px">' + E(Object.keys(p.c).filter(function (c) { return CORE.indexOf(c) < 0; }).join(', ')) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  OPS.act.trNew = function () { OPS.edit('training', null, { after: function () { OPS.bust('training'); } }); };
  OPS.act.trCsv = function () { var t = tr(); if (Array.isArray(t)) OPS.csv('Training records', 'training', t); };
  OPS.act.exNew = function () { OPS.edit('exercises', null, { defaults: { status: 'Planning', ex_type: 'Tabletop (TTX)' }, after: function () { OPS.bust('exercises'); } }); };
  OPS.act.ipNew = function (exId) { var e = Array.isArray(ex()) ? ex() : []; var x = exId ? e.find(function (z) { return String(z.OBJECTID) === String(exId); }) : null; OPS.edit('improve', null, { defaults: { status: 'Open', exercise_id: x ? String(x.OBJECTID) : null, source: x ? x.name : 'General' }, after: function () { OPS.bust('improve'); } }); };
  OPS.tools.training.edit = { exercises: function (x) { var p = OPS.arr(ip()).filter(function (i) { return i.exercise_id === String(x.OBJECTID); }); OPS.edit('exercises', x, { bottom: '<div class="fgrp">Improvement items (' + p.length + ')</div>' + (p.map(function (i) { return '<div style="margin-bottom:4px">' + OPS.chip(i.status) + ' ' + E(i.issue) + ' <span class="dim">· ' + E(i.owner || '') + '</span></div>'; }).join('') || '<span class="dim">None yet.</span>'), buttons: [{ label: I('plus') + 'Improvement item', fn: function () { setTimeout(function () { OPS.act.ipNew(x.OBJECTID); }, 30); } }, { label: I('print') + 'AAR/IP', fn: function () { OPS.act.exPrint(x.OBJECTID); return false; } }], after: function () { OPS.bust('exercises'); } }); } };
  OPS.act.exPrint = function (oid) {
    var x = OPS.arr(ex()).find(function (z) { return z.OBJECTID === +oid; }); if (!x) return; var p = OPS.arr(ip()).filter(function (i) { return i.exercise_id === String(x.OBJECTID); });
    OPS.print('After-Action Report / Improvement Plan', E(x.name) + ' · ' + E(x.ex_type || '') + ' · ' + E(OPS.d(x.ex_date)),
      OPS.ptable(['Exercise / event', 'Type', 'Date', 'Hazard / scenario', 'Participants', 'Grant'], [[x.name, x.ex_type, OPS.d(x.ex_date), x.hazard, (x.participant_count || '') + ' ' + (x.participants || ''), x.grant]]) +
      '<h2>Core capabilities</h2><p>' + E(x.capabilities || '') + '</p><h2>Objectives</h2><p>' + E(x.objectives || '').replace(/\n/g, '<br>') + '</p><h2>Strengths</h2><p>' + E(x.strengths || '').replace(/\n/g, '<br>') + '</p><h2>Summary</h2><p>' + E(x.summary || '').replace(/\n/g, '<br>') + '</p>' +
      '<h2>Improvement plan</h2>' + OPS.ptable(['Core capability', 'Issue / area for improvement', 'Corrective action', 'Responsible', 'Due', 'Status'], p.map(function (i) { return [i.capability, i.issue, i.action, i.owner, OPS.d(i.due), i.status]; })));
  };
  // AAR from a real Command Post incident
  OPS.act.aarFromInc = function () {
    var list = OPS.incList; if (!list.length) { U.toast('No Command Post incidents', 'err'); return; }
    U.modal('After-action report from an incident', '<label class="f"><span>Incident</span><select class="in" name="k">' + list.map(function (a) { return '<option value="' + E(a.incident_key) + '"' + (OPS.inc && OPS.inc.key === a.incident_key ? ' selected' : '') + '>' + E(a.incident_name) + ' · ' + E(a.incident_number) + ' (' + E(a.status) + ')</option>'; }).join('') + '</select></label><p class="dim">Creates an AAR record with the incident\'s timeline, size and Ops numbers filled in. Add strengths and improvement items after.</p>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Create AAR', cls: 'pri', fn: function (bg) { make(U.val(bg, 'k')).catch(function (e) { U.toast(E(e.message), 'err'); }); } }]);
    async function make(key) {
      var d = await A.loadRemote(key); if (!d) throw new Error('Incident not found');
      var ci = await OPS.rows('checkins', 'incident_key=' + A.sq(key), { fields: 'persons', n: 3000 }).catch(function () { return []; });
      var cost = await OPS.rows('costs', 'incident_key=' + A.sq(key), { fields: 'amount', n: 5000 }).catch(function () { return []; });
      var log = CP.alive(d.log).sort(function (a, b) { return (a.ts || '').localeCompare(b.ts || ''); });
      var keyEvents = log.filter(function (l) { return /Decision|Safety|Event/.test(l.cat); }).slice(0, 30).map(function (l) { return CP.fmtDT(l.ts) + ' ' + l.text; }).join('\n');
      var sum = d.name + ' (' + d.type + ', Type ' + d.complexity + '), ' + CP.fmtDT(d.start) + (d.closed ? ' to ' + CP.fmtDT(d.closed) : ', still open') + '.\n' + (d.situation || '') + '\n\nResources: ' + CP.alive(d.resources).length + ' (' + ci.reduce(function (n, x) { return n + (x.persons || 1); }, 0) + ' people checked in). Requests: ' + CP.alive(d.requests).length + '. Log entries: ' + log.length + '. Costs tracked: ' + OPS.money(cost.reduce(function (n, x) { return n + (x.amount || 0); }, 0)) + '.\n\nKey events:\n' + keyEvents;
      var oid = await OPS.save('exercises', { name: 'AAR: ' + d.name, ex_type: 'Real incident (AAR)', ex_date: Date.parse(d.start), hazard: d.type, status: 'AAR Draft', summary: sum.slice(0, 4000), incident_key: key, participants: Array.from(new Set(CP.alive(d.resources).map(function (r) { return r.agency; }).filter(Boolean))).join(', ').slice(0, 1000) });
      OPS.bust('exercises'); OPS.st.ui.tt = 'ex'; OPS.repaint(); U.toast('AAR draft created', 'ok');
      setTimeout(function () { OPS.act.edit('exercises|' + oid); }, 600);
    }
  };
})(window.CP);
