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
    triage: '<path d="M5 3h14v18H5zM9 7h6M9 11h6M9 15h3"/>',
    pen: '<path d="M4 20l1-5L16 4l4 4L9 19zM14 6l4 4"/>',
    eraser: '<path d="M8 20h12M5 15l9-9 5 5-7 7H8z"/>',
    cam: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'
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
      var f = await A.query(A.L.cad, A.CAD_FIRE_EMS, { geom: true, order: 'calldate DESC', n: 60, fields: 'callid,callcat,calltype,fulladdr,city,calldate,agency' });
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
    CB.inc = i; CB.tab = 'board';
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
    var r = CP.addItem(inc(), 'resources', { name: name, kind: kind || kindOf(name), type: '', agency: agency || '', leader: '', persons: crewDefault(kind || kindOf(name)), contact: '', orderNo: '', checkinLoc: 'Scene', status: status || 'Checked In', assign: '', checkin: CP.now() });
    if (!quiet) log(name + (status === 'En Route' ? ' responding' : ' on scene'), 'Resource');
    return r;
  }
  function moveUnit(r, aid) {
    var a = aid ? CP.byId(inc().assignments, aid) : null;
    var was = r.assign ? CP.byId(inc().assignments, r.assign) : null;
    if (isWork(a)) { if (!r.workT || !isWork(was)) r.workT = CP.now(); } else r.workT = '';
    if (a && aid !== r.assign) { r.asgT = CP.now(); r.ack = ''; }
    r.assign = aid || ''; r.status = !a ? 'Checked In' : a.staging ? 'Staged' : 'Assigned'; r.u = CP.now(); if (r.status !== 'En Route' && !r.arrived) r.arrived = CP.now(); CP.touch(inc(), 'resources');
    commit(r.name + (a ? ' assigned to ' + aName(a) : ' available (unassigned)'), 'Resource');
  }

  // quick log picks, by incident type
  var QUICK = {
    fire: ['Command transferred', 'Primary search all clear', 'Requested 2nd alarm', 'Utilities on scene', 'Occupants accounted for', 'Fire marshal requested', 'Red Cross requested', 'Exposures protected'],
    mva: ['Patient extricated', 'Helicopter requested', 'Landing zone set', 'Patients transported', 'Traffic diverted', 'Vehicle stabilized', 'Tow requested', 'VSP on scene'],
    mci: ['Triage complete', 'RHCC notified', 'Hospitals notified', 'Bus requested', 'Last patient transported', 'Additional ambulances requested', 'Helicopter requested', 'Command transferred'],
    rescue: ['Patient located', 'Patient accessed', 'Patient packaged', 'Patient removed', 'Rope system set', 'Helicopter requested', 'Command transferred'],
    hazard: ['Area evacuated', 'Readings taken', 'Utilities on scene', 'Hazmat team requested', 'Source located', 'All clear', 'Command transferred'],
    other: ['Command transferred', 'Additional units requested', 'Utilities on scene', 'Red Cross requested', 'All clear']
  };
  function quickFor() { var t = kv('tpl', 'other'); if (kv('mci') && t !== 'mci') return QUICK.mci; return QUICK[/^(alarm|structure|vehicle|brush)$/.test(t) ? 'fire' : t] || QUICK.other; }
  function saveNote(t) { t = (t || '').trim(); if (!t) return false; commit(t, /command/i.test(t) ? 'Decision' : 'Event'); return true; }

  // ---------- the board ----------
  function phone() { return window.innerWidth < 720 || new URLSearchParams(location.search).get('view') === '1'; }
  function board() {
    var i = inc(), mode = kv('mode', ''), cond = kv('cond', ''), parEvery = +kv('parEvery', 20), parT = kv('parT', i.start), parDue = new Date(parT).getTime() + parEvery * 60000, parLeft = Math.round((parDue - Date.now()) / 1000);
    var may = kv('mayday', null), ic = CP.personName(i, 'IC');
    var h = '<div class="cbx">';
    // top: where, clock, PAR, MAYDAY
    h += '<div class="cbtop' + (may ? ' mayday' : '') + '"><div class="cbaddr">' + svg(tplOf(i).icon || 'flag', 'big t-' + kv('tpl', 'other')) + '<div><b>' + E(i.location.desc || i.name) + '</b><span>' + E(i.number) + ' · ' + E(TEMPLATES[kv('tpl', 'other')] ? TEMPLATES[kv('tpl', 'other')].n : i.type) + (ic ? ' · IC ' + E(ic) : '') + (i.exercise ? ' · <span class="chip practice">PRACTICE</span>' : '') + (kv('mci') ? ' · <span class="chip red">MCI</span>' : '') + '</span></div><span class="sync on" id="cbSync"></span></div>' +
      '<div class="cbclock"><span>ELAPSED</span><b id="cbEl">' + since(i.start) + '</b></div>' +
      '<button class="cbpar' + (parLeft <= 0 ? ' due' : parLeft < 120 ? ' soon' : '') + '" data-cb="par"><span>PAR · ' + ppl(onScene()) + ' on scene</span><b id="cbPar">' + (parLeft <= 0 ? 'DUE ' + since(new Date(parDue).toISOString()) : Math.floor(parLeft / 60) + ':' + CP.pad(parLeft % 60)) + '</b><i class="cbparbar"><i id="cbParBar" style="width:' + Math.max(0, Math.min(100, parLeft / (parEvery * 60) * 100)).toFixed(1) + '%"></i></i></button>' +
      '<button class="cbmay" data-cb="mayday">' + I('warn') + (may ? 'MAYDAY ACTIVE' : 'MAYDAY') + '</button></div>';
    if (may) h += '<div class="cbmaybar">' + I('warn') + ' MAYDAY ' + E(since(may.t)) + ' · ' + E(may.who || '') + ' · ' + E(may.where || '') + ' · ' + E(may.air || '') + (may.rit ? ' · RIT: ' + E(may.rit) : '') + ' <button class="btn sm" data-cb="mayclear">Clear MAYDAY</button></div>';
    if (CB.tab === 'map') h += mapView(); else if (CB.tab === 'wb') h += wbView(); else {
    var free = units().filter(function (r) { return !r.assign; }), enr = free.filter(function (r) { return r.status === 'En Route'; }), avail = free.filter(function (r) { return r.status !== 'En Route'; });
    var su = CB.sel ? CP.byId(i.resources, CB.sel) : null;
    h += '<div class="cb3">';
    // LEFT: units waiting + add buttons
    h += '<section class="cbcol cbcolU"><div class="cbh">' + I('truck') + 'Waiting <span class="ct">' + free.length + '</span><span class="sp" style="flex:1"></span><span class="dim cbhint">' + units().length + ' on incident</span></div><div class="cbscroll cbuw">' +
      (avail.length ? avail.map(tile).join('') : '') + (enr.length ? '<div class="cbsub">Responding</div>' + enr.map(tile).join('') : '') +
      (free.length ? '' : '<div class="dim cbempty">' + (units().length ? 'All units are on a task.' : 'No units yet. Tap a unit type below to add one.') + '</div>') + '</div>' +
      '<div class="cbh sm">' + I('plus') + 'Add unit</div><div class="cbadd">' + KINDS.map(function (k) { return '<button data-cb="addk" data-a="' + k[0] + '" title="' + E(k[2]) + '">' + E(k[0]) + '</button>'; }).join('') + '</div>' +
      '<button class="btn cbcad" data-cb="cadunits">' + I('radio') + 'From CAD</button></section>';
    // CENTER: divisions and groups, all visible
    h += '<section class="cbcol cbcolA">' + longBar() + (su ? '<div class="cbpick"><div><b>' + E(su.name) + '</b> selected · tap a division or group to assign</div><div class="cbpickb">' +
        (su.assign || su.status === 'En Route' ? '<button class="btn" data-cb="qa" data-a="">' + I('check') + 'Available</button>' : '') +
        (workMin(su) ? '<button class="btn" data-cb="torehab" data-a="' + su.id + '">' + svg('rehab') + 'Rehab</button>' : '') + '<button class="btn" data-cb="crew" data-a="' + su.id + '">' + I('users') + (+su.persons ? su.persons + ' riding' : 'Crew') + '</button><button class="btn" data-cb="unote" data-a="' + su.id + '">' + I('log') + (su.note ? 'Edit note' : 'Note') + '</button><button class="btn" data-cb="umenu" data-a="' + su.id + '">' + I('menu') + 'Options</button><button class="btn ghost" data-cb="desel">Cancel</button></div></div>'
        : '<div class="cbh">' + svg('div') + 'Divisions & groups <span class="ct">' + asgs().filter(function (a) { return unitsIn(a.id).length; }).length + ' staffed</span><span class="sp" style="flex:1"></span><span class="dim cbhint">Tap a unit, then tap where it goes</span></div>') +
      '<div class="cbscroll"><div class="cbgrid">' + asgs().map(function (a) {
        var us = unitsIn(a.id), sup = a.reportTo || '', par = kv('par_' + a.id, null), can = a.cbCan || '', al = asgLook(a);
        return '<div id="asg_' + a.id + '" class="cbasg ' + al[1] + (a.staging ? ' stg' : a.division ? ' div' : '') + (su ? ' target' + (su.assign === a.id ? ' cur' : '') : '') + (us.length ? '' : ' empty') + '" data-cb="drop" data-a="' + a.id + '"><div class="cbah">' + svg(al[0], 'ah') + '<b>' + E(aName(a)) + '</b><span class="ct">' + us.length + '</span>' + (sup ? '<span class="sup">' + E(sup) + '</span>' : '') + '<button class="ibtn" data-cb="amenu" data-a="' + a.id + '" title="Assignment options">' + I('menu') + '</button></div>' +
          '<div class="cbau">' + (us.length ? us.map(tile).join('') : '<div class="dim">' + (su ? 'Tap to assign ' + E(su.name) + ' here' : 'No units') + '</div>') + '</div>' +
          (can || a.work ? '<div class="cbcan">' + E(can || a.work).slice(0, 120) + '</div>' : '') + (par ? '<div class="cbpok">' + I('check') + 'PAR ' + Math.round((Date.now() - new Date(par).getTime()) / 60000) + ' min ago</div>' : '') + '</div>';
      }).join('') + '<button class="cbasg cbnew" data-cb="newasg">' + I('plus') + 'Add division / group</button></div></div></section>';
    // RIGHT: status, benchmarks, notes
    var SET = setFor(kv('tpl', 'other')) === SETS.fire && kv('mci') ? SETS.mci : setFor(kv('tpl', 'other'));
    h += '<section class="cbcol cbcolS"><div class="cbscroll">' +
      '<div class="cbh sm">' + (setFor(kv('tpl', 'other')) === SETS.fire ? 'Strategy' : 'Phase') + '</div><div class="cbbtns">' + SET[0].map(function (m) { return '<button class="' + (m === mode ? 'on' : '') + (m === 'Defensive' ? ' def' : '') + '" data-cb="mode" data-a="' + E(m) + '">' + E(m) + '</button>'; }).join('') + '</div>' +
      '<div class="cbh sm">Conditions</div><div class="cbbtns">' + SET[1].map(function (c) { return '<button class="' + (c === cond ? 'on' : '') + '" data-cb="cond" data-a="' + E(c) + '">' + E(c) + '</button>'; }).join('') + '</div>' +
      respPanel() + mciPanel() +
      '<div class="cbh sm">' + I('check') + 'Benchmarks <span class="ct">' + marks().filter(function (m) { return m.t; }).length + '/' + marks().length + '</span></div><div class="cbmarks">' + marks().map(function (m) { return '<button class="cbmark' + (m.t ? ' done' : '') + '" data-cb="mark" data-a="' + m.id + '" title="' + (m.t ? 'Done ' + E(CP.fmtTime(m.t)) : 'Tap when done') + '">' + I(m.t ? 'check' : 'clock') + '<span>' + E(m.label) + '</span>' + (m.t ? '<i>' + E(CP.fmtTime(m.t)) + '</i>' : '') + '</button>'; }).join('') +
      '<button class="cbmark add" data-cb="addmark">' + I('plus') + '<span>Add</span></button></div>' +
      photoStrip() + '<div class="cbh sm">' + I('log') + 'Quick log</div><div class="cbqk">' + quickFor().map(function (q) { return '<button data-cb="quick" data-a="' + E(q) + '">' + E(q) + '</button>'; }).join('') + '</div>' +
      '<div class="cbnote"><input id="cbQuick" class="in" placeholder="Type a note…"><button class="btn pri" data-cb="notesave">Save</button></div>' +
      '<div class="cblog">' + AL(i.log).slice(-12).reverse().map(function (l) { return '<div><span class="mono">' + E(CP.fmtTime(l.ts)) + '</span> ' + E(l.text) + '</div>'; }).join('') + '</div></div></section>';
    h += '</div>';
    }
    // BOTTOM: big action buttons
    h += '<div class="cbact">' + (kv('mci') ? '' : '<button class="red" data-cb="mci">' + svg('mci') + '<span>Declare MCI</span></button>') +
      '<button data-cb="can">' + I('msg') + '<span>CAN report</span></button><button data-cb="note">' + I('log') + '<span>Log entry</span></button><button data-cb="xfer">' + I('users') + '<span>Transfer IC</span></button><button data-cb="photo">' + svg('cam') + '<span>Photo</span></button><button data-cb="report">' + I('print') + '<span>Report</span></button><button data-cb="more">' + I('menu') + '<span>More</span></button>' +
      '<a class="pri" href="index.html?incident=' + encodeURIComponent(i.id) + '" target="_blank" rel="noopener" data-cb="tocp">' + I('link') + '<span>Command Post</span></a></div>';
    return h + '</div>';
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
    var lk = unitLook(r), wm = workMin(r), av = r.status === 'En Route' ? avlFor(r) : null, kind = E((r.kind || '').replace(/ \(.*\)/, '').replace('Overhead', 'Chief'));
    var sub = r.status === 'En Route' ? (av && av.mi != null ? av.mi.toFixed(1) + ' mi out' : 'responding') : wm ? 'working ' + wm + 'm' : kind;
    var wc = wm >= wkMax() ? ' wkover' : wm >= wkWarn() ? ' wkwarn' : '';
    return '<button class="cbunit ' + st + ' ' + lk[1] + (on ? ' sel' : '') + wc + '" draggable="true" data-cb="unit" data-a="' + r.id + '">' + svg(lk[0]) + '<b>' + E(r.name) + (+r.persons ? '<em class="cbpp">' + r.persons + '</em>' : '') + (r.ack && r.asgT && r.ack >= r.asgT ? '<em class="cback" title="Acknowledged">✓</em>' : '') + (CB.tab === 'map' && r.lat != null && r.lat !== '' ? '<em class="cbpin" title="On the map">●</em>' : '') + '</b><span>' + sub + '</span>' + (r.note ? '<em class="cbun">' + E(r.note) + '</em>' : '') + '</button>';
  }

  // ---------- phone view (read-only, live) ----------
  function phoneView() {
    var i = inc(), may = kv('mayday', null), parEvery = +kv('parEvery', 20), parDue = new Date(kv('parT', i.start)).getTime() + parEvery * 60000, left = Math.round((parDue - Date.now()) / 1000);
    var h = '<div class="cbph">' + myUnitCard() + '<div class="cbaddr"><b>' + E(i.location.desc || i.name) + '</b><span>' + E(kv('mode', '')) + ' · ' + E(kv('cond', '')) + (i.exercise ? ' · PRACTICE' : '') + '</span></div>' +
      '<div class="cbphrow"><div><span>Elapsed</span><b id="cbEl">' + since(i.start) + '</b></div><div class="' + (left <= 0 ? 'bad-t' : '') + '"><span>PAR</span><b id="cbPar">' + (left <= 0 ? 'DUE' : Math.floor(left / 60) + ':' + CP.pad(left % 60)) + '</b></div><div><span>Units</span><b>' + units().length + '</b></div></div>' +
      (may ? '<div class="cbmaybar">' + I('warn') + ' MAYDAY · ' + E(may.who || '') + ' · ' + E(may.where || '') + '</div>' : '') + mciPanel() +
      asgs().map(function (a) { var us = unitsIn(a.id); return '<div class="cbphasg"><b>' + E(aName(a)) + '</b>' + (a.reportTo ? ' <span class="dim">· ' + E(a.reportTo) + '</span>' : '') + '<div>' + (us.length ? us.map(function (r) { return '<span class="chip">' + E(r.name) + (r.note ? ' · ' + E(r.note) : '') + '</span>'; }).join(' ') : '<span class="dim">—</span>') + '</div></div>'; }).join('') +
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
    document.body.classList.remove('cbfit');
    if (!A.signedIn() && !inc() && !CB.localOk) { m.innerHTML = '<div class="cbstart"><div class="cbhero"><img class="cbheropatch" src="' + PATCH + '" alt=""><h1>' + I('flag') + 'Command Board</h1><p>Sign in with your county ArcGIS account so the board is shared live with Command Post, the EOC and phones on scene. You can also start offline; it shares once you sign in.</p><button class="btn big pri" data-cb="signin">' + I('cloud') + 'Sign in with ArcGIS</button> <button class="btn big" data-cb="local">Start without signing in</button></div></div>'; return; }
    if (!inc()) { var hv = CB.htab === 'map' ? homeMapView() : CB.htab === 'wb' ? homeWbView() : startScreen(); m.innerHTML = hv; document.body.classList.toggle('cbfit', CB.htab !== 'home'); var ts0 = document.getElementById('cbTabSlot'); if (ts0) ts0.innerHTML = homeTabs(); if (CB.htab === 'map') homeMapMount(); if (CB.htab === 'wb') wbMount(); return; }
    var y = window.scrollY, qn = document.getElementById('cbQuick'), qv = qn ? qn.value : '', qf = qn && document.activeElement === qn;
    var force = new URLSearchParams(location.search).get('view');
    m.innerHTML = inc().status === 'Closed' ? closedScreen() : (force === '0' ? false : phone()) ? phoneView() : board();
    document.body.classList.toggle('cbfit', !!m.querySelector('.cbx'));
    var ts = document.getElementById('cbTabSlot'); if (ts) ts.innerHTML = m.querySelector('.cbx') ? tabs() : '';
    if (m.querySelector('#cbMapHost')) mapMount(); if (m.querySelector('#cbWbHost')) wbMount();
    document.body.classList.toggle('practice', !!inc().exercise); CP.practice = !!inc().exercise;
    var q2 = document.getElementById('cbQuick'); if (q2 && qv) { q2.value = qv; } if (q2 && qf) { q2.focus(); try { q2.setSelectionRange(qv.length, qv.length); } catch (x) {} }
    paintSync(); window.scrollTo(0, y);
  }
  setInterval(function () {
    if (!inc()) return; var i = inc();
    var el = document.getElementById('cbEl'); if (el) el.textContent = since(i.start);
    var p = document.getElementById('cbPar'); if (p) { var due = new Date(kv('parT', i.start)).getTime() + (+kv('parEvery', 20)) * 60000, left = Math.round((due - Date.now()) / 1000); p.textContent = left <= 0 ? 'DUE ' + since(new Date(due).toISOString()) : Math.floor(left / 60) + ':' + CP.pad(left % 60); var b = p.closest('.cbpar'); if (b) { b.classList.toggle('due', left <= 0); b.classList.toggle('soon', left > 0 && left < 120); if (left === 0 && navigator.vibrate) navigator.vibrate([200, 100, 200]); } var pb = document.getElementById('cbParBar'); if (pb) pb.style.width = Math.max(0, Math.min(100, left / ((+kv('parEvery', 20)) * 60) * 100)).toFixed(1) + '%'; }
  }, 1000);
  // pull others' changes (phones and other tablets stay in step)
  setInterval(async function () {
    if (!inc() || A.status !== 'on' || CB.saving || CB.drawing || document.getElementById('modal')) return;
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
  // =================== tabs: board · map · whiteboard ===================
  CB.tab = CB.tab || 'board';
  act.tab = function (t) { CB.tab = t; CB.sel = null; CB.placing = null; render(); };
  CB.htab = CB.htab || 'home';
  act.htab = function (t) { CB.htab = t; render(); };
  function homeTabs() { return '<div class="cbtabs">' + [['home', 'home', 'Start'], ['map', 'map', 'Live map'], ['wb', 'pen', 'Whiteboard']].map(function (t) { return '<button class="' + (CB.htab === t[0] ? 'on' : '') + '" data-cb="htab" data-a="' + t[0] + '">' + (t[1] === 'pen' ? svg('pen') : I(t[1])) + '<span>' + t[2] + '</span></button>'; }).join('') + '</div>'; }
  act.cadgo = function (id) { CB.htab = 'home'; act.cad(id); if (CB.map) CB.map.closePopup(); };
  function homeMapView() {
    var calls = (CB.cad || []).filter(function (c) { return c.ll; }), u = CB.avl || [];
    var side = '<section class="cbcol cbmapside"><div class="cbscroll"><div class="cbh">' + I('radio') + 'Active fire & EMS calls <span class="ct">' + (CB.cad || []).length + '</span></div>' +
      (CB.cad === undefined ? '<div class="dim cbempty">Loading CAD…</div>' : !(CB.cad || []).length ? '<div class="dim cbempty">' + (A.signedIn() ? 'No active fire or EMS calls.' : 'Sign in to see CAD.') + '</div>' :
        CB.cad.map(function (c) { return '<button class="cbcad" data-cb="cadgo" data-a="' + E(c.callid) + '"><b>' + E(c.type || c.cat) + '</b><span>' + E(c.addr) + '</span><i>' + E(c.cat || '') + ' · ' + E((c.units || []).map(function (x) { return x.id; }).join(', ') || 'no units') + ' · tap to start a board</i></button>'; }).join('')) +
      '<div class="cbh sm">Live fire & EMS units <span class="ct">' + u.length + '</span></div>' + (A.status !== 'on' ? '<div class="dim cbempty">Sign in to see live unit locations.</div>' : !CB.avl ? '<div class="dim cbempty">Loading…</div>' :
        u.slice().sort(function (a, b) { return (a.stale - b.stale) || String(a.id).localeCompare(String(b.id)); }).map(function (v) { return '<div class="cbrow2' + (v.stale ? ' stale' : '') + '"><b>' + E(v.id) + '</b><span>' + E(v.type.toLowerCase()) + ' · ' + E(v.st.toLowerCase()) + (v.stale ? ' · old position' : '') + '</span></div>'; }).join('')) +
      '</div></section>';
    return '<div class="cbx cbhome"><div class="cbmapv">' + side + '<div class="cbmaphost" id="cbMapHost"></div></div></div>';
  }
  function homeMapMount() {
    var host = document.getElementById('cbMapHost'); if (!host) return;
    if (!window.L || !CP.map) { host.innerHTML = '<div class="empty" style="padding:30px">The map needs a connection the first time it opens.</div>'; return; }
    if (!CB.mapEl) { CB.mapEl = document.createElement('div'); CB.mapEl.className = 'cbmapel'; host.appendChild(CB.mapEl); var m = CB.map = CP.map.create(CB.mapEl, {}); CB.lyr = { hyd: L.layerGroup().addTo(m), avl: L.layerGroup().addTo(m), scene: L.layerGroup().addTo(m), units: L.layerGroup().addTo(m) }; m.on('click', mapClick); CB.mapInc = ''; }
    else host.appendChild(CB.mapEl);
    if (CB.mapInc !== '_home') { CB.mapInc = '_home'; CB.mapC = ''; CB.map.setView(CP.COUNTY.center, CP.COUNTY.zoom); }
    setTimeout(function () { CB.map.invalidateSize(); }, 40);
    var Ly = CB.lyr; Ly.scene.clearLayers(); Ly.units.clearLayers(); Ly.avl.clearLayers(); Ly.hyd.clearLayers();
    (CB.cad || []).forEach(function (c) { if (!c.ll) return; Ly.scene.addLayer(L.marker(c.ll, { zIndexOffset: 900, icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="cbcallpin ' + (/EMS/i.test(c.cat) ? 'ems' : 'fire') + '">' + svg(/EMS/i.test(c.cat) ? 'medic' : 'flame') + '<b>' + E(c.type || c.cat) + '</b></div>' }) }).bindPopup('<b>' + E(c.type || '') + '</b><br>' + E(c.addr) + '<br>' + E((c.units || []).map(function (x) { return x.id; }).join(', ')) + '<br><button class="btn xs pri" data-cb="cadgo" data-a="' + E(c.callid) + '">Start a board</button>')); });
    (CB.avl || []).forEach(function (v) { var cls = /ARRIV|SCENE/i.test(v.st) ? 'os' : /ENROUTE|EN ROUTE|RESPOND|DISPATCH/i.test(v.st) ? 'er' : 'av'; Ly.avl.addLayer(L.marker(v.ll, { zIndexOffset: 500, icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="cbavl ' + cls + (v.stale ? ' stale' : '') + '">' + E(v.id) + '</div>' }) }).bindPopup('<b>' + E(v.id) + '</b> · ' + E(v.type) + '<br>' + E(v.st) + '<br>Position ' + (v.t ? E(CP.fmtTime(new Date(v.t).toISOString())) : 'unknown') + ' (CAD)')); });
    if (!CB.avl || Date.now() - (CB.avlT || 0) > 15000) loadAvl().then(function (ok) { if (ok && !inc() && CB.htab === 'map') render(); });
  }
  function homeWbView() { return '<div class="cbx cbhome">' + wbView().replace('<div class="cbwb">', '<div class="cbwb"><div class="cbscratch">' + I('pen') + 'Scratch board on this tablet. Open or start an incident to draw on its shared whiteboard.</div>') + '</div>'; }
  function tabs() { return '<div class="cbtabs">' + [['board', 'truck', 'Board'], ['map', 'map', 'Map'], ['wb', 'pen', 'Whiteboard']].map(function (t) { return '<button class="' + (CB.tab === t[0] ? 'on' : '') + '" data-cb="tab" data-a="' + t[0] + '">' + (t[1] === 'pen' ? svg('pen') : I(t[1])) + '<span>' + t[2] + '</span></button>'; }).join('') + '</div>'; }

  // =================== crews: riding count, names, split ===================
  var CREW = [['Engine', 4], ['Ladder', 4], ['Tanker', 2], ['Rescue', 3], ['Ambulance', 2], ['Brush', 2], ['Overhead', 1], ['Law', 1]];
  function crewDefault(kind) { var c = CREW.find(function (x) { return (kind || '').indexOf(x[0]) === 0; }); return c ? c[1] : 2; }
  function ppl(list) { return list.reduce(function (s, r) { return s + (+r.persons || 0); }, 0); }
  function onScene() { return units().filter(function (r) { return r.status !== 'En Route' && r.status !== 'Out of Service'; }); }
  function rideRow(n, max, from) { var h = '<div class="cbride">'; for (var k = from || 1; k <= (max || 8); k++) h += '<button data-rd="' + k + '" class="' + (k === n ? 'on' : '') + '">' + k + '</button>'; return h + '</div>'; }
  function rideWire(bg) { bg.addEventListener('click', function (e) { var b = e.target.closest('[data-rd]'); if (!b) return; e.preventDefault(); bg.querySelectorAll('[data-rd]').forEach(function (x) { x.classList.toggle('on', x === b); }); }); }
  function rideVal(bg, d) { var b = bg.querySelector('[data-rd].on'); return b ? +b.dataset.rd : d; }
  function unitCrew(id) {
    var r = CP.byId(inc().resources, id); if (!r) return;
    var bg = U.modal('Crew · ' + r.name, '<div class="cbh sm">Riding (people on this unit)</div>' + rideRow(+r.persons || crewDefault(r.kind), 8) + '<label class="f" style="margin-top:10px"><span>Names (optional)</span><textarea class="in" name="crew" rows="3" placeholder="Capt. Smith, FF Jones, FF Lee">' + E(r.crew || '') + '</textarea></label>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Save', cls: 'pri', fn: function (b) { r.persons = rideVal(b, r.persons); r.crew = U.val(b, 'crew'); r.u = CP.now(); CP.touch(inc(), 'resources'); commit(r.name + ' crew: ' + r.persons + (r.crew ? ' (' + r.crew + ')' : ''), 'Resource'); } }], { nofocus: true });
    rideWire(bg);
  }
  function nextSplit(name) { var L2 = 'BCDEFG'; for (var k = 0; k < L2.length; k++) { var c = name + L2[k]; if (!units().some(function (u) { return u.name === c; })) return c; } return name + 'X'; }
  function unitSplit(id) {
    var r = CP.byId(inc().resources, id); if (!r) return; var n = +r.persons || 0;
    if (n < 2) { U.toast('Set the crew count first (a split needs 2 or more).', 'err'); return; }
    var nm = nextSplit(r.name);
    var bg = U.modal('Split ' + r.name, '<p style="margin-top:0">How many of the ' + n + ' go with <b>' + E(nm) + '</b>?</p>' + rideRow(1, n - 1) + '<p class="dim" style="font-size:13px">' + E(nm) + ' shows up as its own unit so you can send it to a different task. Rejoin it from its options when the crew comes back together.</p>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Split crew', cls: 'pri', fn: function (b) { var k = rideVal(b, 1), s = addUnit(nm, r.kind, r.agency, 'Checked In', true); s.persons = k; s.parent = r.id; s.arrived = CP.now(); r.persons = n - k; r.u = CP.now(); CP.touch(inc(), 'resources'); CB.sel = s.id; commit(r.name + ' split: ' + k + ' to ' + nm + ', ' + (n - k) + ' stay with ' + r.name, 'Resource'); } }], { nofocus: true });
    rideWire(bg);
  }
  function unitRejoin(id) {
    var s = CP.byId(inc().resources, id), p = s && CP.byId(inc().resources, s.parent); if (!p) return;
    p.persons = (+p.persons || 0) + (+s.persons || 0); p.u = CP.now(); s.status = 'Released'; s.assign = ''; s.released = CP.now(); s.u = CP.now(); CP.touch(inc(), 'resources'); commit(s.name + ' rejoined ' + p.name + ' (' + p.persons + ' riding)', 'Resource');
  }

  // =================== work timers ===================
  function isWork(a) { return !!a && !a.staging && !/rehab/i.test(aName(a)); }
  function workMin(r) { if (!r.assign || !r.workT) return 0; var a = CP.byId(inc().assignments, r.assign); if (!isWork(a)) return 0; return Math.floor((Date.now() - new Date(r.workT).getTime()) / 60000); }
  function wkWarn() { return +kv('workWarn', 20); } function wkMax() { return +kv('workMax', 30); }
  function longCrews() { return units().filter(function (r) { return workMin(r) >= wkWarn(); }).sort(function (a, b) { return workMin(b) - workMin(a); }); }
  function rehabAsg() { var a = asgs().find(function (x) { return /rehab/i.test(aName(x)); }); return a || CP.addItem(inc(), 'assignments', { branch: '', division: '', group: 'Rehab', staging: '', work: '', special: '', needs: [], reportTo: '' }); }
  act.torehab = function (id) { var r = CP.byId(inc().resources, id); if (!r) return; CB.sel = null; moveUnit(r, rehabAsg().id); };
  function longBar() {
    var l = longCrews(); if (!l.length) return '';
    return '<div class="cblong">' + I('clock') + '<b>Work time</b>' + l.map(function (r) { var m = workMin(r); return '<button class="' + (m >= wkMax() ? 'over' : 'warn') + '" data-cb="torehab" data-a="' + r.id + '"><b>' + E(r.name) + '</b> ' + m + ' min <span>→ Rehab</span></button>'; }).join('') + '</div>';
  }
  act.worktimes = function () {
    var bg = U.modal('Crew work timers', '<p style="margin-top:0">A crew turns amber after this long on a working assignment (not Staging or Rehab), and red at the limit. Rehab or Staging resets it.</p><div class="cbh sm">Amber at</div><div class="cbride">' + [10, 15, 20, 25].map(function (n) { return '<button data-ww="' + n + '" class="' + (n === wkWarn() ? 'on' : '') + '">' + n + ' min</button>'; }).join('') + '</div><div class="cbh sm">Red at</div><div class="cbride">' + [20, 30, 40, 45, 60].map(function (n) { return '<button data-wm="' + n + '" class="' + (n === wkMax() ? 'on' : '') + '">' + n + ' min</button>'; }).join('') + '</div>', [{ label: 'Done', cls: 'pri' }], { nofocus: true });
    bg.addEventListener('click', function (e) { var b = e.target.closest('[data-ww],[data-wm]'); if (!b) return; e.preventDefault(); var k = b.dataset.ww ? 'workWarn' : 'workMax'; setKV(k, +(b.dataset.ww || b.dataset.wm)); bg.querySelectorAll(b.dataset.ww ? '[data-ww]' : '[data-wm]').forEach(function (x) { x.classList.toggle('on', x === b); }); commit(null, null, true); });
  };

  // =================== transfer of command ===================
  act.xfer = function () {
    var cur = CP.personName(inc(), 'IC') || 'not set', chiefs = units().filter(function (r) { return /Overhead/.test(r.kind || ''); }).map(function (r) { return r.name; });
    var bg = U.modal('Transfer command', '<p style="margin-top:0">Current Incident Commander: <b>' + E(cur) + '</b></p><label class="f"><span>New Incident Commander (name or unit)</span><input class="in big" name="ic"></label>' + (chiefs.length ? '<div class="cbmenu grid">' + chiefs.map(function (c) { return '<button data-ic="' + E(c) + '">' + E(c) + '</button>'; }).join('') + '</div>' : '') +
      '<label class="f"><span>Command name (optional)</span><input class="in" name="cn" value="' + E(kv('cmdName', '') || '') + '" placeholder="Main Street Command"></label><label class="chk"><input type="checkbox" name="b1"> Briefing given: conditions, actions, needs</label><label class="chk"><input type="checkbox" name="b2"> Assignments and accountability reviewed on this board</label>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Transfer command', cls: 'pri', fn: function (b) {
        var n = U.val(b, 'ic'); if (!n) { U.toast('Who is taking command?', 'err'); return false; }
        var p = CP.person(inc(), 'IC'); if (p) { p.name = n; p.u = CP.now(); } else CP.addItem(inc(), 'org', { pos: 'IC', label: '', name: n, agency: '', phone: '', radio: '', email: '', checkin: CP.now() }); CP.touch(inc(), 'org');
        var cn = U.val(b, 'cn'); if (cn) setKV('cmdName', cn);
        var br = [b.querySelector('[name=b1]').checked ? 'briefing given' : '', b.querySelector('[name=b2]').checked ? 'board reviewed' : ''].filter(Boolean);
        setKV('xfers', (kv('xfers', []) || []).concat([{ t: CP.now(), from: cur, to: n }]));
        commit('COMMAND TRANSFERRED: ' + cur + ' to ' + n + (cn ? ' (' + cn + ')' : '') + (br.length ? '. ' + br.join(', ') : '') + '.', 'Decision');
      } }], { nofocus: true });
    bg.addEventListener('click', function (e) { var c = e.target.closest('[data-ic]'); if (!c) return; e.preventDefault(); bg.querySelector('[name=ic]').value = c.dataset.ic; });
  };

  // =================== scene photos ===================
  var PDB = null;
  function pdb() { return PDB || (PDB = new Promise(function (ok, no) { var r = indexedDB.open('beacon-cb-photos', 1); r.onupgradeneeded = function () { r.result.createObjectStore('p'); }; r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); }; })); }
  async function pput(k, v) { var d = await pdb(); return new Promise(function (ok, no) { var t = d.transaction('p', 'readwrite'); if (v === undefined) t.objectStore('p').delete(k); else t.objectStore('p').put(v, k); t.oncomplete = function () { ok(); }; t.onerror = function () { no(t.error); }; }); }
  async function pget(k) { try { var d = await pdb(); return await new Promise(function (ok) { var q = d.transaction('p').objectStore('p').get(k); q.onsuccess = function () { ok(q.result); }; q.onerror = function () { ok(null); }; }); } catch (e) { return null; } }
  function shrink(file, max, q) { return new Promise(function (ok, no) { var u = URL.createObjectURL(file), im = new Image(); im.onload = function () { var s = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); var d = c.toDataURL('image/jpeg', q); c.toBlob(function (b) { ok({ blob: b, url: d }); }, 'image/jpeg', q); }; im.onerror = function () { no(new Error('Not an image')); }; im.src = u; }); }
  function photos() { return AL(inc().cbPhotos); }
  act.photo = function () {
    var f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*'; f.multiple = true;
    f.onchange = async function () {
      var n = 0;
      for (var k = 0; k < f.files.length; k++) { try { var full = await shrink(f.files[k], 1600, 0.82), th = await shrink(f.files[k], 220, 0.55), p = { id: CP.uid(), t: CP.now(), by: CP.me.name || '', cap: '', th: th.url, item: '', u: CP.now() }; await pput(p.id, full.blob); inc().cbPhotos = inc().cbPhotos || []; inc().cbPhotos.push(p); n++; } catch (e) { console.warn(e); } }
      if (!n) { U.toast('Could not read that photo', 'err'); return; }
      CP.touch(inc(), 'cbPhotos'); commit(n + ' scene photo' + (n > 1 ? 's' : '') + ' added', 'Event'); uploadPhotos();
    };
    f.click();
  };
  var upBusy = false, grpIds = null;
  async function uploadPhotos() {
    if (upBusy || A.status !== 'on' || !inc() || !A.user) return; var pend = photos().filter(function (p) { return !p.item; }); if (!pend.length) return; upBusy = true;
    try {
      if (!grpIds) { var me = await A.req(A.portal + '/sharing/rest/community/self'); grpIds = (me.groups || []).filter(function (g) { return /^BOCO Access [1-4] /.test(g.title); }).map(function (g) { return g.id; }); }
      for (var k = 0; k < pend.length; k++) {
        var p = pend[k], blob = await pget(p.id); if (!blob) continue;
        var u = A.user.username, fd = new FormData();
        fd.append('f', 'json'); fd.append('token', (A.auth() || {}).token || ''); fd.append('type', 'Image'); fd.append('title', 'Incident ' + inc().number + ' scene photo ' + CP.fmtTime(p.t)); fd.append('tags', 'BEACON,Command Board,Scene photo,' + inc().number); fd.append('snippet', (inc().location.desc || inc().name) + (p.cap ? ' · ' + p.cap : '')); fd.append('file', blob, 'scene-' + p.id + '.jpg');
        var r = await fetch(A.portal + '/sharing/rest/content/users/' + u + '/addItem', { method: 'POST', body: fd }).then(function (x) { return x.json(); });
        if (!r.success) throw new Error((r.error && r.error.message) || 'Photo upload failed');
        if (grpIds.length) await A.req(A.portal + '/sharing/rest/content/users/' + u + '/items/' + r.id + '/share', { groups: grpIds.join(','), everyone: false, org: false }, true);
        p.item = r.id; p.u = CP.now(); CP.touch(inc(), 'cbPhotos'); await pput(p.id, undefined); commit(null, null, true);
      }
    } catch (e) { console.warn('photo upload', e); } finally { upBusy = false; }
  }
  setInterval(uploadPhotos, 60000);
  function photoUrl(p) { return p.item && A.signedIn() ? A.portal + '/sharing/rest/content/items/' + p.item + '/data?token=' + encodeURIComponent((A.auth() || {}).token || '') : ''; }
  act.pview = async function (id) {
    var p = CP.byId(inc().cbPhotos, id); if (!p) return; var src = p.th, b = await pget(p.id); if (b) src = URL.createObjectURL(b); else if (photoUrl(p)) src = photoUrl(p);
    U.modal('Photo · ' + CP.fmtTime(p.t) + (p.by ? ' · ' + p.by : ''), '<img src="' + E(src) + '" alt="" style="width:100%;max-height:62vh;object-fit:contain;border-radius:8px;background:#000"><label class="f" style="margin-top:8px"><span>Caption</span><input class="in" name="cap" value="' + E(p.cap || '') + '" placeholder="Side C, second floor"></label><div class="dim" style="font-size:12px">' + (p.item ? 'Saved to county ArcGIS.' : 'Saved on this device. It uploads to county ArcGIS when online.') + '</div>',
      [{ label: 'Delete', cls: 'ghost', fn: function () { sure('Delete this photo?', 'It comes off the incident record.', 'Delete', function () { p.del = true; p.u = CP.now(); CP.touch(inc(), 'cbPhotos'); commit('Scene photo removed', 'Event'); }); } }, { label: 'Close', cls: 'ghost' }, { label: 'Save caption', cls: 'pri', fn: function (bg) { p.cap = U.val(bg, 'cap'); p.u = CP.now(); CP.touch(inc(), 'cbPhotos'); commit(p.cap ? 'Photo ' + CP.fmtTime(p.t) + ': ' + p.cap : null, 'Event'); } }]);
  };
  function photoStrip() {
    var ps = photos();
    return '<div class="cbh sm">' + svg('cam') + 'Photos <span class="ct">' + ps.length + '</span></div><div class="cbphotos">' + ps.slice(-8).reverse().map(function (p) { return '<button data-cb="pview" data-a="' + p.id + '" title="' + E(p.cap || CP.fmtTime(p.t)) + '"><img src="' + E(p.th) + '" alt="">' + (p.item ? '' : '<i title="Uploads when online">•</i>') + '</button>'; }).join('') + '<button class="add" data-cb="photo">' + svg('cam') + '<span>Add</span></button></div>';
  }

  // =================== acknowledge (phone view) ===================
  act.myunit = function (n) { CP.store.setPref('cbMyUnit', CP.store.prefs().cbMyUnit === n ? '' : n); render(); };
  act.ack = function (id) { var r = CP.byId(inc().resources, id); if (!r) return; var a = r.assign && CP.byId(inc().assignments, r.assign); r.ack = CP.now(); r.u = CP.now(); CP.touch(inc(), 'resources'); if (navigator.vibrate) navigator.vibrate(80); commit(r.name + ' acknowledged ' + (a ? aName(a) : 'assignment'), 'Communication'); };
  function needsAck(r) { return !!(r && r.assign && r.asgT && (!r.ack || r.ack < r.asgT)); }
  function myUnitCard() {
    var my = CP.store.prefs().cbMyUnit || '', mu = units().find(function (r) { return r.name === my; });
    var h = '<div class="cbmyu"><div class="cbh">' + I('truck') + 'My unit</div><div class="cbmyus">' + units().map(function (r) { return '<button class="' + (r.name === my ? 'on' : '') + (needsAck(r) ? ' need' : '') + '" data-cb="myunit" data-a="' + E(r.name) + '">' + E(r.name) + '</button>'; }).join('') + '</div>';
    if (!mu) return h + '<div class="dim" style="font-size:13px">Tap your unit to see your assignment and acknowledge it.</div></div>';
    var a = mu.assign && CP.byId(inc().assignments, mu.assign), need = needsAck(mu);
    if (need && !CB.lastNeed && navigator.vibrate) navigator.vibrate([250, 120, 250]); CB.lastNeed = need;
    return h + '<div class="cbmycard' + (need ? ' need' : '') + '"><b>' + E(mu.name) + ' → ' + (a ? E(aName(a)) : 'Not assigned') + '</b><span>' + (mu.asgT && a ? 'Assigned ' + E(CP.fmtTime(mu.asgT)) : '') + (mu.ack && !need ? ' · acknowledged ' + E(CP.fmtTime(mu.ack)) : '') + (workMin(mu) ? ' · working ' + workMin(mu) + ' min' : '') + '</span>' +
      (need ? '<button class="btn big pri" data-cb="ack" data-a="' + mu.id + '">' + I('check') + 'Acknowledge</button>' : '') + (a && (a.cbCan || a.work) ? '<div class="dim" style="margin-top:6px">' + E(a.cbCan || a.work) + '</div>' : '') + '</div></div>';
  }

  // =================== send the report ===================
  function summaryText(short) {
    var i = inc(), call = kv('call', null), ic = CP.personName(i, 'IC'), dmin = Math.round((new Date(i.closed || Date.now()) - new Date(i.start)) / 60000);
    var L1 = [(i.exercise ? 'PRACTICE · ' : '') + 'BOTETOURT COUNTY FIRE & EMS · INCIDENT ' + i.number, (i.location.desc || i.name), (call ? call.type : (TEMPLATES[kv('tpl', 'other')] || {}).n || i.type) + ' · ' + i.status,
      'Start ' + CP.fmtDT(i.start) + (i.closed ? ' · Closed ' + CP.fmtDT(i.closed) : '') + ' · ' + (dmin >= 60 ? Math.floor(dmin / 60) + ' h ' + (dmin % 60) + ' min' : dmin + ' min'),
      'IC: ' + (ic || '-') + ' · ' + (kv('mode', '') || '') + (kv('cond', '') ? ' · ' + kv('cond', '') : ''), 'Units: ' + AL(i.resources).length + ' · Personnel: ' + ppl(AL(i.resources).filter(function (r) { return !r.parent; }))];
    if (kv('mci', null)) { var c = mciCounts(); L1.push('MCI: ' + c.total + ' patients (R ' + c.red + ', Y ' + c.yellow + ', G ' + c.green + ', B ' + c.black + ')'); }
    if (short) return L1.join('\n');
    L1.push('', 'BENCHMARKS'); marks().forEach(function (m) { L1.push((m.t ? CP.fmtTime(m.t) : '----') + '  ' + m.label); });
    L1.push('', 'ASSIGNMENTS'); asgs().forEach(function (a) { var us = AL(i.resources).filter(function (r) { return r.assign === a.id; }); if (us.length) L1.push(aName(a) + ': ' + us.map(function (r) { return r.name; }).join(', ')); });
    L1.push('', 'TIMELINE (latest)'); AL(i.log).slice(-25).forEach(function (l) { L1.push(CP.fmtTime(l.ts) + '  ' + l.text); });
    L1.push('', 'Full record: ' + location.origin + location.pathname.replace(/[^\/]*$/, '') + 'index.html?incident=' + encodeURIComponent(i.id));
    return L1.join('\n');
  }
  function sendBtns(html, fname) {
    var i = inc(), subj = 'Incident report ' + i.number + ' · ' + (i.location.desc || i.name), out = [
      { label: I('msg') + 'Email', cls: 'ghost', fn: function () { var t = summaryText(false); if (t.length > 1800) t = t.slice(0, 1800) + '\n…'; location.href = 'mailto:?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(t); return false; } },
      { label: I('phone') + 'Text', cls: 'ghost', fn: function () { location.href = 'sms:?&body=' + encodeURIComponent(summaryText(true)); return false; } }];
    try { var f = new File([html], fname, { type: 'text/html' }); if (navigator.canShare && navigator.canShare({ files: [f] })) out.push({ label: I('up') + 'Share file', cls: 'ghost', fn: function () { navigator.share({ files: [f], title: subj, text: summaryText(true) }).catch(function () {}); return false; } }); } catch (e) {}
    return out;
  }

  // =================== live unit locations (CAD AVL) ===================
  var HYD = A.L.cad.replace(/CAD%20Calls.*$/, 'Hydrants/FeatureServer/0');
  function norm(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function miles(a, b) { var R = 3958.8, t = Math.PI / 180, dl = (b[0] - a[0]) * t, dn = (b[1] - a[1]) * t, x = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dn / 2) * Math.sin(dn / 2); return 2 * R * Math.asin(Math.sqrt(x)); }
  function incLL() { var l = inc() && inc().status !== 'Closed' && inc().location; return l && l.lat != null && l.lat !== '' ? [+l.lat, +l.lng] : null; }
  async function loadAvl() {
    if (A.status !== 'on') return false;
    try {
      var f = await A.query(A.L.cadUnits, "(MainTypeDesc IN ('FIRE','EMS') OR UnitTypeDesc IN ('FIRE MUTUAL','EMS MUTUAL','MEDEVAC')) AND Latitude IS NOT NULL", { fields: 'UnitID,StatusName,UnitTypeDesc,MainTypeDesc,DeptName,CFSNumber,Latitude,Longitude,LastPositionCheck', n: 500 });
      var c = incLL(), now = Date.now();
      CB.avl = f.map(function (x) { var a = x.attributes, ll = [+a.Latitude, +a.Longitude]; return { id: a.UnitID, st: a.StatusName || '', type: a.UnitTypeDesc || '', main: a.MainTypeDesc || '', dept: a.DeptName || '', cfs: a.CFSNumber || '', ll: ll, t: a.LastPositionCheck, stale: !a.LastPositionCheck || now - a.LastPositionCheck > 15 * 60000, mi: c ? miles(c, ll) : null }; }).filter(function (v) { return v.ll[0] && v.ll[1]; });
      CB.avlT = now; return true;
    } catch (e) { CB.avlT = Date.now(); console.warn('AVL', e); return false; }
  }
  function avlFor(r) { if (!CB.avl) return null; var n = norm(r.name); return CB.avl.find(function (v) { return norm(v.id) === n; }) || null; }
  function cadKind(v) { var t = v.type; return /^ENGINE/.test(t) ? 'Engine' : /LADDER/.test(t) ? 'Ladder/Truck' : /TANKER/.test(t) ? 'Tanker/Tender' : /SQUAD|SOTT/.test(t) ? 'Rescue' : /BRUSH|WILDLAND/.test(t) ? 'Brush Truck' : /^ALS$/.test(t) ? 'Ambulance (ALS)' : /BLS|EMS MUTUAL|ALL EMS/.test(t) ? 'Ambulance (BLS)' : /DUTY|CAPTAIN|SUPERVISOR|ONCALL|ADMIN|DIRECTOR|EMERGENCY MGNT/.test(t) ? 'Overhead (single person)' : kindOf(v.id); }
  act.avladd = function (id) { var v = (CB.avl || []).find(function (x) { return x.id === id; }); if (!v) return; var r = addUnit(v.id, cadKind(v), v.dept, /ARRIV|SCENE/i.test(v.st) ? 'Checked In' : 'En Route'); commit(null); U.toast(v.id + ' added to the board', 'ok'); };
  setInterval(function () { if (!inc() || A.status !== 'on' || inc().status === 'Closed') return; var enr = units().some(function (r) { return r.status === 'En Route'; }); if (CB.tab !== 'map' && !enr) return; loadAvl().then(function () { if (CB.tab === 'map') { if (CB.map) mapDraw(); } else if (enr && !document.getElementById('modal') && !CB.sel && !(document.activeElement && document.activeElement.id === 'cbQuick')) render(); }); }, 15000);
  // home live map: refresh calls and units
  setInterval(function () { if (inc() || CB.htab !== 'map' || A.status !== 'on' || document.getElementById('modal')) return; Promise.all([loadAvl(), loadLists()]).then(function () { if (!inc() && CB.htab === 'map') homeMapMount(); }); }, 20000);
  // keep work timers fresh on the board
  setInterval(function () { if (!inc() || CB.tab !== 'board' || CB.drawing || document.getElementById('modal') || (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) return; if (units().some(function (r) { return r.workT && r.assign; })) render(); }, 30000);

  // =================== scene map ===================
  function offset(c, brg, m) { var b = brg * Math.PI / 180; return [c[0] + m * Math.cos(b) / 111320, c[1] + m * Math.sin(b) / (111320 * Math.cos(c[0] * Math.PI / 180))]; }
  act.setloc = function () { CB.placing = CB.placing === 'inc' ? null : 'inc'; CB.sel = null; render(); if (CB.placing) U.toast('Tap the map where the incident is', 'ok'); };
  act.sidea = function (d) { setKV('sideA', +d); commit('Side A faces ' + ({ 0: 'north', 90: 'east', 180: 'south', 270: 'west' })[d], 'Event', true); render(); };
  act.lyr = function (k) { CB['hide_' + k] = !CB['hide_' + k]; render(); };
  act.mapfit = function () { if (!CB.map) return; var c = incLL(); var pts = units().filter(function (r) { return r.lat != null; }).map(function (r) { return [r.lat, r.lng]; }); if (c) pts.push(c); if (pts.length > 1) CB.map.fitBounds(pts, { padding: [40, 40], maxZoom: 19 }); else if (c) CB.map.setView(c, 18); };
  function mapView() {
    var i = inc(), c = incLL(), su = CB.sel ? CP.byId(i.resources, CB.sel) : null, A0 = +kv('sideA', 180);
    var side = '<section class="cbcol cbmapside"><div class="cbscroll">' +
      (CB.placing === 'inc' ? '<div class="cbpick"><div><b>Tap the map</b> where the incident is</div><button class="btn ghost" data-cb="setloc">Cancel</button></div>' : su ? '<div class="cbpick"><div>Tap the map to place <b>' + E(su.name) + '</b></div><button class="btn ghost" data-cb="desel">Cancel</button></div>' : '') +
      (c ? '' : '<div class="warnbox" style="margin-bottom:8px">No incident location yet. Tap <b>Set incident location</b>, then tap the map.</div>') +
      '<div class="cbbtns"><button data-cb="setloc" class="' + (CB.placing === 'inc' ? 'on' : '') + '">' + I('pin') + (c ? 'Move incident pin' : 'Set incident location') + '</button><button data-cb="mapfit">' + I('target') + 'Fit scene</button></div>' +
      '<div class="cbh sm">Side A (address side) faces</div><div class="cbbtns c4">' + [['N', 0], ['E', 90], ['S', 180], ['W', 270]].map(function (d) { return '<button class="' + (A0 === d[1] ? 'on' : '') + '" data-cb="sidea" data-a="' + d[1] + '">' + d[0] + '</button>'; }).join('') + '</div>' +
      '<div class="cbh sm">Show</div><div class="cbbtns"><button class="' + (CB.hide_hyd ? '' : 'on') + '" data-cb="lyr" data-a="hyd">Hydrants</button><button class="' + (CB.hide_avl ? '' : 'on') + '" data-cb="lyr" data-a="avl">Live units (CAD)</button></div>' +
      '<div class="cbh sm">' + I('truck') + 'Units · tap, then the map</div><div class="cbuw">' + (units().length ? units().map(tile).join('') : '<div class="dim cbempty">No units on the board yet.</div>') + '</div>' +
      '<div class="cbh sm">Nearest hydrants</div>' + (!c ? '<div class="dim cbempty">Set the incident location first.</div>' : !CB.hyd ? '<div class="dim cbempty">' + (A.status === 'on' ? 'Loading…' : 'Sign in to see hydrants.') + '</div>' : !CB.hyd.length ? '<div class="dim cbempty">No hydrants within about 1,000 yards. Plan for tanker water supply.</div>' :
        CB.hyd.slice(0, 5).map(function (h) { return '<div class="cbrow2' + (h.out ? ' bad' : '') + '"><b>' + Math.round(h.ft) + ' ft</b><span>' + E(h.name) + (h.psi ? ' · ' + h.psi + ' psi' : '') + (h.out ? ' · OUT OF SERVICE' : '') + '</span></div>'; }).join('')) +
      '<div class="cbh sm">Live fire & EMS units (CAD)</div>' + (A.status !== 'on' ? '<div class="dim cbempty">Sign in to see live unit locations.</div>' : !CB.avl ? '<div class="dim cbempty">Loading…</div>' :
        CB.avl.filter(function (v) { return v.mi != null && v.mi < 25; }).sort(function (a, b) { return a.mi - b.mi; }).slice(0, 14).map(function (v) { var on = units().some(function (r) { return norm(r.name) === norm(v.id); }); return '<div class="cbrow2' + (v.stale ? ' stale' : '') + '"><b>' + E(v.id) + '</b><span>' + E(v.st.toLowerCase()) + ' · ' + v.mi.toFixed(1) + ' mi' + (v.stale ? ' · old position' : '') + '</span>' + (on ? '<em>on board</em>' : '<button class="btn xs" data-cb="avladd" data-a="' + E(v.id) + '">+ Add</button>') + '</div>'; }).join('') || '<div class="dim cbempty">No fire or EMS units reporting a location.</div>') +
      '</div></section>';
    return '<div class="cbmapv">' + side + '<div class="cbmaphost" id="cbMapHost"></div></div>';
  }
  async function loadHyd() {
    var c = incLL(); if (!c || A.status !== 'on') return; var key = c.join(','); if (CB.hydFor === key) return; CB.hydFor = key;
    try {
      var d = 0.01, f = await A.query(HYD, '1=1', { geom: true, fields: 'Location_Name,Location,Static_Pressure,Operational_Status,Authority,Icon_Color', n: 300, extra: { geometry: JSON.stringify({ xmin: c[1] - d * 1.25, ymin: c[0] - d, xmax: c[1] + d * 1.25, ymax: c[0] + d, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects' } });
      CB.hyd = f.filter(function (x) { return x.geometry; }).map(function (x) { var a = x.attributes, ll = [x.geometry.y, x.geometry.x]; return { ll: ll, name: a.Location_Name || 'Hydrant', where: a.Location || '', psi: a.Static_Pressure, out: a.Operational_Status && !/INUSE|IN USE|ACTIVE/i.test(a.Operational_Status), st: a.Operational_Status || '', auth: a.Authority || '', ft: miles(c, ll) * 5280 }; }).sort(function (a, b) { return a.ft - b.ft; });
    } catch (e) { CB.hyd = []; CB.hydFor = null; console.warn('hydrants', e); }
    if (CB.tab === 'map') render();
  }
  function mapMount() {
    var host = document.getElementById('cbMapHost'); if (!host) return;
    if (!window.L || !CP.map) { host.innerHTML = '<div class="empty" style="padding:30px">The map needs a connection the first time it opens.</div>'; return; }
    var i = inc(), c = incLL();
    if (!CB.mapEl) {
      CB.mapEl = document.createElement('div'); CB.mapEl.className = 'cbmapel'; host.appendChild(CB.mapEl);
      var m = CB.map = CP.map.create(CB.mapEl, { center: c, zoom: c ? 18 : null });
      try { var bm = m._cpBase; Object.keys(bm).forEach(function (k) { if (m.hasLayer(bm[k])) m.removeLayer(bm[k]); }); bm.Imagery.addTo(m); } catch (e) {}
      CB.lyr = { hyd: L.layerGroup().addTo(m), avl: L.layerGroup().addTo(m), scene: L.layerGroup().addTo(m), units: L.layerGroup().addTo(m) };
      m.on('click', mapClick); CB.mapInc = i.id; CB.mapC = c ? c.join() : '';
    } else host.appendChild(CB.mapEl);
    if (CB.mapInc !== i.id || (c && CB.mapC !== c.join())) { CB.mapInc = i.id; CB.mapC = c ? c.join() : ''; if (c) CB.map.setView(c, 18); }
    CB.mapEl.classList.toggle('placing', !!(CB.placing || CB.sel));
    setTimeout(function () { CB.map.invalidateSize(); }, 40);
    mapDraw(); loadHyd(); if (!CB.avl || Date.now() - (CB.avlT || 0) > 15000) loadAvl().then(function (ok) { if (ok && CB.tab === 'map') render(); });
  }
  function mapClick(e) {
    if (!inc()) return;
    var p = [+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)], i = inc();
    if (CB.placing === 'inc') { i.location.lat = p[0]; i.location.lng = p[1]; CP.touch(i, 'location'); CB.placing = null; CB.hyd = null; CB.hydFor = null; commit('Incident location set on the map', 'Event'); return; }
    if (CB.sel) { var r = CP.byId(i.resources, CB.sel); CB.sel = null; if (r) { r.lat = p[0]; r.lng = p[1]; r.u = CP.now(); CP.touch(i, 'resources'); } commit(null); }
  }
  function mapDraw() {
    if (!CB.map || !inc()) return; var i = inc(), Ly = CB.lyr, c = incLL();
    Ly.scene.clearLayers(); Ly.units.clearLayers(); Ly.avl.clearLayers(); Ly.hyd.clearLayers();
    if (c) {
      Ly.scene.addLayer(L.marker(c, { icon: CP.map.pinIcon('#FDB833', '★', 34), zIndexOffset: 900, interactive: false }));
      var A0 = +kv('sideA', 180); ['A', 'B', 'C', 'D'].forEach(function (s, k) { Ly.scene.addLayer(L.marker(offset(c, A0 + k * 90, 28), { interactive: false, icon: L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 14], html: '<div class="cbsideA s' + s + '">' + s + '</div>' }) })); });
    }
    if (!CB.hide_hyd) (CB.hyd || []).forEach(function (h) { Ly.hyd.addLayer(L.marker(h.ll, { icon: L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], html: '<div class="cbhyd' + (h.out ? ' out' : '') + '">H</div>' }) }).bindPopup('<b>' + E(h.name) + '</b><br>' + E(h.where) + '<br>' + Math.round(h.ft) + ' ft from the incident' + (h.psi ? '<br>Static ' + h.psi + ' psi' : '') + '<br>' + E(h.st) + (h.auth ? ' · ' + E(h.auth) : ''))); });
    var board = {}; units().forEach(function (r) { board[norm(r.name)] = r; });
    if (!CB.hide_avl) (CB.avl || []).forEach(function (v) {
      var r = board[norm(v.id)], cls = /ARRIV|SCENE/i.test(v.st) ? 'os' : /ENROUTE|EN ROUTE|RESPOND|DISPATCH/i.test(v.st) ? 'er' : 'av';
      if (!r && cls === 'av' && v.mi != null && v.mi > 8) return;
      Ly.avl.addLayer(L.marker(v.ll, { zIndexOffset: 500, icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="cbavl ' + cls + (v.stale ? ' stale' : '') + (r ? ' mine' : '') + '">' + E(v.id) + '</div>' }) }).bindPopup('<b>' + E(v.id) + '</b> · ' + E(v.type) + '<br>' + E(v.st) + (v.cfs && v.cfs !== '0' ? ' · call ' + E(v.cfs) : '') + (v.mi != null ? '<br>' + v.mi.toFixed(1) + ' mi from the incident' : '') + '<br>Position ' + (v.t ? E(CP.fmtTime(new Date(v.t).toISOString())) : 'unknown') + ' (CAD)' + (r ? '' : '<br><button class="btn xs" data-cb="avladd" data-a="' + E(v.id) + '">+ Add to board</button>')));
    });
    units().forEach(function (r) {
      if (r.lat == null || r.lat === '') return; var lk = unitLook(r), a = r.assign && CP.byId(i.assignments, r.assign), wm = workMin(r);
      var mk = L.marker([r.lat, r.lng], { draggable: true, zIndexOffset: 800, icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="cbmu ' + lk[1] + (CB.sel === r.id ? ' sel' : '') + (wm >= wkMax() ? ' wkover' : wm >= wkWarn() ? ' wkwarn' : '') + '">' + svg(lk[0]) + '<b>' + E(r.name) + '</b>' + (a ? '<i>' + E(aName(a)) + '</i>' : '') + '</div>' }) });
      mk.on('dragend', function (ev) { var p = ev.target.getLatLng(); r.lat = +p.lat.toFixed(6); r.lng = +p.lng.toFixed(6); r.u = CP.now(); CP.touch(inc(), 'resources'); commit(null, null, true); });
      mk.on('click', function () { act.unit(r.id); });
      Ly.units.addLayer(mk);
    });
  }

  // =================== whiteboard ===================
  var WBW = 2000, WBC = [['#ff3030', 'Red'], ['#f2f2f2', 'White'], ['#FDB833', 'Yellow'], ['#5aa9ff', 'Blue']], WBS = [[4, 'Fine'], [8, 'Medium'], [16, 'Thick']];
  CB.wbColor = CB.wbColor || '#ff3030'; CB.wbSize = CB.wbSize || 8; CB.wbTool = CB.wbTool || 'pen';
  var SCR = 'bcem.cb.scratch.v1';
  function wbDoc() { if (inc()) return inc(); if (!CB.scratch) { try { CB.scratch = JSON.parse(localStorage.getItem(SCR) || 'null'); } catch (e) {} CB.scratch = CB.scratch || { cbDraw: [] }; } return CB.scratch; }
  function wbSave(text) { if (inc()) { CP.touch(inc(), 'cbDraw'); commit(text || null, 'Event', true); } else { wbDoc().cbDraw = AL(wbDoc().cbDraw); try { localStorage.setItem(SCR, JSON.stringify(CB.scratch)); } catch (e) {} } }
  function strokes() { return AL(wbDoc().cbDraw); }
  act.wbc = function (c) { CB.wbColor = c; CB.wbTool = 'pen'; wbBar(); };
  act.wbs = function (s) { CB.wbSize = +s; CB.wbTool = 'pen'; wbBar(); };
  act.wbt = function (t) { CB.wbTool = t; wbBar(); };
  act.wbundo = function () { var me = CP.me.name || '', s = strokes(), last = null; for (var k = s.length - 1; k >= 0; k--) { if (!me || s[k].by === me) { last = s[k]; break; } } if (!last) return; last.del = true; last.u = CP.now(); wbSave(); wbDraw(); };
  act.wbclear = function () { if (!strokes().length) return; sure('Clear the whiteboard?', inc() ? 'Erases everything on it for everyone.' : 'Erases this scratch board.', 'Clear', function () { strokes().forEach(function (s) { s.del = true; s.u = CP.now(); }); wbSave(inc() ? 'Whiteboard cleared' : null); wbDraw(); }); };
  function wbBarHtml() {
    return WBC.map(function (c) { return '<button class="sw' + (CB.wbTool === 'pen' && CB.wbColor === c[0] ? ' on' : '') + '" data-cb="wbc" data-a="' + c[0] + '" title="' + c[1] + '"><i style="background:' + c[0] + '"></i></button>'; }).join('') + '<span class="sep"></span>' +
      WBS.map(function (s) { return '<button class="sz' + (CB.wbSize === s[0] ? ' on' : '') + '" data-cb="wbs" data-a="' + s[0] + '" title="' + s[1] + '"><i style="width:' + (s[0] + 4) + 'px;height:' + (s[0] + 4) + 'px"></i></button>'; }).join('') + '<span class="sep"></span>' +
      '<button class="tl' + (CB.wbTool === 'pen' ? ' on' : '') + '" data-cb="wbt" data-a="pen">' + svg('pen') + 'Pen</button><button class="tl' + (CB.wbTool === 'erase' ? ' on' : '') + '" data-cb="wbt" data-a="erase">' + svg('eraser') + 'Eraser</button><span class="sp"></span><button class="tl" data-cb="wbundo">' + I('refresh') + 'Undo</button><button class="tl" data-cb="wbclear">' + I('trash') + 'Clear</button>';
  }
  function wbBar() { var b = document.getElementById('cbWbBar'); if (b) b.innerHTML = wbBarHtml(); }
  function wbView() { return '<div class="cbwb"><div class="cbwbbar" id="cbWbBar">' + wbBarHtml() + '</div><div class="cbwbhost" id="cbWbHost"></div></div>'; }
  function wbPt(e) { var r = CB.wb.getBoundingClientRect(), s = WBW / r.width; return [Math.round((e.clientX - r.left) * s), Math.round((e.clientY - r.top) * s)]; }
  function wbCtx() { var c = CB.wb, x = c.getContext('2d'), s = c.width / WBW; x.setTransform(s, 0, 0, s, 0, 0); x.lineCap = 'round'; x.lineJoin = 'round'; return x; }
  function pts(st) { return typeof st.p === 'string' ? st.p.split(' ').map(function (q) { return q.split(',').map(Number); }) : st.p; }
  function drawStroke(x, st) { var ps = pts(st); if (!ps.length) return; x.strokeStyle = st.c; x.lineWidth = st.w; x.beginPath(); x.moveTo(ps[0][0], ps[0][1]); if (ps.length === 1) x.lineTo(ps[0][0] + 0.5, ps[0][1] + 0.5); for (var k = 1; k < ps.length; k++) { if (k < ps.length - 1) { var mx = (ps[k][0] + ps[k + 1][0]) / 2, my = (ps[k][1] + ps[k + 1][1]) / 2; x.quadraticCurveTo(ps[k][0], ps[k][1], mx, my); } else x.lineTo(ps[k][0], ps[k][1]); } x.stroke(); }
  function wbBg(x, w, h) { x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = '#080b10'; x.fillRect(0, 0, w, h); x.restore(); }
  function wbDraw() { var c = CB.wb; if (!c || !c.width) return; var x = c.getContext('2d'); wbBg(x, c.width, c.height); x = wbCtx(); strokes().forEach(function (s) { drawStroke(x, s); }); }
  function wbSize() { var c = CB.wb, h = c.parentNode; if (!h) return; var dpr = Math.min(window.devicePixelRatio || 1, 2), w = h.clientWidth, hh = h.clientHeight; c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr); c.style.width = w + 'px'; c.style.height = hh + 'px'; }
  function eraseAt(p) { var hit = false, rad = 24; strokes().forEach(function (s) { if (pts(s).some(function (q) { return Math.abs(q[0] - p[0]) < rad && Math.abs(q[1] - p[1]) < rad; })) { s.del = true; s.u = CP.now(); hit = true; } }); if (hit) { CB.erased = true; wbDraw(); } }
  function wbMount() {
    var host = document.getElementById('cbWbHost'); if (!host) return;
    if (!CB.wb) {
      var c = CB.wb = document.createElement('canvas'); c.className = 'cbwbc'; var cur = null, penSeen = false;
      c.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'pen') penSeen = true; else if (penSeen && e.pointerType === 'touch') return; // palm rejection once a pencil is used
        e.preventDefault(); try { c.setPointerCapture(e.pointerId); } catch (x) {} var p = wbPt(e); CB.drawing = true;
        if (CB.wbTool === 'erase') { cur = { erase: true }; eraseAt(p); return; }
        cur = { id: CP.uid(), c: CB.wbColor, w: CB.wbSize, pts: [p], last: p }; var x = wbCtx(); x.fillStyle = cur.c; x.beginPath(); x.arc(p[0], p[1], cur.w / 2, 0, 7); x.fill();
      });
      c.addEventListener('pointermove', function (e) {
        if (!cur) return; e.preventDefault(); var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; if (!evs.length) evs = [e];
        evs.forEach(function (ev) { var p = wbPt(ev); if (cur.erase) { eraseAt(p); return; } var l = cur.last; if (Math.abs(p[0] - l[0]) + Math.abs(p[1] - l[1]) < 3) return; var x = wbCtx(); x.strokeStyle = cur.c; x.lineWidth = cur.w; x.beginPath(); x.moveTo(l[0], l[1]); x.lineTo(p[0], p[1]); x.stroke(); cur.pts.push(p); cur.last = p; });
      });
      var end = function () {
        if (!cur) return; var s = cur; cur = null; CB.drawing = false;
        if (s.erase) { if (CB.erased) { CB.erased = false; wbSave(); } return; }
        var dd = wbDoc(); dd.cbDraw = dd.cbDraw || []; dd.cbDraw.push({ id: s.id, c: s.c, w: s.w, p: s.pts.map(function (q) { return q[0] + ',' + q[1]; }).join(' '), by: CP.me.name || '', u: CP.now() });
        wbSave(); wbDraw();
      };
      c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end); c.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') end(); });
      window.addEventListener('resize', function () { if (CB.wb && CB.wb.parentNode) { wbSize(); wbDraw(); } });
    }
    host.appendChild(CB.wb); wbSize(); wbDraw();
  }
  // whiteboard as an image for the report
  function wbImage() {
    var s = strokes(); if (!s.length) return '';
    var maxY = 0; s.forEach(function (st) { pts(st).forEach(function (q) { if (q[1] > maxY) maxY = q[1]; }); });
    var w = 1000, sc = w / WBW, h = Math.max(400, Math.min(2000, Math.round((maxY + 40) * sc))), c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d'); x.fillStyle = '#080b10'; x.fillRect(0, 0, w, h); x.setTransform(sc, 0, 0, sc, 0, 0); x.lineCap = 'round'; x.lineJoin = 'round'; s.forEach(function (st) { drawStroke(x, st); });
    return c.toDataURL('image/png');
  }

  act.signin = function () { A.signIn(); };
  act.local = function () { CB.localOk = true; CB.list = []; CB.cad = []; render(); };
  act.tpl = function (k) { CB.tpl = k; if (CB.call && CB.call[2] !== k) CB.call = null; CB.addr = (document.getElementById('cbAddr') || {}).value || CB.addr; render(); };
  act.cad = function (id) { var c = (CB.cad || []).find(function (x) { return x.callid === id; }); CB.cadPick = c; CB.addr = c.addr; var ct = callFor(c.type); if (ct) { CB.call = ct; CB.tpl = ct[2]; return render(); } if (/alarm/i.test(c.type + ' ' + c.cat)) CB.tpl = 'alarm'; else if (/struct|resid|commerc|building|house/i.test(c.type)) CB.tpl = 'structure'; else if (/mci|mass casualty|multiple patient/i.test(c.type + ' ' + c.cat)) CB.tpl = 'mci'; else if (/accident|mva|collision|crash|wreck|mvc/i.test(c.type + ' ' + c.cat)) CB.tpl = 'mva'; else if (/vehicle fire|car fire/i.test(c.type)) CB.tpl = 'vehicle'; else if (/brush|woods|grass|wild/i.test(c.type)) CB.tpl = 'brush'; render(); };
  act.start = function () { startBoard().catch(function (e) { U.toast(E(e.message), 'err'); }); };
  act.open = function (k) { openBoard(k); };
  act.mode = function (m) { setKV('mode', m); commit((setFor(kv('tpl', 'other')) === SETS.fire ? 'Strategy: ' : 'Phase: ') + m.toUpperCase(), 'Decision'); };
  act.cond = function (c) { setKV('cond', c); if (c === 'Working fire' && kv('tpl') === 'alarm') return upgrade(); commit('Conditions: ' + c, 'Event'); };
  act.unit = function (id, el) {
    // with a unit picked, tapping any unit inside another division/group assigns to that division/group
    if (CB.sel && CB.sel !== id && el && el.closest) { var card = el.closest('.cbasg[data-a]'), cur = CP.byId(inc().resources, CB.sel); if (card && cur && cur.assign !== card.dataset.a) { CB.sel = null; return moveUnit(cur, card.dataset.a); } }
    if (CB.sel === id) { CB.sel = null; render(); return; }
    CB.sel = id; render();
  };
  act.jump = function (aid) { var el = document.getElementById('asg_' + aid); if (!el) return; var t = document.querySelector('.cbtray'), off = t ? t.getBoundingClientRect().height + 12 : 12; window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - off, behavior: 'smooth' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); };
  act.qa = function (aid) { var r = CB.sel && CP.byId(inc().resources, CB.sel); CB.sel = null; if (r) moveUnit(r, aid || ''); else render(); };
  act.desel = function () { CB.sel = null; render(); };
  // drag a unit onto a division or group (mouse; tablets use tap)
  document.addEventListener('dragstart', function (e) { var t = e.target.closest && e.target.closest('.cbunit[data-a]'); if (!t) return; CB.drag = t.dataset.a; try { e.dataTransfer.setData('text/plain', t.dataset.a); e.dataTransfer.effectAllowed = 'move'; } catch (x) {} document.body.classList.add('cbdragging'); });
  document.addEventListener('dragend', function () { CB.drag = null; document.body.classList.remove('cbdragging'); document.querySelectorAll('.cbover').forEach(function (n) { n.classList.remove('cbover'); }); });
  document.addEventListener('dragover', function (e) { if (!CB.drag) return; var z = e.target.closest && e.target.closest('.cbasg[data-a],.cbtray'); if (!z) return; e.preventDefault(); document.querySelectorAll('.cbover').forEach(function (n) { if (n !== z) n.classList.remove('cbover'); }); z.classList.add('cbover'); });
  document.addEventListener('drop', function (e) { if (!CB.drag) return; var z = e.target.closest && e.target.closest('.cbasg[data-a],.cbtray'); if (!z) return; e.preventDefault(); var r = CP.byId(inc().resources, CB.drag); CB.drag = null; CB.sel = null; document.body.classList.remove('cbdragging'); if (!r) return; var aid = z.classList.contains('cbtray') ? '' : z.dataset.a; if ((r.assign || '') === aid && aid) return render(); moveUnit(r, aid); });
  act.drop = function (aid, el, e) {
    if (e && e.target.closest('[data-cb="unit"],[data-cb="amenu"]')) return;
    if (!CB.sel) return;
    var r = CP.byId(inc().resources, CB.sel); CB.sel = null; if (r) moveUnit(r, aid);
  };
  act.addk = function (k) {
    var kind = KINDS.find(function (x) { return x[0] === k; });
    var bg = U.modal('Add ' + kind[1], '<div class="cbpad"><input class="in big" id="cbUn" value="' + (k === 'U' ? '' : k) + '" style="font-size:28px;font-weight:800;text-transform:uppercase;text-align:center"><div class="cbkeys">' + '1 2 3 4 5 6 7 8 9 ⌫ 0 ✓'.split(' ').map(function (d) { return '<button data-k="' + d + '">' + d + '</button>'; }).join('') + '</div>' +
      '<div class="cbh sm" style="margin-top:10px">Riding</div>' + rideRow(crewDefault(kind[2]), 8) + '<label class="chk"><input type="checkbox" id="cbEnr"> Responding (not on scene yet)</label><input class="in" id="cbAg" placeholder="Agency (optional)" style="margin-top:8px"></div>', [{ label: 'Cancel', cls: 'ghost' }, { label: 'Add unit', cls: 'pri', fn: function (b) { go(b); } }], { nofocus: true });
    function go(b) { var n = b.querySelector('#cbUn').value; if (!n || n === k) { U.toast('Unit number?', 'err'); return false; } var r = addUnit(n, kind[2], b.querySelector('#cbAg').value, b.querySelector('#cbEnr').checked ? 'En Route' : 'Checked In'); if (r) r.persons = rideVal(b, r.persons); U.closeModal(); CB.sel = r && r.id; commit(null); }
    rideWire(bg);
    bg.addEventListener('click', function (e) { var b = e.target.closest('[data-k]'); if (!b) return; e.preventDefault(); var i = bg.querySelector('#cbUn'); if (b.dataset.k === '⌫') i.value = i.value.slice(0, -1); else if (b.dataset.k === '✓') go(bg); else i.value += b.dataset.k; });
  };
  function unitNote(id) {
    var r = CP.byId(inc().resources, id); if (!r) return; CB.sel = null;
    var picks = ['Low on air', 'Needs rehab', 'Transporting', 'Out of water', 'Mechanical problem', 'Available for reassignment'];
    var bg = U.modal('Note for ' + r.name, '<textarea class="in" id="cbUN" rows="3" style="font-size:17px">' + E(r.note || '') + '</textarea><div class="cbmenu grid" style="margin-top:8px">' + picks.map(function (q) { return '<button data-q="' + E(q) + '">' + E(q) + '</button>'; }).join('') + '</div><p class="dim" style="font-size:12.5px">Shows on the unit and is logged with the time.</p>',
      [{ label: 'Cancel', cls: 'ghost' }].concat(r.note ? [{ label: 'Clear', cls: 'ghost', fn: function () { r.note = ''; r.u = CP.now(); CP.touch(inc(), 'resources'); commit(r.name + ': note cleared', 'Resource'); } }] : []).concat([{ label: 'Save', cls: 'pri', fn: function (b) { var t = b.querySelector('#cbUN').value.trim(); if (!t) { U.toast('Type a note first', 'err'); return false; } r.note = t; r.u = CP.now(); CP.touch(inc(), 'resources'); commit(r.name + ': ' + t, 'Resource'); } }]));
    bg.addEventListener('click', function (e) { var q = e.target.closest('[data-q]'); if (!q) return; e.preventDefault(); var n = bg.querySelector('#cbUN'); n.value = q.dataset.q === 'Transporting' ? 'Transporting to ' : q.dataset.q; n.focus(); });
  }
  function unitMenu(id) {
    var r = CP.byId(inc().resources, id); if (!r) return;
    var opts = [['crew', 'Crew: ' + (+r.persons ? r.persons + ' riding' : 'set riding count') + (r.crew ? ' (' + r.crew + ')' : '')]].concat(+r.persons >= 2 ? [['split', 'Split crew']] : []).concat(r.parent ? [['rejoin', 'Rejoin ' + ((CP.byId(inc().resources, r.parent) || {}).name || 'parent unit')]] : []).concat(r.assign && workMin(r) ? [['rehab', 'Send to Rehab (working ' + workMin(r) + ' min)']] : []).concat([['note', r.note ? 'Edit note: ' + r.note : 'Add a note']]).concat(r.note ? [['clrnote', 'Clear note']] : []).concat([['onscene', 'On scene (unassigned)'], ['oos', 'Out of service'], ['release', 'Release from incident'], ['rename', 'Rename / agency'], ['cancel', 'Deselect']]);
    var bg = U.modal(r.name, '<div class="cbmenu">' + opts.map(function (o) { return '<button data-um="' + o[0] + '"' + (o[0] === 'release' ? ' class="red"' : '') + '>' + E(o[1]) + '</button>'; }).join('') + '</div><p class="dim" style="font-size:12.5px">' + (r.asgT ? (needsAck(r) ? 'Assignment not acknowledged yet.' : 'Acknowledged ' + E(CP.fmtTime(r.ack)) + '.') + ' ' : '') + 'Tip: tap a unit, then tap an assignment to move it.</p>', [{ label: 'Close', cls: 'ghost' }], { nofocus: true });
    bg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-um]'); if (!b) return; e.preventDefault(); U.closeModal(); CB.sel = null; var k = b.dataset.um;
      if (k === 'crew') setTimeout(function () { unitCrew(r.id); }, 30);
      else if (k === 'split') setTimeout(function () { unitSplit(r.id); }, 30);
      else if (k === 'rejoin') unitRejoin(r.id);
      else if (k === 'rehab') act.torehab(r.id);
      else if (k === 'note') setTimeout(function () { unitNote(r.id); }, 30);
      else if (k === 'clrnote') { r.note = ''; r.u = CP.now(); CP.touch(inc(), 'resources'); commit(r.name + ': note cleared', 'Resource'); }
      else if (k === 'onscene') { r.status = 'Checked In'; r.assign = ''; if (!r.arrived) r.arrived = CP.now(); r.u = CP.now(); CP.touch(inc(), 'resources'); commit(r.name + ' on scene', 'Resource'); }
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
      var na = CP.addItem(inc(), 'assignments', o); U.closeModal(); var sr = CB.sel && CP.byId(inc().resources, CB.sel); CB.sel = null; if (sr && na) { log(n + ' established', 'Action'); moveUnit(sr, na.id); } else commit(n + ' established', 'Action');
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
    var bg = U.modal('PAR · Personnel Accountability', '<div class="cbmenu">' + list.map(function (a) { return '<label class="cbparrow"><input type="checkbox" data-pa="' + a.id + '"> <b>' + E(aName(a)) + '</b> <span class="dim">' + E(unitsIn(a.id).map(function (r) { return r.name + (+r.persons ? ' (' + r.persons + ')' : ''); }).join(', ')) + '</span><em class="cbparn">' + ppl(unitsIn(a.id)) + '</em></label>'; }).join('') + '</div>' +
      '<div class="row" style="margin-top:10px;gap:8px"><span class="dim">PAR timer every</span>' + [10, 15, 20, 30].map(function (n) { return '<button class="btn xs' + (n === every ? ' pri' : '') + '" data-pe="' + n + '">' + n + ' min</button>'; }).join('') + '</div>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Record PAR', cls: 'pri', fn: function (b) {
        var ok = [], miss = [], pOk = 0, pAll = 0; b.querySelectorAll('[data-pa]').forEach(function (x) { var a = CP.byId(inc().assignments, x.dataset.pa), n = ppl(unitsIn(a.id)); pAll += n; if (x.checked) pOk += n; (x.checked ? ok : miss).push(aName(a)); if (x.checked) setKV('par_' + a.id, CP.now()); });
        setKV('parT', CP.now()); commit('PAR: ' + ok.length + ' of ' + list.length + ' assignments, ' + pOk + ' of ' + pAll + ' personnel accounted' + (miss.length ? '. NOT ACCOUNTED: ' + miss.join(', ') : ''), 'Safety');
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
  act.notesave = function () { var b = document.getElementById('cbQuick'); if (!b) return; var t = b.value; if (!t.trim()) { b.focus(); U.toast('Type a note first', 'err'); return; } b.value = ''; saveNote(t); U.toast('Note saved', 'ok'); };
  act.quick = function (q) { var b = document.getElementById('cbQuick'), extra = b && b.value.trim(); if (b) b.value = ''; saveNote(q + (extra ? '. ' + extra : '')); U.toast('Logged: ' + q, 'ok'); };
  act.unote = function (id) { unitNote(id); };
  act.crew = function (id) { unitCrew(id); };
  act.umenu = function (id) { unitMenu(id); };
  act.note = function () { U.modal('Log entry', '<textarea class="in" id="cbNote" style="min-height:90px"></textarea><div class="cbmenu grid" style="margin-top:8px">' + quickFor().map(function (q) { return '<button data-q="' + E(q) + '">' + E(q) + '</button>'; }).join('') + '</div>', [{ label: 'Cancel', cls: 'ghost' }, { label: 'Log', cls: 'pri', fn: function (b) { var t = b.querySelector('#cbNote').value.trim(); if (!t) return false; commit(t, /command/i.test(t) ? 'Decision' : 'Event'); } }], { onOpen: function (b) { b.addEventListener('click', function (e) { var q = e.target.closest('[data-q]'); if (!q) return; e.preventDefault(); var n = b.querySelector('#cbNote'); n.value = (n.value ? n.value + '. ' : '') + q.dataset.q; }); } }); };
  act.more = function () {
    var bg = U.modal('More', '<div class="cbmenu">' + [['report', 'Incident report (print / PDF)'], ['ic', 'Transfer command (new IC)'], ['work', 'Crew work timers (' + wkWarn() + ' / ' + wkMax() + ' min)'], ['upgrade', kv('tpl') === 'alarm' ? 'Upgrade: alarm is a working fire' : 'Add structure-fire assignments'], ['phonelink', 'Phone view link / QR'], ['tocp', 'Move to Command Post (full ICS)'], [inc().status === 'Closed' ? 'reopen' : 'close', inc().status === 'Closed' ? 'Reopen incident' : 'Terminate command / close incident'], ['exit', 'Back to board list']].map(function (o) { return '<button data-mo="' + o[0] + '"' + (o[0] === 'close' ? ' class="red"' : '') + '>' + E(o[1]) + '</button>'; }).join('') + '</div>', [{ label: 'Close', cls: 'ghost' }], { nofocus: true });
    bg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-mo]'); if (!b) return; e.preventDefault(); var k = b.dataset.mo; U.closeModal();
      if (k === 'ic') setTimeout(act.xfer, 30);
      if (k === 'work') setTimeout(act.worktimes, 30);
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
      (function () { var ps = photos(), wb = wbImage(); return (ps.length ? '<h2>Scene photos</h2><div style="display:flex;flex-wrap:wrap;gap:8px">' + ps.map(function (p) { return '<figure style="margin:0;width:150px"><img src="' + p.th + '" style="width:150px;border-radius:4px"><figcaption style="font-size:10px">' + E(CP.fmtTime(p.t)) + (p.cap ? ' · ' + E(p.cap) : '') + '</figcaption></figure>'; }).join('') + '</div><p style="font-size:10px;color:#555">Full-size photos: county ArcGIS, tag "' + E(inc().number) + '".</p>' : '') + (wb ? '<h2>Whiteboard</h2><img src="' + wb + '" style="width:100%;max-width:700px;border-radius:6px">' : ''); })() + '<h2>Benchmarks</h2>' + tbl(['Benchmark', 'Time', 'Into incident', 'By'], marks().map(function (m) { return row([m.label, m.t ? CP.fmtTime(m.t) : 'not reached', m.t ? dur(i.start, m.t) : '', m.by]); })) +
      '<h2>Units</h2>' + tbl(['Unit', 'Riding', 'Type', 'Agency', 'Arrived', 'Last assignment', 'Status', 'Released', 'Time on scene', 'Note'], all.map(function (r) { return row([r.name + (r.parent ? ' (split)' : ''), r.persons || '', r.kind, r.agency, r.arrived || r.checkin ? CP.fmtTime(r.arrived || r.checkin) : '', asgName(r.assign) || (lg.slice().reverse().find(function (l) { return l.text.indexOf(r.name + ' assigned to ') === 0; }) || { text: '' }).text.replace(r.name + ' assigned to ', ''), r.status, r.released ? CP.fmtTime(r.released) : '', dur(r.arrived || r.checkin, r.released || i.closed || null), r.note || '']); })) +
      '<h2>Divisions & groups</h2>' + tbl(['Assignment', 'Supervisor', 'Task', 'Last CAN report'], asgs().map(function (a) { return row([aName(a), a.reportTo, a.work, a.cbCan]); })) +
      '<h2>Safety: PAR and MAYDAY</h2>' + tbl(['Time', 'Entry'], lg.filter(function (l) { return /^(PAR|MAYDAY)/.test(l.text); }).map(function (l) { return row([CP.fmtTime(l.ts), l.text]); }).concat(lg.some(function (l) { return /^(PAR|MAYDAY)/.test(l.text); }) ? [] : [row(['', 'No PAR or MAYDAY recorded'])])) +
      '<h2>Complete timeline</h2>' + tbl(['Time', 'Elapsed', 'Category', 'Entry', 'By'], lg.map(function (l) { return row([CP.fmtTime(l.ts), dur(i.start, l.ts), l.cat, l.text, l.author]); })) +
      '<div class="foot">Generated ' + E(CP.fmtDT(CP.now())) + ' by ' + E(CP.me.name || '') + '. The same record is in Command Post (Reports: ICS 201, 211, 214) and in county ArcGIS (BOCO_Command_Post).</div>';
    var css = '<style>body{font:12px/1.35 Arial,sans-serif;color:#111;margin:24px}h1{font:800 18px Arial;margin:2px 0}h2{font:700 13px Arial;margin:16px 0 6px;border-bottom:2px solid #0B1A2B;text-transform:uppercase;letter-spacing:.5px}.k{font:700 10px Arial;letter-spacing:2px;color:#555}.sub{color:#444;margin-bottom:10px}table{width:100%;border-collapse:collapse;margin-bottom:6px}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eef1f5;font-size:11px}.foot{margin-top:16px;font-size:10px;color:#666}@media print{button{display:none}}</style>';
    var html = '<!doctype html><html><head><meta charset="utf-8"><title>Incident report ' + E(i.number) + '</title>' + css + '</head><body>' + body + '</body></html>';
    var fname = 'Incident report ' + i.number + ' ' + (i.location.desc || '').replace(/[^\w ,-]+/g, '').slice(0, 40) + '.html';
    var bg = U.modal('Incident report', '<div class="cbreport">' + body + '</div>', [{ label: I('down') + 'Download', cls: 'ghost', fn: function () { U.download(fname, html, 'text/html'); return false; } }, { label: I('print') + 'Print / save as PDF', cls: 'pri', fn: function () {
      var w = window.open('', '_blank'); if (w) { w.document.write(html + '<script>setTimeout(function(){print()},300)<\/script>'); w.document.close(); } else { U.download(fname, html, 'text/html'); U.toast('Downloaded. Open it and print to save a PDF.', 'ok', 6000); } return false; } }, { label: 'Close', cls: 'ghost' }].slice(0, 2).concat(sendBtns(html, fname)).concat([{ label: 'Close', cls: 'ghost' }]), { wide: true });
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
  act.home = function () { CB.htab = 'home'; CB.inc = null; CB.sel = null; history.replaceState(null, '', location.pathname); CB.list = undefined; CB.cad = undefined; render(); loadLists().then(render); };
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
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && e.target && e.target.id === 'cbQuick') { e.preventDefault(); act.notesave(); } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && CB.sel && !document.getElementById('modal')) { CB.sel = null; render(); } });
  window.addEventListener('resize', function () { clearTimeout(CB._rz); CB._rz = setTimeout(render, 200); });
  window.addEventListener('cp-incident-synced', function (ev) { if (inc() && inc().id === ev.detail) { var s = CP.store.get(ev.detail); if (s) { CB.inc = CP.merge(inc(), s); render(); } } });
  window.addEventListener('cp-reconnected', function () { if (inc()) push(); });

  // ---------- boot ----------
  CB.boot = async function () {
    CP.me = CP.store.prefs().me || {};
    document.getElementById('app').innerHTML = '<header class="cbfire cbh2"><div class="cbbadge"><img class="cbpatch" src="' + PATCH + '" alt="Botetourt County Fire &amp; EMS patch" onerror="this.onerror=null;this.src=\'seal.png\'"></div><div class="cblock"><div class="k">Botetourt County <i>·</i> BEACON</div><div class="t">Fire <i>&amp;</i> EMS <span>Command Board</span></div></div><span class="sp" style="flex:1"></span><nav id="cbTabSlot" class="cbhtabs"></nav><span class="sp" style="flex:1"></span><div class="cbhclock"><b id="cbClock">' + new Date().toTimeString().slice(0, 5) + '</b><span id="cbDate">' + new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + '</span></div><button class="btn cbhome" data-cb="home" title="Command Board home: all open incidents">' + I('home') + '<span>Home</span></button></header><main id="cbmain" class="cbwrap"></main>';
    setInterval(function () { var c = document.getElementById('cbClock'); if (c) c.textContent = new Date().toTimeString().slice(0, 5); }, 5000);
    try { if (await A.handleRedirect() === 'away') return; } catch (e) {}
    var qs = new URLSearchParams(location.search), want = qs.get('incident');
    render();
    if (A.signedIn()) await A.connect();
    if (want) await openBoard(want); else { await loadLists(); render(); }
  };
})(window.CP);
