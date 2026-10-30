/* EM OPS — Botetourt County EOP 2026 guidance shown inside each tool.
   Taken from the county EOP field guide content (Rev. 2). The full EOP governs; these are quick references. */
(function (CP) {
  'use strict';
  var OPS = CP.ops, E = CP.esc, I = CP.ui.icon;
  OPS.EOP = {
    general: { t: 'Activation & priorities', items: [
      ['h', 'Activation levels'], ['p', 'Levels 3, 2 and 1 escalate with lifeline impacts. Level 2 examples: weather warning, moderate flooding, significant power outage, multi-agency incident.'], ['k', 'Level 1', 'Full activation: all lifeline leads participate, full ICS, physical EOC when scale requires, state/federal coordination active'],
      ['p', 'The Director of Emergency Management (County Administrator) or the Coordinator of Emergency Management authorizes EOC activation. Most activations are virtual. The Board of Supervisors declares a local emergency.'],
      ['h', 'Operational priorities (in order)'], ['o', ['Life safety and security of responders and the public', 'Stabilize Community Lifelines, greatest life-safety impact first', 'Protect property and critical infrastructure', 'Protect the environment', 'Restore essential community services']],
      ['h', 'Lifeline status'], ['k', 'Stabilized (green)', 'Functioning normally, re-established, or not impacted'], ['k', 'Impacted (yellow)', 'Functional with workarounds, partial disruption, or at risk'], ['k', 'Destabilized (red)', 'Failed or severely disrupted: priority resources, escalate'],
      ['p', 'EOC line during an activation: 928-2265. SitReps go to VDEM Region 6.']] },
    reunify: { t: 'EOP: family reunification & Family Assistance Center', items: [
      ['p', 'Family Reunification functional annex. Lead: Department of Social Services and Sheriff\'s Office.'],
      ['h', 'Unaccompanied minors'], ['o', ['DSS takes responsibility under Virginia DSS protocols', 'Notify law enforcement', 'Reunify immediately once a legal guardian is verified']],
      ['h', 'Family Assistance Center (MCI, transportation disaster, active violence, mass fatality)'], ['c', ['EM Coordinator or IC activates; IC/EOC Director names a FAC Lead', 'Stand up a Reception Center near the scene first (hours), then a fixed FAC', 'FAC Lead and Logistics secure an ADA-compliant site away from the scene, hospitals and media', 'Sheriff\'s Office provides security and a single controlled family entry', 'PIO and OCME hold family briefings at least twice daily', 'Reunification Lead confirms patients with hospitals / VHASS', 'Fatality notifications in person only (OCME, law enforcement, trained teams), never by phone or media', 'Grief counseling, chaplains, feeding (DSS, Red Cross, Salvation Army) and health support on site']],
      ['p', 'School incidents: family reunification planning is critical. Coordinate with Botetourt County Public Schools.']] },
    reunifyBest: { t: 'Reunification best practices (national guidance)', items: [
      ['h', 'Children'], ['c', ['Every child gets a case number and wristband at intake; photograph and record what they say about their family', 'Keep unaccompanied children in a supervised, secure area; never alone with one unrelated adult (two-adult rule)', 'Release only to a parent, legal guardian or an adult the guardian authorized, after photo ID matches the record', 'Ask about custody orders and protective orders; any conflict goes to DSS and law enforcement before release', 'Two staff verify every release and sign the release log', 'Report unaccompanied minors to NCMEC (Unaccompanied Minors Registry; NCMEC 1-800-THE-LOST). In a federally declared disaster VDEM can ask FEMA to activate the National Emergency Child Locator Center']],
      ['h', 'Adults & information'], ['c', ['Only share someone\'s location if they agreed to it; otherwise pass a message and let them make contact', 'Search every list (shelters, hospitals / VHASS, MCI patients, check-ins) before telling a family "not found"', 'Keep inquiries open until resolved; call families back on a schedule', 'Do not post names of the missing, injured or deceased publicly', 'Provide interpreters and accessible communication; offer behavioral health support']]] },
    mci: { t: 'EOP: Mass Casualty Incident quick card', items: [
      ['p', 'Lead: Department of Fire & EMS (Sheriff\'s Office supports). New in EOP 2026.'],
      ['h', 'MCI levels'], ['k', 'Level 4', 'up to 15 patients'], ['k', 'Level 3', '16–30 patients'], ['k', 'Level 2', '31–100 patients'], ['k', 'Level 1', '101+ patients'],
      ['h', '5-S scene assessment'], ['p', 'SAFETY → SURVEY → SEND → SET UP → START'],
      ['h', 'START triage'], ['k', 'GREEN', 'Can walk'], ['k', 'BLACK', 'No breathing after airway repositioned'], ['k', 'RED', 'Breathing over 30/min, or no radial pulse / cap refill over 2 s, or cannot follow commands'], ['k', 'YELLOW', 'All checks OK but cannot walk'],
      ['h', 'Staffing ratios'], ['k', 'RED', '1 ALS + 1 BLS per patient'], ['k', 'YELLOW', '1 ALS per 3 patients + 1 BLS per patient'], ['k', 'GREEN', '1 BLS per 3 patients'],
      ['h', 'Transport & hospitals'], ['c', ['Transport RED first, then YELLOW, then GREEN; move GREENs early by bus or van to free ambulances', 'Contact the closest 1–2 hospitals first; if not enough, call RHCC', 'RED to the highest-level trauma center; mix YELLOW / GREEN to the nearest open EDs', 'Carilion Roanoke Memorial is Level I trauma; LewisGale Medical Center is Level II']],
      ['h', 'RHCC (Level 1 & 2): 1-866-679-7422'], ['p', 'Tell them: entity, callback number, radio channel, level and patient count, needs, hospitals contacted, actions taken, what happened.'],
      ['h', 'Also'], ['c', ['Request mutual aid ambulances through dispatch early', 'Establish patient collection and treatment areas; activate a Medical Branch', 'Coordinate family reunification and public information', 'Activate behavioral health support for survivors and responders', 'Demobilize: account for all patients and personnel, release mutual aid first, AAR meeting within 14 days, IC submits the AAR within 30 days']]] },
    pods: { t: 'EOP: Point of Distribution operations', items: [
      ['h', 'Activation criteria'], ['o', ['Widespread power outages over 72 hours affecting retail', 'Significant damage to or closure of grocery / supply stores', 'Communities isolated by road closures or infrastructure damage', 'Declared local emergency with commodity shortages', 'Direction from VDEM as part of a state distribution mission']],
      ['h', 'POD types'], ['k', 'Type I', 'Large: up to 20,000 persons/day'], ['k', 'Type II', 'Medium: up to 10,000 persons/day; up to 280 vehicles/hr; about 75,000 sq ft, 2 lanes'], ['k', 'Type III', 'Small: up to 5,000 persons/day; up to 140 vehicles/hr; about 50,000 sq ft, 1 lane'],
      ['p', 'Type II and multiple Type III sites are most likely for Botetourt County. Drive-through first, with a walk-up / AFN lane at every site. Hours 0700–1900; restock 1900–0700. A Type III needs 7–10 staff per shift.']] },
    flood: { t: 'EOP: flooding', items: [['p', 'Key gauges named in the EOP: Craig Creek at Parr, Catawba Creek, Tinker Creek and the James River. Wildwood Mobile Home Park is a known vulnerable area (EOP 2.2.1). Record county impacts for each gauge on the Impact stages tab so warnings turn into actions.']] },
    shelter: { t: 'EOP: mass care', items: [['p', 'Mass care lead: Department of Social Services (local responsibility) with the American Red Cross managing shelters. Keep detailed records for FEMA Public Assistance. Daily shelter population and needs report to the EOC.']] },
    costs: { t: 'EOP: finance & records', items: [['p', 'Finance tracks costs and procurement for every activation. Keep detailed records (timesheets, equipment logs, invoices, donated resources) for FEMA Public Assistance from the first operational period. Demobilization ends with an AAR.']] },
    infra: { t: 'EOP: lifelines', items: [['p', 'Report facility status by Community Lifeline. A lifeline is Destabilized when it has failed or is severely disrupted, Impacted when it works with workarounds or is at risk, and Stabilized when it is working normally. Use "Update Command Post lifelines" to carry this into the SitRep.']] },
    afn: { t: 'EOP: access & functional needs', items: [['p', 'Shelters must meet ADA physical, program and communication access, with a medical support area on generator-backed power for people with access and functional needs. Non-congregate (hotel) sheltering is available for medical / AFN needs; EM coordinates operators and DSS manages placement.']] }
  };
  function blk(x) {
    if (x[0] === 'h') return '<div class="fgrp" style="margin-top:12px">' + E(x[1]) + '</div>';
    if (x[0] === 'p') return '<p style="margin:4px 0 8px;font-size:13.5px;line-height:1.5">' + E(x[1]) + '</p>';
    if (x[0] === 'k') return '<div style="display:flex;gap:10px;font-size:13.5px;margin:3px 0"><b style="min-width:120px;color:#fff">' + E(x[1]) + '</b><span class="muted">' + E(x[2]) + '</span></div>';
    if (x[0] === 'o') return '<ol style="margin:4px 0 8px;padding-left:20px;font-size:13.5px">' + x[1].map(function (i) { return '<li>' + E(i) + '</li>'; }).join('') + '</ol>';
    if (x[0] === 'c') return '<div style="font-size:13.5px">' + x[1].map(function (i) { return '<div style="margin:4px 0">☐ ' + E(i) + '</div>'; }).join('') + '</div>';
    return '';
  }
  OPS.eopHtml = function (key) { var b = OPS.EOP[key]; return b ? b.items.map(blk).join('') : ''; };
  OPS.eopCard = function (key, open) { var b = OPS.EOP[key]; if (!b) return ''; return '<details class="card eopcard" style="margin-top:14px"' + (open ? ' open' : '') + '><summary><h3 style="display:inline-flex;margin:0">' + I('brief') + E(b.t) + '</h3></summary><div style="margin-top:8px">' + OPS.eopHtml(key) + '<p class="dim" style="font-size:12px;margin:10px 0 0">Botetourt County EOP 2026. The full EOP governs.</p></div></details>'; };
})(window.CP);
