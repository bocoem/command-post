# Command Post

Incident management for **Botetourt County Emergency Management**.

One record per incident fills every ICS form (201, 202, 203, 204, 205, 205A, 206, 207, 208, 209, 211, 213, 213RR, 214, 215, 215A, 221) and the Incident Action Plan, and updates the county ArcGIS Online EM layers (Incidents, Incident Lines, Incident Facilities, Impacted Area, Road Closures, Road Blocks, Detours, Notices & Evacuations, Evacuation Routes, Shelters, Distribution Sites, Critical Infrastructure, Lifeline Status, Public Message, SitRep, Damage Assessment).

The **Affected Area** page replaces the old EM Information Manager impact tools: pick or draw an area, count the homes and buildings in it, list what's inside, get Esri population numbers, and run Business Analyst infographics (PDF, Excel or interactive) for it.

Live app: https://bocoem.github.io/command-post/

- Plain HTML/JS, no build step. Hosted on GitHub Pages.
- Sign-in uses ArcGIS Online OAuth 2.0 (PKCE). The client ID in `config.js` is public by design; no secrets are stored here.
- County data lives in ArcGIS Online, not in this repository.

## EM Ops tools

`ops.html` holds the county operations tools. They share Command Post's sign-in, look and incidents, and every record lives in ArcGIS Online:

- **BOCO_EM_Operations** (staff): Resources, Requests (213RR mirror), Costs, Check-ins, PAR, Volunteers, Volunteer hours, Training, Exercises, Improvement plan, Plans (with attachments), Infrastructure status, POD ledger, Flood impact stages, Flood watch points, MCI hospitals.
- **BOCO_EM_Protected** (restricted group only): AFN registry, welfare checks, reunification cases, family intake, child release log, MCI patients.
- **BOCO_Reunification_Public_Intake**: public add-only view of the family intake layer. It powers `family.html` (kiosk and QR). Records cannot be read through it.

Standalone apps: `mci.html`, `reunify.html` (staff), `checkin.html` (phone check-in), `family.html` (public family check-in). Open **Setup** in `ops.html` once, with a publisher account, to create and share the services.

Check-ins, resource assignments, requests, checklist steps, transports, PAR results and status changes are written into the Command Post incident record (Resources, Requests, Activity Log, Lifelines). EOP 2026 guidance is shown inside each tool.
