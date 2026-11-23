# Stormwatch Responder for iPhone and iPad

Native app for **responder** storm reports. Dispatch and the public keep using their web forms. It runs alongside the Stormwatch Responder web form and uses the same data:

- **Sends to the same layer as the web form.** Reports go to the public, add-only Survey123 layer (`survey123_87946e73db344d4da8e41655a205e6e7_form`). No ArcGIS sign-in, seat or app registration is needed to send, which matches the web form.
- **Same questions as the web form.** On every launch with a connection, the app reads the Responder Survey123 form's public `form.json`, including questions, choices, required answers, "Other" boxes and show-when rules (such as power-company questions only for *Power lines down*). Publish a change in Survey123 and the app picks it up. A copy of the form ships with the app (`Form-responder.json`) for first launch offline.
- **Same alerts.** Survey123 starts the Stormwatch Responder alert flow with a webhook. The app's reports don't pass through Survey123, so the app sends the same webhook message to the same flow after the report is saved.
- **Nothing gets lost.** Each report is saved on the phone first, then sent: the report and its photos together, then the alert. If there's no connection, the app keeps trying: when the connection comes back, every 30 seconds while open, when it's put away, and in the background. Each report carries its own ID (its GlobalID), so a retry after a lost answer can't save a second copy. The **Sent** tab shows what's waiting, what's saved, and any report whose alert didn't go out.
- **Recent map** (optional sign-in): the last 3 days of responder, dispatch and public reports.


## Files

| File | What it is |
|---|---|
| `Stormwatch.xcodeproj` | The Xcode project. Files in `Stormwatch/` are picked up automatically. |
| `Stormwatch/Config.swift` | County addresses: layers, form items, the optional sign-in. |
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

## Optional: the Recent map sign-in

Sending never needs a sign-in. The Recent tab does, because the results views are private. To turn it on, open the **Command Post** app item in ArcGIS Online (client ID `n2nFWHs6Eb9dg9Cs`) → Settings → Application → **Redirect URLs** → add `bocostormwatch://auth` → Save.

## Changing things

- **Questions or choices:** change and publish the Survey123 form. No app change needed.
- **Another report type (for example House Checks):** add a case to `ReportKind` in `Config.swift` with its form item, service item and flow key, plus a `Form-<name>.json` copy, and put back a report-type switch on the form.
- **Alert message:** the flows read the Survey123 webhook message. `Alerts.payload` builds the same shape: `feature.attributes`, `feature.geometry`, `feature.attachments.photo[]`, `surveyInfo`, `eventType: addData`.

## Checks

GitHub builds the app for the iPhone simulator whenever `ios/` changes (`.github/workflows/stormwatch-ios.yml`).
