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
    alarm: { n: 'Fire alarm', type: 'Fire', icon: 'bell', assign: [['group', 'Investigation'], ['staging', 'Staging']],
      marks: ['Arrived · nothing showing', 'Investigation started', 'Panel checked / zone found', 'Cause found', 'Area clear · no fire', 'System reset or turned over to owner'] },
    structure: { n: 'Structure fire', type: 'Fire', icon: 'flame', assign: [['group', 'Fire Attack'], ['group', 'Search'], ['group', 'Water Supply'], ['group', 'RIT'], ['group', 'Ventilation'], ['staging', 'Staging'], ['group', 'Rehab']],
      marks: ['360 / size-up complete', 'Water supply established', 'Primary search all clear', 'Fire under control', 'Secondary search all clear', 'Utilities secured', 'Loss stopped', 'Overhaul complete'] },
    vehicle: { n: 'Vehicle fire', type: 'Vehicle', icon: 'flame', assign: [['group', 'Fire Attack'], ['group', 'Traffic Control'], ['staging', 'Staging']], marks: ['Scene protected', 'Fire under control', 'Hazards mitigated', 'Overhaul complete'] },
    brush: { n: 'Brush / wildland', type: 'Wildfire', icon: 'leaf', assign: [['division', 'Division A'], ['division', 'Division Z'], ['group', 'Water Supply'], ['staging', 'Staging']], marks: ['Size-up / anchor point', 'Water supply established', 'Forward spread stopped', 'Contained', 'Mop-up complete'] },
    mva: { n: 'Vehicle accident', type: 'Vehicle', icon: 'car', assign: [['group', 'Extrication'], ['group', 'Patient Care'], ['group', 'Traffic Control'], ['group', 'Fire Protection'], ['staging', 'Staging']],
      marks: ['Scene size-up · vehicles & patients counted', 'Traffic blocked / scene protected', 'Vehicles stabilized', 'Hazards controlled (fluids, batteries, airbags)', 'Patient access', 'Extrication complete', 'All patients transported', 'Roadway cleared'] },
    mci: { n: 'Mass casualty (MCI)', type: 'Other', icon: 'mci', assign: [['group', 'Triage'], ['group', 'Treatment'], ['group', 'Transport'], ['staging', 'Ambulance Staging']],
      marks: ['MCI declared · level set', 'Triage started', 'Treatment area set up', 'Hospitals / RHCC notified', 'Triage complete', 'All RED transported', 'All patients transported'] },
    hazard: { n: 'Hazard / investigation', type: 'Fire', icon: 'bell', assign: [['group', 'Investigation'], ['group', 'Hazard Control'], ['staging', 'Staging']],
      marks: ['Arrived · size-up', 'Meter readings / area checked', 'Source found', 'Hazard controlled', 'Utility / owner notified', 'Released to owner'] },
    rescue: { n: 'Rescue', type: 'Other', icon: 'rescue', assign: [['group', 'Rescue'], ['group', 'Patient Care'], ['group', 'Safety'], ['staging', 'Staging']],
      marks: ['Size-up · victims located', 'Scene made safe', 'Access to victim', 'Victim removed', 'Patient care transferred', 'All personnel accounted for'] },
    other: { n: 'Other incident', type: 'Other', icon: 'flag', assign: [['staging', 'Staging']], marks: ['Scene size-up complete', 'Hazards identified', 'Incident stabilized', 'Scene cleared'] }
  };
  // Botetourt County fire call types and their current recommended responses (Current Fire Responses and Call Types.xlsx).
  // [CAD call type, recommended response, template, note]
  var CALLS = [
    ['F - FIRE ALARM', '2 FD, 1 EMS', 'alarm'], ['TARGET FIRE ALARM', '3 FD, 1 EMS, COUNTY 12', 'alarm'],
    ['F - STRUCTURE FIRE', '2 FD, 2 EMS, COUNTY 12', 'structure'], ['TARGET STRUCTURE', '3 FD, 2 EMS, COUNTY 12, COUNTY 11', 'structure'], ['F - WORKING FIRE', '2 FD, 2 EMS, COUNTY 12, ON-CALL, POWER COMPANY', 'structure', 'Working fire adds on-call and the power company'],
    ['F - VEHICLE FIRE', '1 FD, 1 EMS', 'vehicle'], ['F - BRUSH / GRASS FIRE', '1 FD, 1 MU', 'brush', 'MU will change to 1 EMS'], ['F - BURN ILLEGALLY', '1 FD', 'brush'],
    ['F - DUMPSTER FIRE', '1 FD, 1 EMS', 'vehicle'], ['F - OTHER FIRE', '1 FD, 1 EMS', 'vehicle'], ['F - SMOKE REPORT', '1 FD, 1 EMS', 'hazard'],
    ['F - CARBON MONOXIDE', '1 FD, 1 MU', 'hazard', 'MU will change to 1 EMS'], ["F - NAT'L GAS LEAK", '2 FD, 1 EMS', 'hazard'], ['F - INSIDE FIRE HAZARD', '2 FD, 1 EMS', 'hazard'],
    ['F - HAZMAT', '1 FD, 1 MU, COUNTY 11', 'hazard', 'MU will change to 1 EMS'], ['F - WIRES DOWN/TRANSFORMER', '1 FD', 'hazard'], ['F - FIRE SERVICE CALL', '1 FD', 'other'], ['F - FIRE STANDBY', '', 'other', 'No response plan'],
    ['F - ELEVATOR RESCUE', '1 FD', 'rescue'],
    ['MVC - ENTRAPMENT', '1 FD, 2 EMS, 1 SQUAD, COUNTY 12, VSP, LG', 'mva', 'LG as needed'], ['MVC - INJURY', '1 FD, 1 EMS, VSP', 'mva'], ['MVC - FD ONLY (NO PI)', '1 FD, VSP', 'mva'], ['MVC - VSP ONLY (NO PI)', 'VSP', 'mva'],
    ['MVC - MCI/BUS', '2 FD, 3 EMS, 1 SQUAD, COUNTY 11, COUNTY 12, VSP, LG', 'mci', 'LG as needed'],
    ['F - AIRPLANE CRASH', '1 FD, 2 EMS, COUNTY 12, COUNTY 11, VSP', 'mci'], ['F - TRAIN DERAILMENT', '1 FD, 1 MU, ON-CALL', 'mci', 'MU will change to 1 EMS'],
    ['SOTT - SEARCH & RESCUE', '1 FD, SOTT, COUNTY 7, LE', 'rescue'], ['SOTT - TECHNICAL RESCUE', '1 FD, 1 SQUAD, 1 MU, SOTT, COUNTY 12, COUNTY 7', 'rescue', 'MU can change to 1 EMS'], ['SOTT - WATER RESCUE', '1 FD, 1 SQUAD, 1 MU, SOTT, COUNTY 12, COUNTY 7', 'rescue', 'MU can change to 1 EMS'],
    ['BOMB SCARE', '1 DEP, 1 SGT, COUNTY 11', 'other', 'Then 2 MU, 1 RS, 2 FD (MU will change to 2 EMS)']
  ];
  function callFor(type) { var t = String(type || '').toUpperCase().replace(/\s+/g, ' ').trim(); if (!t) return null; var c = CALLS.find(function (x) { return x[0] === t; }) || CALLS.find(function (x) { return x[0].replace(/^F - /, '') === t.replace(/^F - /, ''); }) || CALLS.find(function (x) { return t.indexOf(x[0].replace(/^F - /, '').split(/[ \/(]/)[0]) >= 0 && x[0].replace(/^F - /, '').split(/[ \/(]/)[0].length > 3; }); return c || null; }
  // response line -> slots: [{label, n, match}]
  function slots(resp) {
    return String(resp || '').split(/,\s*/).filter(Boolean).map(function (p) {
      var m = /^(\d+)\s+(.+)$/.exec(p.trim()), n = m ? +m[1] : 1, l = (m ? m[2] : p).trim().toUpperCase();
      var test = /^(FD)$/.test(l) ? function (r) { return /Engine|Ladder|Tanker|Brush/.test(r.kind); } : /^(EMS|MU)$/.test(l) ? function (r) { return /Ambulance/.test(r.kind); } : /^SQUAD$/.test(l) ? function (r) { return /Rescue/.test(r.kind); }
        : /^VSP$/.test(l) ? function (r) { return /Law/.test(r.kind) && /^(VSP|TROOP|VA)/i.test(r.name || ''); } : /^(LE|DEP|SGT)$/.test(l) ? function (r) { return /Law/.test(r.kind); } : /^LG$/.test(l) ? function (r) { return /^HC|LG|LIFE/i.test(r.name); } : /^COUNTY (\d+)$/.test(l) ? (function (num) { return function (r) { return new RegExp('(^|\\D)' + num + '$').test((r.name || '').replace(/\s+/g, '')); }; })(l.split(' ')[1]) : null;
      return { label: l, n: n, test: test };
    });
  }
  var ADD_ASSIGN = { Groups: ['Fire Attack', 'Search', 'Ventilation', 'Water Supply', 'RIT', 'Salvage', 'Overhaul', 'Utilities', 'Exposure', 'Medical', 'Rehab', 'Traffic Control', 'Investigation', 'Extrication', 'Patient Care', 'Fire Protection', 'Landing Zone'], EMS: ['EMS Branch', 'Triage', 'Treatment', 'Transport', 'Ambulance Staging'], Divisions: ['Division 1', 'Division 2', 'Division 3', 'Roof', 'Basement', 'Side A', 'Side B', 'Side C', 'Side D'], Staging: ['Staging', 'Level 2 Staging'] };
  var KINDS = [['E', 'Engine', 'Engine'], ['L', 'Ladder', 'Ladder/Truck'], ['T', 'Tanker', 'Tanker/Tender'], ['R', 'Rescue', 'Rescue'], ['M', 'Medic', 'Ambulance (ALS)'], ['BR', 'Brush', 'Brush Truck'], ['BC', 'Chief', 'Overhead (single person)'], ['S', 'Squad', 'Rescue'], ['A', 'Ambulance', 'Ambulance (BLS)'], ['HC', 'Helicopter', 'Other'], ['VSP', 'State Police', 'Law Enforcement'], ['PD', 'Police', 'Law Enforcement'], ['U', 'Other', 'Other']];
  var MODES = ['Investigating', 'Offensive', 'Defensive', 'Transitional', 'Marginal'];
  var COND = ['Nothing showing', 'Smoke showing', 'Fire showing', 'Working fire', 'Under control'];
  // status buttons that fit the kind of incident (fire terms only on fires)
  var SETS = {
    fire: [MODES, COND],
    mva: [['Size-up', 'Rescue', 'Stabilized', 'Recovery'], ['No injuries', 'Injuries', 'Entrapment', 'Rollover', 'Vehicle fire', 'Hazmat / fluids']],
    mci: [['Size-up', 'Triage', 'Treatment', 'Transport', 'Recovery'], ['Patients still being found', 'All patients found', 'Patients being transported', 'All patients transported']],
    rescue: [['Size-up', 'Rescue', 'Recovery'], ['Victim not located', 'Victim located', 'Access made', 'Victim removed']],
    hazard: [['Investigating', 'Mitigating', 'Monitoring'], ['Nothing found', 'Readings present', 'Source found', 'Hazard controlled']],
    other: [['Size-up', 'Active', 'Stabilized', 'Recovery'], ['Initial', 'Escalating', 'Stable', 'Under control']]
  };
  function setFor(tk) { return /^(structure|vehicle|alarm|brush)$/.test(tk) ? SETS.fire : SETS[tk] || SETS.other; }

  // ---------- Fire & EMS look ----------
  var PATCH = 'patch.png'; // Botetourt County Fire & EMS patch (full resolution, cached for offline)
  var SVG = {
    flame: '<path d="M12 2c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.6 1.6-4 2-6.5 1 1.2 2 2 3 2.2C12 5.6 11.5 4 12 2z"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>',
    car: '<path d="M3 13l2-5a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 8l2 5v5h-3v-2H6v2H3zM5 13h14"/><circle cx="7.5" cy="15" r="1"/><circle cx="16.5" cy="15" r="1"/>',
    leaf: '<path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15M5 19l7-7"/>',
    flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
    mci: '<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z"/>',
    engine: '<path d="M2 16V9h10v7M12 11h5l4 3v2M2 16h19"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/><path d="M3 7h8"/>',
    ladder: '<path d="M7 3v18M17 3v18M7 7h10M7 11h10M7 15h10M7 19h10"/>',
    tanker: '<path d="M12 3l5.5 8a6 6 0 1 1-11 0z"/>',
    rescue: '<path d="M14 6l4 4-8 8-4-4zM16 4l4 4M4 20l2-2"/>',
    medic: '<path d="M10.5 3h3v6.4l5.5-3.2 1.5 2.6-5.5 3.2 5.5 3.2-1.5 2.6-5.5-3.2V21h-3v-6.4L5 17.8l-1.5-2.6L9 12 3.5 8.8 5 6.2l5.5 3.2z"/>',
    chief: '<path d="M3 16h18M5 16a7 7 0 0 1 14 0M12 9V6M9.5 6h5"/>',
    police: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/>',
    brushk: '<path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15M5 19l7-7"/>',
    heli: '<path d="M3 6h18M12 6v3M6 9h9a3 3 0 0 1 0 6H8a2 2 0 0 1-2-2zM15 15l2 4M9 15l-1 4M6 19h12"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    vent: '<path d="M12 20V5M6 11l6-6 6 6"/>',
    water: '<path d="M12 3l5.5 8a6 6 0 1 1-11 0z"/>',
    rit: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M6.3 6.3l3.2 3.2M17.7 6.3l-3.2 3.2M6.3 17.7l3.2-3.2M17.7 17.7l-3.2-3.2"/>',
    rehab: '<path d="M5 9h11v5a5 5 0 0 1-10 0zM16 10h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3"/>',
    staging: '<path d="M7 20V4h6a4 4 0 0 1 0 8H7"/>',
    traffic: '<path d="M12 3l7 17H5zM9.5 14h5M10.6 10h2.8"/>',
    tools: '<path d="M14 6l4 4-8 8-4-4zM16 4l4 4M4 20l2-2"/>',
    triage: '<path d="M5 3h14v18H5zM9 7h6M9 11h6M9 15h3"/>'
  };
  function svg(k, cls) { return '<svg class="cbi ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (SVG[k] || SVG.flag) + '</svg>'; }
  function unitLook(r) {
    var k = r.kind || '';
    if (/Engine/.test(k)) return ['engine', 'u-eng']; if (/Ladder/.test(k)) return ['ladder', 'u-lad']; if (/Tanker/.test(k)) return ['tanker', 'u-tank'];
    if (/Ambulance/.test(k)) return ['medic', 'u-med']; if (/Rescue/.test(k)) return ['rescue', 'u-res']; if (/Brush/.test(k)) return ['brushk', 'u-brush'];
    if (/Overhead/.test(k)) return ['chief', 'u-chief']; if (/Law/.test(k)) return ['police', 'u-pd']; if (/^HC/i.test(r.name || '')) return ['heli', 'u-med'];
    return ['flag', 'u-oth'];
  }
  function asgLook(a) {
    var n = (a.division || a.group || a.branch || a.staging || '');
    var M = [[/attack|exposure|fire protection/i, 'flame', 'a-fire'], [/search/i, 'search', 'a-search'], [/vent|roof/i, 'vent', 'a-vent'], [/water/i, 'water', 'a-water'], [/RIT/i, 'rit', 'a-rit'], [/rehab/i, 'rehab', 'a-rehab'],
      [/triage/i, 'triage', 'a-ems'], [/treat|patient|medical|EMS|transport/i, 'medic', 'a-ems'], [/staging/i, 'staging', 'a-stg'], [/traffic/i, 'traffic', 'a-traffic'], [/extric|salvage|overhaul|utilit/i, 'tools', 'a-tools'], [/investig/i, 'bell', 'a-fire'], [/landing|LZ/i, 'heli', 'a-ems']];
    var m = M.find(function (x) { return x[0].test(n); }); return m ? [m[1], m[2]] : (a.division ? ['flag', 'a-div'] : ['flag', 'a-oth']);
  }
  function tplOf(i) { return TEMPLATES[kv('tpl', 'other')] || TEMPLATES.other; }

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
    var h = '<div class="cbstart"><div class="cbhero"><img class="cbheropatch" src="' + PATCH + '" alt=""><h1>' + I('flag') + 'Command Board</h1><p>Start a board for a new incident, or open an incident that is already running. Everything you tap here is the Command Post incident, so you can move it to Command Post at any time.</p></div>';
    h += '<div class="cbcols"><section class="card"><h3>' + I('plus') + 'New board</h3><div class="cbtypes">' + Object.keys(TEMPLATES).map(function (k) { return '<button class="cbtype t-' + k + (CB.tpl === k ? ' on' : '') + '" data-cb="tpl" data-a="' + k + '">' + svg(TEMPLATES[k].icon || 'flag') + E(TEMPLATES[k].n) + '</button>'; }).join('') + '</div>' +
      '<label class="f"><span>Call type (county response plan)</span><select class="in big" id="cbCall" data-cbchg="call"><option value="">Pick a call type, or tap a type above</option>' +
      [['Fire', /^(F - |TARGET)/], ['Vehicle crashes', /^MVC/], ['Rescue (SOTT)', /^SOTT/], ['Other', /^BOMB/]].map(function (g) { return '<optgroup label="' + g[0] + '">' + CALLS.filter(function (c) { return g[1].test(c[0]); }).map(function (c) { return '<option' + (CB.call && CB.call[0] === c[0] ? ' selected' : '') + '>' + E(c[0]) + '</option>'; }).join('') + '</optgroup>'; }).join('') + '</select></label>' +
      (CB.call ? '<div class="cbresp start">' + I('truck') + ' <b>Recommended response:</b> ' + E(CB.call[1] || 'none') + (CB.call[3] ? ' <span class="dim">(' + E(CB.call[3]) + ')</span>' : '') + '</div>' : '') +
      '<label class="f"><span>Address / location</span><input class="in big" id="cbAddr" placeholder="e.g. 123 Main St, Daleville" value="' + E(CB.addr || '') + '"></label>' +
      '<label class="f"><span>Incident Commander</span><input class="in" id="cbIC" value="' + E(CP.me.name || '') + '" placeholder="Your name / unit"></label>' +
      '<label class="chk" style="margin:6px 0 12px"><input type="checkbox" id="cbEx"> Practice / training</label>' +
      '<button class="btn big pri" style="width:100%" data-cb="start">' + I('play') + 'Start command board</button></section>';
    h += '<section class="card"><h3>' + I('radio') + 'From an active CAD call</h3><p class="dim" style="margin-top:0">Tap a call to fill the address and bring its units onto the board.</p>' +
      (cad === undefined ? '<div class="empty">Loading CAD…</div>' : !cad || !cad.length ? '<div class="dim">No active CAD calls' + (A.signedIn() ? '' : ' (sign in to see CAD)') + '.</div>' : cad.slice(0, 20).map(function (c) { return '<button class="cbcad' + (CB.cadPick && CB.cadPick.callid === c.callid ? ' on' : '') + '" data-cb="cad" data-a="' + E(c.callid) + '"><b>' + E(c.type || c.cat || 'Call') + '</b><span>' + E(c.addr || '') + '</span><i>' + E((c.units || []).map(function (u) { return u.id; }).join(' ') || 'no units yet') + '</i></button>'; }).join('')) + '</section>';
    h += '<section class="card"><h3>' + I('list') + 'Open a running incident</h3>' + (l === undefined ? '<div class="empty">Loading incidents…</div>' : !l || !l.length ? '<div class="dim">No open incidents' + (A.signedIn() ? '' : ' (sign in to see shared incidents)') + '.</div>' : l.map(function (x) { return '<button class="cbcad" data-cb="open" data-a="' + E(x.incident_key) + '"><b>' + E(x.incident_name) + '</b><span>' + E(x.incident_number || '') + ' · ' + E(x.incident_type || '') + '</span><i>' + (x.exercise === 'Yes' ? 'PRACTICE · ' : '') + 'started ' + E(CP.fmtDT(new Date(x.start_time).toISOString())) + '</i></button>'; }).join('')) + ((CB.closedList || []).length ? '<div class="cbsub" style="margin-top:14px">Closed in the last 3 days</div>' + CB.closedList.map(function (x) { return '<button class="cbcad closed" data-cb="open" data-a="' + E(x.incident_key) + '"><b>' + E(x.incident_name) + '</b><span>Closed ' + E(CP.fmtDT(new Date(x.closed_time).toISOString())) + '</span><i>open for the report</i></button>'; }).join('') : '') + '</section></div></div>';
    return h;
  }
  async function loadLists() {
    if (!A.signedIn()) { CB.list = []; CB.cad = []; return; }
    try { var r = await A.listRemote(); CB.closedList = r.filter(function (x) { return x.status === 'Closed' && x.closed_time && Date.now() - x.closed_time < 3 * 864e5; }).slice(0, 8); CB.list = r.filter(function (x) { return x.status !== 'Closed'; }).sort(function (a, b) { return (b.start_time || 0) - (a.start_time || 0); }).slice(0, 25); } catch (e) { CB.list = CP.store.list().filter(function (x) { return x.status !== 'Closed'; }).map(function (x) { return { incident_key: x.id, incident_name: x.name, incident_number: x.number, incident_type: x.type, start_time: Date.parse(x.start) }; }); }
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
    var ctName = CB.call ? CB.call[0].replace(/^F - /, '').toLowerCase().replace(/(^|[\s\/(-])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }).replace(/Mvc/, 'MVC').replace(/Sott/, 'SOTT').replace(/Vsp/, 'VSP').replace(/Mci/, 'MCI').replace(/Pi\)/, 'PI)') : T.n;
    var i = CP.newIncident({ name: (ex ? 'PRACTICE: ' : '') + ctName + ' · ' + addr, type: T.type, start: CP.now(), locdesc: addr, lat: ll ? +ll[0].toFixed(6) : null, lng: ll ? +ll[1].toFixed(6) : null, icName: ic, complexity: 5, opHours: 12, author: ic });
    if (ex) i.exercise = true;
    i.arc.auto = { incident: false, facilities: false }; // a fire alarm is not posted to the public incident map unless the IC turns it on in Command Post
    var SS = setFor(tk); i.cbKV = [{ id: 'tpl', v: tk, u: CP.now() }, { id: 'mode', v: SS === SETS.fire ? (tk === 'alarm' ? 'Investigating' : 'Offensive') : SS[0][0], u: CP.now() }, { id: 'cond', v: SS === SETS.fire ? (tk === 'alarm' ? 'Nothing showing' : 'Smoke showing') : '', u: CP.now() }, { id: 'parEvery', v: 20, u: CP.now() }, { id: 'parT', v: CP.now(), u: CP.now() }];
    if (CB.call) i.cbKV.push({ id: 'call', v: { type: CB.call[0], resp: CB.call[1], note: CB.call[3] || '' }, u: CP.now() });
    if (tk === 'mci') i.cbKV.push({ id: 'mci', v: { t: CP.now(), est: 0 }, u: CP.now() });
    i.cbMarks = T.marks.map(function (m, n) { return { id: 'm' + n, label: m, t: '', by: '', u: CP.now() }; });
    T.assign.forEach(function (a) { var o = { branch: '', division: '', group: '', staging: '', work: '', special: '', needs: [], reportTo: '' }; o[a[0]] = a[1]; CP.addItem(i, 'assignments', o); });
    CB.inc = i;
    if (CB.cadPick) { CP.addItem(i, 'calls', { callid: CB.cadPick.callid, type: CB.cadPick.type, addr: CB.cadPick.addr, linked: CP.now() }); (CB.cadPick.units || []).forEach(function (u) { addUnit(u.id, kindOf(u.id), u.dept || '', /arriv|on ?scene/i.test(u.st || '') ? 'Checked In' : 'En Route', true); }); }
    log('Command Board started: ' + (CB.call ? CB.call[0] + ' (response: ' + (CB.call[1] || 'none') + ')' : T.n) + ' at ' + addr + (ic ? '. ' + ic + ' has command.' : '') + (CB.cadPick ? ' CAD ' + CB.cadPick.callid + '.' : ''), 'Event');
    CB.call = null; CP.store.setPref('curInc', { key: i.id, t: Date.now() }); history.replaceState(null, '', location.pathname + '?incident=' + encodeURIComponent(i.id));
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
    var h = '<div class="cbtop' + (may ? ' mayday' : '') + '"><div class="cbaddr">' + svg(tplOf(i).icon || 'flag', 'big t-' + kv('tpl', 'other')) + '<div><b>' + E(i.location.desc || i.name) + '</b><span>' + E(i.number) + ' · ' + E(TEMPLATES[kv('tpl', 'other')] ? TEMPLATES[kv('tpl', 'other')].n : i.type) + (ic ? ' · IC ' + E(ic) : '') + (i.exercise ? ' · <span class="chip practice">PRACTICE</span>' : '') + (kv('mci') ? ' · <span class="chip red">MCI</span>' : '') + '</span></div></div>' +
      '<div class="cbclock"><span>ELAPSED</span><b id="cbEl">' + since(i.start) + '</b></div>' +
      '<button class="cbpar' + (parLeft <= 0 ? ' due' : parLeft < 120 ? ' soon' : '') + '" data-cb="par"><span>PAR every ' + parEvery + ' min</span><b id="cbPar">' + (parLeft <= 0 ? 'DUE ' + since(new Date(parDue).toISOString()) : Math.floor(parLeft / 60) + ':' + CP.pad(parLeft % 60)) + '</b></button>' +
      '<button class="cbmay" data-cb="mayday">' + I('warn') + (may ? 'MAYDAY ACTIVE' : 'MAYDAY') + '</button></div>';
    if (may) h += '<div class="cbmaybar">' + I('warn') + ' MAYDAY ' + E(since(may.t)) + ' · ' + E(may.who || '') + ' · ' + E(may.where || '') + ' · ' + E(may.air || '') + (may.rit ? ' · RIT: ' + E(may.rit) : '') + ' <button class="btn sm" data-cb="mayclear">Clear MAYDAY</button></div>';
    var SET = setFor(kv('tpl', 'other')) === SETS.fire && kv('mci') ? SETS.mci : setFor(kv('tpl', 'other'));
    h += '<div class="cbbar"><div class="cbseg">' + SET[0].map(function (m) { return '<button class="' + (m === mode ? 'on' : '') + (m === 'Defensive' ? ' def' : '') + '" data-cb="mode" data-a="' + m + '">' + m + '</button>'; }).join('') + '</div>' +
      '<div class="cbseg">' + SET[1].map(function (c) { return '<button class="' + (c === cond ? 'on' : '') + '" data-cb="cond" data-a="' + c + '">' + c + '</button>'; }).join('') + '</div>' +
      '<span class="sp"></span><span class="sync on" id="cbSync"></span>' + (kv('mci') ? '' : '<button class="btn sm red" data-cb="mci">' + svg('mci') + 'Declare MCI</button>') + '<button class="btn sm" data-cb="can">' + I('msg') + 'CAN report</button><button class="btn sm" data-cb="note">' + I('log') + 'Log</button><button class="btn sm" data-cb="more">' + I('menu') + 'More</button><a class="btn sm pri" href="index.html?incident=' + encodeURIComponent(i.id) + '" target="_blank" rel="noopener" data-cb="tocp">' + I('link') + 'Move to Command Post</a></div>';
    // units rack
    var free = units().filter(function (r) { return !r.assign; }), enr = free.filter(function (r) { return r.status === 'En Route'; }), avail = free.filter(function (r) { return r.status !== 'En Route'; });
    h += '<div class="cbmain"><section class="cbrack"><div class="cbh">' + I('truck') + 'Units <span class="ct">' + units().length + '</span></div>' +
      '<div class="cbadd">' + KINDS.map(function (k) { return '<button data-cb="addk" data-a="' + k[0] + '" title="' + E(k[2]) + '">+' + k[0] + '</button>'; }).join('') + '</div>' +
      respPanel() + '<div class="cbsub">On scene · not assigned</div>' + (avail.length ? avail.map(tile).join('') : '<div class="dim cbempty">Tap a unit type above, or a unit below to assign it.</div>') +
      '<div class="cbsub">Responding</div>' + (enr.length ? enr.map(tile).join('') : '<div class="dim cbempty">—</div>') +
      '<button class="btn sm ghost" style="width:100%;margin-top:8px" data-cb="cadunits">' + I('radio') + 'Pull units from CAD</button></section>';
    // assignments
    h += '<section class="cbgrid">' + asgs().map(function (a) {
      var us = unitsIn(a.id), sup = a.reportTo || '', par = kv('par_' + a.id, null), can = a.cbCan || '';
      var al = asgLook(a);
      return '<div class="cbasg ' + al[1] + (a.staging ? ' stg' : a.division ? ' div' : '') + (CB.sel ? ' target' : '') + '" data-cb="drop" data-a="' + a.id + '"><div class="cbah">' + svg(al[0], 'ah') + '<b>' + E(aName(a)) + '</b>' + (sup ? '<span>' + E(sup) + '</span>' : '') + '<button class="ibtn" data-cb="amenu" data-a="' + a.id + '" title="Assignment options">' + I('menu') + '</button></div>' +
        '<div class="cbau">' + (us.length ? us.map(tile).join('') : '<div class="dim">' + (CB.sel ? 'Tap to assign here' : 'No units') + '</div>') + '</div>' +
        (can || a.work ? '<div class="cbcan">' + E(can || a.work).slice(0, 140) + '</div>' : '') + (par ? '<div class="cbpok">' + I('check') + 'PAR ' + Math.round((Date.now() - new Date(par).getTime()) / 60000) + ' min ago</div>' : '') + '</div>';
    }).join('') + '<button class="cbasg cbnew" data-cb="newasg">' + I('plus') + 'Add division / group</button></section>';
    // benchmarks + log
    h += '<section class="cbside">' + mciPanel() + '<div class="cbh">' + I('check') + 'Benchmarks</div>' + marks().map(function (m) { return '<button class="cbmark' + (m.t ? ' done' : '') + '" data-cb="mark" data-a="' + m.id + '"><span>' + I(m.t ? 'check' : 'clock') + E(m.label) + '</span><i>' + (m.t ? E(CP.fmtTime(m.t)) + ' · +' + Math.round((new Date(m.t) - new Date(i.start)) / 60000) + ' min' : 'tap when done') + '</i></button>'; }).join('') +
      '<button class="btn xs ghost" data-cb="addmark">' + I('plus') + 'Benchmark</button>' +
      '<div class="cbh" style="margin-top:12px">' + I('log') + 'Activity</div><div class="cblog">' + AL(i.log).slice(-14).reverse().map(function (l) { return '<div><span class="mono">' + E(CP.fmtTime(l.ts)) + '</span> ' + E(l.text) + '</div>'; }).join('') + '</div></section></div>';
    return h;
  }
  function respPanel() {
    var c = kv('call', null); if (!c || !c.resp) return '';
    var used = {}, all = units();
    var chips = slots(c.resp).map(function (sl, ix) {
      var have = 0, tot = sl.n;
      if (sl.test) { all.forEach(function (r) { if (!used[r.id] && have < tot && sl.test(r)) { used[r.id] = 1; have++; } }); }
      else have = kv('slot_' + ix, 0) ? tot : 0;
      var cls = have >= tot ? 'ok' : have ? 'part' : 'none';
      return '<button class="cbslot ' + cls + '"' + (sl.test ? '' : ' data-cb="slot" data-a="' + ix + '"') + ' title="' + (sl.test ? 'Fills as matching units are added' : 'Tap when they arrive') + '"><b>' + E(sl.label) + '</b><span>' + have + '/' + tot + '</span></button>';
    }).join('');
    return '<div class="cbresp"><div class="cbsub" style="margin-top:0">' + E(c.type) + ' · response</div><div class="cbslots">' + chips + '</div>' + (c.note ? '<div class="dim" style="font-size:11.5px;margin-top:4px">' + E(c.note) + '</div>' : '') + '</div>';
  }
  function tile(r) {
    var on = CB.sel === r.id, st = r.status === 'En Route' ? 'enr' : r.status === 'Out of Service' ? 'oos' : r.assign ? 'asg' : 'av';
    var t = r.arrived || r.checkin; var mins = t ? Math.floor((Date.now() - new Date(t).getTime()) / 60000) : 0;
    var lk = unitLook(r);
    return '<button class="cbunit ' + st + ' ' + lk[1] + (on ? ' sel' : '') + '" data-cb="unit" data-a="' + r.id + '">' + svg(lk[0]) + '<b>' + E(r.name) + '</b><span>' + E((r.kind || '').replace(/ \(.*\)/, '').replace('Overhead', 'Chief')) + (r.status === 'En Route' ? ' · resp.' : mins ? ' · ' + mins + 'm' : '') + '</span></button>';
  }

  // ---------- phone view (read-only, live) ----------
  function phoneView() {
    var i = inc(), may = kv('mayday', null), parEvery = +kv('parEvery', 20), parDue = new Date(kv('parT', i.start)).getTime() + parEvery * 60000, left = Math.round((parDue - Date.now()) / 1000);
    var h = '<div class="cbph"><div class="cbaddr"><b>' + E(i.location.desc || i.name) + '</b><span>' + E(kv('mode', '')) + ' · ' + E(kv('cond', '')) + (i.exercise ? ' · PRACTICE' : '') + '</span></div>' +
      '<div class="cbphrow"><div><span>Elapsed</span><b id="cbEl">' + since(i.start) + '</b></div><div class="' + (left <= 0 ? 'bad-t' : '') + '"><span>PAR</span><b id="cbPar">' + (left <= 0 ? 'DUE' : Math.floor(left / 60) + ':' + CP.pad(left % 60)) + '</b></div><div><span>Units</span><b>' + units().length + '</b></div></div>' +
      (may ? '<div class="cbmaybar">' + I('warn') + ' MAYDAY · ' + E(may.who || '') + ' · ' + E(may.where || '') + '</div>' : '') + mciPanel() +
      asgs().map(function (a) { var us = unitsIn(a.id); return '<div class="cbphasg"><b>' + E(aName(a)) + '</b>' + (a.reportTo ? ' <span class="dim">· ' + E(a.reportTo) + '</span>' : '') + '<div>' + (us.length ? us.map(function (r) { return '<span class="chip">' + E(r.name) + '</span>'; }).join(' ') : '<span class="dim">—</span>') + '</div></div>'; }).join('') +
      '<div class="cbphasg"><b>Not assigned</b><div>' + units().filter(function (r) { return !r.assign; }).map(function (r) { return '<span class="chip' + (r.status === 'En Route' ? ' blue' : '') + '">' + E(r.name) + (r.status === 'En Route' ? ' (resp.)' : '') + '</span>'; }).join(' ') + '</div></div>' +
      '<div class="cbh">Benchmarks</div>' + marks().map(function (m) { return '<div class="cbphm ' + (m.t ? 'ok-t' : 'dim') + '">' + I(m.t ? 'check' : 'clock') + E(m.label) + (m.t ? ' · ' + E(CP.fmtTime(m.t)) : '') + '</div>'; }).join('') +
      '<div class="cbh">Activity</div><div class="cblog">' + AL(i.log).slice(-10).reverse().map(function (l) { return '<div><span class="mono">' + E(CP.fmtTime(l.ts)) + '</span> ' + E(l.text) + '</div>'; }).join('') + '</div>' +
      '<div class="row" style="margin-top:12px;gap:8px"><a class="btn" href="commandboard.html?incident=' + encodeURIComponent(i.id) + '&view=0">Full board</a><a class="btn" href="index.html?incident=' + encodeURIComponent(i.id) + '">Command Post</a></div><p class="dim" style="font-size:12px">Updates every few seconds.</p></div>';
    return h;
  }

  // ---------- incident closed: a clear end state ----------
  function closedScreen() {
    var i = inc(), mins = Math.round((new Date(i.closed || Date.now()) - new Date(i.start)) / 60000);
    return '<div class="cbclosed"><div class="cbclosedin"><img class="cbclosedpatch" src="' + PATCH + '" alt=""><svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="#2FBF71" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M7.5 12.5l3 3 6-6"></path></svg>' +
      '<div class="k">INCIDENT CLOSED</div><h1>' + E(i.location.desc || i.name) + '</h1>' +
      '<p>' + E(i.number) + ' · command terminated ' + E(CP.fmtDT(i.closed || CP.now())) + ' · ' + (mins >= 60 ? Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min' : mins + ' min') + (i.exercise ? ' · PRACTICE' : '') + '</p>' +
      '<p class="dim">All units released. The record is saved in Command Post' + (A.status === 'on' ? ' and county ArcGIS.' : ' and will send to ArcGIS when this device is back online.') + '</p>' +
      '<div class="cbclosedbtns"><button class="btn big pri" data-cb="home">' + I('home') + 'Command Board home</button><button class="btn big" data-cb="report">' + I('print') + 'Incident report</button><a class="btn big" href="index.html?incident=' + encodeURIComponent(i.id) + '" target="_blank" rel="noopener">' + I('link') + 'Open in Command Post</a><button class="btn big ghost" data-cb="reopen">Reopen incident</button></div></div></div>';
  }

  // ---------- render ----------
  function render() {
    var m = document.getElementById('cbmain'); if (!m) return;
    if (!A.signedIn() && !inc() && !CB.localOk) { m.innerHTML = '<div class="cbstart"><div class="cbhero"><img class="cbheropatch" src="' + PATCH + '" alt=""><h1>' + I('flag') + 'Command Board</h1><p>Sign in with your county ArcGIS account so the board is shared live with Command Post, the EOC and phones on scene. You can also start offline; it shares once you sign in.</p><button class="btn big pri" data-cb="signin">' + I('cloud') + 'Sign in with ArcGIS</button> <button class="btn big" data-cb="local">Start without signing in</button></div></div>'; return; }
    if (!inc()) { m.innerHTML = startScreen(); return; }
    var y = window.scrollY;
    var force = new URLSearchParams(location.search).get('view');
    m.innerHTML = inc().status === 'Closed' ? closedScreen() : (force === '0' ? false : phone()) ? phoneView() : board();
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
    if (kv('mci') && (!CB.mciLive || Date.now() - (CB.mciLive.t || 0) > 15000)) { var before = JSON.stringify(CB.mciLive || {}); await loadMci(); if (JSON.stringify(CB.mciLive || {}) !== before && !document.getElementById('modal')) render(); }
  }, 5000);

  // ---------- dialogs (no browser pop-ups: they are blocked in the BEACON pane and on some tablets) ----------
  function ask(title, fields, label, cb) {
    U.modal(title, fields.map(function (f, i) { return '<label class="f"><span>' + E(f.l) + '</span><input class="in big" name="q' + i + '" value="' + E(f.v || '') + '"></label>'; }).join(''),
      [{ label: 'Cancel', cls: 'ghost' }, { label: label || 'Save', cls: 'pri', fn: function (bg) { var v = fields.map(function (f, i) { return (bg.querySelector('[name="q' + i + '"]').value || '').trim(); }); if (!v[0]) { U.toast('Fill it in first', 'err'); return false; } cb(v); } }]);
  }
  function sure(title, text, label, cb) { setTimeout(function () { U.confirm(title, E(text), label, cb, true); }, 30); }

  // ---------- actions ----------
  var act = {};
  act.signin = function () { A.signIn(); };
  act.local = function () { CB.localOk = true; CB.list = []; CB.cad = []; render(); };
  act.tpl = function (k) { CB.tpl = k; if (CB.call && CB.call[2] !== k) CB.call = null; CB.addr = (document.getElementById('cbAddr') || {}).value || CB.addr; render(); };
  act.cad = function (id) { var c = (CB.cad || []).find(function (x) { return x.callid === id; }); CB.cadPick = c; CB.addr = c.addr; var ct = callFor(c.type); if (ct) { CB.call = ct; CB.tpl = ct[2]; return render(); } if (/alarm/i.test(c.type + ' ' + c.cat)) CB.tpl = 'alarm'; else if (/struct|resid|commerc|building|house/i.test(c.type)) CB.tpl = 'structure'; else if (/mci|mass casualty|multiple patient/i.test(c.type + ' ' + c.cat)) CB.tpl = 'mci'; else if (/accident|mva|collision|crash|wreck|mvc/i.test(c.type + ' ' + c.cat)) CB.tpl = 'mva'; else if (/vehicle fire|car fire/i.test(c.type)) CB.tpl = 'vehicle'; else if (/brush|woods|grass|wild/i.test(c.type)) CB.tpl = 'brush'; render(); };
  act.start = function () { startBoard().catch(function (e) { U.toast(E(e.message), 'err'); }); };
  act.open = function (k) { openBoard(k); };
  act.mode = function (m) { setKV('mode', m); commit((setFor(kv('tpl', 'other')) === SETS.fire ? 'Strategy: ' : 'Phase: ') + m.toUpperCase(), 'Decision'); };
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
      else if (k === 'rename') setTimeout(function () { ask('Rename ' + r.name, [{ l: 'Unit', v: r.name }, { l: 'Agency', v: r.agency || '' }], 'Save', function (v) { r.name = v[0].toUpperCase(); r.agency = v[1]; r.u = CP.now(); CP.touch(inc(), 'resources'); commit(null); }); }, 30);
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
      if (k === 'rename') setTimeout(function () { ask('Rename', [{ l: 'Name', v: aName(a) }], 'Save', function (v) { ['division', 'group', 'staging', 'branch'].forEach(function (f) { if (a[f]) a[f] = v[0]; }); a.u = CP.now(); CP.touch(inc(), 'assignments'); commit(null); }); }, 30);
      if (k === 'free') { unitsIn(a.id).forEach(function (r) { r.assign = ''; r.status = 'Checked In'; r.u = CP.now(); }); CP.touch(inc(), 'resources'); commit('Units released from ' + aName(a), 'Resource'); }
      if (k === 'del') sure('Remove ' + aName(a) + '?', 'Its units become unassigned.', 'Remove', function () { unitsIn(a.id).forEach(function (r) { r.assign = ''; r.status = 'Checked In'; r.u = CP.now(); }); a.del = true; a.u = CP.now(); CP.touch(inc(), 'assignments'); CP.touch(inc(), 'resources'); commit(aName(a) + ' removed', 'Action'); });
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
    if (m.t) return sure('Clear this benchmark?', m.label, 'Clear', function () { m.t = ''; m.by = ''; m.u = CP.now(); CP.touch(inc(), 'cbMarks'); commit('Benchmark cleared: ' + m.label, 'Note'); });
    m.t = CP.now(); m.by = CP.me.name || ''; m.u = CP.now(); CP.touch(inc(), 'cbMarks');
    if (/under control/i.test(m.label) && kv('cond') !== 'Under control') setKV('cond', 'Under control');
    commit('BENCHMARK: ' + m.label + ' (' + since(inc().start) + ' into the incident)', 'Event');
  };
  act.addmark = function () { ask('Add benchmark', [{ l: 'Benchmark' }], 'Add', function (v) { inc().cbMarks = inc().cbMarks || []; inc().cbMarks.push({ id: CP.uid(), label: v[0], t: '', by: '', u: CP.now() }); CP.touch(inc(), 'cbMarks'); commit(null); }); };
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
  act.mayclear = function () { var m = kv('mayday', null); if (!m) return; sure('Clear the MAYDAY?', 'Only when the member is out and accounted for.', 'Clear MAYDAY', function () { setKV('mayday', null); commit('MAYDAY cleared after ' + since(m.t) + ': ' + (m.who || ''), 'Safety'); }); };
  function canReport(a) {
    U.modal('CAN report' + (a ? ' · ' + aName(a) : ''), '<label class="f"><span>Conditions</span><input class="in" name="c" placeholder="What you see"></label><label class="f"><span>Actions</span><input class="in" name="a" placeholder="What you are doing"></label><label class="f"><span>Needs</span><input class="in" name="n" placeholder="What you need"></label>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Log it', cls: 'pri', fn: function (b) { var t = ['C: ' + U.val(b, 'c'), 'A: ' + U.val(b, 'a'), 'N: ' + U.val(b, 'n')].filter(function (x) { return x.length > 3; }).join(' · '); if (!t) return false; if (a) { a.cbCan = t; a.u = CP.now(); CP.touch(inc(), 'assignments'); } commit('CAN' + (a ? ' ' + aName(a) : '') + ': ' + t, 'Communication'); } }]);
  }
  act.can = function () { canReport(null); };
  act.note = function () { U.modal('Log entry', '<textarea class="in" id="cbNote" style="min-height:90px"></textarea><div class="cbmenu grid" style="margin-top:8px">' + ['Command transferred', 'Requested 2nd alarm', 'Utilities on scene', 'Fire marshal requested', 'Red Cross requested', 'Occupants accounted for'].map(function (q) { return '<button data-q="' + E(q) + '">' + E(q) + '</button>'; }).join('') + '</div>', [{ label: 'Cancel', cls: 'ghost' }, { label: 'Log', cls: 'pri', fn: function (b) { var t = b.querySelector('#cbNote').value.trim(); if (!t) return false; commit(t, /command/i.test(t) ? 'Decision' : 'Event'); } }], { onOpen: function (b) { b.addEventListener('click', function (e) { var q = e.target.closest('[data-q]'); if (!q) return; e.preventDefault(); var n = b.querySelector('#cbNote'); n.value = (n.value ? n.value + '. ' : '') + q.dataset.q; }); } }); };
  act.more = function () {
    var bg = U.modal('More', '<div class="cbmenu">' + [['report', 'Incident report (print / PDF)'], ['ic', 'Transfer command (new IC)'], ['upgrade', kv('tpl') === 'alarm' ? 'Upgrade: alarm is a working fire' : 'Add structure-fire assignments'], ['phonelink', 'Phone view link / QR'], ['tocp', 'Move to Command Post (full ICS)'], [inc().status === 'Closed' ? 'reopen' : 'close', inc().status === 'Closed' ? 'Reopen incident' : 'Terminate command / close incident'], ['exit', 'Back to board list']].map(function (o) { return '<button data-mo="' + o[0] + '"' + (o[0] === 'close' ? ' class="red"' : '') + '>' + E(o[1]) + '</button>'; }).join('') + '</div>', [{ label: 'Close', cls: 'ghost' }], { nofocus: true });
    bg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-mo]'); if (!b) return; e.preventDefault(); var k = b.dataset.mo; U.closeModal();
      if (k === 'ic') setTimeout(function () { ask('Transfer command', [{ l: 'New Incident Commander (name / unit)' }], 'Transfer', function (v) { var n = v[0], p = CP.person(inc(), 'IC'); if (p) { p.name = n; p.u = CP.now(); } else CP.addItem(inc(), 'org', { pos: 'IC', label: '', name: n, agency: '', phone: '', radio: '', email: '', checkin: CP.now() }); CP.touch(inc(), 'org'); commit('Command transferred to ' + n, 'Decision'); }); }, 30);
      if (k === 'upgrade') upgrade();
      if (k === 'phonelink') phoneLink();
      if (k === 'tocp') toCP();
      if (k === 'close') sure('Terminate command?', 'Releases every unit and closes the incident. The incident report opens next.', 'Terminate command', function () { var all = units(); all.forEach(function (r) { r.status = 'Released'; r.released = CP.now(); r.u = CP.now(); }); CP.touch(inc(), 'resources'); log('Command terminated. ' + all.length + ' unit(s) released. Incident closed after ' + since(inc().start) + '.', 'Decision'); CP.setPath(inc(), 'status', 'Closed'); CP.setPath(inc(), 'closed', CP.now()); commit(null); setTimeout(report, 300); });
      if (k === 'report') report();
      if (k === 'reopen') { CP.setPath(inc(), 'status', 'Active'); CP.setPath(inc(), 'closed', ''); commit('Incident reopened', 'Decision'); }
      if (k === 'exit') { CB.inc = null; history.replaceState(null, '', location.pathname); CB.list = undefined; render(); loadLists().then(render); }
    });
  };
  // ---------- incident report: everything that happened, ready to print or save as PDF ----------
  function report() {
    var i = inc(), all = AL(i.resources), lg = AL(i.log), dur = function (a, b) { if (!a) return ''; var m = Math.round(((b ? new Date(b) : new Date()) - new Date(a)) / 60000); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; };
    var row = function (c) { return '<tr>' + c.map(function (x) { return '<td>' + E(x == null ? '' : x) + '</td>'; }).join('') + '</tr>'; };
    var tbl = function (h, rows) { return '<table><thead><tr>' + h.map(function (x) { return '<th>' + E(x) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>'; };
    var asgName = function (id) { var a = CP.byId(i.assignments, id); return a ? aName(a) : ''; };
    var body = '<div class="k">BOTETOURT COUNTY EMERGENCY MANAGEMENT · ' + E(CP.BRAND) + ' COMMAND BOARD</div><h1>Incident report: ' + E(i.location.desc || i.name) + '</h1>' +
      '<div class="sub">' + E(i.number) + ' · ' + E(TEMPLATES[kv('tpl', 'other')] ? TEMPLATES[kv('tpl', 'other')].n : i.type) + (i.exercise ? ' · PRACTICE' : '') + ' · Status ' + E(i.status) + '</div>' +
      (kv('call', null) ? '<p><b>Call type:</b> ' + E(kv('call').type) + ' · <b>Recommended response:</b> ' + E(kv('call').resp || 'none') + '</p>' : '') + (kv('mci', null) ? '<p><b>MCI declared</b> ' + E(CP.fmtDT(kv('mci').t)) + ' · patients ' + mciCounts().total + ' (red ' + mciCounts().red + ', yellow ' + mciCounts().yellow + ', green ' + mciCounts().green + ', black ' + mciCounts().black + ')</p>' : '') +
      tbl(['Started', 'Closed', 'Duration', 'Incident Commander', 'Final strategy', 'Conditions', 'Units'], [row([CP.fmtDT(i.start), i.closed ? CP.fmtDT(i.closed) : 'Open', dur(i.start, i.closed || null), CP.personName(i, 'IC'), kv('mode', ''), kv('cond', ''), all.length])]) +
      '<h2>Benchmarks</h2>' + tbl(['Benchmark', 'Time', 'Into incident', 'By'], marks().map(function (m) { return row([m.label, m.t ? CP.fmtTime(m.t) : 'not reached', m.t ? dur(i.start, m.t) : '', m.by]); })) +
      '<h2>Units</h2>' + tbl(['Unit', 'Type', 'Agency', 'Arrived', 'Last assignment', 'Status', 'Released', 'Time on scene'], all.map(function (r) { return row([r.name, r.kind, r.agency, r.arrived || r.checkin ? CP.fmtTime(r.arrived || r.checkin) : '', asgName(r.assign) || (lg.slice().reverse().find(function (l) { return l.text.indexOf(r.name + ' assigned to ') === 0; }) || { text: '' }).text.replace(r.name + ' assigned to ', ''), r.status, r.released ? CP.fmtTime(r.released) : '', dur(r.arrived || r.checkin, r.released || i.closed || null)]); })) +
      '<h2>Divisions & groups</h2>' + tbl(['Assignment', 'Supervisor', 'Task', 'Last CAN report'], asgs().map(function (a) { return row([aName(a), a.reportTo, a.work, a.cbCan]); })) +
      '<h2>Safety: PAR and MAYDAY</h2>' + tbl(['Time', 'Entry'], lg.filter(function (l) { return /^(PAR|MAYDAY)/.test(l.text); }).map(function (l) { return row([CP.fmtTime(l.ts), l.text]); }).concat(lg.some(function (l) { return /^(PAR|MAYDAY)/.test(l.text); }) ? [] : [row(['', 'No PAR or MAYDAY recorded'])])) +
      '<h2>Complete timeline</h2>' + tbl(['Time', 'Elapsed', 'Category', 'Entry', 'By'], lg.map(function (l) { return row([CP.fmtTime(l.ts), dur(i.start, l.ts), l.cat, l.text, l.author]); })) +
      '<div class="foot">Generated ' + E(CP.fmtDT(CP.now())) + ' by ' + E(CP.me.name || '') + '. The same record is in Command Post (Reports: ICS 201, 211, 214) and in county ArcGIS (BOCO_Command_Post).</div>';
    var css = '<style>body{font:12px/1.35 Arial,sans-serif;color:#111;margin:24px}h1{font:800 18px Arial;margin:2px 0}h2{font:700 13px Arial;margin:16px 0 6px;border-bottom:2px solid #0B1A2B;text-transform:uppercase;letter-spacing:.5px}.k{font:700 10px Arial;letter-spacing:2px;color:#555}.sub{color:#444;margin-bottom:10px}table{width:100%;border-collapse:collapse;margin-bottom:6px}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eef1f5;font-size:11px}.foot{margin-top:16px;font-size:10px;color:#666}@media print{button{display:none}}</style>';
    var html = '<!doctype html><html><head><meta charset="utf-8"><title>Incident report ' + E(i.number) + '</title>' + css + '</head><body>' + body + '</body></html>';
    var fname = 'Incident report ' + i.number + ' ' + (i.location.desc || '').replace(/[^\w ,-]+/g, '').slice(0, 40) + '.html';
    var bg = U.modal('Incident report', '<div class="cbreport">' + body + '</div>', [{ label: I('down') + 'Download', cls: 'ghost', fn: function () { U.download(fname, html, 'text/html'); return false; } }, { label: I('print') + 'Print / save as PDF', cls: 'pri', fn: function () {
      var w = window.open('', '_blank'); if (w) { w.document.write(html + '<script>setTimeout(function(){print()},300)<\/script>'); w.document.close(); } else { U.download(fname, html, 'text/html'); U.toast('Downloaded. Open it and print to save a PDF.', 'ok', 6000); } return false; } }, { label: 'Close', cls: 'ghost' }], { wide: true });
    return bg;
  }

  // ---------- MCI ----------
  function mciLevel(n) { return n <= 15 ? 4 : n <= 30 ? 3 : n <= 100 ? 2 : 1; }
  function mciCounts() {
    var live = CB.mciLive, t = kv('mciTally', {}) || {};
    var c = live && live.ok ? live.c : { red: t.red || 0, yellow: t.yellow || 0, green: t.green || 0, black: t.black || 0 };
    c.total = c.red + c.yellow + c.green + c.black; return c;
  }
  async function loadMci() {
    if (!inc() || !kv('mci') || A.status !== 'on') return;
    try {
      if (!CB.ptUrl) {
        for (var nm of ['BOCO_EMS_PatientCare', 'BOCO_EMS_PatientCare_Field']) {
          var r = await A.req(A.portal + '/sharing/rest/search', { q: 'title:"' + nm + '" AND orgid:' + A.user.orgId, num: 2 }); var it = (r.results || []).find(function (x) { return x.title === nm; }); if (!it) continue;
          var info = await A.req(it.url, {}); var l = (info.layers || []).concat(info.tables || []).find(function (x) { return x.name === 'PROT_MCI_Patients'; }); if (l) { CB.ptUrl = it.url.replace(/\/$/, '') + '/' + l.id; break; }
        }
        if (!CB.ptUrl) { CB.mciLive = { ok: false }; return; }
      }
      var st = await A.stats(CB.ptUrl, 'incident_key=' + A.sq(inc().id), [{ statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'n' }], 'triage');
      var c = { red: 0, yellow: 0, green: 0, black: 0 }; st.forEach(function (x) { var t = x.triage || ''; if (/Red/.test(t)) c.red += x.n; else if (/Yellow/.test(t)) c.yellow += x.n; else if (/Green/.test(t)) c.green += x.n; else if (/Black|Gray/.test(t)) c.black += x.n; });
      CB.mciLive = { ok: true, c: c, t: Date.now() };
    } catch (e) { CB.mciLive = { ok: false }; }
  }
  function mciPanel() {
    var m = kv('mci', null); if (!m) return '';
    var c = mciCounts(), lv = c.total ? mciLevel(c.total) : (m.est ? mciLevel(m.est) : 4), live = CB.mciLive && CB.mciLive.ok;
    var cell = function (k, lab, cls) { return '<div class="cbtri ' + cls + '"><b>' + c[k] + '</b><span>' + lab + '</span>' + (live ? '' : '<div class="row"><button class="btn xs" data-cb="tally" data-a="' + k + '|-1" aria-label="Minus ' + lab + '">−</button><button class="btn xs" data-cb="tally" data-a="' + k + '|1" aria-label="Plus ' + lab + '">+</button></div>') + '</div>'; };
    return '<div class="cbmci"><div class="cbh" style="color:#ffb3b8">' + svg('mci') + 'MCI · LEVEL ' + lv + '<span class="ct">' + c.total + (m.est && !c.total ? ' est ' + m.est : '') + '</span></div>' +
      '<div class="cbtris">' + cell('red', 'Red', 'r') + cell('yellow', 'Yellow', 'y') + cell('green', 'Green', 'g') + cell('black', 'Black', 'k') + '</div>' +
      (lv <= 2 ? '<div class="cbrhcc">' + I('phone') + ' Level ' + lv + ': call RHCC <b>1-866-679-7422</b></div>' : '') +
      '<div class="row" style="gap:6px;margin-top:8px"><a class="btn sm pri" href="mci.html?incident=' + encodeURIComponent(inc().id) + '" target="_blank" rel="noopener">' + I('med') + 'MCI patient tracking</a></div>' +
      '<div class="dim" style="font-size:11.5px;margin-top:4px">' + (live ? 'Live from MCI patient tracking.' : 'Tap +/− to keep a tally here; triage in the MCI app for full tracking.') + '</div></div>';
  }
  act.tally = function (a) { var p = a.split('|'), t = Object.assign({}, kv('mciTally', {}) || {}); t[p[0]] = Math.max(0, (t[p[0]] || 0) + (+p[1])); setKV('mciTally', t); var c = mciCounts(); var was = kv('mciLv', 4), now = mciLevel(c.total); if (now !== was) { setKV('mciLv', now); return commit('MCI now Level ' + now + ' (' + c.total + ' patients)', 'Event'); } commit(null, null, true); render(); };
  act.mci = function () {
    if (kv('mci')) { U.toast('MCI is already declared on this incident.', 'ok'); return; }
    U.modal('Declare MCI', '<p style="margin-top:0">Turns this incident into a mass casualty incident: adds Triage, Treatment, Transport and Ambulance Staging, MCI benchmarks and a live patient count, and opens MCI patient tracking on the same incident.</p><label class="f"><span>Estimated patients</span><input class="in big" name="est" type="number" min="1" inputmode="numeric" placeholder="e.g. 8"></label>' +
      '<div class="dim" style="font-size:13px">EOP levels: 4 = up to 15 · 3 = 16–30 · 2 = 31–100 · 1 = 101+ (call RHCC at Level 2 or 1).</div>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: svg('mci') + 'Declare MCI', cls: 'red', fn: function (b) {
        var est = +U.val(b, 'est') || 0, lv = mciLevel(est || 1), have = asgs().map(aName);
        TEMPLATES.mci.assign.forEach(function (a) { if (have.indexOf(a[1]) >= 0) return; var o = { branch: '', division: '', group: '', staging: '', work: '', special: '', needs: [], reportTo: '' }; o[a[0]] = a[1]; CP.addItem(inc(), 'assignments', o); });
        var hm = marks().map(function (x) { return x.label; }); TEMPLATES.mci.marks.forEach(function (x) { if (hm.indexOf(x) < 0) inc().cbMarks.push({ id: CP.uid(), label: x, t: '', by: '', u: CP.now() }); });
        var first = inc().cbMarks.find(function (x) { return x.label === 'MCI declared · level set'; }); if (first) { first.t = CP.now(); first.by = CP.me.name || ''; first.u = CP.now(); } CP.touch(inc(), 'cbMarks');
        setKV('mci', { t: CP.now(), est: est }); setKV('mciLv', lv); if (setFor(kv('tpl', 'other')) !== SETS.fire) { setKV('mode', 'Triage'); setKV('cond', 'Patients still being found'); }
        if (lv <= 3 && inc().complexity > 3) CP.setPath(inc(), 'complexity', 3);
        commit('MCI DECLARED: Level ' + lv + (est ? ' (about ' + est + ' patients)' : '') + '. Triage, Treatment, Transport and Ambulance Staging established.' + (lv <= 2 ? ' Call RHCC 1-866-679-7422.' : ''), 'Decision');
        loadMci().then(render);
      } }]);
  };

  function upgrade() {
    var T = TEMPLATES.structure, have = asgs().map(aName);
    T.assign.forEach(function (a) { if (have.indexOf(a[1]) >= 0) return; var o = { branch: '', division: '', group: '', staging: '', work: '', special: '', needs: [], reportTo: '' }; o[a[0]] = a[1]; CP.addItem(inc(), 'assignments', o); });
    var hm = marks().map(function (m) { return m.label; }); T.marks.forEach(function (m) { if (hm.indexOf(m) < 0) inc().cbMarks.push({ id: CP.uid(), label: m, t: '', by: '', u: CP.now() }); }); CP.touch(inc(), 'cbMarks');
    setKV('tpl', 'structure'); setKV('mode', 'Offensive'); setKV('cond', 'Working fire');
    var cc = kv('call', null); if (cc && !/ON-CALL/.test(cc.resp)) setKV('call', { type: cc.type, resp: (cc.resp ? cc.resp + ', ' : '') + 'ON-CALL, POWER COMPANY', note: 'Working fire adds on-call and the power company' });
    var nm = inc().name.replace(/Fire alarm/, 'Structure fire'); if (nm !== inc().name) CP.setPath(inc(), 'name', nm);
    commit('UPGRADED to working structure fire', 'Decision');
  }
  function toCP() {
    var i = inc(); if (i.complexity >= 5) CP.setPath(i, 'complexity', 4);
    commit('Moved to Command Post (full ICS). Units, assignments and log carried over.', 'Decision', true);
    window.open('index.html?incident=' + encodeURIComponent(i.id) + '&view=dash', '_blank');
  }
  act.slot = function (ix) { setKV('slot_' + ix, !kv('slot_' + ix, 0)); commit(null); };
  act.home = function () { CB.inc = null; CB.sel = null; history.replaceState(null, '', location.pathname); CB.list = undefined; CB.cad = undefined; render(); loadLists().then(render); };
  act.report = function () { report(); };
  act.reopen = function () { CP.setPath(inc(), 'status', 'Active'); CP.setPath(inc(), 'closed', ''); commit('Incident reopened', 'Decision'); };
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
  document.addEventListener('change', function (e) { var el = e.target.closest('[data-cbchg="call"]'); if (!el) return; CB.addr = (document.getElementById('cbAddr') || {}).value || CB.addr; CB.call = CALLS.find(function (c) { return c[0] === el.value; }) || null; if (CB.call) CB.tpl = CB.call[2]; render(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && CB.sel && !document.getElementById('modal')) { CB.sel = null; render(); } });
  window.addEventListener('resize', function () { clearTimeout(CB._rz); CB._rz = setTimeout(render, 200); });
  window.addEventListener('cp-incident-synced', function (ev) { if (inc() && inc().id === ev.detail) { var s = CP.store.get(ev.detail); if (s) { CB.inc = CP.merge(inc(), s); render(); } } });
  window.addEventListener('cp-reconnected', function () { if (inc()) push(); });

  // ---------- boot ----------
  CB.boot = async function () {
    CP.me = CP.store.prefs().me || {};
    document.getElementById('app').innerHTML = '<header class="cbfire"><div class="cbpatchbox"><img class="cbpatch" src="' + PATCH + '" alt="Botetourt County Fire &amp; EMS patch" onerror="this.onerror=null;this.src=\'seal.png\'"></div><div class="cblock"><div class="k">BOTETOURT COUNTY</div><div class="t">FIRE <i>&amp;</i> EMS</div><div class="s">COMMAND BOARD</div></div><span class="sp" style="flex:1"></span><button class="btn cbhome" data-cb="home" title="Command Board home: all open incidents">' + I('home') + 'Home</button>' + CP.beaconMark() + '</header><main id="cbmain" class="cbwrap"></main>';
    try { if (await A.handleRedirect() === 'away') return; } catch (e) {}
    var qs = new URLSearchParams(location.search), want = qs.get('incident');
    render();
    if (A.signedIn()) await A.connect();
    if (want) await openBoard(want); else { await loadLists(); render(); }
  };
})(window.CP);
