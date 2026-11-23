# Stormwatch Responder for iPhone and iPad

Native version of the published **Stormwatch Responder** web app (Experience Builder item `0f7a1564b1db45c2adcb469b56973330`), for county responders. It has the same five pages, in the same order, and Info is the home page:

| Page | Same as the web app |
|---|---|
| **Map** | "Storm Reports - Public Map": residents, responders and 911 Dispatch reports with the web map's own symbols (downloaded from the map, so they always match), layer list, legend, search, your location, the pop-up (title, reported by, when, comments, photos) and "+ Submit a responder report". |
| **Reports** | Newest first (up to 200), tabs for Residents / Responders / 911 Dispatch, search by comments, count, pull to refresh. Resident names and contact details are not shown. |
| **Submit** | The Responder storm report Survey123 form. |
| **Info** | "About this app", with the same wording, plus this phone's sending status. |
| **House Check** | The Responder House Checks Survey123 form. |

No sign-in anywhere, same as the web app. Map and Reports read the three public views; Submit and House Check send to the forms' public, add-only layers.

What the native app adds:
- **Nothing gets lost.** Each report is saved on the phone first, then sent (report and photos in one request, then the alert). With no connection it keeps trying: when the connection comes back, every 30 seconds while open, when put away, and in the background. A retry can't make a duplicate (each report's ID is its GlobalID). **Sent** (top right of Submit and House Check) shows what's waiting, saved, or needs attention.
- **Works offline.** Map, Reports and the map key show the last copy downloaded.
- **Forms follow Survey123.** On each launch with a connection, the app reads each form's public `form.json` (questions, choices, required answers, "Other" boxes, show-when rules). Publish a change in Survey123 and the app follows. Copies ship with the app for first launch offline.
- **Alerts.** Survey123 starts the responder alert flow with a webhook. Reports from the app don't pass through Survey123, so the app sends the same webhook message to the same flow. House checks have no alert flow, same as the web form.
- Your own name, team and phone are remembered between reports. Resident details are never remembered.

## Files

| File | What it is |
|---|---|
| `Stormwatch.xcodeproj` | The Xcode project. Files in `Stormwatch/` are picked up automatically. |
| `Stormwatch/Config.swift` | County addresses: forms, layers, the web map. |
| `Stormwatch/Feed.swift` | Map and Reports data and the web map's symbols. |
| `Stormwatch/MapTab.swift`, `ReportsTab.swift`, `InfoTab.swift`, `ReportFormView.swift` | The five pages. |
| `Stormwatch/FormSchema.swift` | Reads the Survey123 form and its show-when rules. |
| `Stormwatch/Outbox.swift` | The send queue: save on phone → ArcGIS → alert, with retries. |
| `Stormwatch/ArcGIS.swift` | Sends a report and its photos in one request, like Survey123. |
| `Stormwatch/Alerts.swift` | The Survey123-style webhook message for the alert flows. |
| `Stormwatch/Secrets.plist` | **Not in GitHub.** The responder alert flow address. It works like a password. |
| `Info.plist` | Background sending permission. |

## Set up on the Mac (once)

1. Open `Stormwatch.xcodeproj` in Xcode.
2. Click **Stormwatch** (blue icon, top of the left list) → **Signing & Capabilities** → **Team**: pick your Apple Developer team. The project is set to team 6N9P686FD4 and bundle ID `com.dmurray.Stormwatch`.
3. In `Stormwatch/Secrets.plist`, paste the Responder form's webhook URL (Survey123 → Responder Storm Situation Reports → Settings → Webhooks) between `<string>` and `</string>` under `ResponderFlowURL`.
   Without it the app still saves reports, but no alert goes out, and the Sent tab says so.
4. Plug in the iPhone, pick it at the top of Xcode, press **Run** (▶). The first time, on the phone: Settings → General → VPN & Device Management → trust your developer certificate.

**To give it to other people:** Product → Archive → Distribute App → **TestFlight Internal Only**. Add testers in App Store Connect; they install the TestFlight app and get updates automatically.

## Changing things

- **Questions or choices:** change and publish the Survey123 form. No app change needed.
- **Another report type (for example House Checks):** add a case to `ReportKind` in `Config.swift` with its form item, service item and flow key, plus a `Form-<name>.json` copy, and put back a report-type switch on the form.
- **Alert message:** the flows read the Survey123 webhook message. `Alerts.payload` builds the same shape: `feature.attributes`, `feature.geometry`, `feature.attachments.photo[]`, `surveyInfo`, `eventType: addData`.

## Checks

GitHub builds the app for the iPhone simulator whenever `ios/` changes (`.github/workflows/stormwatch-ios.yml`).
