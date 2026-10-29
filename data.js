/* COMMAND POST — constants, data model and local store
   Botetourt County Emergency Management */
window.CP = window.CP || {};
(function (CP) {
  'use strict';

  CP.VERSION = '1.0.0';
  CP.COUNTY = { name: 'Botetourt County', state: 'VA', center: [37.555, -79.81], zoom: 10,
    bbox: { xmin: -80.16, ymin: 37.32, xmax: -79.48, ymax: 37.81 } };

  // Same coded values the county's Incidents layer uses, so a push to ArcGIS always validates.
  CP.INCIDENT_TYPES = ['Winter Storm', 'Severe Thunderstorm', 'Flooding', 'Tornado', 'Hurricane', 'Wildfire', 'Fire',
    'Vehicle', 'Rail', 'Air', 'Chemical', 'Radiological', 'Public Health', 'Civil Disturbance', 'Criminal Activity',
    'Cyber', 'Earthquake', 'Agricultural Animal Health', 'Infestation', 'Marine', 'Other'];

  CP.COMPLEXITY = [
    { v: 5, label: 'Type 5', d: 'One or two single resources, up to 6 people. Contained in the first operational period, usually within hours. No written IAP.' },
    { v: 4, label: 'Type 4', d: 'Several resources (task force or strike team). Command staff and general staff activated only if needed. Usually one operational period, no written IAP.' },
    { v: 3, label: 'Type 3', d: 'Capability exceeds initial attack. Some or all command and general staff positions filled. Written IAP may be needed. Multiple operational periods possible.' },
    { v: 2, label: 'Type 2', d: 'Extends beyond local capability. Most command and general staff positions filled. Written IAP required. Many functional units staffed.' },
    { v: 1, label: 'Type 1', d: 'Most complex. National resources. All command and general staff positions activated. Branches established. Written IAP required.' }
  ];

  CP.EOC_STATUS = ['Normal Operations', 'Virtually Monitoring', 'Partial Activation', 'Full Activation'];
  CP.DECLARATION = ['Non-Declared', 'Local Emergency Declared', 'State of Emergency (Virginia)', 'Federal Declaration'];
  CP.SHELTER_STATUS = ['Closed', 'On Standby', 'Open', 'At Capacity'];
  CP.OFFICE_STATUS = ['Open', 'Delayed Opening', 'Early Closure', 'Closed'];
  CP.SCHOOL_STATUS = ['Open', 'Delayed Opening', 'Early Dismissal', 'Virtual', 'Closed'];
  CP.WEATHER_STATUS = ['No Active Alerts', 'Hazardous Weather Outlook', 'Winter Weather Advisory', 'Winter Storm Watch', 'Winter Storm Warning',
    'Winter Weather Warning', 'Ice Storm Warning', 'Flood Watch', 'Flood Warning', 'Flash Flood Warning', 'Severe Thunderstorm Warning',
    'Tornado Warning', 'Wind Advisory', 'Heat Advisory', 'Other'];
  CP.ACADEMY_STATUS = ['Normal', 'Virtual', 'Cancelled'];

  // FEMA community lifelines. key = field name on the county Lifeline Status table.
  CP.LIFELINES = [
    { key: 'safetysecurity', sitrep: 'exp_safety', name: 'Safety & Security', icon: 'shield' },
    { key: 'foodhydrationshelter', sitrep: 'exp_food', name: 'Food, Hydration, Shelter', icon: 'food' },
    { key: 'healthmedical', sitrep: 'exp_health', name: 'Health & Medical', icon: 'health' },
    { key: 'energy', sitrep: 'exp_energy', name: 'Energy', icon: 'energy' },
    { key: 'communications', sitrep: 'exp_comms', name: 'Communications', icon: 'comms' },
    { key: 'transportation', sitrep: 'exp_transport', name: 'Transportation', icon: 'transport' },
    { key: 'hazardousmaterials', sitrep: 'exp_hazmat', name: 'Hazardous Materials', icon: 'hazmat' },
    { key: 'watersystems', sitrep: 'exp_water', name: 'Water Systems', icon: 'water' }
  ];
  CP.LIFELINE_STATUS = [
    { v: 'Minimal Impact', eop: 'Stabilized', c: 'ok' },
    { v: 'Moderate Impact', eop: 'Stabilizing', c: 'warn' },
    { v: 'Significant Impact', eop: 'Destabilized', c: 'bad' },
    { v: 'Unknown', eop: 'Unknown', c: 'unk' }
  ];

  // ICS positions. f = which form block lists it. many = can repeat with a label (Division A, Branch II ...)
  CP.POSITIONS = [
    { k: 'IC', t: 'Incident Commander', s: 'Command' },
    { k: 'DIC', t: 'Deputy Incident Commander', s: 'Command' },
    { k: 'SOFR', t: 'Safety Officer', s: 'Command' },
    { k: 'PIO', t: 'Public Information Officer', s: 'Command' },
    { k: 'LOFR', t: 'Liaison Officer', s: 'Command' },
    { k: 'AREP', t: 'Agency Representative', s: 'Command', many: true, lab: 'Agency' },
    { k: 'OSC', t: 'Operations Section Chief', s: 'Operations' },
    { k: 'DOSC', t: 'Deputy Operations Section Chief', s: 'Operations' },
    { k: 'STAM', t: 'Staging Area Manager', s: 'Operations', many: true, lab: 'Staging Area' },
    { k: 'OPBD', t: 'Branch Director', s: 'Operations', many: true, lab: 'Branch' },
    { k: 'DIVS', t: 'Division/Group Supervisor', s: 'Operations', many: true, lab: 'Division/Group' },
    { k: 'AOBD', t: 'Air Operations Branch Director', s: 'Operations' },
    { k: 'TFLD', t: 'Task Force / Strike Team Leader', s: 'Operations', many: true, lab: 'TF/ST' },
    { k: 'PSC', t: 'Planning Section Chief', s: 'Planning' },
    { k: 'DPSC', t: 'Deputy Planning Section Chief', s: 'Planning' },
    { k: 'RESL', t: 'Resources Unit Leader', s: 'Planning' },
    { k: 'SITL', t: 'Situation Unit Leader', s: 'Planning' },
    { k: 'DOCL', t: 'Documentation Unit Leader', s: 'Planning' },
    { k: 'DMOB', t: 'Demobilization Unit Leader', s: 'Planning' },
    { k: 'THSP', t: 'Technical Specialist', s: 'Planning', many: true, lab: 'Specialty' },
    { k: 'LSC', t: 'Logistics Section Chief', s: 'Logistics' },
    { k: 'DLSC', t: 'Deputy Logistics Section Chief', s: 'Logistics' },
    { k: 'SUBD', t: 'Support Branch Director', s: 'Logistics' },
    { k: 'SPUL', t: 'Supply Unit Leader', s: 'Logistics' },
    { k: 'FACL', t: 'Facilities Unit Leader', s: 'Logistics' },
    { k: 'GSUL', t: 'Ground Support Unit Leader', s: 'Logistics' },
    { k: 'SVBD', t: 'Service Branch Director', s: 'Logistics' },
    { k: 'COML', t: 'Communications Unit Leader', s: 'Logistics' },
    { k: 'MEDL', t: 'Medical Unit Leader', s: 'Logistics' },
    { k: 'FDUL', t: 'Food Unit Leader', s: 'Logistics' },
    { k: 'FSC', t: 'Finance/Admin Section Chief', s: 'Finance/Admin' },
    { k: 'DFSC', t: 'Deputy Finance/Admin Section Chief', s: 'Finance/Admin' },
    { k: 'TIME', t: 'Time Unit Leader', s: 'Finance/Admin' },
    { k: 'PROC', t: 'Procurement Unit Leader', s: 'Finance/Admin' },
    { k: 'COMP', t: 'Comp/Claims Unit Leader', s: 'Finance/Admin' },
    { k: 'COST', t: 'Cost Unit Leader', s: 'Finance/Admin' }
  ];
  CP.POS = {}; CP.POSITIONS.forEach(function (p) { CP.POS[p.k] = p; });
  CP.SECTIONS = ['Command', 'Operations', 'Planning', 'Logistics', 'Finance/Admin'];
  CP.SECTION_CHIEF = { Operations: 'OSC', Planning: 'PSC', Logistics: 'LSC', 'Finance/Admin': 'FSC' };

  CP.RES_KINDS = ['Engine', 'Ambulance (ALS)', 'Ambulance (BLS)', 'Ladder/Truck', 'Rescue', 'Tanker/Tender', 'Brush Truck', 'Law Enforcement',
    'Swiftwater Team', 'SAR Team', 'Hazmat Team', 'UAS Team', 'Dozer', 'Dump Truck', 'Plow/Grader', 'Chainsaw Crew', 'Generator',
    'Light Tower', 'Pump', 'Bus', 'Shelter Team', 'Damage Assessment Team', 'Utility Crew', 'Public Works Crew',
    'Overhead (single person)', 'Volunteer Team', 'Other'];
  CP.RES_STATUS = [
    { v: 'Ordered', c: 'unk' }, { v: 'En Route', c: 'blue' }, { v: 'Checked In', c: 'gold' }, { v: 'Staged', c: 'gold' },
    { v: 'Assigned', c: 'ok' }, { v: 'Out of Service', c: 'bad' }, { v: 'Released', c: 'mute' }, { v: 'Demobilized', c: 'mute' }
  ];
  CP.FAC_TYPES = ['Incident Command Post', 'Staging Area', 'Incident Base', 'Camp ', 'Other'];
  CP.FAC_TYPES_X = ['Incident Command Post', 'Staging Area', 'Incident Base', 'Camp', 'Helibase/Helispot', 'EOC', 'Shelter', 'Point of Distribution', 'Medical Aid Station', 'Other'];
  CP.LOG_CATS = ['Event', 'Decision', 'Action', 'Communication', 'Resource', 'Safety', 'Public Info', 'Briefing', 'Note'];
  CP.CHECKIN_LOCS = ['ICP', 'Staging Area', 'Base', 'Helibase', 'EOC', 'Other'];
  CP.PRIORITY = ['Urgent', 'Routine', 'Low'];
  CP.REQ_STATUS = ['Draft', 'Submitted', 'Approved', 'Ordered', 'Filled', 'Cancelled'];

  CP.TOOLKIT = [
    { n: 'Overwatch', d: 'Live CAD, VDOT, power, weather', u: 'https://experience.arcgis.com/experience/299778f2f57a472eb478ac1bf21bb424', c: 'gold' },
    { n: 'County EOC', d: 'Lifelines, SitReps, field reports', u: 'https://experience.arcgis.com/experience/0ed836c463984dcc86ab3e1a6d36831a', c: 'gold' },
    { n: 'Stormwatch Responder', d: 'Storm reports and field reports', u: 'https://experience.arcgis.com/experience/0f7a1564b1db45c2adcb469b56973330', c: 'blue' },
    { n: 'EM Information Manager', d: 'Incidents, closures, notices, shelters', u: 'https://experience.arcgis.com/experience/72f067d23b644c91b77cc41824be18cd', c: 'blue' },
    { n: 'Damage Assessment Ops', d: 'Zones, teams and IDA', u: 'https://experience.arcgis.com/experience/4191928dcb0448ed85a379a69a1ef304', c: 'red' },
    { n: 'Shelter Operations', d: 'Registrations and capacity', u: 'https://botetourt.maps.arcgis.com/apps/dashboards/7dddb021e06f4a52922526bd380a78a7', c: 'red' },
    { n: 'House Checks', d: 'Welfare checks (staff)', u: 'https://botetourt.maps.arcgis.com/apps/dashboards/ef9a579655aa4e839df5a1688e340185', c: 'red' },
    { n: 'SitRep Survey', d: 'Survey123 SitRep form', u: 'https://survey123.arcgis.com/share/631f7ff13dea429cbf8f04de16405a44', c: 'blue' },
    { n: 'Incident Status (public)', d: 'Public incident dashboard', u: 'https://botetourt.maps.arcgis.com/apps/dashboards/4d677e0a925043988069feb407c834fb', c: 'mute' },
    { n: 'EM Website', d: 'Public Hub site', u: 'https://bocoem-botetourt.hub.arcgis.com', c: 'mute' }
  ];

  // ---------- helpers ----------
  CP.uid = function () { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); };
  CP.now = function () { return new Date().toISOString(); };
  CP.pad = function (n) { return (n < 10 ? '0' : '') + n; };
  CP.localInput = function (iso) { // ISO -> value for <input type=datetime-local>
    if (!iso) return ''; var d = new Date(iso); if (isNaN(d)) return '';
    return d.getFullYear() + '-' + CP.pad(d.getMonth() + 1) + '-' + CP.pad(d.getDate()) + 'T' + CP.pad(d.getHours()) + ':' + CP.pad(d.getMinutes());
  };
  CP.fromLocalInput = function (v) { if (!v) return ''; var d = new Date(v); return isNaN(d) ? '' : d.toISOString(); };
  CP.fmtDate = function (iso) { if (!iso) return ''; var d = new Date(iso); if (isNaN(d)) return ''; return CP.pad(d.getMonth() + 1) + '/' + CP.pad(d.getDate()) + '/' + d.getFullYear(); };
  CP.fmtTime = function (iso) { if (!iso) return ''; var d = new Date(iso); if (isNaN(d)) return ''; return CP.pad(d.getHours()) + CP.pad(d.getMinutes()); };
  CP.fmtDT = function (iso) { if (!iso) return ''; return CP.fmtDate(iso) + ' ' + CP.fmtTime(iso); };
  CP.elapsed = function (iso) {
    if (!iso) return ''; var ms = Date.now() - new Date(iso).getTime(); if (ms < 0) return 'starts ' + CP.fmtDT(iso);
    var m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    return (d ? d + 'd ' : '') + (d || h ? h + 'h ' : '') + mm + 'm';
  };
  CP.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  CP.nl = function (s) { return CP.esc(s).replace(/\n/g, '<br>'); };
  CP.clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  CP.alive = function (arr) { return (arr || []).filter(function (x) { return x && !x.del; }); };
  CP.byId = function (arr, id) { return (arr || []).find(function (x) { return x.id === id; }); };

  // ---------- new incident ----------
  CP.newOP = function (n, start, hours) {
    var s = start ? new Date(start) : new Date();
    var e = new Date(s.getTime() + (hours || 12) * 3600000);
    return { id: CP.uid(), u: CP.now(), n: n, start: s.toISOString(), end: e.toISOString(), objectives: [],
      emphasis: '', awareness: '', weather: '', safetyMsg: '', sspRequired: false, sspLocation: '',
      iapItems: { '203': true, '204': true, '205': true, '205A': false, '206': true, '207': true, '208': true, map: false, weather: false },
      otherAttachments: '', meetings: [] };
  };

  CP.newIncident = function (o) {
    o = o || {};
    var start = o.start || CP.now(), d = new Date(start);
    var inc = {
      schema: 1, id: CP.uid(), _ts: {}, created: CP.now(), updated: CP.now(), updatedBy: '',
      number: o.number || (d.getFullYear() + '-BOCO-' + CP.pad(d.getMonth() + 1) + CP.pad(d.getDate()) + '-' + CP.pad(d.getHours()) + CP.pad(d.getMinutes())),
      name: o.name || 'New Incident', type: o.type || 'Other', complexity: o.complexity || 5, status: 'Active',
      start: start, closed: '', location: { desc: o.locdesc || '', address: '', lat: o.lat || null, lng: o.lng || null, jurisdiction: 'Botetourt County' },
      perimeter: null, publicView: false, showAll: false,
      situation: o.situation || '', healthSafety: '', mapNote: '',
      actions: [], // 201 block 8
      opPeriods: [], currentOP: 1,
      org: [], resources: [], assignments: [], comms: [], contacts: [],
      medical: { aid: [], transport: [], hospitals: [], procedures: '', aviation: false },
      facilities: [], calls: [], hazards: [], log: [], messages: [], requests: [], sitreps: [], briefings: [],
      eoc: { eoc_status: 'Virtually Monitoring', declaration_status: 'Non-Declared', shelter_status: 'Closed', gov_offices_status: 'Open',
        schools_status: 'Open', weather_status: 'No Active Alerts', fire_academy_status: 'Normal' },
      lifelines: {}, publicInfo: { shortMessage: '', longMessage: '', actionRequired: false, actionMessage: '', url: '', releases: [] },
      s209: { version: 'Initial', reportNo: 1, size: '', pctComplete: '', definition: '', events: '', hazards: '', weatherConcerns: '',
        proj12: '', proj24: '', proj48: '', proj72: '', projAfter: '', threat12: '', threat24: '', threat48: '', threat72: '', threatAfter: '',
        need12: '', need24: '', need48: '', need72: '', needAfter: '', strategic: '', nextActions: '', finalSize: '', completion: '',
        demobStart: '', costToDate: '', costFinal: '', remarks: '', lshRemarks: '', threatMgmt: {}, cooperating: '', sentTo: 'VDEM Region 6 / VEOC',
        dmg: {}, pub: {}, resp: {} },
      arc: { linked: false, pushed: {}, auto: { incident: true, facilities: true } }, links: []
    };
    CP.LIFELINES.forEach(function (l) { inc.lifelines[l.key] = { status: 'Minimal Impact', desc: '' }; });
    inc.opPeriods.push(CP.newOP(1, start, o.opHours || 12));
    if (o.icName) inc.org.push({ id: CP.uid(), u: CP.now(), pos: 'IC', label: '', name: o.icName, agency: o.icAgency || '', phone: o.icPhone || '', radio: '', email: '', checkin: start });
    if (o.objectives) o.objectives.split(/\n+/).filter(Boolean).forEach(function (t) { inc.opPeriods[0].objectives.push({ id: CP.uid(), text: t.trim(), status: 'Open' }); });
    if (o.situation) inc.log.push({ id: CP.uid(), u: CP.now(), ts: start, author: o.author || o.icName || '', pos: o.icName ? 'Incident Commander' : '', cat: 'Event', text: 'Incident initiated. ' + o.situation, op: 1 });
    // default comms + medical so small incidents get useful 205/206 with no typing
    inc.comms = CP.defaultComms();
    inc.medical.hospitals = CP.defaultHospitals();
    inc.medical.transport = [{ id: CP.uid(), u: CP.now(), name: 'Botetourt County Fire & EMS', location: 'County-wide', contact: '911 / Dispatch 540-473-8631', level: 'ALS', air: 'Ground' }];
    return inc;
  };

  CP.defaultComms = function () {
    return [
      { id: CP.uid(), u: CP.now(), zone: '', ch: '1', fn: 'Command', name: 'BOCO Command', assign: 'Command / Div Sups', rx: '', rxTone: '', tx: '', txTone: '', mode: 'D', remarks: 'Confirm talkgroup with Emergency Communications' },
      { id: CP.uid(), u: CP.now(), zone: '', ch: '2', fn: 'Tactical', name: 'BOCO Fire TAC', assign: 'Operations', rx: '', rxTone: '', tx: '', txTone: '', mode: 'D', remarks: '' },
      { id: CP.uid(), u: CP.now(), zone: '', ch: '3', fn: 'Dispatch', name: 'BOCO Dispatch', assign: 'All units', rx: '', rxTone: '', tx: '', txTone: '', mode: 'D', remarks: 'Dispatch 540-473-8631' }
    ];
  };
  CP.defaultHospitals = function () {
    return [
      { id: CP.uid(), u: CP.now(), name: 'Carilion Roanoke Memorial Hospital', address: '1906 Belleview Ave SE, Roanoke, VA', contact: '540-981-7000', air: '15', ground: '35', trauma: 'Level I', burn: 'Yes', helipad: 'Yes' },
      { id: CP.uid(), u: CP.now(), name: 'LewisGale Medical Center', address: '1900 Electric Rd, Salem, VA', contact: '540-776-4000', air: '15', ground: '30', trauma: 'Level II', burn: 'No', helipad: 'Yes' }
    ];
  };

  CP.curOP = function (inc) {
    var ops = CP.alive(inc.opPeriods);
    return ops.find(function (o) { return o.n === inc.currentOP; }) || ops[ops.length - 1];
  };
  CP.person = function (inc, posKey, label) {
    var m = CP.alive(inc.org).filter(function (p) { return p.pos === posKey && (!label || (p.label || '') === label); });
    return m.find(function (p) { return p.name; }) || m[0];
  };
  CP.personName = function (inc, posKey) { var p = CP.person(inc, posKey); return p ? p.name : ''; };

  // ---------- path editing with per-section timestamps (used for merge) ----------
  // path syntax: "situation", "location.lat", "resources@id.status", "opPeriods@id.objectives@oid.text", "eoc.weather_status"
  CP.setPath = function (inc, path, val) {
    var segs = path.split('.'), o = inc, now = CP.now();
    inc._ts = inc._ts || {}; inc._ts[segs[0].split('@')[0]] = now;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i], last = i === segs.length - 1, at = s.indexOf('@');
      if (at > 0) {
        var arr = o[s.slice(0, at)], it = CP.byId(arr, s.slice(at + 1));
        if (!it) return false;
        it.u = now;
        if (last) return false;
        o = it; continue;
      }
      if (last) { o[s] = val; break; }
      if (o[s] == null || typeof o[s] !== 'object') o[s] = {};
      o = o[s];
    }
    inc.updated = now;
    return true;
  };
  CP.getPath = function (inc, path) {
    var segs = path.split('.'), o = inc;
    for (var i = 0; i < segs.length && o != null; i++) {
      var s = segs[i], at = s.indexOf('@');
      o = at > 0 ? CP.byId(o[s.slice(0, at)], s.slice(at + 1)) : o[s];
    }
    return o;
  };
  CP.touch = function (inc, key) { inc._ts = inc._ts || {}; inc._ts[key] = CP.now(); inc.updated = CP.now(); };
  CP.addItem = function (inc, key, item) {
    item.id = item.id || CP.uid(); item.u = CP.now();
    var arr = key.indexOf('.') > 0 ? CP.getPath(inc, key) : inc[key];
    arr.push(item); CP.touch(inc, key.split('.')[0].split('@')[0]);
    var top = key.split('.')[0]; if (top.indexOf('@') > 0) { var p = CP.getPath(inc, top); if (p) p.u = CP.now(); }
    return item;
  };
  CP.delItem = function (inc, key, id) {
    var arr = key.indexOf('.') > 0 ? CP.getPath(inc, key) : inc[key];
    var it = CP.byId(arr, id); if (!it) return;
    it.del = true; it.u = CP.now(); CP.touch(inc, key.split('.')[0].split('@')[0]);
    var top = key.split('.')[0]; if (top.indexOf('@') > 0) { var p = CP.getPath(inc, top); if (p) p.u = CP.now(); }
  };

  // Merge two versions of the same incident: id-arrays merge item by item (newest u wins),
  // everything else per top-level key by _ts. Lets several people edit at once.
  CP.merge = function (a, b) {
    if (!a) return b; if (!b) return a;
    var out = CP.clone(a), ta = a._ts || {}, tb = b._ts || {};
    out._ts = Object.assign({}, ta);
    Object.keys(b).forEach(function (k) {
      if (k === '_ts' || k === 'arc') return;
      var va = a[k], vb = b[k];
      if (Array.isArray(vb) && (Array.isArray(va) || va == null) && (vb.length === 0 || (vb[0] && typeof vb[0] === 'object' && 'id' in vb[0]))) {
        var map = {}, order = [];
        (va || []).forEach(function (x) { map[x.id] = x; order.push(x.id); });
        vb.forEach(function (x) { if (!map[x.id]) { order.push(x.id); map[x.id] = x; } else if ((x.u || '') > (map[x.id].u || '')) map[x.id] = x; });
        out[k] = order.map(function (id) { return map[id]; });
        if ((tb[k] || '') > (out._ts[k] || '')) out._ts[k] = tb[k];
      } else if ((tb[k] || '') > (ta[k] || '') || va === undefined) {
        out[k] = CP.clone(vb); out._ts[k] = tb[k] || out._ts[k];
      }
    });
    out.updated = (a.updated || '') > (b.updated || '') ? a.updated : b.updated;
    return out;
  };

  // ---------- local store ----------
  var KEY = 'bcem.cp.incidents.v1', PREF = 'bcem.cp.prefs.v1';
  CP.store = {
    all: function () { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } },
    list: function () { var a = CP.store.all(); return Object.keys(a).map(function (k) { return a[k]; }).sort(function (x, y) { return (y.updated || '').localeCompare(x.updated || ''); }); },
    get: function (id) { return CP.store.all()[id] || null; },
    put: function (inc) { var a = CP.store.all(); a[inc.id] = inc; try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { console.warn('local save failed', e); } },
    remove: function (id) { var a = CP.store.all(); delete a[id]; localStorage.setItem(KEY, JSON.stringify(a)); },
    prefs: function () { try { return JSON.parse(localStorage.getItem(PREF) || '{}'); } catch (e) { return {}; } },
    setPref: function (k, v) { var p = CP.store.prefs(); p[k] = v; try { localStorage.setItem(PREF, JSON.stringify(p)); } catch (e) {} }
  };
})(window.CP);
