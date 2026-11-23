# Stormwatch for iPhone and iPad

Native app for **responder** and **dispatch** storm reports. It runs alongside the Stormwatch web forms and uses the same data:

- **Sends to the same layers as the web forms.** Reports go to the public, add-only Survey123 layers (`survey123_<form>_form`). No ArcGIS sign-in, seat or app registration is needed to send, which matches the web forms.
- **Same questions as the web form.** On every launch with a connection, the app reads the Survey123 form's public `form.json`, including questions, choices, required answers, "Other" boxes and show-when rules (such as power-company questions only for *Power lines down*). Publish a change in Survey123 and the app picks it up. A copy of each form ships with the app (`Form-responder.json`, `Form-dispatch.json`) for first launch offline.
- **Same alerts.** Survey123 starts the Stormwatch alert flows with a webhook. The app's reports don't pass through Survey123, so the app sends the same webhook message to the same flow after the report is saved.
- **Nothing gets lost.** Each report is saved on the phone first, then sent: the report and its photos together, then the alert. If there's no connection, the app keeps trying: when the connection comes back, every 30 seconds while open, when it's put away, and in the background. Each report carries its own ID (its GlobalID), so a retry after a lost answer can't save a second copy. The **Sent** tab shows what's waiting, what's saved, and any report whose alert didn't go out.
- **Recent map** (optional sign-in): the last 3 days of responder, dispatch and public reports.

The public keeps using the web form.

## Files

| File | What it is |
|---|---|
| `Stormwatch.xcodeproj` | The Xcode project. Files in `Stormwatch/` are picked up automatically. |
| `Stormwatch/Config.swift` | County addresses: layers, form items, the optional sign-in. |
| `Stormwatch/FormSchema.swift` | Reads the Survey123 form and its show-when rules. |
| `Stormwatch/Outbox.swift` | The send queue: save on phone → ArcGIS → alert, with retries. |
| `Stormwatch/ArcGIS.swift` | Sends a report and its photos in one request, like Survey123. |
| `Stormwatch/Alerts.swift` | The Survey123-style webhook message for the alert flows. |
| `Stormwatch/Secrets.plist` | **Not in GitHub.** The two alert flow addresses. They work like passwords. |
| `Info.plist` | Background sending permission. |

## Set up on the Mac (once)

1. Open `Stormwatch.xcodeproj` in Xcode.
2. Click **Stormwatch** (blue icon, top of the left list) → **Signing & Capabilities** → **Team**: pick your Apple Developer team. If Xcode says the bundle ID is taken, change `org.bocoem.stormwatch` to something unique (for example `gov.botetourtva.stormwatch`).
3. Put `Secrets.plist` in the `Stormwatch` folder (next to `Config.swift`):
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0"><dict>
     <key>ResponderFlowURL</key><string>(Survey123 → Responder form → Settings → Webhooks → URL)</string>
     <key>DispatchFlowURL</key><string>(Survey123 → Dispatch form → Settings → Webhooks → URL)</string>
   </dict></plist>
   ```
   Without it the app still saves reports, but no alert goes out, and the Sent tab says so.
4. Plug in the iPhone, pick it at the top of Xcode, press **Run** (▶). The first time, on the phone: Settings → General → VPN & Device Management → trust your developer certificate.

**To give it to other people:** Product → Archive → Distribute App → **TestFlight Internal Only**. Add testers in App Store Connect; they install the TestFlight app and get updates automatically.

## Optional: the Recent map sign-in

Sending never needs a sign-in. The Recent tab does, because the results views are private. To turn it on, open the **Command Post** app item in ArcGIS Online (client ID `n2nFWHs6Eb9dg9Cs`) → Settings → Application → **Redirect URLs** → add `bocostormwatch://auth` → Save.

## Changing things

- **Questions or choices:** change and publish the Survey123 form. No app change needed.
- **A new report type (for example House Checks):** add a case to `ReportKind` in `Config.swift` with its form item, service item and flow key, plus a `Form-<name>.json` copy.
- **Alert message:** the flows read the Survey123 webhook message. `Alerts.payload` builds the same shape: `feature.attributes`, `feature.geometry`, `feature.attachments.photo[]`, `surveyInfo`, `eventType: addData`.

## Checks

GitHub builds the app for the iPhone simulator whenever `ios/` changes (`.github/workflows/stormwatch-ios.yml`).
