# BEACON MCI Board (iPad / iPhone)

Native SwiftUI app for mass casualty incidents: triage, patient tracking, transport and the hospital board.
Same sign-in and gate as the Command Board app. Patient records stay in ArcGIS (`BOCO_EMS_PatientCare` → `PROT_MCI_Patients`),
reached only through the BEACON gate. The web MCI page (`mci.html`), EM Ops, Command Board and dashboards read the same rows.

## What it does

| Screen | Who | What |
|---|---|---|
| Triage | Officer+ | Tag number (type it, auto-number, or scan the tag's barcode with the camera), then one tap on a color saves. Age group, sex, sector and injuries are optional. Warns on a duplicate tag. |
| Patients | Officer+ | Search, filter by color and on scene / transported, open a patient to re-triage, update status and care, transport. |
| Transport | Officer+ | Waiting list (red first, longest wait first) with Assign; unit from CAD (Fire & EMS units) or typed; hospital cards show sent / can-take for that color, diversion and closed greyed out. On-the-way list with Arrived. |
| Hospitals | everyone (edit Officer+) | Capacity board (OPS_Hospitals). Adds the two EOP trauma centers when empty. |
| Overview | everyone | MCI level (EOP thresholds), RHCC call-out and script at Level 2/1, counts by color, waiting reds/yellows and longest wait, where patients went. |
| Patient report | Command+ | PDF marked RESTRICTED, with or without names; shared with the share sheet and removed from the iPad afterwards. |

Also: START / JumpSTART quick card, declare an MCI with no Command Post incident (other iPads join it from the list), practice/drill flag,
Command Board's MCI panel opens this app on the same incident (`beaconmci://open?incident=KEY`).

## Access levels (mci_level column in BEACON_App_Access)

| Level | Sees | Can do |
|---|---|---|
| Viewer | Counts only (by color, status, hospital), hospital board | Nothing |
| Officer | Patients by tag, clinical details, CAD units, hospital board | Triage, update, transport, hospital capacity |
| Command, Chief, Admin | + patient names | + names, send to Reunification, patient report, mark "entered in error" |

Nobody can delete a patient record. No guest codes in this app.
The gate enforces all of this (`gate/worker.js`, `layersFor().mci`); the app only hides what the gate would refuse anyway.

## Security

- **ArcGIS is the record.** The iPad keeps a working copy of the open incident so triage works offline. It's encrypted by iPadOS file protection, left out of iCloud and computer backups, wiped on sign-out, and cleared after 3 days when nothing is waiting to send.
- **Every ArcGIS call is a POST through the gate.** No patient detail is ever in a web address or a server log. The network layer keeps no cache.
- **App lock.** Face ID, Touch ID or the passcode on launch and after 2 minutes away (Account → setting; on by default). The app switcher shows a cover, not patient data.
- **Names are Command-only.** The gate strips them from Officer reads, and refuses any search, sort or grouping on name fields (so they can't be guessed) and any write of them below Command.
- **Viewer counts are counts.** Only `count` statistics, one incident, grouped by triage, status or hospital.
- **Reunification is add-only.** Command can send a found person (name, age, sex, where they went; nothing clinical). The app can't read Reunification back.
- **Session token** in the Keychain, this device only.

## Set up (once)

1. **ArcGIS credentials item** "BEACON gate (Command Board and MCI apps)": give it access to `BOCO_EMS_PatientCare`, `BOCO_EM_Operations` and `BOCO_EM_Protected` (the gate limits it to the patient layer, the hospital board and adding to Reunification).
2. **Gate settings**: EM Ops → Setup → "Command Board & MCI apps" → Copy gate settings. It now includes `patients`, `ops` and `prot`. Paste into the worker's `SERVICES` variable.
3. **Deploy the gate** (Cloudflare dashboard → beacon-gate → Edit code). Tests first: `node gate/test-mci.mjs` and `node gate/test-users.mjs`.
4. **People**: set `mci_level` for each person in EM Ops → App access, or in the Command Board app's Users screen.
5. **Xcode**: open `ios/MCIBoard/MCIBoard.xcodeproj`. Team 6N9P686FD4, bundle `com.dmurray.MCIBoard`. Create the app record in App Store Connect (name "BEACON MCI Board"), then Product → Archive → Distribute → TestFlight.
6. **Command Board**: `ios/CommandBoard/CommandBoard/board.html` was rebuilt (live MCI counts from the gate, "Open MCI Board app" button). Archive a new Command Board build to pick it up.

## Layer numbers

`PROT_MCI_Patients` = 0 in BOCO_EMS_PatientCare, `OPS_Hospitals` = 15 in BOCO_EM_Operations, `PROT_Reunification` = 2 in BOCO_EM_Protected
(EM Ops schema, `ops/schema.js`). If a service was built differently, change them in `Config.swift` and in `gate/worker.js` (`PT_LAYER`, `HOSP_LAYER`, `REUN_LAYER`).

## Files

`Store.swift` (data, outbox, sync) · `Api.swift` (ArcGIS through the gate) · `Support.swift` (encrypted copy, location) · `Models.swift` ·
`TriageView.swift` (triage, scanner, START card) · `PatientsView.swift` (list, patient sheet) · `TransportView.swift` · `OverviewView.swift` (overview, hospitals) ·
`ReportView.swift` (PDF, account, unsent) · `RootView.swift` (layout, incident picker) · `MCIBoardApp.swift` (lock, sign-in) · `Session.swift` (same as Command Board).
