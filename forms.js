/* COMMAND POST — ICS form engine.
   Every form is rendered from the one incident record, laid out after the FEMA NIMS ICS forms (block numbers match). */
(function (CP) {
  'use strict';
  var E = CP.esc, A = CP.alive;
  var F = CP.forms = {};

  // ---------- small builders ----------
  function v(x) { return '<span class="val">' + E(x == null ? '' : x) + '</span>'; }
  function vn(x) { return '<span class="val">' + CP.nl(x) + '</span>'; }
  function lb(n, t) { return '<span class="lb">' + (n ? n + '. ' : '') + t + '</span>'; }
  function cb(on) { return '<span class="cb">' + (on ? '✓' : '') + '</span>'; }
  function opBlock(op, n) {
    n = n || 2;
    return lb(n, 'Operational Period:') + '<table style="width:100%;font-size:9px;border-collapse:collapse"><tr><td>Date From: ' + v(op ? CP.fmtDate(op.start) : '') + '</td><td>Date To: ' + v(op ? CP.fmtDate(op.end) : '') + '</td></tr><tr><td>Time From: ' + v(op ? CP.fmtTime(op.start) : '') + '</td><td>Time To: ' + v(op ? CP.fmtTime(op.end) : '') + '</td></tr></table>';
  }
  function head(no, title) {
    return '<div class="ftitle"><h1>' + E(title) + ' (ICS ' + no + ')</h1><div class="brand"><img src="seal.png" alt="">BOTETOURT COUNTY<br>EMERGENCY MANAGEMENT</div></div>';
  }
  function page(no, title, inner, foot) {
    return '<div class="ics-page" data-form="' + no + '">' + head(no, title) + inner + '<div class="grow"></div><div class="ffoot"><span>ICS ' + no + '</span><span>' + (foot || '') + '</span><span>' + E(CP.FOOT || '') + '</span></div></div>';
  }
  function prep(inc, posKey, n, label) {
    var p = posKey ? CP.person(inc, posKey) : null, me = CP.me || {};
    var name = p ? p.name : (me.name || ''), pos = p ? CP.POS[posKey].t : (me.pos || (posKey ? CP.POS[posKey].t : ''));
    return '<table class="fx"><tr><td style="width:20%" class="shade">' + lb(n, label || 'Prepared by:') + '</td><td>Name: ' + v(name) + '</td><td>Position/Title: ' + v(pos) + '</td><td>Signature: <span class="sig"></span></td><td style="width:20%">Date/Time: ' + v(CP.fmtDT(CP.now())) + '</td></tr></table>';
  }
  function chunk(arr, n) { var out = []; for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out.length ? out : [[]]; }
  function pad(arr, n) { arr = arr.slice(); while (arr.length < n) arr.push(null); return arr; }
  function pName(inc, k, label) { var p = CP.person(inc, k, label); return p ? p.name : ''; }
  function pAll(inc, k) { return A(inc.org).filter(function (p) { return p.pos === k; }); }
  function op0(inc, o) { return (o && o.op) || CP.curOP(inc); }
  function topRow(inc, op, extra) {
    return '<table class="fx"><tr><td style="width:38%">' + lb(1, 'Incident Name:') + v(inc.name) + '</td><td>' + opBlock(op) + '</td>' + (extra || '') + '</tr></table>';
  }
  function contact(p) { return p ? [p.phone, p.radio, p.email].filter(Boolean).join(' / ') : ''; }

  // ---------- 201 Incident Briefing (4 pages) ----------
  F['201'] = function (inc, o) {
    var map = (o && o.mapImg) ? '<img src="' + o.mapImg + '">' : (inc.location.lat ? 'Location: ' + inc.location.lat.toFixed(5) + ', ' + inc.location.lng.toFixed(5) + (inc.location.desc ? ' — ' + E(inc.location.desc) : '') + '<br><br>(Attach map printed from the Map page)' : 'Map / sketch');
    var t = '<table class="fx"><tr><td style="width:45%">' + lb(1, 'Incident Name:') + v(inc.name) + '</td><td>' + lb(2, 'Incident Number:') + v(inc.number) + '</td><td>' + lb(3, 'Date/Time Initiated:') + 'Date: ' + v(CP.fmtDate(inc.start)) + ' Time: ' + v(CP.fmtTime(inc.start)) + '</td></tr></table>';
    var p1 = t + '<div class="blk">' + lb(4, 'Map/Sketch (include sketch, showing the total area of operations, the incident site/area, impacted and threatened areas, overflight results, trajectories, impacted shorelines, or other graphics depicting situational status and resource assignment):') + '<div class="mapimg" style="margin-top:4px">' + map + '</div></div>' +
      '<div class="blk" style="min-height:3in">' + lb(5, 'Situation Summary and Health and Safety Briefing (for briefings or transfer of command): Recognize potential incident Health and Safety Hazards and develop necessary measures (remove hazard, provide personal protective equipment, warn people of the hazard) to protect responders from those hazards.') + vn(inc.situation + (inc.healthSafety ? '\n\nHealth & Safety: ' + inc.healthSafety : '')) + '</div>' + prep(inc, 'IC', 6);
    var op = CP.curOP(inc);
    var objs = op ? A(op.objectives).map(function (x, i) { return (i + 1) + '. ' + x.text; }).join('\n') : '';
    var acts = A(inc.actions).concat(A(inc.log).filter(function (l) { return l.cat === 'Action' || l.cat === 'Decision'; })).slice().sort(function (a, b) { return (a.ts || '').localeCompare(b.ts || ''); });
    var p2 = t + '<div class="blk" style="min-height:2.4in">' + lb(7, 'Current and Planned Objectives:') + vn(objs) + '</div><div class="blk">' + lb(8, 'Current and Planned Actions, Strategies, and Tactics:') +
      '<table class="fx" style="margin-top:3px"><tr><th style="width:16%">Time:</th><th>Actions:</th></tr>' + pad(acts, 22).slice(0, Math.max(22, acts.length)).map(function (a) { return '<tr><td>' + v(a ? CP.fmtDT(a.ts) : '') + '</td><td>' + v(a ? a.text : '') + '</td></tr>'; }).join('') + '</table></div>' + prep(inc, 'IC', 6);
    var p3 = t + '<div class="blk">' + lb(9, 'Current Organization (fill in additional organization as appropriate):') + orgChart(inc, true) + '</div>' + prep(inc, 'IC', 6);
    var res = A(inc.resources);
    var pages4 = chunk(res, 26).map(function (rows) {
      return t + '<table class="fx" style="border-top:0"><tr><th colspan="6" style="text-align:left">10. Resource Summary</th></tr><tr><th style="width:20%">Resource</th><th style="width:18%">Resource Identifier</th><th style="width:13%">Date/Time Ordered</th><th style="width:9%">ETA</th><th style="width:7%">Arrived</th><th>Notes (location/assignment/status)</th></tr>' +
        pad(rows, 26).map(function (r) { return '<tr><td>' + v(r ? r.kind + (r.type ? ' T' + r.type : '') : '') + '</td><td>' + v(r ? r.name : '') + '</td><td>' + v(r ? CP.fmtDT(r.ordered) : '') + '</td><td>' + v(r ? CP.fmtTime(r.eta) : '') + '</td><td style="text-align:center">' + (r ? cb(!!r.checkin) : '') + '</td><td>' + v(r ? [r.status, assignName(inc, r.assign), r.location].filter(Boolean).join(' · ') : '') + '</td></tr>'; }).join('') + '</table>' + prep(inc, 'IC', 6);
    });
    var pages = [p1, p2, p3].concat(pages4);
    return pages.map(function (x, i) { return page('201', 'Incident Briefing', x, 'Page ' + (i + 1) + ' of ' + pages.length); }).join('');
  };

  function assignName(inc, id) { var a = CP.byId(inc.assignments, id); return a ? (a.division || a.group || a.branch || a.staging || '') : (id || ''); }
  F.assignName = assignName;

  // org chart used by 201 p3 and 207
  function orgChart(inc, compact) {
    function bx(k, lab, label) { var p = CP.person(inc, k, label); return '<div class="bx' + (compact === 'sub' ? ' sub' : '') + '"><b>' + E(lab || CP.POS[k].t) + (label ? ' — ' + E(label) : '') + '</b><span class="v">' + E(p ? p.name : '') + '</span></div>'; }
    function many(k) { return pAll(inc, k).map(function (p) { return '<div class="bx sub"><b>' + E(CP.POS[k].t.replace('Division/Group Supervisor', 'Div/Group') + (p.label ? ' ' + p.label : '')) + '</b><span class="v">' + E(p.name) + '</span></div>'; }).join(''); }
    var ics = A(inc.org).filter(function (p) { return p.pos === 'IC'; });
    var icBox = '<div class="bx" style="min-width:1.8in"><b>Incident Commander(s)' + (ics.length > 1 ? ' — Unified Command' : '') + '</b><span class="v">' + E(ics.map(function (p) { return p.name + (p.agency ? ' (' + p.agency + ')' : ''); }).join('; ')) + '</span></div>';
    var h = '<div class="chart"><div class="lv">' + icBox + '</div><div class="lv">' + bx('LOFR', 'Liaison Officer') + bx('SOFR', 'Safety Officer') + bx('PIO', 'Public Information Officer') + '</div><div class="lv" style="align-items:flex-start">';
    h += '<div class="col">' + bx('OSC') + bx('STAM', 'Staging Area Mgr') + many('OPBD') + many('DIVS') + (CP.person(inc, 'AOBD') ? bx('AOBD') : '') + '</div>';
    h += '<div class="col">' + bx('PSC') + bx('RESL', 'Resources Unit', null) + bx('SITL', 'Situation Unit') + bx('DOCL', 'Documentation Unit') + bx('DMOB', 'Demobilization Unit') + '</div>';
    h += '<div class="col">' + bx('LSC') + bx('SPUL', 'Supply Unit') + bx('FACL', 'Facilities Unit') + bx('GSUL', 'Ground Support Unit') + bx('COML', 'Communications Unit') + bx('MEDL', 'Medical Unit') + bx('FDUL', 'Food Unit') + '</div>';
    h += '<div class="col">' + bx('FSC') + bx('TIME', 'Time Unit') + bx('PROC', 'Procurement Unit') + bx('COMP', 'Comp/Claims Unit') + bx('COST', 'Cost Unit') + '</div>';
    return h + '</div></div>';
  }

  // ---------- 202 Incident Objectives ----------
  F['202'] = function (inc, o) {
    var op = op0(inc, o), it = (op && op.iapItems) || {};
    var objs = op ? A(op.objectives).map(function (x, i) { return (i + 1) + '. ' + x.text; }).join('\n') : '';
    var body = topRow(inc, op) +
      '<div class="blk" style="min-height:3.2in">' + lb(3, 'Objective(s):') + vn(objs) + '</div>' +
      '<div class="blk" style="min-height:2.3in">' + lb(4, 'Operational Period Command Emphasis:') + vn(op && op.emphasis) + '<br>' + lb('', 'General Situational Awareness') + vn(op && op.awareness) + '</div>' +
      '<div class="blk">' + lb(5, 'Site Safety Plan Required?') + ' Yes ' + cb(op && op.sspRequired) + ' No ' + cb(op && !op.sspRequired) + ' &nbsp; Approved Site Safety Plan(s) Located at: ' + v(op && op.sspLocation) + '</div>' +
      '<div class="blk">' + lb(6, 'Incident Action Plan (the items checked below are included in this Incident Action Plan):') +
      '<table style="width:100%;font-size:10px;margin-top:3px"><tr><td>' + cb(it['203']) + 'ICS 203</td><td>' + cb(it['207']) + 'ICS 207</td><td>Other Attachments:</td></tr><tr><td>' + cb(it['204']) + 'ICS 204</td><td>' + cb(it['208']) + 'ICS 208</td><td>' + v(op && op.otherAttachments) + '</td></tr><tr><td>' + cb(it['205']) + 'ICS 205</td><td>' + cb(it.map) + 'Map/Chart</td><td></td></tr><tr><td>' + cb(it['205A']) + 'ICS 205A</td><td>' + cb(it.weather) + 'Weather Forecast/Tides/Currents</td><td></td></tr><tr><td>' + cb(it['206']) + 'ICS 206</td><td></td><td></td></tr></table></div>' +
      prep(inc, 'PSC', 7) + '<table class="fx" style="border-top:0"><tr><td style="width:20%" class="shade">' + lb(8, 'Approved by Incident Commander:') + '</td><td>Name: ' + v(pName(inc, 'IC')) + '</td><td>Signature: <span class="sig"></span></td></tr></table>';
    return page('202', 'Incident Objectives', body, 'IAP Page ____');
  };

  // ---------- 203 Organization Assignment List ----------
  F['203'] = function (inc, o) {
    var op = op0(inc, o);
    function r(lab, k, label) { var p = CP.person(inc, k, label); return '<tr><td>' + E(lab) + '</td><td>' + v(p ? p.name : '') + '</td></tr>'; }
    function rows(list) { return list.map(function (x) { return r(x[0], x[1]); }).join(''); }
    function many(k, pre) { return pAll(inc, k).map(function (p) { return '<tr><td>' + E(pre + (p.label ? ' ' + p.label : '')) + '</td><td>' + v(p.name) + '</td></tr>'; }).join(''); }
    var ics = A(inc.org).filter(function (p) { return p.pos === 'IC'; });
    var left = '<table class="fx"><tr><th colspan="2" style="text-align:left">3. Incident Commander(s) and Command Staff:</th></tr>' +
      pad(ics, 2).map(function (p, i) { return '<tr><td style="width:45%">' + (i ? 'IC/UC' : 'IC/UCs') + '</td><td>' + v(p ? p.name + (p.agency ? ' (' + p.agency + ')' : '') : '') + '</td></tr>'; }).join('') +
      r('Deputy', 'DIC') + r('Safety Officer', 'SOFR') + r('Public Info. Officer', 'PIO') + r('Liaison Officer', 'LOFR') +
      '<tr><th colspan="2" style="text-align:left">4. Agency/Organization Representatives:</th></tr><tr><th>Agency/Organization</th><th>Name</th></tr>' +
      pad(pAll(inc, 'AREP'), 6).map(function (p) { return '<tr><td>' + v(p ? p.label || p.agency : '') + '</td><td>' + v(p ? p.name : '') + '</td></tr>'; }).join('') +
      '<tr><th colspan="2" style="text-align:left">5. Planning Section:</th></tr>' + rows([['Chief', 'PSC'], ['Deputy', 'DPSC'], ['Resources Unit', 'RESL'], ['Situation Unit', 'SITL'], ['Documentation Unit', 'DOCL'], ['Demobilization Unit', 'DMOB']]) +
      '<tr><td>Technical Specialists</td><td></td></tr>' + pad(pAll(inc, 'THSP'), 2).map(function (p) { return '<tr><td>' + v(p ? p.label : '') + '</td><td>' + v(p ? p.name : '') + '</td></tr>'; }).join('') +
      '<tr><th colspan="2" style="text-align:left">6. Logistics Section:</th></tr>' + rows([['Chief', 'LSC'], ['Deputy', 'DLSC']]) +
      '<tr><td colspan="2" class="shade"><b>Support Branch</b></td></tr>' + rows([['Director', 'SUBD'], ['Supply Unit', 'SPUL'], ['Facilities Unit', 'FACL'], ['Ground Support Unit', 'GSUL']]) +
      '<tr><td colspan="2" class="shade"><b>Service Branch</b></td></tr>' + rows([['Director', 'SVBD'], ['Communications Unit', 'COML'], ['Medical Unit', 'MEDL'], ['Food Unit', 'FDUL']]) + '</table>';
    var branches = pAll(inc, 'OPBD');
    var divs = pAll(inc, 'DIVS');
    var right = '<table class="fx"><tr><th colspan="2" style="text-align:left">7. Operations Section:</th></tr>' + rows([['Chief', 'OSC'], ['Deputy', 'DOSC']]) +
      pad(pAll(inc, 'STAM'), 1).map(function (p) { return '<tr><td>Staging Area' + (p && p.label ? ' ' + E(p.label) : '') + '</td><td>' + v(p ? p.name : '') + '</td></tr>'; }).join('');
    var bl = branches.length ? branches : [null];
    bl.forEach(function (b, bi) {
      right += '<tr><td colspan="2" class="shade"><b>Branch' + (b && b.label ? ' — ' + E(b.label) : '') + '</b></td></tr><tr><td>Branch Director</td><td>' + v(b ? b.name : '') + '</td></tr><tr><td>Deputy</td><td></td></tr>';
      var mine = divs.filter(function (d) { return b ? (d.branch === b.label || (!d.branch && bi === 0)) : true; });
      pad(mine, bi === 0 ? 5 : 3).forEach(function (d) { right += '<tr><td>Division/Group ' + v(d ? d.label : '') + '</td><td>' + v(d ? d.name : '') + '</td></tr>'; });
    });
    right += '<tr><td colspan="2" class="shade"><b>Air Operations Branch</b></td></tr><tr><td>Air Ops Branch Dir.</td><td>' + v(pName(inc, 'AOBD')) + '</td></tr>' +
      '<tr><th colspan="2" style="text-align:left">8. Finance/Administration Section:</th></tr>' + rows([['Chief', 'FSC'], ['Deputy', 'DFSC'], ['Time Unit', 'TIME'], ['Procurement Unit', 'PROC'], ['Comp/Claims Unit', 'COMP'], ['Cost Unit', 'COST']]) + '</table>';
    var body = topRow(inc, op) + '<div class="r" style="gap:0;align-items:flex-start"><div>' + left + '</div><div>' + right + '</div></div>' + prep(inc, 'RESL', 9);
    return page('203', 'Organization Assignment List', body, 'IAP Page ____');
  };

  // ---------- 204 Assignment List (one per division/group) ----------
  F['204'] = function (inc, o) {
    var op = op0(inc, o);
    var list = A(inc.assignments).filter(function (a) { return !o || !o.only || a.id === o.only; });
    if (!list.length) list = [{ id: '', branch: '', division: '', group: '', staging: '', work: '', special: '', comms: '' }];
    return list.map(function (a) {
      var res = A(inc.resources).filter(function (r) { return a.id && r.assign === a.id && r.status !== 'Demobilized' && r.status !== 'Released'; });
      var sup = A(inc.org).find(function (p) { return p.pos === 'DIVS' && p.label && (p.label === a.division || p.label === a.group); });
      var br = A(inc.org).find(function (p) { return p.pos === 'OPBD' && a.branch && p.label === a.branch; });
      var osc = CP.person(inc, 'OSC');
      var comms = A(inc.comms).filter(function (c) { return !a.channels || !a.channels.length || a.channels.indexOf(c.id) >= 0; });
      var body = '<table class="fx"><tr><td style="width:30%">' + lb(1, 'Incident Name:') + v(inc.name) + '</td><td style="width:38%">' + opBlock(op) + '</td><td>' + lb(3, '') +
        '<table style="width:100%;font-size:9px"><tr><td><b>Branch:</b> ' + v(a.branch) + '</td></tr><tr><td><b>Division:</b> ' + v(a.division) + '</td></tr><tr><td><b>Group:</b> ' + v(a.group) + '</td><td><b>Staging Area:</b> ' + v(a.staging) + '</td></tr></table></td></tr></table>' +
        '<table class="fx" style="border-top:0"><tr><th colspan="3" style="text-align:left">4. Operations Personnel:</th></tr><tr><th style="width:34%"></th><th>Name</th><th>Contact Number(s)</th></tr>' +
        '<tr><td>Operations Section Chief:</td><td>' + v(osc ? osc.name : '') + '</td><td>' + v(contact(osc)) + '</td></tr>' +
        '<tr><td>Branch Director:</td><td>' + v(br ? br.name : '') + '</td><td>' + v(contact(br)) + '</td></tr>' +
        '<tr><td>Division/Group Supervisor:</td><td>' + v(sup ? sup.name : a.supervisor || '') + '</td><td>' + v(contact(sup)) + '</td></tr></table>' +
        '<table class="fx" style="border-top:0"><tr><th colspan="6" style="text-align:left">5. Resources Assigned:</th></tr><tr><th style="width:20%">Resource Identifier</th><th style="width:17%">Leader</th><th style="width:7%"># of Persons</th><th style="width:20%">Contact (e.g., phone, pager, radio frequency, etc.)</th><th>Reporting Location, Special Equipment and Supplies, Remarks, Notes, Information</th></tr>' +
        pad(res, 10).map(function (r) { return '<tr><td>' + v(r ? r.name + (r.kind ? ' (' + r.kind + ')' : '') : '') + '</td><td>' + v(r ? r.leader : '') + '</td><td>' + v(r ? r.persons : '') + '</td><td>' + v(r ? r.contact : '') + '</td><td>' + v(r ? [a.reportTo, r.notes].filter(Boolean).join(' · ') : '') + '</td></tr>'; }).join('') + '</table>' +
        '<div class="blk" style="min-height:1.5in">' + lb(6, 'Work Assignments:') + vn(a.work) + '</div>' +
        '<div class="blk" style="min-height:1in">' + lb(7, 'Special Instructions:') + vn(a.special) + '</div>' +
        '<table class="fx" style="border-top:0"><tr><th colspan="3" style="text-align:left">8. Communications (radio and/or phone contact numbers needed for this assignment):</th></tr><tr><th>Name/Function</th><th colspan="2">Primary Contact: indicate cell, pager, or radio (frequency/system/channel)</th></tr>' +
        pad(comms, 4).slice(0, Math.max(4, comms.length)).map(function (c) { return '<tr><td>' + v(c ? c.name + ' / ' + c.fn : '') + '</td><td colspan="2">' + v(c ? ['Ch ' + c.ch, c.rx && 'RX ' + c.rx, c.remarks].filter(Boolean).join(' · ') : '') + '</td></tr>'; }).join('') + '</table>' +
        prep(inc, 'RESL', 9) + '<table class="fx" style="border-top:0"><tr><td class="shade" style="width:20%"><b>Approved by (OSC):</b></td><td>Name: ' + v(pName(inc, 'OSC')) + '</td><td>Signature: <span class="sig"></span></td></tr></table>';
      return page('204', 'Assignment List', body, 'IAP Page ____');
    }).join('');
  };

  // ---------- 205 Radio Communications Plan ----------
  F['205'] = function (inc, o) {
    var op = op0(inc, o), ch = A(inc.comms);
    return chunk(ch, 16).map(function (rows, pi, all) {
      var body = '<table class="fx"><tr><td style="width:30%">' + lb(1, 'Incident Name:') + v(inc.name) + '</td><td style="width:22%">' + lb(2, 'Date/Time Prepared:') + 'Date: ' + v(CP.fmtDate(CP.now())) + ' Time: ' + v(CP.fmtTime(CP.now())) + '</td><td>' + opBlock(op, 3) + '</td></tr></table>' +
        '<table class="fx" style="border-top:0;font-size:9.5px"><tr><th colspan="11" style="text-align:left">4. Basic Radio Channel Use:</th></tr><tr><th style="width:6%">Zone Grp.</th><th style="width:5%">Ch #</th><th style="width:10%">Function</th><th style="width:14%">Channel Name/Trunked Radio System Talkgroup</th><th style="width:13%">Assignment</th><th style="width:8%">RX Freq N or W</th><th style="width:7%">RX Tone/NAC</th><th style="width:8%">TX Freq N or W</th><th style="width:7%">TX Tone/NAC</th><th style="width:6%">Mode (A, D, or M)</th><th>Remarks</th></tr>' +
        pad(rows, 16).map(function (c) { return '<tr style="height:.32in">' + (c ? [c.zone, c.ch, c.fn, c.name, c.assign, c.rx, c.rxTone, c.tx, c.txTone, c.mode, c.remarks] : ['', '', '', '', '', '', '', '', '', '', '']).map(function (x) { return '<td>' + v(x) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>' +
        '<div class="blk" style="min-height:1in">' + lb(5, 'Special Instructions:') + vn(inc.commsNotes) + '</div>' + prep(inc, 'COML', 6, 'Prepared by (Communications Unit Leader):');
      return page('205', 'Incident Radio Communications Plan', body, 'IAP Page ____');
    }).join('');
  };

  // ---------- 205A Communications List ----------
  F['205A'] = function (inc, o) {
    var op = op0(inc, o);
    var list = A(inc.org).filter(function (p) { return p.name; }).map(function (p) { return { pos: CP.POS[p.pos] ? CP.POS[p.pos].t + (p.label ? ' — ' + p.label : '') : p.pos, name: p.name, how: contact(p) }; })
      .concat(A(inc.contacts).map(function (c) { return { pos: c.pos, name: c.name, how: c.how }; }))
      .sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    return chunk(list, 30).map(function (rows) {
      var body = topRow(inc, op) + '<table class="fx" style="border-top:0"><tr><th colspan="3" style="text-align:left">3. Basic Local Communications Information:</th></tr><tr><th style="width:32%">Incident Assigned Position</th><th style="width:28%">Name (Alphabetized)</th><th>Method(s) of Contact (phone, pager, cell, etc.)</th></tr>' +
        pad(rows, 30).map(function (r) { return '<tr><td>' + v(r ? r.pos : '') + '</td><td>' + v(r ? r.name : '') + '</td><td>' + v(r ? r.how : '') + '</td></tr>'; }).join('') + '</table>' + prep(inc, 'COML', 4);
      return page('205A', 'Communications List', body, 'IAP Page ____');
    }).join('');
  };

  // ---------- 206 Medical Plan ----------
  F['206'] = function (inc, o) {
    var op = op0(inc, o), m = inc.medical || {};
    var body = topRow(inc, op) +
      '<table class="fx" style="border-top:0"><tr><th colspan="4" style="text-align:left">3. Medical Aid Stations:</th></tr><tr><th style="width:26%">Name</th><th style="width:30%">Location</th><th>Contact Number(s)/Frequency</th><th style="width:14%">Paramedics on Site?</th></tr>' +
      pad(A(m.aid), 4).map(function (r) { return '<tr><td>' + v(r ? r.name : '') + '</td><td>' + v(r ? r.location : '') + '</td><td>' + v(r ? r.contact : '') + '</td><td>' + (r ? cb(r.medic === 'Yes') + 'Yes ' + cb(r.medic !== 'Yes') + 'No' : cb() + 'Yes ' + cb() + 'No') + '</td></tr>'; }).join('') + '</table>' +
      '<table class="fx" style="border-top:0"><tr><th colspan="4" style="text-align:left">4. Transportation (indicate air or ground):</th></tr><tr><th style="width:26%">Ambulance Service</th><th style="width:30%">Location</th><th>Contact Number(s)/Frequency</th><th style="width:14%">Level of Service</th></tr>' +
      pad(A(m.transport), 4).map(function (r) { return '<tr><td>' + v(r ? r.name + (r.air ? ' (' + r.air + ')' : '') : '') + '</td><td>' + v(r ? r.location : '') + '</td><td>' + v(r ? r.contact : '') + '</td><td>' + (r ? cb(r.level === 'ALS') + 'ALS ' + cb(r.level === 'BLS') + 'BLS' : cb() + 'ALS ' + cb() + 'BLS') + '</td></tr>'; }).join('') + '</table>' +
      '<table class="fx" style="border-top:0;font-size:9.5px"><tr><th colspan="7" style="text-align:left">5. Hospitals:</th></tr><tr><th style="width:18%">Hospital Name</th><th style="width:22%">Address, Latitude &amp; Longitude if Helipad</th><th style="width:14%">Contact Number(s)/Frequency</th><th style="width:11%">Travel Time<br>Air / Ground</th><th style="width:12%">Trauma Center</th><th style="width:9%">Burn Center</th><th>Helipad</th></tr>' +
      pad(A(m.hospitals), 5).map(function (r) { return '<tr><td>' + v(r ? r.name : '') + '</td><td>' + v(r ? r.address : '') + '</td><td>' + v(r ? r.contact : '') + '</td><td>' + v(r ? (r.air || '—') + ' / ' + (r.ground || '—') + ' min' : '') + '</td><td>' + v(r ? r.trauma : '') + '</td><td>' + v(r ? r.burn : '') + '</td><td>' + v(r ? r.helipad : '') + '</td></tr>'; }).join('') + '</table>' +
      '<div class="blk" style="min-height:2.2in">' + lb(6, 'Special Medical Emergency Procedures:') + vn(m.procedures) + '<div style="margin-top:6px">' + cb(m.aviation) + ' Check box if aviation assets are utilized for rescue. If assets are used, coordinate with Air Operations.</div></div>' +
      prep(inc, 'MEDL', 7, 'Prepared by (Medical Unit Leader):') + '<table class="fx" style="border-top:0"><tr><td class="shade" style="width:20%">' + lb(8, 'Approved by (Safety Officer):') + '</td><td>Name: ' + v(pName(inc, 'SOFR')) + '</td><td>Signature: <span class="sig"></span></td></tr></table>';
    return page('206', 'Medical Plan', body, 'IAP Page ____');
  };

  // ---------- 207 Incident Organization Chart ----------
  F['207'] = function (inc, o) {
    var op = op0(inc, o);
    var body = topRow(inc, op) + '<div class="blk" style="flex:1">' + lb(3, 'Organization Chart') + orgChart(inc) + '</div>' + prep(inc, 'RESL', 4);
    return page('207', 'Incident Organization Chart', body, 'IAP Page ____');
  };

  // ---------- 208 Safety Message/Plan ----------
  F['208'] = function (inc, o) {
    var op = op0(inc, o);
    var hz = A(inc.hazards).map(function (h) { return '• ' + [h.area, h.hazard].filter(Boolean).join(': ') + (h.mitigation ? ' — ' + h.mitigation : ''); }).join('\n');
    var body = topRow(inc, op) + '<div class="blk" style="min-height:6.6in">' + lb(3, 'Safety Message/Expanded Safety Message, Safety Plan, Site Safety Plan:') + vn((op && op.safetyMsg) || '') + (hz ? '<br><b>Identified hazards and mitigations (from ICS 215A):</b>' + vn(hz) : '') + '</div>' +
      '<div class="blk">' + lb(4, 'Site Safety Plan Required?') + ' Yes ' + cb(op && op.sspRequired) + ' No ' + cb(op && !op.sspRequired) + ' &nbsp; Approved Site Safety Plan(s) Located At: ' + v(op && op.sspLocation) + '</div>' + prep(inc, 'SOFR', 5);
    return page('208', 'Safety Message/Plan', body, 'IAP Page ____');
  };

  // ---------- 209 Incident Status Summary ----------
  F['209'] = function (inc, o) {
    var s = inc.s209 || {}, op = op0(inc, o), x = (o && o.live) || CP.liveSummary || {};
    var ics = A(inc.org).filter(function (p) { return p.pos === 'IC'; }).map(function (p) { return p.name + (p.agency ? ' (' + p.agency + ')' : ''); }).join('; ');
    var cx = CP.COMPLEXITY.find(function (c) { return c.v === inc.complexity; });
    var p1 = '<table class="fx"><tr><td style="width:28%">' + lb(1, 'Incident Name:') + v(inc.name) + '</td><td style="width:22%">' + lb(2, 'Incident Number:') + v(inc.number) + '</td><td>' + lb(3, 'Report Version (check one box on left):') + cb(s.version === 'Initial') + 'Initial ' + cb(s.version === 'Update') + 'Update ' + cb(s.version === 'Final') + 'Final &nbsp; Report #: ' + v(s.reportNo) + '</td></tr>' +
      '<tr><td>' + lb(4, 'Incident Commander(s) &amp; Agency or Organization:') + v(ics) + '</td><td>' + lb(5, 'Incident Management Organization:') + v(cx ? cx.label + ' IMT' : '') + '</td><td>' + lb(6, 'Incident Start Date/Time:') + 'Date: ' + v(CP.fmtDate(inc.start)) + ' Time: ' + v(CP.fmtTime(inc.start)) + ' Time Zone: ' + v('ET') + '</td></tr>' +
      '<tr><td>' + lb(7, 'Current Incident Size or Area Involved:') + v(s.size) + '</td><td>' + lb(8, 'Percent (%) Contained / Completed:') + v(s.pctComplete) + '</td><td>' + lb(9, 'Incident Definition:') + v(s.definition || inc.type) + ' &nbsp; ' + lb(10, 'Incident Complexity Level:') + v(cx ? cx.label : '') + '</td></tr>' +
      '<tr><td colspan="2">' + lb(11, 'For Time Period:') + 'From: ' + v(op ? CP.fmtDT(op.start) : '') + ' To: ' + v(op ? CP.fmtDT(op.end) : '') + '</td><td></td></tr></table>' +
      '<table class="fx" style="border-top:0"><tr><th colspan="4" style="text-align:left">Approval &amp; Routing Information</th></tr><tr><td>' + lb(12, 'Prepared By:') + v(pName(inc, 'SITL') || pName(inc, 'PSC') || (CP.me || {}).name) + '</td><td>' + lb(13, 'Date/Time Submitted:') + v(CP.fmtDT(CP.now())) + '</td><td>' + lb(14, 'Approved By:') + v(pName(inc, 'IC')) + '</td><td>' + lb(15, 'Primary Location, Organization, or Agency Sent To:') + v(s.sentTo) + '</td></tr></table>' +
      '<table class="fx" style="border-top:0"><tr><th colspan="4" style="text-align:left">Incident Location Information</th></tr><tr><td>' + lb(16, 'State:') + v('VA') + '</td><td>' + lb(17, 'County/Parish/Borough:') + v('Botetourt') + '</td><td>' + lb(18, 'City:') + v(inc.location.city || '') + '</td><td>' + lb(19, 'Unit or Other:') + v('Botetourt County EM') + '</td></tr>' +
      '<tr><td>' + lb(20, 'Incident Jurisdiction:') + v(inc.location.jurisdiction) + '</td><td>' + lb(21, 'Incident Location Ownership:') + v(inc.location.ownership || 'Mixed') + '</td><td colspan="2">' + lb(22, 'Longitude (indicate format) / Latitude:') + v(inc.location.lat ? 'Lat ' + inc.location.lat.toFixed(5) + ', Long ' + inc.location.lng.toFixed(5) + ' (decimal degrees, WGS84)' : '') + '</td></tr>' +
      '<tr><td colspan="4">' + lb(25, 'Short Location or Area Description (list all affected areas or a reference point):') + v(inc.location.desc + (inc.location.address ? ' — ' + inc.location.address : '')) + '</td></tr>' +
      '<tr><td colspan="4">' + lb(27, 'Note any electronic geospatial data included or attached:') + v(inc.arc && inc.arc.linked ? 'Incident point/area and facilities published to Botetourt County ArcGIS Online (Incidents, Incident Facilities layers).' : '') + '</td></tr></table>' +
      '<table class="fx" style="border-top:0"><tr><th style="text-align:left">Incident Summary</th></tr><tr><td style="height:1.6in">' + lb(28, 'Observed Fire Behavior or Significant Events for the Time Period Reported:') + vn(s.events || inc.situation) + '</td></tr><tr><td style="height:.7in">' + lb(29, 'Primary Fuel Model, Materials, or Hazards Involved:') + vn(s.hazards) + '</td></tr></table>';
    var d = s.dmg || {};
    function dr(k, lab) { var r = d[k] || {}; return '<tr><td>' + lab + '</td><td>' + v(r.thr) + '</td><td>' + v(r.dmg) + '</td><td>' + v(r.des) + '</td></tr>'; }
    p1 += '<table class="fx" style="border-top:0"><tr><th style="width:40%;text-align:left">30. Damage Assessment Information</th><th>A. # Threatened (72 hrs)</th><th>B. # Damaged</th><th>C. # Destroyed</th></tr>' +
      dr('res', 'D. Single Residences') + dr('com', 'E. Nonresidential Commercial Property') + dr('minor', 'F. Other Minor Structures') + dr('other', 'G. Other') + '</table>';
    var pages = [p1];
    var pub = s.pub || {}, rsp = s.resp || {};
    function sr(obj, k, lab) { var r = obj[k] || {}; return '<tr><td>' + lab + '</td><td>' + v(r.a) + '</td><td>' + v(r.b) + '</td></tr>'; }
    var tm = s.threatMgmt || {};
    var TM = ['No Likely Threat', 'Potential Future Threat', 'Mass Notifications in Progress', 'Mass Notifications Completed', 'No Evacuation(s) Imminent', 'Planning for Evacuation', 'Planning for Shelter-in-Place', 'Evacuation(s) in Progress', 'Shelter-in-Place in Progress', 'Repopulation in Progress', 'Mass Immunization in Progress', 'Mass Immunization Complete', 'Quarantine in Progress', 'Area Restriction in Effect'];
    var p2 = '<table class="fx"><tr><td>' + lb(1, 'Incident Name:') + v(inc.name) + '</td><td>' + lb(2, 'Incident Number:') + v(inc.number) + '</td></tr></table>' +
      '<div class="r" style="gap:0;align-items:flex-start"><div><table class="fx" style="border-top:0"><tr><th style="text-align:left;width:56%">31. Public Status Summary:</th><th>A. # This Reporting Period</th><th>B. Total # to Date</th></tr>' +
      sr(pub, 'fat', 'C. Fatalities') + sr(pub, 'inj', 'D. With Injuries/Illness') + sr(pub, 'trap', 'E. Trapped/In Need of Rescue') + sr(pub, 'miss', 'F. Missing') + sr(pub, 'evac', 'G. Evacuated') + sr(pub, 'sip', 'H. Sheltering in Place') + sr(pub, 'shel', 'I. In Temporary Shelters') + sr(pub, 'imm', 'J. Have Received Mass Immunizations') + sr(pub, 'reqimm', 'K. Require Immunizations') + sr(pub, 'quar', 'L. In Quarantine') + sr(pub, 'tot', 'M. Total # Civilians (Public) Affected') + '</table></div>' +
      '<div><table class="fx" style="border-top:0"><tr><th style="text-align:left;width:56%">32. Responder Status Summary:</th><th>A. # This Reporting Period</th><th>B. Total # to Date</th></tr>' +
      sr(rsp, 'fat', 'C. Fatalities') + sr(rsp, 'inj', 'D. With Injuries/Illness') + sr(rsp, 'trap', 'E. Trapped/In Need of Rescue') + sr(rsp, 'miss', 'F. Missing') + sr(rsp, 'sip', 'G. Sheltering in Place') + sr(rsp, 'imm', 'H. Have Received Immunizations') + sr(rsp, 'reqimm', 'I. Require Immunizations') + sr(rsp, 'quar', 'J. In Quarantine') + sr(rsp, 'tot', 'K. Total # Responders Affected') + '</table></div></div>' +
      '<table class="fx" style="border-top:0"><tr><td style="width:50%;height:1.4in">' + lb(33, 'Life, Safety, and Health Status/Threat Remarks:') + vn(s.lshRemarks) + '</td><td>' + lb(34, 'Life, Safety, and Health Threat Management:') + '<div style="columns:2;font-size:9px">' + TM.map(function (t, i) { return '<div>' + String.fromCharCode(65 + i) + '. ' + t + ' ' + cb(tm[t]) + '</div>'; }).join('') + '</div></td></tr>' +
      '<tr><td colspan="2" style="height:1in">' + lb(35, 'Weather Concerns (synopsis of current and predicted weather; discuss related factors that may cause concern):') + vn(s.weatherConcerns || (op && op.weather)) + '</td></tr>' +
      '<tr><td colspan="2">' + lb(36, 'Projected Incident Activity, Potential, Movement, Escalation, or Spread and influencing factors during the next operational period and in 12-, 24-, 48-, and 72-hour timeframes:') + '<table style="width:100%;font-size:9.5px"><tr><td style="width:14%"><b>12 hours:</b></td><td>' + v(s.proj12) + '</td></tr><tr><td><b>24 hours:</b></td><td>' + v(s.proj24) + '</td></tr><tr><td><b>48 hours:</b></td><td>' + v(s.proj48) + '</td></tr><tr><td><b>72 hours:</b></td><td>' + v(s.proj72) + '</td></tr><tr><td><b>After 72 hrs:</b></td><td>' + v(s.projAfter) + '</td></tr></table></td></tr>' +
      '<tr><td colspan="2" style="height:1.1in">' + lb(37, 'Strategic Objectives (define planned end-state for incident):') + vn(s.strategic || ((op && A(op.objectives).map(function (x, i) { return (i + 1) + '. ' + x.text; }).join('\n')) || '')) + '</td></tr></table>';
    pages.push(p2);
    var p3 = '<table class="fx"><tr><td>' + lb(1, 'Incident Name:') + v(inc.name) + '</td><td>' + lb(2, 'Incident Number:') + v(inc.number) + '</td></tr></table>' +
      '<table class="fx" style="border-top:0">' +
      '<tr><td>' + lb(38, 'Current Incident Threat Summary and Risk Information in 12-, 24-, 48-, and 72-hour timeframes and beyond:') + '<table style="width:100%;font-size:9.5px">' + [['12 hours', s.threat12], ['24 hours', s.threat24], ['48 hours', s.threat48], ['72 hours', s.threat72], ['After 72 hrs', s.threatAfter]].map(function (r) { return '<tr><td style="width:14%"><b>' + r[0] + ':</b></td><td>' + v(r[1]) + '</td></tr>'; }).join('') + '</table></td></tr>' +
      '<tr><td>' + lb(39, 'Critical Resource Needs in 12-, 24-, 48-, and 72-hour timeframes and beyond to meet critical incident objectives:') + '<table style="width:100%;font-size:9.5px">' + [['12 hours', s.need12], ['24 hours', s.need24], ['48 hours', s.need48], ['72 hours', s.need72], ['After 72 hrs', s.needAfter]].map(function (r) { return '<tr><td style="width:14%"><b>' + r[0] + ':</b></td><td>' + v(r[1]) + '</td></tr>'; }).join('') + '</table></td></tr>' +
      '<tr><td style="height:1in">' + lb(40, 'Strategic Discussion: Explain the relation of overall strategy, constraints, and current available information:') + vn(s.strategicDiscussion) + '</td></tr>' +
      '<tr><td style="height:1in">' + lb(41, 'Planned Actions for Next Operational Period:') + vn(s.nextActions) + '</td></tr></table>' +
      '<table class="fx" style="border-top:0"><tr><td>' + lb(42, 'Projected Final Incident Size/Area:') + v(s.finalSize) + '</td><td>' + lb(43, 'Anticipated Incident Management Completion Date:') + v(s.completion) + '</td></tr><tr><td>' + lb(44, 'Projected Significant Resource Demobilization Start Date:') + v(s.demobStart) + '</td><td>' + lb(45, 'Estimated Incident Costs to Date:') + v(s.costToDate) + '</td></tr><tr><td>' + lb(46, 'Projected Final Incident Cost Estimate:') + v(s.costFinal) + '</td><td></td></tr>' +
      '<tr><td colspan="2" style="height:1.2in">' + lb(47, 'Remarks (or continuation of any blocks above – list block number in notation):') + vn(s.remarks) + '</td></tr></table>';
    pages.push(p3);
    // 48-52 resource table by agency x kind
    var res = A(inc.resources).filter(function (r) { return ['Released', 'Demobilized', 'Ordered'].indexOf(r.status) < 0; });
    var kinds = [], ags = {};
    res.forEach(function (r) { var k = r.kind || 'Other'; if (kinds.indexOf(k) < 0) kinds.push(k); var a = r.agency || 'Unspecified'; ags[a] = ags[a] || {}; ags[a][k] = ags[a][k] || { n: 0, p: 0 }; ags[a][k].n++; ags[a][k].p += (+r.persons || 0); });
    kinds = kinds.slice(0, 9);
    var overhead = A(inc.org).filter(function (p) { return p.name && !p.resId; });
    var oa = {}; overhead.forEach(function (p) { var a = p.agency || 'Unspecified'; oa[a] = (oa[a] || 0) + 1; });
    var agList = Object.keys(Object.assign({}, ags, oa));
    var totR = res.length, totP = res.reduce(function (s, r) { return s + (+r.persons || 0); }, 0) + overhead.length;
    var p4 = '<table class="fx"><tr><td>' + lb(1, 'Incident Name:') + v(inc.name) + '</td><td>' + lb(2, 'Incident Number:') + v(inc.number) + '</td></tr></table>' +
      '<table class="fx" style="border-top:0;font-size:9px"><tr><th colspan="' + (kinds.length + 3) + '" style="text-align:left">Incident Resource Commitment Summary — 48. Agency or Organization / Resources (by kind): # of resources / # of personnel</th></tr><tr><th style="width:20%">48. Agency or Organization</th>' + kinds.map(function (k) { return '<th>' + E(k) + '<br>Res / Pers</th>'; }).join('') + '<th>49. Additional Personnel not assigned to a resource</th><th>50. Total Personnel</th></tr>' +
      pad(agList, 12).map(function (a) {
        if (!a) return '<tr><td>&nbsp;</td>' + kinds.map(function () { return '<td></td>'; }).join('') + '<td></td><td></td></tr>';
        var row = ags[a] || {}, pers = 0;
        var cells = kinds.map(function (k) { var c = row[k]; if (c) pers += c.p; return '<td style="text-align:center">' + v(c ? c.n + ' / ' + c.p : '') + '</td>'; }).join('');
        return '<tr><td>' + v(a) + '</td>' + cells + '<td style="text-align:center">' + v(oa[a] || '') + '</td><td style="text-align:center">' + v(pers + (oa[a] || 0)) + '</td></tr>';
      }).join('') +
      '<tr><td><b>51. Total Resources</b></td>' + kinds.map(function (k) { var n = res.filter(function (r) { return (r.kind || 'Other') === k; }).length; return '<td style="text-align:center"><b>' + n + '</b></td>'; }).join('') + '<td style="text-align:center"><b>' + overhead.length + '</b></td><td style="text-align:center"><b>' + totP + '</b></td></tr></table>' +
      '<div class="blk" style="min-height:1.2in">' + lb(52, 'Additional Cooperating and Assisting Organizations Not Listed Above:') + vn(s.cooperating) + '</div>' +
      '<div class="blk" style="font-size:9px;color:#333">Totals: ' + totR + ' resources, ' + totP + ' personnel. Live figures at time of print' + (x.asof ? ' (' + E(x.asof) + ')' : '') + ': ' +
      E([x.shelterPop != null ? 'shelter population ' + x.shelterPop : '', x.sheltersOpen != null ? x.sheltersOpen + ' shelters open' : '', x.daDestroyed != null ? 'DA destroyed ' + x.daDestroyed + ', major ' + x.daMajor + ', minor ' + x.daMinor + ', affected ' + x.daAffected : '', x.closures != null ? x.closures + ' road closures' : ''].filter(Boolean).join('; ') || 'not connected to ArcGIS') + '</div>';
    pages.push(p4);
    return pages.map(function (p, i) { return page('209', 'Incident Status Summary', p, 'Page ' + (i + 1) + ' of ' + pages.length); }).join('');
  };

  // ---------- 211 Check-In List ----------
  F['211'] = function (inc, o) {
    var res = A(inc.resources).filter(function (r) { return r.checkin || r.status !== 'Ordered'; });
    if (o && o.loc) res = res.filter(function (r) { return r.checkinLoc === o.loc; });
    var first = res.map(function (r) { return r.checkin; }).filter(Boolean).sort()[0];
    return chunk(res, 14).map(function (rows, i, all) {
      var body = '<table class="fx"><tr><td style="width:28%">' + lb(1, 'Incident Name:') + v(inc.name) + '</td><td style="width:18%">' + lb(2, 'Incident Number:') + v(inc.number) + '</td><td>' + lb(3, 'Check-In Location (complete all that apply):') +
        CP.CHECKIN_LOCS.map(function (l) { return cb(rows.some(function (r) { return r && r.checkinLoc === l; })) + l; }).join(' ') + '</td><td style="width:16%">' + lb(4, 'Start Date/Time:') + v(CP.fmtDT(first || inc.start)) + '</td></tr></table>' +
        '<table class="fx" style="border-top:0;font-size:8.5px"><tr><th colspan="12" style="text-align:left">Check-In Information (use reverse of form for remarks or comments)</th></tr><tr>' +
        ['5. List single resource personnel (overhead) by agency and name, OR list resources by: State / Agency / Category / Kind / Type / Resource Name or Identifier / ST or TF', '6. Order Request #', '7. Date/Time Check-In', '8. Leader\'s Name', '9. Total # of Personnel', '10. Incident Contact Information', '11. Home Unit or Agency', '12. Departure Point, Date and Time', '13. Method of Travel', '14. Incident Assignment', '15. Other Qualifications', '16. Data Provided to Resources Unit'].map(function (t, j) { return '<th style="width:' + [17, 6, 8, 9, 5, 10, 8, 9, 6, 9, 7, 6][j] + '%">' + t + '</th>'; }).join('') + '</tr>' +
        pad(rows, 14).map(function (r) { return '<tr style="height:.36in">' + (r ? ['VA / ' + (r.agency || '') + ' / ' + (r.kind || '') + (r.type ? ' / T' + r.type : '') + ' / ' + (r.name || '') + (r.stf ? ' / ' + r.stf : ''), r.orderNo, CP.fmtDT(r.checkin), r.leader, r.persons, r.contact, r.home || r.agency, [r.depart, CP.fmtDT(r.departTime)].filter(Boolean).join(' '), r.travel, assignName(inc, r.assign), r.quals, r.checkin ? 'Yes' : ''] : ['', '', '', '', '', '', '', '', '', '', '', '']).map(function (x) { return '<td>' + v(x) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>' +
        prep(inc, 'RESL', 17);
      return page('211', 'Incident Check-In List', body, 'Page ' + (i + 1) + ' of ' + all.length);
    }).join('');
  };

  // ---------- 213 General Message ----------
  F['213'] = function (inc, o) {
    var msgs = A(inc.messages).filter(function (m) { return !o || !o.only || m.id === o.only; });
    if (!msgs.length) msgs = [{}];
    return msgs.map(function (m) {
      var body = '<table class="fx"><tr><td colspan="2">' + lb(1, 'Incident Name (Optional):') + v(inc.name) + '</td></tr><tr><td colspan="2">' + lb(2, 'To (Name and Position):') + v(m.to) + '</td></tr><tr><td colspan="2">' + lb(3, 'From (Name and Position):') + v(m.from) + '</td></tr>' +
        '<tr><td style="width:60%">' + lb(4, 'Subject:') + v(m.subject) + '</td><td>' + lb(5, 'Date:') + v(CP.fmtDate(m.ts)) + ' ' + lb(6, 'Time:') + v(CP.fmtTime(m.ts)) + '</td></tr></table>' +
        '<div class="blk" style="min-height:3.6in">' + lb(7, 'Message:') + vn(m.body) + '</div>' +
        '<table class="fx" style="border-top:0"><tr><td>' + lb(8, 'Approved by:') + 'Name: ' + v(m.approvedBy) + '</td><td>Signature: <span class="sig"></span></td><td>Position/Title: ' + v(m.approvedPos) + '</td></tr></table>' +
        '<div class="blk" style="min-height:2.6in">' + lb(9, 'Reply:') + vn(m.reply) + '</div>' +
        '<table class="fx" style="border-top:0"><tr><td>' + lb(10, 'Replied by:') + 'Name: ' + v(m.replyBy) + '</td><td>Position/Title: ' + v(m.replyPos) + '</td><td>Signature: <span class="sig"></span></td><td>Date/Time: ' + v(CP.fmtDT(m.replyTs)) + '</td></tr></table>';
      return page('213', 'General Message', body, '');
    }).join('');
  };

  // ---------- 213RR Resource Request ----------
  F['213RR'] = function (inc, o) {
    var reqs = A(inc.requests).filter(function (r) { return !o || !o.only || r.id === o.only; });
    if (!reqs.length) reqs = [{ items: [] }];
    return reqs.map(function (q) {
      var items = A(q.items);
      var body = '<table class="fx"><tr><td style="width:40%">' + lb(1, 'Incident Name:') + v(inc.name) + '</td><td>' + lb(2, 'Date/Time:') + v(CP.fmtDT(q.ts)) + '</td><td>' + lb(3, 'Resource Request Number:') + v(q.number) + '</td></tr></table>' +
        '<table class="fx" style="border-top:0"><tr><th rowspan="2" style="width:3%;writing-mode:vertical-rl;transform:rotate(180deg)">Requestor</th><th colspan="6" style="text-align:left">4. Order (Use additional forms when requesting different resource sources of supply.):</th></tr><tr><th style="width:6%">Qty.</th><th style="width:11%">Kind</th><th style="width:7%">Type</th><th>Detailed Item Description: (Vital characteristics, brand, specs, experience, size, etc.)</th><th style="width:14%">Requested Arrival Date/Time</th><th style="width:9%">Cost</th></tr>' +
        pad(items, 8).map(function (it) { return '<tr><td></td><td>' + v(it ? it.qty : '') + '</td><td>' + v(it ? it.kind : '') + '</td><td>' + v(it ? it.type : '') + '</td><td>' + v(it ? it.desc : '') + '</td><td>' + v(it ? CP.fmtDT(it.arrival) : '') + '</td><td>' + v(it ? it.cost : '') + '</td></tr>'; }).join('') +
        '<tr><td></td><td colspan="6">' + lb(5, 'Requested Delivery/Reporting Location:') + v(q.deliverTo) + '</td></tr><tr><td></td><td colspan="6">' + lb(6, 'Suitable Substitutes and/or Suggested Sources:') + v(q.substitutes) + '</td></tr>' +
        '<tr><td></td><td colspan="3">' + lb(7, 'Requested by Name/Position:') + v(q.requestor) + '</td><td colspan="2">' + lb(8, 'Priority:') + ['Urgent', 'Routine', 'Low'].map(function (p) { return cb(q.priority === p) + p; }).join(' ') + '</td><td>' + lb(9, 'Section Chief Approval:') + v(q.approval) + '</td></tr>' +
        '<tr><th rowspan="4" style="writing-mode:vertical-rl;transform:rotate(180deg)">Logistics</th><td colspan="3">' + lb(10, 'Logistics Order Number:') + v(q.logOrder) + '</td><td colspan="3">' + lb(11, 'Supplier Phone/Fax/Email:') + v(q.supplierContact) + '</td></tr>' +
        '<tr><td colspan="6">' + lb(12, 'Name of Supplier/POC:') + v(q.supplier) + '</td></tr><tr><td colspan="6">' + lb(13, 'Notes:') + vn(q.notes) + '</td></tr>' +
        '<tr><td colspan="3">' + lb(14, 'Approval Signature of Auth Logistics Rep:') + '<span class="sig"></span></td><td colspan="2">' + lb(15, 'Date/Time:') + '</td><td>' + lb(16, 'Order placed by (check box):') + cb(q.placedBy === 'SPUL') + 'SPUL ' + cb(q.placedBy === 'PROC') + 'PROC</td></tr>' +
        '<tr><th rowspan="2" style="writing-mode:vertical-rl;transform:rotate(180deg)">Finance</th><td colspan="6" style="height:.6in">' + lb(17, 'Reply/Comments from Finance:') + vn(q.financeReply) + '</td></tr><tr><td colspan="4">' + lb(18, 'Finance Section Signature:') + '<span class="sig"></span></td><td colspan="2">' + lb(19, 'Date/Time:') + '</td></tr></table>' +
        '<div style="font-size:9px;margin-top:4px">Status in Command Post: <b>' + E(q.status || 'Draft') + '</b></div>';
      return page('213RR', 'Resource Request Message', body, '');
    }).join('');
  };

  // ---------- 214 Activity Log ----------
  F['214'] = function (inc, o) {
    o = o || {};
    var op = op0(inc, o);
    var entries = A(inc.log).filter(function (l) { return (!o.author || l.author === o.author) && (!o.opOnly || !op || l.op === op.n); }).sort(function (a, b) { return (a.ts || '').localeCompare(b.ts || ''); });
    var me = o.author ? A(inc.org).find(function (p) { return p.name === o.author; }) : null;
    var assigned = me ? A(inc.org).filter(function (p) { return p.reportsTo === me.id; }) : [];
    return chunk(entries, 24).map(function (rows, i, all) {
      var body = topRow(inc, op) + '<table class="fx" style="border-top:0"><tr><td>' + lb(3, 'Name:') + v(o.author || 'All positions (unit log)') + '</td><td>' + lb(4, 'ICS Position:') + v(me ? CP.POS[me.pos].t : (o.author ? '' : 'Command Post consolidated log')) + '</td><td>' + lb(5, 'Home Agency (and Unit):') + v(me ? me.agency : 'Botetourt County') + '</td></tr></table>' +
        (i === 0 ? '<table class="fx" style="border-top:0"><tr><th colspan="3" style="text-align:left">6. Resources Assigned:</th></tr><tr><th>Name</th><th>ICS Position</th><th>Home Agency (and Unit)</th></tr>' + pad(assigned, 3).map(function (p) { return '<tr><td>' + v(p ? p.name : '') + '</td><td>' + v(p ? CP.POS[p.pos].t : '') + '</td><td>' + v(p ? p.agency : '') + '</td></tr>'; }).join('') + '</table>' : '') +
        '<table class="fx" style="border-top:0"><tr><th colspan="2" style="text-align:left">7. Activity Log:</th></tr><tr><th style="width:16%">Date/Time</th><th>Notable Activities</th></tr>' +
        pad(rows, i === 0 ? 20 : 24).map(function (l) { return '<tr><td>' + v(l ? CP.fmtDT(l.ts) : '') + '</td><td>' + v(l ? (l.cat && l.cat !== 'Note' ? '[' + l.cat + '] ' : '') + l.text + (l.author && !o.author ? ' — ' + l.author : '') : '') + '</td></tr>'; }).join('') + '</table>' + prep(inc, null, 8);
      return page('214', 'Activity Log', body, 'Page ' + (i + 1) + ' of ' + all.length);
    }).join('');
  };

  // ---------- 215 Operational Planning Worksheet ----------
  F['215'] = function (inc, o) {
    var op = op0(inc, o), asg = A(inc.assignments);
    var kinds = [];
    asg.forEach(function (a) { A(a.needs).forEach(function (n) { if (n.kind && kinds.indexOf(n.kind) < 0) kinds.push(n.kind); }); });
    kinds = kinds.slice(0, 6); while (kinds.length < 4) kinds.push('');
    function have(a, k) { return A(inc.resources).filter(function (r) { return r.assign === a.id && r.kind === k && ['Released', 'Demobilized'].indexOf(r.status) < 0; }).length; }
    var tot = kinds.map(function () { return { r: 0, h: 0 }; });
    var rows = pad(asg, 8).map(function (a) {
      if (!a) return '<tr style="height:.5in"><td></td><td></td><td></td>' + kinds.map(function () { return '<td></td><td></td><td></td>'; }).join('') + '<td></td><td></td><td></td><td></td></tr>';
      return '<tr><td>' + v(a.branch) + '</td><td>' + v(a.division || a.group || a.staging) + '</td><td>' + v(a.work) + '</td>' + kinds.map(function (k, i) {
        var n = A(a.needs).find(function (x) { return x.kind === k; }); var req = n ? +n.req || 0 : 0, h = k ? have(a, k) : 0; tot[i].r += req; tot[i].h += h;
        return '<td>' + v(req || '') + '</td><td>' + v(k ? h : '') + '</td><td>' + v(req ? Math.max(0, req - h) : '') + '</td>';
      }).join('') + '<td>' + v(a.overhead) + '</td><td>' + v(a.equipment) + '</td><td>' + v(a.reportTo) + '</td><td>' + v(CP.fmtTime(a.arrival)) + '</td></tr>';
    }).join('');
    var body = '<table class="fx"><tr><td style="width:40%">' + lb(1, 'Incident Name:') + v(inc.name) + '</td><td>' + opBlock(op) + '</td></tr></table>' +
      '<table class="fx" style="border-top:0;font-size:8.5px"><tr><th rowspan="2" style="width:7%">3. Branch</th><th rowspan="2" style="width:8%">4. Division, Group, or Other</th><th rowspan="2" style="width:18%">5. Work Assignment &amp; Special Instructions</th><th colspan="' + kinds.length * 3 + '">6. Resources</th><th rowspan="2" style="width:7%">7. Overhead Position(s)</th><th rowspan="2" style="width:7%">8. Special Equipment &amp; Supplies</th><th rowspan="2" style="width:7%">9. Reporting Location</th><th rowspan="2" style="width:6%">10. Requested Arrival Time</th></tr><tr>' +
      kinds.map(function (k) { return '<th colspan="3">' + E(k || '') + '<br>Req / Have / Need</th>'; }).join('') + '</tr>' + rows +
      '<tr><td colspan="3" style="text-align:right"><b>11. Total Resources Required / 12. Have on Hand / 13. Need To Order</b></td>' + tot.map(function (t) { return '<td><b>' + (t.r || '') + '</b></td><td><b>' + (t.h || '') + '</b></td><td><b>' + (t.r ? Math.max(0, t.r - t.h) : '') + '</b></td>'; }).join('') + '<td colspan="4"></td></tr></table>' + prep(inc, 'OSC', 14);
    return page('215', 'Operational Planning Worksheet', body, '').replace('class="ics-page"', 'class="ics-page" style="font-size:9px"');
  };

  // ---------- 215A Safety Analysis ----------
  F['215A'] = function (inc, o) {
    var op = op0(inc, o), hz = A(inc.hazards);
    var body = '<table class="fx"><tr><td style="width:28%">' + lb(1, 'Incident Name:') + v(inc.name) + '</td><td style="width:18%">' + lb(2, 'Incident Number:') + v(inc.number) + '</td><td style="width:18%">' + lb(3, 'Date/Time Prepared:') + v(CP.fmtDT(CP.now())) + '</td><td>' + opBlock(op, 4) + '</td></tr></table>' +
      '<table class="fx" style="border-top:0"><tr><th style="width:22%">5. Incident Area</th><th style="width:36%">6. Hazards/Risks</th><th>7. Mitigations</th></tr>' +
      pad(hz, 12).map(function (h) { return '<tr style="height:.55in"><td>' + v(h ? h.area : '') + '</td><td>' + v(h ? h.hazard : '') + '</td><td>' + v(h ? h.mitigation : '') + '</td></tr>'; }).join('') + '</table>' +
      prep(inc, 'SOFR', 8, 'Prepared by (Safety Officer):') + prep(inc, 'OSC', '', 'Prepared by (Operations Section Chief):');
    return page('215A', 'Incident Action Plan Safety Analysis', body, '');
  };

  // ---------- 221 Demobilization Check-Out ----------
  F['221'] = function (inc, o) {
    var list = A(inc.resources).filter(function (r) { return (o && o.only) ? r.id === o.only : (r.demob && (r.demob.planned || r.status === 'Released' || r.status === 'Demobilized')); });
    if (!list.length) list = [{ demob: {} }];
    return list.map(function (r) {
      var d = r.demob || {}, ck = d.checks || {};
      var units = [['Logistics Section', [['Supply Unit', 'SPUL'], ['Communications Unit', 'COML'], ['Facilities Unit', 'FACL'], ['Ground Support Unit', 'GSUL']]], ['Planning Section', [['Documentation Unit', 'DOCL']]], ['Finance/Administration Section', [['Time Unit', 'TIME']]], ['Other Section/Staff', [['Safety Officer', 'SOFR']]]];
      var body = '<table class="fx"><tr><td style="width:30%">' + lb(1, 'Incident Name:') + v(inc.name) + '</td><td style="width:20%">' + lb(2, 'Incident Number:') + v(inc.number) + '</td><td colspan="2">' + lb(3, 'Planned Release Date/Time:') + v(CP.fmtDT(d.planned)) + '</td></tr>' +
        '<tr><td colspan="3">' + lb(4, 'Resource or Personnel Released:') + v(r.name ? r.name + (r.kind ? ' (' + r.kind + ')' : '') + (r.leader ? ' — ' + r.leader : '') : '') + '</td><td>' + lb(5, 'Order Request Number:') + v(r.orderNo) + '</td></tr></table>' +
        '<div class="blk">' + lb(6, 'Resource or Personnel:') + 'You and your resources are in the process of being released. Resources are not released until the checked boxes below have been signed off by the appropriate overhead and the Demobilization Unit Leader (or Planning Section representative).' +
        '<table class="fx" style="margin-top:4px"><tr><th style="width:6%"></th><th style="width:36%">Unit/Manager</th><th>Remarks</th><th style="width:22%">Name</th><th style="width:14%">Signature</th></tr>' +
        units.map(function (s) { return '<tr><td colspan="5" class="shade"><b>' + s[0] + ':</b></td></tr>' + s[1].map(function (u) { var c = ck[u[1]] || {}; return '<tr><td style="text-align:center">' + cb(c.ok) + '</td><td>' + u[0] + '</td><td>' + v(c.remarks) + '</td><td>' + v(c.by || pName(inc, u[1])) + '</td><td></td></tr>'; }).join(''); }).join('') + '</table></div>' +
        '<div class="blk" style="min-height:1in">' + lb(7, 'Remarks:') + vn(d.remarks) + '</div>' +
        '<table class="fx" style="border-top:0"><tr><th colspan="4" style="text-align:left">8. Travel Information:</th></tr><tr><td>Destination: ' + v(d.destination || r.home || r.agency) + '</td><td>Estimated Time of Departure: ' + v(CP.fmtDT(d.etd)) + '</td><td>Actual Release Date/Time: ' + v(CP.fmtDT(d.released)) + '</td><td>Estimated Time of Arrival: ' + v(CP.fmtDT(d.eta)) + '</td></tr>' +
        '<tr><td>Travel Method: ' + v(d.method || r.travel) + '</td><td colspan="2">Contact Information While Traveling: ' + v(d.contact || r.contact) + '</td><td>Manifest? ' + cb(d.manifest) + 'Yes ' + cb(!d.manifest) + 'No</td></tr>' +
        '<tr><td colspan="4">Reassignment Information: ' + cb(d.reassign) + 'Yes ' + cb(!d.reassign) + 'No &nbsp; Incident Name: ' + v(d.reassignInc) + ' Incident Number: ' + v(d.reassignNo) + ' Location: ' + v(d.reassignLoc) + '</td></tr></table>' + prep(inc, 'DMOB', 9);
      return page('221', 'Demobilization Check-Out', body, '');
    }).join('');
  };

  // ---------- IAP cover ----------
  F.cover = function (inc, o) {
    var op = op0(inc, o), ics = A(inc.org).filter(function (p) { return p.pos === 'IC'; });
    var items = (o && o.forms) || [];
    var inner = '<div class="strip"></div><div class="cover"><img src="seal.png" alt=""><div style="font:bold 12px Arial;letter-spacing:2px">BOTETOURT COUNTY EMERGENCY MANAGEMENT</div><h1>Incident Action Plan</h1><h2>' + E(inc.name) + '</h2><div style="font:12px Arial">Incident # ' + E(inc.number) + ' · ' + E(inc.type) + '</div>' +
      '<div class="op">Operational Period ' + (op ? op.n : '') + '<br><span style="font-weight:normal;font-size:12px">' + (op ? CP.fmtDT(op.start) + ' to ' + CP.fmtDT(op.end) : '') + '</span></div>' +
      '<table><tr><td><b>Incident Commander</b></td><td>' + E(ics.map(function (p) { return p.name; }).join('; ')) + '</td></tr><tr><td><b>Planning Section Chief</b></td><td>' + E(pName(inc, 'PSC')) + '</td></tr><tr><td><b>Contents</b></td><td>' + E(items.filter(function (f) { return f !== 'cover'; }).map(function (f) { return f === 'map' ? 'Map' : 'ICS ' + f; }).join(', ')) + '</td></tr></table>' +
      '<div style="margin-top:28px;font-size:11px">Approved by Incident Commander: <span class="sig" style="min-width:2.5in"></span> &nbsp; Date/Time: <span class="sig"></span></div></div>';
    return '<div class="ics-page" data-form="cover">' + inner + '<div class="ffoot"><span>IAP Cover</span><span>' + E(CP.FOOT || '') + '</span></div></div>';
  };

  F.mapPage = function (inc, o) {
    var img = o && o.mapImg;
    var body = '<table class="fx"><tr><td style="width:40%">' + lb('', 'Incident Name:') + v(inc.name) + '</td><td>' + opBlock(op0(inc, o), '') + '</td></tr></table><div class="mapimg" style="flex:1;min-height:8in;border-top:0">' + (img ? '<img src="' + img + '" style="max-height:8.4in">' : 'Incident map — open the Map page and use "Add map to IAP"') + '</div>';
    return page('Map', 'Incident Map', body, '').replace('(ICS Map)', '');
  };

  // ---------- registry ----------
  CP.FORMS = [
    { no: '201', plain: 'Briefing packet', t: 'Incident Briefing', d: 'Initial briefing and transfer of command: map, situation, objectives, actions, org and resources.', small: true, f: F['201'] },
    { no: '202', plain: 'Shift goals', t: 'Incident Objectives', d: 'Objectives, command emphasis and IAP contents for the operational period.', iap: true, f: F['202'] },
    { no: '203', plain: 'Who is assigned', t: 'Organization Assignment List', d: 'Who fills each ICS position.', iap: true, f: F['203'] },
    { no: '204', plain: 'Team assignment sheets', t: 'Assignment List', d: 'One per division or group: resources, work assignment, comms.', iap: true, f: F['204'] },
    { no: '205', plain: 'Radio plan', t: 'Radio Communications Plan', d: 'Channels, talkgroups and assignments.', iap: true, f: F['205'] },
    { no: '205A', plain: 'Contact list', t: 'Communications List', d: 'Phone and contact methods for everyone on the incident.', iap: true, f: F['205A'] },
    { no: '206', plain: 'Medical plan', t: 'Medical Plan', d: 'Aid stations, EMS transport, hospitals and procedures.', iap: true, f: F['206'] },
    { no: '207', plain: 'Org chart', t: 'Organization Chart', d: 'Visual org chart built from the org list.', iap: true, f: F['207'] },
    { no: '208', plain: 'Safety message', t: 'Safety Message/Plan', d: 'Safety message and site safety plan status.', iap: true, f: F['208'] },
    { no: '209', plain: 'VDEM status report', t: 'Incident Status Summary', d: 'Status report to VDEM/EOC with live shelter, damage and resource totals.', f: F['209'] },
    { no: '211', plain: 'Check-in sheet', t: 'Incident Check-In List', d: 'Every resource checked in, with times and assignments.', small: true, f: F['211'] },
    { no: '213', plain: 'Message', t: 'General Message', d: 'Formal messages with reply.', small: true, f: F['213'] },
    { no: '213RR', plain: 'Resource request', t: 'Resource Request', d: 'Resource orders through Logistics and Finance.', f: F['213RR'] },
    { no: '214', plain: 'Activity log', t: 'Activity Log', d: 'Unit or individual activity log from the incident log.', small: true, f: F['214'] },
    { no: '215', plain: 'Resource needs', t: 'Operational Planning Worksheet', d: 'Resource needs by division: required, have, need.', f: F['215'] },
    { no: '215A', plain: 'Hazard analysis', t: 'IAP Safety Analysis', d: 'Hazards and mitigations by incident area.', f: F['215A'] },
    { no: '221', plain: 'Release checkout', t: 'Demobilization Check-Out', d: 'Release checklist for each demobilizing resource.', f: F['221'] }
  ];
  CP.FORM = {}; CP.FORMS.forEach(function (f) { CP.FORM[f.no] = f; });

  // completeness: rough share of the form's key inputs that have data
  CP.formFill = function (inc, no) {
    var op = CP.curOP(inc) || {}, chk = [];
    var has = function (x) { return !!(x && (Array.isArray(x) ? CP.alive(x).length : String(x).trim())); };
    switch (no) {
      case '201': chk = [inc.name, inc.situation, A(op.objectives), inc.actions, CP.person(inc, 'IC'), inc.resources, inc.location.lat]; break;
      case '202': chk = [A(op.objectives), op.emphasis, op.awareness, CP.person(inc, 'PSC'), CP.person(inc, 'IC')]; break;
      case '203': case '207': chk = [CP.person(inc, 'IC'), CP.person(inc, 'SOFR'), CP.person(inc, 'PIO'), CP.person(inc, 'OSC'), CP.person(inc, 'PSC'), CP.person(inc, 'LSC')]; break;
      case '204': chk = [inc.assignments, A(inc.assignments).some(function (a) { return a.work; }), A(inc.resources).some(function (r) { return r.assign; })]; break;
      case '205': chk = [inc.comms, A(inc.comms).some(function (c) { return c.rx || c.name; }), CP.person(inc, 'COML')]; break;
      case '205A': chk = [A(inc.org).some(function (p) { return p.phone; }), inc.contacts]; break;
      case '206': chk = [inc.medical.hospitals, inc.medical.transport, inc.medical.aid, inc.medical.procedures, CP.person(inc, 'MEDL')]; break;
      case '208': chk = [op.safetyMsg, inc.hazards, CP.person(inc, 'SOFR')]; break;
      case '209': chk = [inc.situation, inc.s209.events, inc.s209.proj12 || inc.s209.proj24, inc.s209.need12 || inc.s209.need24, inc.resources, inc.s209.size]; break;
      case '211': chk = [inc.resources, A(inc.resources).some(function (r) { return r.checkin; })]; break;
      case '213': chk = [inc.messages]; break;
      case '213RR': chk = [inc.requests]; break;
      case '214': chk = [inc.log]; break;
      case '215': chk = [inc.assignments, A(inc.assignments).some(function (a) { return A(a.needs).length; })]; break;
      case '215A': chk = [inc.hazards]; break;
      case '221': chk = [A(inc.resources).some(function (r) { return r.demob && r.demob.planned; })]; break;
    }
    if (!chk.length) return 0;
    return Math.round(100 * chk.filter(has).length / chk.length);
  };

  CP.renderForm = function (inc, no, o) {
    CP.FOOT = inc.number + ' · printed ' + CP.fmtDT(CP.now()) + ' · Command Post';
    if (no === 'cover') return F.cover(inc, o);
    if (no === 'map') return F.mapPage(inc, o);
    return CP.FORM[no].f(inc, o || {});
  };
})(window.CP);
