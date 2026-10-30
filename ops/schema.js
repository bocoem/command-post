/* EM OPS — ArcGIS schema for every Ops tool.
   One definition drives three things: the hosted feature layers created in ArcGIS Online, the edit forms, and the list columns.
   Two services: BOCO_EM_Operations (staff) and BOCO_EM_Protected (personal information: AFN registry, reunification, MCI patients).
   Field spec: [name, type S|I|D|T, length, label, ui]  ui: {o: options, req, list, area, hint, g: form group, ro} */
(function (CP) {
  'use strict';
  var OPS = CP.ops = CP.ops || {};

  // ---------- shared pick lists ----------
  var K = OPS.LISTS = {
    yesno: ['Yes', 'No'],
    resStatus: ['Available', 'Assigned', 'Out of Service', 'Reserved', 'Retired'],
    resCat: ['Apparatus', 'Heavy Equipment', 'Vehicle', 'Generator / Power', 'Pump / Water', 'Lighting', 'Shelter Supplies', 'Communications', 'Medical', 'Team / Crew', 'Personnel (overhead)', 'Facility', 'Commodity', 'Other'],
    owner: ['Botetourt County Emergency Management', 'Botetourt County Fire & EMS', 'Botetourt County Sheriff\'s Office', 'Botetourt County Public Works', 'Botetourt County Parks & Recreation', 'Botetourt County Public Schools', 'Botetourt County General Services', 'Town of Buchanan', 'Town of Fincastle', 'Town of Troutville', 'Volunteer Fire/Rescue', 'Contract / Vendor', 'Mutual Aid', 'VDEM', 'Other'],
    reqStatus: CP.REQ_STATUS.slice(),
    reqSource: ['County inventory', 'Mutual aid (local)', 'SMAA / VDEM', 'EMAC', 'Vendor / contract', 'Donation', 'Volunteer'],
    priority: ['Urgent', 'Routine', 'Low'],
    paCat: ['A - Debris Removal', 'B - Emergency Protective Measures', 'C - Roads & Bridges', 'D - Water Control Facilities', 'E - Buildings & Equipment', 'F - Utilities', 'G - Parks, Recreation & Other', 'Z - Management Costs', 'Not PA eligible'],
    costType: ['Force Account Labor', 'Force Account Equipment', 'Materials & Supplies', 'Rented Equipment', 'Contract', 'Mutual Aid', 'Donated Resources', 'Commodities', 'Other'],
    docStatus: ['Missing', 'Partial', 'Complete', 'Submitted to VDEM'],
    ciStatus: ['On Scene', 'Staged', 'Assigned', 'Rest', 'Checked Out'],
    role: ['Responder', 'Overhead / ICS position', 'EOC Staff', 'Volunteer', 'Contractor', 'Mutual Aid', 'Agency Representative', 'Other'],
    afnNeeds: ['Oxygen', 'Dialysis', 'Ventilator / power-dependent device', 'Mobility (wheelchair)', 'Bedbound', 'Hearing', 'Vision', 'Cognitive / memory', 'Mental health', 'Limited English', 'Service animal', 'Medication refrigeration', 'Home health care', 'Other'],
    afnTransport: ['None needed', 'Car seat / standard vehicle', 'Wheelchair van', 'Stretcher / ambulance', 'Unknown'],
    welfare: ['Not checked', 'Contacted - safe', 'Contacted - needs help', 'No answer', 'Evacuated', 'Transported', 'Referred to EMS'],
    volTeam: ['CERT', 'Medical Reserve Corps', 'ARES / Amateur Radio', 'American Red Cross', 'Fire/Rescue Auxiliary', 'Faith-based', 'Spontaneous', 'Other'],
    volStatus: ['Active', 'Pending background check', 'Inactive', 'Deployed'],
    courseType: ['IS-100', 'IS-200', 'IS-700', 'IS-800', 'ICS-300', 'ICS-400', 'G-191', 'G-2300 (EOC)', 'E/L-0950 (IC)', 'CERT Basic', 'CPR / First Aid', 'Stop the Bleed', 'Background check', 'Driver check', 'Hazmat Awareness', 'Shelter Fundamentals', 'Damage Assessment', 'Other'],
    exType: ['Seminar', 'Workshop', 'Tabletop (TTX)', 'Game', 'Drill', 'Functional (FE)', 'Full-Scale (FSE)', 'Real incident (AAR)'],
    exStatus: ['Planning', 'Scheduled', 'Conducted', 'AAR Draft', 'AAR Final'],
    capability: ['Planning', 'Public Information & Warning', 'Operational Coordination', 'Operational Communications', 'Situational Assessment', 'Mass Care Services', 'Mass Search & Rescue', 'Critical Transportation', 'Public Health, Healthcare & EMS', 'Fatality Management', 'Logistics & Supply Chain', 'Infrastructure Systems', 'On-scene Security & Protection', 'Environmental Response / Health & Safety', 'Fire Management & Suppression', 'Community Resilience', 'Economic Recovery', 'Housing', 'Health & Social Services', 'Natural & Cultural Resources', 'Threats & Hazards Identification', 'Risk & Disaster Resilience Assessment', 'Long-term Vulnerability Reduction', 'Cybersecurity', 'Intelligence & Information Sharing'],
    ipStatus: ['Open', 'In Progress', 'Complete', 'Deferred'],
    planType: ['EOP Base Plan', 'Functional Annex', 'ESF Annex', 'Support Annex', 'Hazard-Specific Annex', 'SOP / SOG', 'Checklist', 'COOP / COG', 'Hazard Mitigation Plan', 'MOU / Agreement', 'Form / Template', 'Other'],
    planStatus: ['Current', 'Under Review', 'Draft', 'Expired', 'Superseded'],
    esf: ['', 'ESF 1 Transportation', 'ESF 2 Communications', 'ESF 3 Public Works & Engineering', 'ESF 4 Firefighting', 'ESF 5 Information & Planning', 'ESF 6 Mass Care', 'ESF 7 Logistics', 'ESF 8 Public Health & Medical', 'ESF 9 Search & Rescue', 'ESF 10 Hazardous Materials', 'ESF 11 Agriculture & Natural Resources', 'ESF 12 Energy', 'ESF 13 Public Safety & Security', 'ESF 14 Cross-Sector Business & Infrastructure', 'ESF 15 External Affairs'],
    infraStatus: ['Operational', 'Impaired', 'Down', 'Unknown'],
    power: ['Grid', 'Generator', 'Out', 'Unknown'],
    lifeline: ['Safety & Security', 'Food, Hydration, Shelter', 'Health & Medical', 'Energy', 'Communications', 'Transportation', 'Hazardous Materials', 'Water Systems'],
    commodity: ['Water (cases)', 'Water (bulk gal)', 'Meals / MREs', 'Ice (bags)', 'Tarps', 'Comfort kits', 'Baby supplies', 'Cots', 'Blankets', 'Hygiene kits', 'Cleaning kits', 'Pet food', 'Fuel (gal)', 'Other'],
    txn: ['Received', 'Distributed', 'Transferred out', 'Transferred in', 'Adjustment', 'Damaged / expired'],
    commSource: ['County purchase', 'VDEM', 'FEMA', 'Donation', 'Transfer', 'Other'],
    watchType: ['Low-water crossing', 'Flood-prone road', 'Dam', 'Bridge', 'Culvert', 'Landslide area', 'Other'],
    watchStatus: ['Open', 'Watch', 'Flooded / closed', 'Damaged', 'Unknown'],
    floodCat: ['Action', 'Minor', 'Moderate', 'Major', 'Custom'],
    reunType: ['Missing (inquiry)', 'Found / accounted for', 'Displaced', 'Hospitalized', 'Deceased (refer to ME)'],
    reunStatus: ['Open inquiry', 'Possible match', 'Located - safe', 'Reunited', 'Hospitalized', 'Referred to law enforcement', 'Closed'],
    triage: ['Immediate (Red)', 'Delayed (Yellow)', 'Minor (Green)', 'Expectant (Gray)', 'Deceased (Black)'],
    ptStatus: ['On scene', 'Treatment area', 'Awaiting transport', 'Transported', 'Arrived at hospital', 'Released on scene', 'Refused', 'Deceased'],
    sex: ['Male', 'Female', 'Unknown'],
    ageGroup: ['Adult', 'Child (1-8)', 'Infant (<1)', 'Unknown'],
    callDir: ['Inbound', 'Outbound', 'Callback'],
    callCat: ['Information request', 'Shelter', 'Evacuation', 'Road / closure', 'Utilities / power', 'Damage report', 'Needs help (not 911)', 'Welfare check / missing person', 'Access & functional needs', 'Commodities / POD', 'Donations / volunteering', 'Rumor / misinformation', 'Media', 'Other'],
    callPri: ['Routine', 'Priority', 'Urgent'],
    callStatus: ['Open', 'Answered', 'Routed', 'Callback needed', 'Closed'],
    callRoute: ['', 'EOC Operations', 'EOC Planning', 'EOC Logistics', 'PIO', 'Mass Care / Shelter', 'Reunification', 'AFN team', 'Damage assessment', 'Public Works / VDOT', 'Utilities', 'Sheriff\'s Office', 'Fire & EMS', 'Volunteer / donations', 'Other'],
    lang: ['English', 'Spanish', 'Other (interpreter)'],
    infoStatus: ['Draft', 'Approved', 'Retired'],
    town: ['Fincastle', 'Buchanan', 'Troutville', 'Daleville', 'Cloverdale', 'Blue Ridge', 'Eagle Rock', 'Springwood', 'Other']
  };

  function S(n, len, l, ui) { return [n, 'S', len, l, ui || {}]; }
  function I(n, l, ui) { return [n, 'I', 0, l, ui || {}]; }
  function D(n, l, ui) { return [n, 'D', 0, l, ui || {}]; }
  function T(n, l, ui) { return [n, 'T', 0, l, ui || {}]; }
  var INC = [S('incident_key', 40, 'Incident key', { ro: 1, hide: 1 }), S('incident_name', 255, 'Incident', { ro: 1, hide: 1 }), S('practice', 3, 'Practice', { ro: 1, hide: 1 })];

  OPS.SERVICES = {
    main: { name: 'BOCO_EM_Operations', title: 'EM Operations', desc: 'County EM operations data: resources, requests, cost recovery, check-in, volunteers, training, plans, infrastructure status, PODs, flood watch.', tags: 'Emergency Management,EM Ops,Botetourt' },
    prot: { name: 'BOCO_EM_Protected', title: 'EM Protected', desc: 'Personal information (access & functional needs registry, family reunification). Share ONLY with the restricted EM group.', tags: 'Emergency Management,EM Ops,Restricted,PII' },
    ems: { name: 'BOCO_EMS_PatientCare', title: 'EMS Patient Care', desc: 'MCI patient records (triage, transport, hospital destination). Protected health information: share ONLY with the EMS patient care group and EM.', tags: 'Emergency Management,EM Ops,EMS,Restricted,PHI' }
  };
  OPS.SVC_KEYS = ['main', 'prot', 'ems'];
  // least-access views (made by Setup → Secure & connect). When someone can't see the full service, the tools use the view they were given.
  OPS.VIEWS = {
    field: { svc: 'main', name: 'BOCO_EM_Operations_Field', title: 'EM Operations (field crews)', groups: [/^BOCO Access 2/, /^BOCO Access 3/, /^BOCO Access 4/], caps: 'Query,Create,Update,Editing',
      layers: ['resources', 'requests', 'checkins', 'par', 'volunteers', 'volhours', 'plans', 'infra', 'podledger', 'impacts', 'watch', 'hospitals', 'calls', 'info'], desc: 'Field crews: everything except cost recovery and training records.' },
    lead: { svc: 'main', name: 'BOCO_EM_Operations_Leadership', title: 'EM Operations (leadership, read-only)', groups: [/^BOCO Role - Leadership/], caps: 'Query', where: "practice IS NULL OR practice <> 'Yes'",
      layers: ['resources', 'requests', 'checkins', 'infra', 'podledger', 'watch', 'hospitals', 'calls', 'plans'], hideFields: { checkins: ['phone', 'notes'], calls: ['caller_name', 'caller_phone', 'address', 'notes', 'response'], resources: ['phone'] }, desc: 'Read-only, no personal contact details, practice incidents left out.' },
    emsField: { svc: 'ems', name: 'BOCO_EMS_PatientCare_Field', title: 'EMS Patient Care (last 72 hours)', groups: [/^BOCO Role - EMS Patient Care/], caps: 'Query,Create,Update,Editing', where: "CreationDate >= CURRENT_TIMESTAMP - INTERVAL '3' DAY",
      layers: ['patients'], desc: 'EMS crews see and edit patients from the last 72 hours only. EM keeps the full record.' }
  };
  OPS.SERVICES.main.views = ['field', 'lead']; OPS.SERVICES.ems.views = ['emsField'];
  OPS.SVC_PRIVATE = { prot: 1, ems: 1 };
  OPS.EMS_GROUP = 'BOCO Role - EMS Patient Care (Protected)';

  // key: {svc, id, name, geom, fields, attach}
  OPS.LAYERS = {
    resources: { svc: 'main', id: 0, name: 'OPS_Resources', title: 'Resource inventory', geom: 'point', fields: [
      S('res_id', 40, 'Resource ID', { list: 1, hint: 'unit number, asset tag', g: 'Resource' }), S('name', 150, 'Name', { req: 1, list: 1, g: 'Resource' }), S('category', 60, 'Category', { o: K.resCat, list: 1, g: 'Resource' }),
      S('kind', 80, 'Kind', { dl: 'dl_kinds', list: 1, g: 'Resource' }), S('nims_type', 120, 'NIMS typing', { hint: 'e.g. Engine Type 1, Generator 50 kW', g: 'Resource' }), S('type_level', 10, 'Type', { o: ['', '1', '2', '3', '4', '5', '6', '7'], g: 'Resource' }),
      I('quantity', 'Quantity', { g: 'Resource' }), S('unit', 30, 'Unit', { hint: 'each, crew, gal', g: 'Resource' }), I('persons', 'Staffing (persons)', { g: 'Resource' }),
      S('owner', 150, 'Owner / agency', { o: K.owner, list: 1, g: 'Ownership' }), S('home_base', 255, 'Home location', { g: 'Ownership' }), S('contact', 150, 'Contact', { g: 'Ownership' }), S('phone', 30, 'Phone', { g: 'Ownership' }),
      S('status', 30, 'Status', { o: K.resStatus, list: 1, req: 1, g: 'Status' }), S('incident_key', 40, 'Assigned incident key', { hide: 1 }), S('incident_name', 255, 'Assigned incident', { ro: 1, list: 1, g: 'Status' }), S('cp_res_id', 40, 'Command Post resource id', { hide: 1 }), S('assignment', 150, 'Assignment', { g: 'Status' }), T('status_time', 'Status changed', { ro: 1, g: 'Status' }),
      S('fema_code', 20, 'FEMA equipment code', { hint: 'Schedule of Equipment Rates', g: 'Cost' }), D('rate_hr', 'Hourly rate ($)', { g: 'Cost' }), D('ot_rate_hr', 'Operator OT rate ($/hr)', { g: 'Cost' }), S('rate_source', 60, 'Rate source', { o: ['', 'FEMA Schedule of Equipment Rates', 'Local rate', 'Contract', 'Mutual aid agreement'], g: 'Cost' }),
      T('last_inspected', 'Last inspected', { g: 'Readiness' }), T('next_service', 'Next service due', { g: 'Readiness' }), S('mutual_aid_ok', 5, 'Deployable for mutual aid', { o: K.yesno, g: 'Readiness' }), S('notes', 1000, 'Notes', { area: 1, g: 'Readiness' })] },
    requests: { svc: 'main', id: 1, name: 'OPS_Requests', title: 'Resource requests (213RR)', fields: INC.concat([
      S('req_no', 30, 'Request #', { list: 1 }), S('cp_req_id', 40, 'Command Post request id', { hide: 1 }), T('req_time', 'Requested', { list: 1 }), S('priority', 20, 'Priority', { o: K.priority, list: 1 }),
      S('requested_by', 150, 'Requested by'), S('deliver_to', 255, 'Deliver / report to'), T('needed_by', 'Needed by', { list: 1 }), I('qty', 'Qty', { list: 1 }), S('kind', 80, 'Kind', { dl: 'dl_kinds', list: 1 }), S('type_level', 10, 'Type'),
      S('description', 1000, 'Detailed description', { area: 1, list: 1 }), S('status', 30, 'Status', { o: K.reqStatus, list: 1 }), S('source', 40, 'Filled from', { o: K.reqSource }), S('supplier', 255, 'Supplier / POC'), S('order_no', 40, 'Logistics order #'),
      S('assigned_res', 1000, 'Assigned resources', { ro: 1 }), T('eta', 'ETA'), D('cost_est', 'Estimated cost ($)'), S('approved_by', 150, 'Approved by'), S('notes', 1000, 'Notes', { area: 1 })]) },
    costs: { svc: 'main', id: 2, name: 'OPS_Costs', title: 'Cost recovery ledger', fields: INC.concat([
      T('work_date', 'Date of work', { req: 1, list: 1 }), S('pa_category', 40, 'FEMA PA category', { o: K.paCat, list: 1, req: 1 }), S('cost_type', 40, 'Cost type', { o: K.costType, list: 1, req: 1 }),
      S('description', 500, 'Description', { list: 1, req: 1 }), S('who', 150, 'Employee / equipment / vendor', { list: 1 }), S('department', 150, 'Department'), S('site', 255, 'Site / project (damage location)'),
      D('reg_hours', 'Regular hours'), D('ot_hours', 'Overtime hours'), D('reg_rate', 'Regular rate ($/hr)'), D('ot_rate', 'OT rate ($/hr)'), D('fringe_pct', 'Fringe %'),
      D('quantity', 'Quantity / equipment hours'), D('unit_cost', 'Unit cost / hourly rate ($)'), S('fema_code', 20, 'FEMA code'), D('amount', 'Total ($)', { list: 1, ro: 1 }),
      S('invoice', 60, 'Invoice / PO #'), S('doc_status', 30, 'Documentation', { o: K.docStatus, list: 1 }), S('source', 40, 'Entered from', { ro: 1 }), S('source_id', 60, 'Source record', { hide: 1 }), S('notes', 1000, 'Notes', { area: 1 })]) },
    checkins: { svc: 'main', id: 3, name: 'OPS_Checkins', title: 'Check-in (ICS 211)', geom: 'point', fields: INC.concat([
      S('person', 150, 'Name / unit', { req: 1, list: 1 }), S('agency', 150, 'Agency', { dl: 'dl_agency', list: 1 }), S('role', 60, 'Role', { o: K.role }), S('position', 150, 'ICS position / kind', { list: 1 }),
      I('persons', 'Persons (if a unit or crew)'), S('phone', 30, 'Phone'), S('res_id', 40, 'Inventory resource', { hide: 1 }), S('vol_id', 40, 'Volunteer record', { hide: 1 }), S('cp_res_id', 40, 'Command Post resource', { hide: 1 }),
      S('checkin_loc', 60, 'Check-in location', { o: ['ICP', 'Staging Area', 'Base', 'EOC', 'Shelter', 'POD', 'Other'] }), S('assignment', 150, 'Assignment', { list: 1 }), S('status', 30, 'Status', { o: K.ciStatus, list: 1 }),
      T('checkin_time', 'Checked in', { list: 1 }), T('checkout_time', 'Checked out'), T('last_par', 'Last PAR'), S('par_ok', 5, 'Accounted at last PAR', { o: K.yesno }), S('quals', 500, 'Qualifications', { ro: 1 }), S('method', 20, 'Method', { ro: 1 }), S('notes', 500, 'Notes', { area: 1 })]) },
    par: { svc: 'main', id: 4, name: 'OPS_PAR', title: 'PAR roll calls', fields: INC.concat([
      T('par_time', 'PAR time', { list: 1 }), S('called_by', 150, 'Called by', { list: 1 }), S('reason', 150, 'Reason', { list: 1 }), I('expected', 'Expected', { list: 1 }), I('accounted', 'Accounted', { list: 1 }), I('missing', 'Missing', { list: 1 }), S('missing_names', 2000, 'Unaccounted', { area: 1 }), T('closed_time', 'Closed')]) },
    volunteers: { svc: 'main', id: 5, name: 'OPS_Volunteers', title: 'Volunteers', fields: [
      S('vol_id', 40, 'Volunteer ID', { ro: 1 }), S('first_name', 80, 'First name', { req: 1, list: 1, g: 'Person' }), S('last_name', 80, 'Last name', { req: 1, list: 1, g: 'Person' }), S('phone', 30, 'Phone', { list: 1, g: 'Person' }), S('email', 150, 'Email', { g: 'Person' }),
      S('address', 255, 'Address', { g: 'Person' }), T('dob', 'Date of birth', { g: 'Person' }), S('emerg_contact', 255, 'Emergency contact', { g: 'Person' }),
      S('team', 60, 'Team / affiliation', { o: K.volTeam, list: 1, g: 'Program' }), S('status', 40, 'Status', { o: K.volStatus, list: 1, g: 'Program' }), S('skills', 1000, 'Skills', { area: 1, hint: 'languages, medical, ham radio, CDL, chainsaw', g: 'Program' }),
      S('availability', 255, 'Availability', { g: 'Program' }), S('bg_check', 20, 'Background check', { o: ['', 'Not started', 'Pending', 'Cleared', 'Expired'], g: 'Program' }), T('bg_check_date', 'Background check date', { g: 'Program' }),
      S('incident_key', 40, 'Deployed incident key', { hide: 1 }), S('incident_name', 255, 'Deployed to', { ro: 1, list: 1, g: 'Program' }), D('total_hours', 'Total hours', { ro: 1, list: 1, g: 'Program' }), S('notes', 1000, 'Notes', { area: 1, g: 'Program' })] },
    volhours: { svc: 'main', id: 6, name: 'OPS_VolunteerHours', title: 'Volunteer hours', fields: INC.concat([
      S('vol_id', 40, 'Volunteer ID', { hide: 1 }), S('volunteer', 160, 'Volunteer', { list: 1 }), T('work_date', 'Date', { list: 1 }), D('hours', 'Hours', { list: 1 }), S('task', 255, 'Task', { list: 1 }), D('rate', 'Value rate ($/hr)'), S('cost_id', 40, 'Cost entry', { hide: 1 })]) },
    training: { svc: 'main', id: 7, name: 'OPS_Training', title: 'Training records', fields: [
      S('person', 150, 'Person', { req: 1, list: 1 }), S('person_key', 150, 'Email / ID', { hint: 'links training to volunteers and check-in' }), S('agency', 150, 'Agency', { dl: 'dl_agency', list: 1 }), S('course', 80, 'Course', { o: K.courseType, list: 1, req: 1 }), S('course_other', 150, 'Course (if other)'),
      T('completed', 'Completed', { list: 1 }), T('expires', 'Expires', { list: 1 }), S('cert_no', 60, 'Certificate #'), S('provider', 150, 'Provider'), S('notes', 500, 'Notes', { area: 1 })] },
    exercises: { svc: 'main', id: 8, name: 'OPS_Exercises', title: 'Exercises & AARs', fields: [
      S('name', 200, 'Exercise / event', { req: 1, list: 1 }), S('ex_type', 40, 'Type', { o: K.exType, list: 1 }), T('ex_date', 'Date', { list: 1 }), S('hazard', 100, 'Hazard / scenario', { list: 1 }), S('status', 30, 'Status', { o: K.exStatus, list: 1 }),
      S('capabilities', 1000, 'Core capabilities', { multi: K.capability }), S('objectives', 2000, 'Objectives', { area: 1 }), S('participants', 1000, 'Participating agencies', { area: 1 }), I('participant_count', 'Participants'),
      S('strengths', 4000, 'Strengths', { area: 1 }), S('summary', 4000, 'AAR summary', { area: 1 }), S('incident_key', 40, 'Incident (real event)', { hide: 1 }), S('doc_url', 500, 'AAR document link'), S('grant', 100, 'Grant (EMPG etc.)')] },
    improve: { svc: 'main', id: 9, name: 'OPS_ImprovementPlan', title: 'Improvement plan items', fields: [
      S('exercise_id', 40, 'Exercise', { hide: 1 }), S('source', 200, 'From', { list: 1, ro: 1 }), S('capability', 80, 'Core capability', { o: K.capability, list: 1 }), S('issue', 1000, 'Issue / area for improvement', { area: 1, req: 1, list: 1 }),
      S('action', 1000, 'Corrective action', { area: 1, list: 1 }), S('owner', 150, 'Responsible', { list: 1 }), T('due', 'Due', { list: 1 }), S('status', 20, 'Status', { o: K.ipStatus, list: 1 }), T('completed', 'Completed'), S('notes', 1000, 'Notes', { area: 1 })] },
    plans: { svc: 'main', id: 10, name: 'OPS_Plans', title: 'Plan library', attach: true, fields: [
      S('title', 255, 'Title', { req: 1, list: 1 }), S('plan_type', 40, 'Type', { o: K.planType, list: 1 }), S('esf', 60, 'ESF', { o: K.esf, list: 1 }), S('hazard', 100, 'Hazard'), S('version', 30, 'Version'),
      S('owner', 150, 'Owner / lead agency', { list: 1 }), T('adopted', 'Adopted'), T('last_review', 'Last reviewed'), T('next_review', 'Next review due', { list: 1 }), S('status', 20, 'Status', { o: K.planStatus, list: 1 }),
      S('doc_url', 500, 'Document link', { hint: 'or attach the PDF below after saving' }), S('summary', 2000, 'Summary', { area: 1 }), S('quickref', 8000, 'Quick-reference checklist', { area: 1, h: 160, hint: 'one step per line' }), S('keywords', 500, 'Keywords')] },
    infra: { svc: 'main', id: 11, name: 'OPS_InfrastructureStatus', title: 'Infrastructure status reports', fields: INC.concat([
      S('facility_id', 100, 'Facility ID', { hide: 1 }), S('facility', 255, 'Facility', { ro: 1, list: 1 }), S('sector', 60, 'Sector', { ro: 1 }), S('lifeline', 40, 'Lifeline', { o: K.lifeline }),
      S('status', 20, 'Status', { o: K.infraStatus, list: 1, req: 1 }), S('power', 20, 'Power', { o: K.power, list: 1 }), D('fuel_hours', 'Generator fuel (hours left)', { list: 1 }), S('water', 20, 'Water', { o: ['', 'OK', 'Limited', 'Out', 'Unknown'] }), S('comms', 20, 'Phone / internet', { o: ['', 'OK', 'Limited', 'Out', 'Unknown'] }),
      I('occupants', 'Residents / patients / occupants'), S('needs', 1000, 'Needs', { area: 1, list: 1 }), S('reported_by', 150, 'Reported by'), T('report_time', 'Report time', { list: 1 })]) },
    podledger: { svc: 'main', id: 12, name: 'OPS_PODLedger', title: 'POD commodity ledger', fields: INC.concat([
      I('pod_oid', 'POD', { hide: 1 }), S('pod', 255, 'POD', { ro: 1, list: 1 }), T('txn_time', 'Time', { list: 1 }), S('txn', 30, 'Transaction', { o: K.txn, list: 1, req: 1 }), S('commodity', 60, 'Commodity', { o: K.commodity, list: 1, req: 1 }),
      D('qty', 'Quantity', { list: 1, req: 1 }), I('households', 'Households served'), S('source', 40, 'Source', { o: K.commSource }), D('unit_cost', 'Unit cost ($)'), S('ref', 100, 'BOL / shipment / ticket #'), S('recorded_by', 150, 'Recorded by'), S('cost_id', 40, 'Cost entry', { hide: 1 }), S('notes', 500, 'Notes', { area: 1 })]) },
    impacts: { svc: 'main', id: 13, name: 'OPS_GaugeImpacts', title: 'Flood impact thresholds', fields: [
      S('gauge_id', 40, 'Gauge ID', { req: 1, list: 1, hint: 'USGS site # or NWS id' }), S('gauge_name', 255, 'Gauge', { list: 1 }), D('stage_ft', 'Stage (ft)', { req: 1, list: 1 }), S('category', 20, 'Category', { o: K.floodCat, list: 1 }),
      S('impact', 2000, 'What happens at this stage', { area: 1, req: 1, list: 1 }), S('actions', 2000, 'County actions', { area: 1 }), S('watch_ids', 500, 'Linked watch points', { hide: 1 }), S('source', 150, 'Source')] },
    watch: { svc: 'main', id: 14, name: 'OPS_WatchPoints', title: 'Flood watch points', geom: 'point', fields: [
      S('name', 255, 'Name', { req: 1, list: 1 }), S('wp_type', 40, 'Type', { o: K.watchType, list: 1 }), S('road', 150, 'Road / route', { list: 1 }), S('gauge_id', 40, 'Nearest gauge'), D('flood_stage_ft', 'Floods at gauge stage (ft)', { list: 1 }),
      S('status', 30, 'Status', { o: K.watchStatus, list: 1 }), T('status_time', 'Status updated', { ro: 1 }), I('homes_cut_off', 'Homes cut off when flooded'), I('block_oid', 'County road block', { hide: 1 }), S('detour', 500, 'Detour'), S('notes', 1000, 'Notes', { area: 1 })] },
    calls: { svc: 'main', id: 16, name: 'OPS_HotlineCalls', title: 'Hotline calls', geom: 'point', fields: INC.concat([
      S('call_id', 30, 'Call #', { ro: 1, list: 1 }), S('direction', 12, 'Direction', { o: K.callDir, list: 1, g: 'Call' }), T('call_time', 'Time', { list: 1, g: 'Call' }), T('end_time', 'Ended', { ro: 1, g: 'Call' }), S('taker', 150, 'Call taker', { g: 'Call' }), S('language', 30, 'Language', { o: K.lang, g: 'Call' }),
      S('caller_name', 150, 'Caller name', { g: 'Caller' }), S('caller_phone', 30, 'Callback number', { g: 'Caller' }), S('callback_ok', 3, 'OK to call back', { o: ['Yes', 'No'], g: 'Caller' }), S('address', 255, 'Address / location', { g: 'Caller' }), S('town', 60, 'Community', { o: K.town, list: 1, g: 'Caller' }),
      S('category', 60, 'Topic', { o: K.callCat, list: 1, req: 1, g: 'What they need' }), S('priority', 12, 'Priority', { o: K.callPri, list: 1, g: 'What they need' }), S('summary', 2000, 'What they said', { area: 1, req: 1, g: 'What they need' }), S('people', 10, 'People affected', { g: 'What they need' }),
      S('response', 2000, 'What we told them', { area: 1, g: 'Response' }), S('info_ids', 200, 'Talking points used', { hide: 1 }), S('status', 20, 'Status', { o: K.callStatus, list: 1, g: 'Response' }), S('routed_to', 60, 'Routed to', { o: K.callRoute, list: 1, g: 'Response' }), S('routed_ref', 150, 'Linked record', { ro: 1, g: 'Response' }),
      S('assigned_to', 150, 'Follow-up by', { g: 'Response' }), T('followup_due', 'Follow up by', { g: 'Response' }), T('closed_time', 'Closed', { ro: 1, g: 'Response' }), S('related_call', 30, 'Related call #', { hide: 1 }), S('notes', 2000, 'Internal notes', { area: 1, g: 'Response' })]) },
    info: { svc: 'main', id: 17, name: 'OPS_HotlineInfo', title: 'Hotline talking points', fields: INC.concat([
      S('topic', 60, 'Topic', { o: K.callCat, list: 1, req: 1 }), S('question', 500, 'Question callers ask', { req: 1, list: 1 }), S('answer', 4000, 'Approved answer', { area: 1, h: 120, req: 1 }), S('spanish', 4000, 'Spanish answer', { area: 1 }),
      S('status', 12, 'Status', { o: K.infoStatus, list: 1 }), S('approved_by', 150, 'Approved by (PIO)'), T('effective', 'Effective', { list: 1 }), T('expires', 'Expires'), S('source', 255, 'Source / link'), I('times_used', 'Times used', { ro: 1, list: 1 }), I('pinned', 'Pinned (1 = top)', { hide: 1 })]) },
    hospitals: { svc: 'main', id: 15, name: 'OPS_Hospitals', title: 'MCI hospital board', geom: 'point', fields: [
      S('name', 150, 'Hospital', { req: 1, list: 1 }), S('level', 60, 'Capability', { list: 1, hint: 'Level I trauma, burn, pediatric' }), S('status', 30, 'Status', { o: ['Open', 'Limited', 'Diversion', 'Closed', 'Unknown'], list: 1 }),
      I('cap_red', 'Can take Immediate (Red)', { list: 1 }), I('cap_yellow', 'Can take Delayed (Yellow)', { list: 1 }), I('cap_green', 'Can take Minor (Green)', { list: 1 }), S('phone', 30, 'ED / med control phone'), D('drive_min', 'Drive time (min)', { list: 1 }), T('updated', 'Updated', { ro: 1 }), S('notes', 500, 'Notes', { area: 1 })] },
    afn: { svc: 'prot', id: 0, name: 'PROT_AFN_Registry', title: 'Access & functional needs registry', geom: 'point', fields: [
      S('reg_id', 40, 'Registry #', { ro: 1, list: 1 }), S('first_name', 80, 'First name', { req: 1, list: 1, g: 'Person' }), S('last_name', 80, 'Last name', { req: 1, list: 1, g: 'Person' }), T('dob', 'Date of birth', { g: 'Person' }),
      S('address', 255, 'Address', { req: 1, list: 1, g: 'Person' }), S('phone', 30, 'Phone', { list: 1, g: 'Person' }), S('alt_contact', 255, 'Caregiver / alternate contact', { g: 'Person' }), S('alt_phone', 30, 'Alternate phone', { g: 'Person' }), I('household', 'People in household', { g: 'Person' }),
      S('needs', 1000, 'Needs', { multi: K.afnNeeds, list: 1, g: 'Needs' }), S('needs_detail', 1000, 'Details', { area: 1, g: 'Needs' }), S('power_dependent', 5, 'Power-dependent equipment', { o: K.yesno, g: 'Needs' }), S('oxygen_hours', 30, 'Oxygen / battery backup lasts', { g: 'Needs' }),
      S('transport', 40, 'Evacuation transport', { o: K.afnTransport, list: 1, g: 'Needs' }), S('pets', 100, 'Pets / service animal', { g: 'Needs' }), S('language', 60, 'Preferred language', { g: 'Needs' }),
      T('consent_date', 'Consent signed', { g: 'Registry' }), T('review_due', 'Annual review due', { list: 1, g: 'Registry' }), S('active', 5, 'Active', { o: K.yesno, g: 'Registry' }), S('source', 60, 'Referred by', { g: 'Registry' }), S('notes', 1000, 'Notes', { area: 1, g: 'Registry' })] },
    afnchecks: { svc: 'prot', id: 1, name: 'PROT_AFN_WelfareChecks', title: 'Welfare checks', fields: INC.concat([
      S('reg_id', 40, 'Registry #', { list: 1 }), S('person', 160, 'Person', { list: 1 }), S('result', 40, 'Result', { o: K.welfare, list: 1, req: 1 }), S('checked_by', 150, 'Checked by', { list: 1 }), T('check_time', 'Time', { list: 1 }), S('notes', 1000, 'Notes', { area: 1 })]) },
    reunify: { svc: 'prot', id: 2, name: 'PROT_Reunification', title: 'Family reunification', geom: 'point', fields: INC.concat([
      S('case_no', 30, 'Case #', { ro: 1, list: 1 }), S('rec_type', 40, 'Record type', { o: K.reunType, list: 1, req: 1 }), S('first_name', 80, 'First name', { list: 1 }), S('last_name', 80, 'Last name', { req: 1, list: 1 }), I('age', 'Age'), S('sex', 10, 'Sex', { o: K.sex }),
      S('description', 1000, 'Description (clothing, features)', { area: 1 }), S('home_address', 255, 'Home address'), S('last_seen', 500, 'Last known location / time'), S('medical', 500, 'Medical needs'),
      S('is_minor', 5, 'Under 18', { o: K.yesno, list: 1 }), S('unaccompanied', 5, 'Unaccompanied minor', { o: K.yesno }), S('guardian', 150, 'Parent / legal guardian'), S('guardian_phone', 30, 'Guardian phone'), S('school', 150, 'School / care facility'), S('language', 60, 'Language'),
      S('center', 150, 'Reunification site', { list: 1 }), S('dss_notified', 5, 'DSS notified', { o: K.yesno }), S('le_notified', 5, 'Law enforcement notified', { o: K.yesno }), S('ncmec', 5, 'Reported to NCMEC (UMR/NECLC)', { o: K.yesno }), S('intake_no', 30, 'Family intake #', { ro: 1 }),
      S('rp_name', 150, 'Reporting party', { g: 'Reporting party' }), S('rp_phone', 30, 'RP phone', { g: 'Reporting party' }), S('rp_relation', 60, 'Relationship', { g: 'Reporting party' }),
      S('status', 40, 'Status', { o: K.reunStatus, list: 1 }), S('located_at', 255, 'Located at (shelter, hospital)', { list: 1 }), S('match_case', 30, 'Matched case #'), T('reunited_time', 'Reunited'), S('notes', 2000, 'Notes', { area: 1 })]) },
    intake: { svc: 'prot', id: 4, name: 'PROT_FamilyIntake', title: 'Family check-in (kiosk / QR)', fields: [
      S('intake_no', 30, 'Intake #', { ro: 1, list: 1 }), S('intake_type', 40, 'Reason', { o: ['Looking for someone', 'Checking in safe', 'Picking up a child', 'Other'], list: 1, req: 1 }), S('site', 150, 'Where submitted', { list: 1 }), S('channel', 20, 'Kiosk / phone', { ro: 1 }),
      S('first_name', 80, 'First name', { req: 1, list: 1 }), S('last_name', 80, 'Last name', { req: 1, list: 1 }), S('phone', 30, 'Phone', { list: 1 }), S('email', 150, 'Email'), S('language', 60, 'Language'), I('party_size', 'People with you'),
      S('sought', 2000, 'Who they are looking for / who is with them', { area: 1, list: 1 }), S('children', 5, 'Children involved', { o: K.yesno, list: 1 }), S('last_seen', 500, 'Last known location'), S('current_loc', 255, 'Where they are now'), S('needs', 500, 'Needs (medical, ride, shelter)', { area: 1 }),
      S('consent', 5, 'OK to share with family', { o: K.yesno }), S('incident_key', 40, 'Incident', { hide: 1 }), S('status', 20, 'Status', { o: ['New', 'Reviewed', 'Case opened', 'Closed'], list: 1 }), S('case_no', 30, 'Case #', { ro: 1 }), S('notes', 1000, 'Staff notes', { area: 1 })] },
    releases: { svc: 'prot', id: 5, name: 'PROT_ChildReleases', title: 'Child release log', fields: INC.concat([
      S('case_no', 30, 'Child case #', { list: 1, ro: 1 }), S('child', 160, 'Child', { list: 1, ro: 1 }), S('released_to', 160, 'Released to', { req: 1, list: 1 }), S('relationship', 60, 'Relationship', { o: ['Parent', 'Legal guardian', 'Authorized adult (on file)', 'DSS / CPS', 'Law enforcement', 'Hospital', 'Other'], req: 1, list: 1 }),
      S('id_type', 40, 'Photo ID checked', { o: ['Driver license', 'State ID', 'Passport', 'Military ID', 'Other photo ID', 'None (DSS/LE approval)'], req: 1 }), S('id_last4', 10, 'ID # (last 4)'), S('id_matches', 5, 'ID name matches guardian on record', { o: K.yesno, req: 1 }),
      S('custody_docs', 30, 'Custody documents', { o: ['Not needed', 'Checked', 'Conflict - DSS/LE decided'] }), S('child_recognizes', 5, 'Child recognizes adult (age-appropriate)', { o: ['Yes', 'No', 'N/A (too young)'] }),
      S('verified_by_1', 150, 'Verified by (staff 1)', { req: 1, list: 1 }), S('verified_by_2', 150, 'Verified by (staff 2)', { req: 1 }), T('release_time', 'Released', { list: 1 }), S('phone', 30, 'Adult phone'), S('destination', 255, 'Going to'), S('notes', 1000, 'Notes', { area: 1 })]) },
    patients: { svc: 'ems', id: 0, name: 'PROT_MCI_Patients', title: 'MCI patients', geom: 'point', fields: INC.concat([
      S('tag_no', 30, 'Triage tag #', { req: 1, list: 1 }), S('triage', 30, 'Triage', { o: K.triage, list: 1, req: 1 }), S('status', 30, 'Status', { o: K.ptStatus, list: 1 }), S('age_group', 20, 'Age group', { o: K.ageGroup }), I('age', 'Age'), S('sex', 10, 'Sex', { o: K.sex }),
      S('first_name', 80, 'First name', { list: 1 }), S('last_name', 80, 'Last name', { list: 1 }), S('injuries', 1000, 'Injuries / chief complaint', { area: 1 }), S('vitals', 255, 'Vitals'), S('treatment', 1000, 'Treatment given', { area: 1 }),
      S('found_at', 255, 'Found at / sector'), S('unit', 40, 'Transport unit', { list: 1 }), S('hospital', 150, 'Destination', { list: 1 }), T('triage_time', 'Triaged'), T('transport_time', 'Transported'), T('arrive_time', 'Arrived'),
      S('reun_case', 30, 'Reunification case #', { hide: 1 }), S('notes', 1000, 'Notes', { area: 1 })]) }
  };
  Object.keys(OPS.LAYERS).forEach(function (k) { OPS.LAYERS[k].key = k; });
})(window.CP);
