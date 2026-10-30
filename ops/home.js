/* EM OPS — home board and ArcGIS setup */
(function (CP) {
  'use strict';
  var OPS = CP.ops, A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon;

  OPS.tool('home', { eop: 'general',
    n: 'EM Ops', sub: 'County Operations Tools', icon: 'dash', d: 'Every county EM operations tool in one place, on ArcGIS, tied to Command Post incidents.',
    render: function () {
      var miss = !OPS.svc.main;
      var h = '<div class="phead"><div><h1 class="pg">Operations board</h1><p class="pgsub" style="margin:0">' + (OPS.inc ? 'Numbers for <b>' + E(OPS.inc.name) + '</b>. Switch to county-wide at the top to see everything.' : 'County-wide numbers. Pick an incident at the top to focus every tool on it.') + '</p></div><div class="acts"><button class="btn sm" data-act="refresh">' + I('refresh') + 'Refresh</button></div></div>';
      if (miss) h += '<div class="hero" style="margin-bottom:14px"><h2>Set up EM Ops</h2><p>The county ArcGIS services behind these tools are not built yet. One click creates every layer, shares them, turns on the family kiosk and QR check-in, makes the web map and loads the EOP starter content.</p>' + (A.user && A.user.canPublish ? '<button class="btn big pri" data-act="buildAll">' + I('play') + 'Build everything</button>' : '<div class="warnbox">Needs an ArcGIS publisher account. Ask the EM Coordinator to open this page and build it.</div>') + '</div>';
      h += '<div class="tiles">' + OPS.order.filter(function (k) { return k !== 'home' && k !== 'setup' && OPS.canUse(k); }).map(function (k) {
        var t = OPS.tools[k], nums = !miss && t.nums ? OPS.load('home:' + k + ':' + (OPS.inc ? OPS.inc.key : ''), t.nums, 60000) : null;
        var nh = nums === undefined ? '<span class="dim">…</span>' : nums && nums._err ? '<span class="dim" style="font-size:12px">' + E(nums._err).slice(0, 90) + '</span>' : (nums || []).map(function (n) { return '<div><b class="' + (n[2] || '') + '">' + E(n[0]) + '</b><span>' + E(n[1]) + '</span></div>'; }).join('');
        return '<a class="tile ' + (t.color || '') + '" href="#' + k + '" data-act="go" data-a="' + k + '"><div class="ti">' + I(t.icon || 'list') + E(t.n) + '</div><p>' + E(t.d || '') + '</p><div class="nums">' + nh + '</div></a>';
      }).join('') + '</div>';
      h += '<div class="card" style="margin-top:14px"><h3>' + I('link') + 'Field links</h3><div class="tk">' +
        '<a href="checkin.html' + (OPS.inc ? '?incident=' + encodeURIComponent(OPS.inc.key) : '') + '" target="_blank"><b>Check-In app</b><span>Phone check-in for responders and volunteers</span></a>' +
        '<a href="commandboard.html' + (OPS.inc ? '?incident=' + encodeURIComponent(OPS.inc.key) : '') + '" target="_blank" class="red"><b>Command Board</b><span>Fire alarm, structure fire, first-hour command</span></a>' +
        '<a href="hotline.html' + (OPS.inc ? '?incident=' + encodeURIComponent(OPS.inc.key) : '') + '" target="_blank" class="blue"><b>Hotline desk</b><span>Public information line: calls, talking points, routing</span></a>' +
        '<a href="mci.html' + (OPS.inc ? '?incident=' + encodeURIComponent(OPS.inc.key) : '') + '" target="_blank" class="red"><b>MCI app</b><span>Triage, transport, hospitals</span></a>' +
        '<a href="' + OPS.cpLink() + '" target="_blank"><b>Command Post</b><span>Incident record and ICS forms</span></a>' +
        (OPS.webmapId() ? '<a href="' + A.portal + '/apps/mapviewer/index.html?webmap=' + OPS.webmapId() + '" target="_blank" class="blue"><b>EM Operations Map</b><span>All Ops layers in ArcGIS</span></a>' : '') + '</div></div>';
      return h;
    }
  });
  OPS.webmapId = function () { return (CP.store.prefs().opsSvc || {}).webmap || ''; };

  // ---------- setup ----------
  OPS.tool('setup', {
    n: 'Setup', sub: 'ArcGIS Services & Sharing', icon: 'gear', d: 'Create and maintain the ArcGIS services behind the EM Ops tools.',
    render: function () {
      var u = A.user || {}, canPub = u.canPublish;
      var h = '<div class="phead"><div><h1 class="pg">ArcGIS setup</h1><p class="pgsub" style="margin:0">Every Ops tool reads and writes hosted feature layers in county ArcGIS Online. Staff data goes in <b>BOCO_EM_Operations</b>. Personal information (AFN registry, reunification) goes in <b>BOCO_EM_Protected</b>, shared only with EM. MCI patient records go in <b>BOCO_EMS_PatientCare</b>, shared only with the EMS patient care group and EM.</p></div></div>';
      var built = OPS.SVC_KEYS.every(function (k) { return OPS.svc[k]; });
      h += '<div class="card" style="margin-bottom:14px;border-left:4px solid var(--gold)"><h3>' + I('build') + 'Build everything' + (built ? '<span class="x">' + OPS.chip('Active') + '</span>' : '') + '</h3><p class="dim" style="margin-top:0">One click, with your publisher account: creates the three services with every layer, adds anything missing, shares them with the groups you pick, turns on the public family check-in (kiosk & QR), builds the EM Operations web map, and loads the EOP starter content (trauma centers, plan library entries for the EOP annexes with their checklists).</p>' +
        '<div id="buildLog" class="mono" style="font-size:12.5px;white-space:pre-wrap;margin-bottom:10px">' + E(OPS._buildLog || '') + '</div><button class="btn pri" data-act="buildAll"' + (canPub ? '' : ' disabled') + '>' + I('play') + (built ? 'Run again (adds only what is missing)' : 'Build everything') + '</button></div>';
      h += '<div class="card" style="margin-bottom:14px;border-left:4px solid var(--blue)"><h3>' + I('shield') + 'Secure & connect</h3><p class="dim" style="margin-top:0">Run after Build everything, and again after any change to the tools. Adds new layers and fields, turns on safe simultaneous saves and practice mode in Command Post, gives field crews, leadership and EMS their own least-access views, turns on delete protection, and builds the leadership dashboard. Existing records are not touched.</p>' +
        '<div class="row"><button class="btn pri" data-act="harden"' + (canPub ? '' : ' disabled') + '>' + I('shield') + 'Secure & connect</button>' + '<button class="btn" data-act="hubs">' + I('link') + 'Update hub pages</button>' + (CP.store.prefs().leadDash ? '<a class="btn ghost" target="_blank" href="' + A.portal + '/apps/dashboards/' + CP.store.prefs().leadDash + '">' + I('dash') + 'Leadership dashboard</a>' : '') + '</div></div>';
      h += '<div class="grid g3">' + OPS.SVC_KEYS.map(function (key) {
        var d = OPS.SERVICES[key], s = OPS.svc[key];
        var gaps = s ? OPS.load('gaps:' + key, function () { return OPS.schemaGaps(key); }) : null;
        var gtxt = !s ? '' : gaps === undefined ? '<span class="dim">Checking layers…</span>' : gaps && gaps._err ? E(gaps._err) : (gaps.layers.length || gaps.fields.length) ? '<span class="warn-t">' + gaps.layers.length + ' layers and ' + gaps.fields.reduce(function (n, x) { return n + x.f.length; }, 0) + ' fields missing.</span> <button class="btn xs pri" data-act="upgrade" data-a="' + key + '">Update layers</button>' : '<span class="ok-t">' + I('check') + ' All ' + OPS.layersFor(key).length + ' layers up to date.</span>';
        return '<div class="card"><h3>' + I(OPS.SVC_PRIVATE[key] ? 'shield' : 'cloud') + E(d.title) + '<span class="x">' + (s ? OPS.chip('Active') : '<span class="chip red">Not set up</span>') + '</span></h3>' +
          '<div class="mono dim" style="font-size:12px;word-break:break-all;margin-bottom:8px">' + E(s ? s.url : d.name) + '</div>' +
          (s ? '<p style="margin:0 0 8px">' + gtxt + '</p><p style="margin:0 0 10px" class="dim">Owner ' + E(s.owner || '?') + ' · shared: ' + E(s.access || '?') + '</p>' +
            '<div class="row">' + (s.id ? '<a class="btn sm" target="_blank" href="' + A.portal + '/home/item.html?id=' + s.id + '">' + I('link') + 'Item page</a><button class="btn sm" data-act="shareDlg" data-a="' + key + '">' + I('users') + 'Share</button>' : '') + '</div>'
            : (canPub ? '<p class="dim">' + E(d.desc) + '</p><button class="btn pri" data-act="createSvc" data-a="' + key + '">' + I('plus') + 'Create ' + E(d.name) + '</button>' : '<div class="warnbox">You need an ArcGIS publisher account to create this service, or ask the owner to share it with you.</div>')) +
          '<details style="margin-top:10px"><summary class="dim" style="cursor:pointer">Layers (' + OPS.layersFor(key).length + ')</summary><ul style="margin:6px 0 0;padding-left:18px;font-size:13px">' + OPS.layersFor(key).map(function (l) { return '<li><b>' + E(l.name) + '</b> <span class="dim">' + E(l.title) + (l.geom ? ' · points' : ' · table') + (l.attach ? ' · attachments' : '') + '</span>' + (s && s.ids[l.name] == null ? ' <span class="warn-t">missing</span>' : '') + '</li>'; }).join('') + '</ul></details></div>';
      }).join('') + '</div>';
      h += '<div class="card" style="margin-top:14px"><h3>' + I('map') + 'EM Operations web map</h3><p class="dim" style="margin-top:0">One web map with every Ops layer plus the county EM layers (Command Post incidents, shelters, PODs, critical infrastructure, closures, evacuation notices, CAD). Use it in ArcGIS Dashboards, Experience Builder, Field Maps or the Hub site.</p>' +
        (OPS.webmapId() ? '<div class="row"><a class="btn sm" target="_blank" href="' + A.portal + '/apps/mapviewer/index.html?webmap=' + OPS.webmapId() + '">' + I('map') + 'Open in Map Viewer</a><a class="btn sm ghost" target="_blank" href="' + A.portal + '/home/item.html?id=' + OPS.webmapId() + '">Item page</a><button class="btn sm ghost" data-act="makeMap">Make a new copy</button></div>' : '<button class="btn" data-act="makeMap"' + (OPS.svc.main ? '' : ' disabled') + '>' + I('plus') + 'Create the web map</button>') + '</div>';
      if (OPS.harden) h += OPS.harden.panel();
      h += '<div class="card" style="margin-top:14px"><h3>' + I('link') + 'How the tools connect</h3><div class="dim" style="font-size:13.5px;line-height:1.55">' +
        '<b>Command Post incidents</b> (CP_Incidents) are the shared incident list; every incident record in these tools carries its incident key. ' +
        '<b>Check-In</b> writes each arrival into the Command Post incident (Resources page, ICS 211, CP_Resources table) and marks the inventory item Assigned. Check-out releases both. ' +
        '<b>Resources</b> requests land in the Command Post incident as ICS 213RR requests. Filling one assigns county inventory and adds it to Command Post as ordered. ' +
        '<b>Cost Recovery</b> imports labor hours from Check-In, equipment hours from Resources, volunteer hours and POD purchases. ' +
        '<b>AFN Registry</b> is checked against the county evacuation notices layer. <b>Reunification</b> searches the shelter registry and MCI patients. ' +
        '<b>Infrastructure</b> reads the county Critical Infrastructure layer. <b>PODs</b> use the county Resources/PODs layer and update its public commodity flags. ' +
        'Major status changes are written to the Command Post activity log.</div></div>';
      return h;
    }
  });
  OPS.act.createSvc = async function (key) {
    U.toast('Creating ' + OPS.SERVICES[key].name + ' in ArcGIS…');
    try { await OPS.createService(key); U.toast(OPS.SERVICES[key].name + ' created. Share it next.', 'ok', 6000); OPS.bust(); OPS.render(); OPS.act.shareDlg(key); } catch (e) { U.toast(E(e.message), 'err', 8000); }
  };
  OPS.act.upgrade = async function (key) { try { var m = await OPS.upgrade(key); U.toast('Updated: ' + m, 'ok'); OPS.bust(); OPS.render(); } catch (e) { U.toast(E(e.message), 'err', 8000); } };
  OPS.act.makeMap = async function () { try { var id = await OPS.makeWebMap(); U.toast('EM Operations Map created', 'ok'); OPS.render(); window.open(A.portal + '/home/item.html?id=' + id, '_blank'); } catch (e) { U.toast(E(e.message), 'err', 8000); } };
  OPS.act.shareDlg = async function (key) {
    var me = await A.req(A.portal + '/sharing/rest/community/self', {}).catch(function () { return { groups: [] }; });
    var gs = (me.groups || []).sort(function (a, b) { return a.title.localeCompare(b.title); });
    var prot = !!OPS.SVC_PRIVATE[key];
    U.modal('Share ' + OPS.SERVICES[key].name, (prot ? '<div class="warnbox" style="margin-bottom:10px">' + (key === 'ems' ? 'This service holds patient records (protected health information).' : 'This service holds names, addresses and medical needs.') + ' Share it only with a small restricted group, not the whole organization.</div>' : '<p class="dim" style="margin-top:0">Share with the groups whose members use the Ops tools. Everyone who can see it can add and edit records.</p>') +
      (prot ? '' : '<label class="chk" style="margin-bottom:8px"><input type="checkbox" name="org"> Whole Botetourt County organization</label>') +
      '<div class="multi" id="grpList">' + (gs.map(function (g) { return '<label class="chk"><input type="checkbox" value="' + E(g.id) + '"> ' + E(g.title) + '</label>'; }).join('') || '<span class="dim">You are not in any groups.</span>') + '</div>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Share', cls: 'pri', fn: function (bg) { var ids = Array.prototype.map.call(bg.querySelectorAll('#grpList input:checked'), function (x) { return x.value; }); var org = !!(bg.querySelector('[name="org"]') || {}).checked; OPS.share(key, ids, org).then(function () { U.toast('Shared', 'ok'); OPS.render(); }).catch(function (e) { U.toast(E(e.message), 'err'); }); } }]);
  };
})(window.CP);
/* EM OPS — one-click build of everything in ArcGIS, plus EOP starter content */
(function (CP) {
  'use strict';
  var OPS = CP.ops, A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon;
  var DAY = 864e5;
  OPS.SEED_PLANS = [
    { title: 'Botetourt County Emergency Operations Plan 2026 (Base Plan)', plan_type: 'EOP Base Plan', version: 'Rev. 2', owner: 'Emergency Management', status: 'Under Review', keywords: 'EOP activation lifelines priorities',
      summary: 'Base plan: activation levels, authorities, Community Lifelines and operational priorities. The Director of Emergency Management (County Administrator) or the Coordinator of Emergency Management authorizes EOC activation; the Board of Supervisors declares a local emergency.',
      quickref: 'Identify the threat or incident and assess scope (EM Coordinator / on-duty IC)\nDetermine the activation level from lifeline impacts (EM Coordinator)\nNotify the Director of Emergency Management (EM Coordinator)\nAuthorize activation; decide virtual or physical EOC (Director of EM / EM Coordinator)\nNotify selected stakeholders and lifeline leads (EM Coordinator)\nStart lifeline status tracking (Planning Section / EM Coordinator)\nBegin situation reports to VDEM Region 6 (EOC Manager)' },
    { title: 'Mass Care and Sheltering', plan_type: 'Functional Annex', esf: 'ESF 6 Mass Care', owner: 'Department of Social Services / American Red Cross', status: 'Under Review', keywords: 'shelter congregate non-congregate regional',
      summary: 'Three sheltering strategies: regional (with Roanoke City, Roanoke County, Salem), county congregate, and non-congregate (hotel) for small events or medical / AFN needs.',
      quickref: 'EM assesses displacement and recommends activation to the Director of EM\nDirector of EM authorizes\nNotify DSS and American Red Cross\nPick strategy (regional, county, non-congregate)\nIf regional: coordinate with Roanoke City, Roanoke County, Salem\nRed Cross deploys shelter teams; DSS deploys caseworkers\nAssess pet sheltering need\nConfirm ADA physical, program, and communication access\nMedical support area with generator-backed power for AFN\nNotify public of locations and services\nDaily shelter population / needs report to EOC' },
    { title: 'Family Assistance Center', plan_type: 'Functional Annex', esf: 'ESF 6 Mass Care', owner: 'Emergency Management / DSS', status: 'Under Review', keywords: 'FAC MCI mass fatality families',
      summary: 'For families of missing, injured, or deceased persons after an MCI, transportation disaster, active violence, or mass fatality event. Separate from general sheltering. New in EOP 2026.',
      quickref: 'EM Coordinator or IC activates; IC/EOC Director names a FAC Lead\nStand up a Reception Center near the scene first (hours), then a fixed FAC\nFAC Lead and Logistics secure an ADA-compliant site away from the scene, hospitals and media\nSheriff\'s Office provides security and a single controlled family entry\nPIO and OCME hold family briefings at least twice daily\nReunification Lead confirms patients with hospitals / VHASS\nFatality notifications in person only (OCME, law enforcement, trained teams)\nGrief counseling, chaplains, feeding and health support on site' },
    { title: 'Family Reunification', plan_type: 'Functional Annex', esf: 'ESF 6 Mass Care', owner: 'Department of Social Services / Sheriff\'s Office', status: 'Under Review', keywords: 'reunification unaccompanied minors children kiosk',
      summary: 'Reuniting separated family members, especially children, older adults and dependents, after evacuations or mass-care operations. Unaccompanied minors: DSS under Virginia DSS protocols, notify law enforcement, immediate reunification once a guardian is verified. Tools: EM Ops Reunification, family kiosk / QR check-in.',
      quickref: 'Open the Reunification app and pick the incident\nSet up the reunification site and turn on the family kiosk / QR check-in\nAssign a Reunification Lead; Sheriff\'s Office controls entry\nSet up a supervised area for unaccompanied children (two adults at all times)\nNotify DSS and law enforcement for every unaccompanied child\nReport unaccompanied children to NCMEC (1-800-THE-LOST)\nSearch every list (shelters, hospitals / VHASS, MCI patients) before telling a family "not found"\nRelease children only after photo ID matches the guardian and two staff verify\nCall back open inquiries on a schedule\nDo not post names of the missing, injured or deceased' },
    { title: 'Mass Casualty Incident Response', plan_type: 'Functional Annex', esf: 'ESF 8 Public Health & Medical', owner: 'Department of Fire & EMS / Sheriff\'s Office', status: 'Under Review', keywords: 'MCI triage START RHCC hospitals',
      summary: 'MCI levels: Level 4 up to 15 patients, Level 3 16-30, Level 2 31-100, Level 1 101+. RHCC for Level 1 and 2: 1-866-679-7422. Carilion Roanoke Memorial (Level I trauma), LewisGale Medical Center (Level II trauma). Tool: EM Ops MCI app.',
      quickref: '5-S: Safety, Survey, Send, Set up, START\nDeclare the MCI and its level; open the MCI app\nRequest mutual aid ambulances through dispatch early\nEstablish patient collection and treatment areas; activate a Medical Branch\nTransport RED first, then YELLOW, then GREEN; move GREENs early by bus or van\nContact the closest 1-2 hospitals; if not enough, call RHCC (Level 1-2)\nCoordinate family reunification and public information\nActivate behavioral health support for survivors and responders\nDemobilize: account for all patients and personnel, release mutual aid first\nAAR meeting within 14 days; IC submits the AAR within 30 days' },
    { title: 'Point of Distribution (POD) Operations', plan_type: 'Functional Annex', esf: 'ESF 7 Logistics', owner: 'Emergency Management', status: 'Under Review', keywords: 'POD commodities water ice tarps',
      summary: 'Type I up to 20,000 persons/day; Type II up to 10,000 (280 vehicles/hr, 2 lanes); Type III up to 5,000 (140 vehicles/hr, 1 lane). Type II and multiple Type III most likely for the county. Hours 0700-1900, restock 1900-0700. Tool: EM Ops PODs.',
      quickref: 'Confirm activation criteria (outage over 72 h, stores closed, isolated communities, local emergency, or VDEM mission)\nPick POD type and sites; open them in EM Ops PODs (updates the public map)\nDrive-through lanes plus a walk-up / AFN lane at every site\nStaff each Type III with 7-10 people per shift\nRecord every receipt and hand-out in the POD ledger\nWatch hours-left and send resupply requests early\nRestock 1900-0700' }
  ];
  async function seed(log) {
    if (OPS.ready('hospitals')) { var h = await OPS.rows('hospitals', '1=1', { fields: 'name', n: 200 }); var have = h.map(function (x) { return (x.name || '').toLowerCase(); });
      var add = [{ name: 'Carilion Roanoke Memorial Hospital', level: 'Level I trauma', status: 'Unknown' }, { name: 'LewisGale Medical Center', level: 'Level II trauma', status: 'Unknown' }].filter(function (x) { return have.indexOf(x.name.toLowerCase()) < 0; }).map(function (x) { x.updated = Date.now(); return x; });
      if (add.length) await OPS.saveMany('hospitals', add); log('   Hospitals: ' + add.length + ' added (EOP trauma centers)'); }
    if (OPS.ready('plans')) { var p = await OPS.rows('plans', '1=1', { fields: 'title', n: 2000 }); var pt = p.map(function (x) { return (x.title || '').toLowerCase(); });
      var addP = OPS.SEED_PLANS.filter(function (x) { return pt.indexOf(x.title.toLowerCase()) < 0; }).map(function (x) { return Object.assign({ last_review: Date.now(), next_review: Date.now() + 365 * DAY }, x); });
      if (addP.length) await OPS.saveMany('plans', addP); log('   Plan library: ' + addP.length + ' EOP entries added with checklists'); }
  }
  OPS.act.buildAll = async function () {
    var me = await A.req(A.portal + '/sharing/rest/community/self', {}).catch(function () { return { groups: [] }; });
    var gs = (me.groups || []).sort(function (a, b) { return a.title.localeCompare(b.title); }); _gs = gs;
    var list = function (n) { return '<div class="multi" id="' + n + '">' + (gs.map(function (g) { return '<label class="chk"><input type="checkbox" value="' + E(g.id) + '"> ' + E(g.title) + '</label>'; }).join('') || '<span class="dim">You are not in any groups. Create them in ArcGIS first, or share later.</span>') + '</div>'; };
    U.modal('Build everything', '<div class="fgrp">Share EM Operations (staff data) with</div><label class="chk" style="margin-bottom:6px"><input type="checkbox" id="bOrg"> Whole Botetourt County organization</label>' + list('bMain') +
      '<div class="fgrp">Share EM Protected (AFN registry, reunification) with</div><div class="warnbox" style="margin-bottom:6px">Pick a small restricted group only (EM, DSS, Sheriff\'s Office leads).</div>' + list('bProt') +
      '<div class="fgrp">Share EMS Patient Care (MCI patients) with</div><div class="warnbox" style="margin-bottom:6px">Patient records only. EMS crews in this group see MCI patients, not the AFN registry or reunification.</div>' +
      (gs.some(function (g) { return g.title === OPS.EMS_GROUP; }) ? '' : '<label class="chk" style="margin-bottom:6px"><input type="checkbox" id="bEmsGrp" checked> Create the <b>' + E(OPS.EMS_GROUP) + '</b> group (private, invite only) and share with it</label>') + list('bEms') +
      '<label class="chk" style="margin-top:12px"><input type="checkbox" id="bView" checked> Turn on the public family check-in (kiosk & QR)</label><br><label class="chk"><input type="checkbox" id="bMap" checked> Create the EM Operations web map</label><br><label class="chk"><input type="checkbox" id="bSeed" checked> Load EOP starter content</label>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: I('play') + 'Build', cls: 'pri', fn: function (bg) {
        var pick = function (id) { return Array.prototype.map.call(bg.querySelectorAll('#' + id + ' input:checked'), function (x) { return x.value; }); };
        var eg = bg.querySelector('#bEmsGrp'); run({ main: pick('bMain'), prot: pick('bProt'), ems: pick('bEms'), emsGrp: !!(eg && eg.checked), org: bg.querySelector('#bOrg').checked, view: bg.querySelector('#bView').checked, map: bg.querySelector('#bMap').checked, seed: bg.querySelector('#bSeed').checked });
      } }], { wide: true });
  };
  var _gs = [];
  function gsFind() { return _gs.find(function (g) { return g.title === OPS.EMS_GROUP; }); }
  async function run(o) {
    var out = [], box = function () { return document.getElementById('buildLog'); };
    var log = function (s) { out.push(s); OPS._buildLog = out.join('\n'); var b = box(); if (b) b.textContent = OPS._buildLog; };
    var step = async function (name, fn) { log('… ' + name); var at = out.length - 1; try { var r = await fn(); out[at] = '✓ ' + name + (r ? ': ' + r : ''); } catch (e) { console.warn(name, e); out[at] = '✗ ' + name + ': ' + OPS.errText(e); } OPS._buildLog = out.join('\n'); var b = box(); if (b) b.textContent = OPS._buildLog; };
    if (OPS.st.tool !== 'setup') OPS.go('setup');
    await OPS.findServices();
    var eg = gsFind();
    if (eg) { if (o.ems.indexOf(eg.id) < 0) o.ems.push(eg.id); }
    else if (o.emsGrp) await step('Create group ' + OPS.EMS_GROUP, async function () {
      var r = await A.req(A.portal + '/sharing/rest/community/createGroup', { title: OPS.EMS_GROUP, access: 'private', isInvitationOnly: true, isViewOnly: false, tags: 'EMS,Restricted,PHI,EM Ops', snippet: 'EMS crews and supervisors who can see MCI patient records in the EM Ops MCI app. Protected health information.', sortField: 'title', sortOrder: 'asc' }, true);
      if (!r.success || !r.group) throw new Error('ArcGIS did not create the group');
      o.ems.push(r.group.id); return 'created; add EMS members in ArcGIS';
    });
    for (var k of OPS.SVC_KEYS) {
      var nm = OPS.SERVICES[k].name;
      if (!OPS.svc[k]) await step('Create ' + nm, function () { return OPS.createService(k).then(function () { return OPS.layersFor(k).length + ' layers'; }); });
      else await step('Update ' + nm, function () { return OPS.upgrade(k); });
      if (OPS.svc[k] && (o[k].length || (k === 'main' && o.org))) await step('Share ' + nm, function () { return OPS.share(k, o[k], k === 'main' && o.org).then(function () { return o[k].length + ' group(s)' + (k === 'main' && o.org ? ' + organization' : ''); }); });
    }
    if (o.view && OPS.svc.prot) await step('Public family check-in', async function () { var v = await OPS.ru.findView(); if (v) return 'already on'; await OPS.ru.createView(); return 'live'; });
    if (o.map && OPS.svc.main) await step('EM Operations web map', function () { return OPS.webmapId() ? Promise.resolve('already made') : OPS.makeWebMap().then(function () { return 'created'; }); });
    if (o.seed) await step('EOP starter content', function () { return seed(log).then(function () { return 'done'; }); });
    log('\nDone. Pick an incident at the top and open any tool.');
    OPS._buildLog = out.join('\n'); OPS.bust(); OPS.render();
    U.toast('Build finished', 'ok', 6000);
  }
})(window.CP);
