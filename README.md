# Command Post

Incident management for **Botetourt County Emergency Management**.

One record per incident fills every ICS form (201, 202, 203, 204, 205, 205A, 206, 207, 208, 209, 211, 213, 213RR, 214, 215, 215A, 221) and the Incident Action Plan, and updates the county ArcGIS Online EM layers (Incidents, Incident Lines, Incident Facilities, Impacted Area, Road Closures, Road Blocks, Detours, Notices & Evacuations, Evacuation Routes, Shelters, Distribution Sites, Critical Infrastructure, Lifeline Status, Public Message, SitRep, Damage Assessment).

The **Affected Area** page replaces the old EM Information Manager impact tools: pick or draw an area, count the homes and buildings in it, list what's inside, get Esri population numbers, and run Business Analyst infographics (PDF, Excel or interactive) for it.

Live app: https://beacon-web.dmurray-5fa.workers.dev/ (Cloudflare Worker `beacon-web`, since Nov 28, 2026). The old GitHub Pages copy at https://bocoem.github.io/command-post/ still works during the switch.

- Plain HTML/JS, no build step. Hosted on Cloudflare (Worker `beacon-web`, static files; `wrangler.toml`, `site-worker.js`, `.assetsignore`). Every push to main redeploys it through Cloudflare Workers Builds.
- Sign-in uses ArcGIS Online OAuth 2.0 (PKCE). The client ID in `config.js` is public by design; no secrets are stored here.
- County data lives in ArcGIS Online, not in this repository.

## EM Ops tools

`ops.html` holds the county operations tools. They share Command Post's sign-in, look and incidents, and every record lives in ArcGIS Online:

- **BOCO_EM_Operations** (staff): Resources, Requests (213RR mirror), Costs, Check-ins, PAR, Volunteers, Volunteer hours, Training, Exercises, Improvement plan, Plans (with attachments), Infrastructure status, POD ledger, Flood impact stages, Flood watch points, MCI hospitals.
- **BOCO_EM_Protected** (EM restricted group only): AFN registry, welfare checks, reunification cases, family intake, child release log.
- **BOCO_EMS_PatientCare** (EMS patient care group + EM): MCI patients. Build everything can create the private "BOCO Role - EMS Patient Care (Protected)" group.
- **BOCO_Reunification_Public_Intake**: public add-only view of the family intake layer. It powers `family.html` (kiosk and QR). Records cannot be read through it.

Standalone apps: `mci.html`, `reunify.html` (staff), `checkin.html` (phone check-in), `family.html` (public family check-in). Open **Setup** in `ops.html` once, with a publisher account, to create and share the services.

Check-ins, resource assignments, requests, checklist steps, transports, PAR results and status changes are written into the Command Post incident record (Resources, Requests, Activity Log, Lifelines). EOP 2026 guidance is shown inside each tool.


## Hotline, offline use, practice mode and security (Oct 2026)
- **Hotline** (`hotline.html`, also in EM Ops): log inbound/outbound/callback calls (OPS_HotlineCalls), PIO-approved talking points (OPS_HotlineInfo), live county facts, routing to Reunification, AFN, Volunteers and the PIO; priority/routed calls are logged to the Command Post incident without caller details.
- **Offline**: every page opens without a connection (service worker `sw.js`). Edits made offline are kept on the device and sent in order when the connection returns (`sync.js`); the status pill at the bottom left shows what is waiting. Personal-information services are never cached on the device.
- **Safe simultaneous saves**: each Command Post save first writes its changes as a row in CP_Changes; readers merge the record with recent change rows, so crossing saves never lose work.
- **Practice mode**: tick "Practice / exercise" when starting an incident. Records are flagged, left out of county-wide views, dashboards and cost recovery, and nothing is posted to public county layers.
- **Least access**: tools appear only when the person's ArcGIS groups reach their layers. Setup → *Secure & connect* creates the field-crew, leadership (read-only) and EMS (72-hour) views, turns on delete protection and builds the leadership dashboard. Setup → *Health check* confirms it all.
- **Field**: scan QR tags / volunteer badges to check in and out, scan triage tag barcodes, quick POD hand-out screen.

## Fire preplans: Survey123 and the Preplan Builder (Nov 2026)
Preplans live in the county ArcGIS layer `BOCO_Preplans`, so the Command Board, the Preplan Program dashboard and any ArcGIS map read the same records. There are two ways in, and they write the same records, so a preplan submitted in one can be reviewed in the other. Nothing runs on a schedule.

- **Survey123 is the backbone.** Two forms, *BEACON Fire Preplan* (crews, no sign-in) and *BEACON Fire Preplan - Review* (reviewers), are published once from Survey123 Connect against the Intake and Review views. They are entirely in ArcGIS, so preplans can be built and reviewed when this site is not reachable. The review form releases every map feature, outline, hazmat row, contact and photo when the reviewer saves. The XLSForms and a report template are kept with the BEACON project files, generated from the same schema as everything here.
- **`preplan.html`, the Preplan Builder,** is the second way in: its own iPad app (own home-screen icon, works offline). Tap the aerial photo to place the same symbols the Command Board uses, trace the outline, take photos, sketch a floor plan; work is saved on the iPad as it is typed. Reviewing in the app is one save that also retires the older version when the preplan is an update.
- **What Survey123 cannot do by itself, the app finishes.** A review saved in Survey123 cannot retire the older version of an updated preplan. The dashboard lists it under *Needs attention* (open the old version, set it to Superseded); a reviewer signed in to the app sees the same thing with a **Fix now** button. The Command Board always uses the newest approved version either way.
- **Both submit through the public, add-only `BOCO_Preplans_Intake` view,** which hides every review field, so nothing a crew sends can mark itself approved. App photos are saved under the Survey123 photo question's keyword, so they show in the review form.
- **Setup** is one button: EM Ops → Setup → *Fire preplans* (`ops/preplans.js`). With a publisher account it creates or repairs `BOCO_Preplans`, its four views, two groups, three web maps and the dashboard, then proves what someone with no sign-in can and cannot do. Once the two forms are published, pressing it again finds them, opens the crew form to everyone, shares the review form with the reviewers' group and puts *Review in Survey123* (first) and *Open in Preplan Builder* links on the dashboard.
- **Command Board** (`preplan.js`) only reads: it finds the approved preplan at the incident's address or within 200 m, and **Load onto map** drops it onto the board, outline and hazards included.

Signed in and in the Protected group: full preplan. Otherwise the Tactical view, if it is shared (approved, non-restricted, no Knox, codes, contacts or photos). The service worker never caches the Protected, Review or Intake views.

Files: `preplan.html`, `pb.js`, `pb.css`, `pb.data.js` (app; `pb.data.js` and `ops/preplans.data.js` are generated from the preplan schema, kept with the BEACON project files), `preplan.js` (Command Board reader), `ops/preplans.js` (setup).
