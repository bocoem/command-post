# EOP Field Guide (iPhone and iPad)

Native app for the Botetourt County EOP Field Guide. Home-screen name **Field Guide**.
Team 6N9P686FD4 · bundle ID `com.dmurray.EOPFieldGuide` · iOS 17+ · App Store Connect app 6838375017.

## ArcGIS is the one place to edit
The app has no guide text of its own. Everything comes from the public **EM Field Guide**
Experience Builder item (c7e098280d1c497c9b387ea3fe85a90e), **published** version:

- page names, menu order and folders (Start here, Lifelines, Incidents, Operations)
- the HTML of every guide page
- the "Update my lifeline" page and its Survey123 form address

To change the guide: edit **EM Watch** first, make the same change in **EM Field Guide**, and
**publish** both. Unpublished drafts never reach the app. The next time the app opens with signal it
sees the item changed, downloads the new version and swaps it in. Renamed, added, moved or removed
pages follow automatically. No new app build is needed.

Lifeline status on the home screen is the newest row of EmergencyInformation_public › Lifeline
Status, the same row SIGNAL shows, with SIGNAL's words (Stabilized / Impacted / Destabilized).

## Without signal
The app keeps the last guide it downloaded and the last lifeline status. A phone that has never had
signal uses the copy built into the app (`FieldGuide/GuideSeed.json`, the published config at build
time). If the saved copy is ever unreadable, the app discards it and downloads a fresh one. The
lifeline form needs signal to send, the same as on the web.

## Look (BCEM Brand Standards, Edition 1.0, 2026)
- Blue Ridge Navy throughout; Signal Red, Harvest Gold and Defense Indigo only as signals.
- Barlow Condensed (headlines, caps), Barlow (text), IBM Plex Mono (labels): bundled in
  `FieldGuide/Fonts`, SIL Open Font License. Guide pages are drawn in Barlow.
- Header on every screen: seal + tri-bar + BOTETOURT COUNTY / EMERGENCY MANAGEMENT on the left,
  FIELD GUIDE on the right. Nothing else in the bar. Page options are the round "…" button
  at the bottom right of each guide page.
- Home footer: tri-bar with Respond · Prepare · Recover, "In an emergency, dial 911"
  (display only), and whether the guide is up to date.
- Icon: the full-colour seal on navy, FIELD GUIDE, tri-bar. Seal is never recoloured or cropped.

## Files
- `Config.swift` – item IDs and addresses
- `Guide.swift` – reads the Experience Builder config into pages and menu
- `GuideStore.swift` – saved copy, update check, search
- `LifelineStatus.swift` – lifeline status tiles
- `Theme.swift` – brand colours, fonts, header, tri-bar
- `HomeView.swift`, `PageView.swift`, `FormView.swift` – screens

## Ship a TestFlight build
1. Raise the build number (target › General › Build). Uploaded so far: 1, 2. Next: 3.
2. Optional: refresh the built-in copy with the latest published config
   (`www.arcgis.com/sharing/rest/content/items/c7e098280d1c497c9b387ea3fe85a90e/resources/config/config.json` → `FieldGuide/GuideSeed.json`).
3. Product › Archive › Distribute App › TestFlight Internal Only.

## History and automatic checks (GitHub)
This folder lives in `bocoem/command-post` under `ios/FieldGuide`, so every change has a history.
- **Field Guide health** (`.github/workflows/field-guide-health.yml`) runs twice a day
  (about 6:17 am and 6:17 pm Eastern) and on demand (Actions › Field Guide health › Run workflow).
  It checks what the app depends on: the EM Field Guide is public and published, its published
  config still turns into the guide (pages, menu, links between pages, a page for every lifeline
  tile), the Update my lifeline form is present and public, and the Lifeline Status feed answers.
  A problem opens the issue **"Field Guide health check failing"** (GitHub emails you), later runs add
  to it while it lasts, and it closes itself when the check passes again.
  Run it locally: `python3 ios/FieldGuide/health/check_field_guide.py`.
- **Field Guide build** (`.github/workflows/field-guide-build.yml`) builds the app on a cloud Mac
  whenever its code changes, so a change that would not compile is caught before archiving.
- The scheduled health check only runs from the repository's main branch.
