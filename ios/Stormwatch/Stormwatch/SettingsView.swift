import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var auth: Auth
    @EnvironmentObject var schemas: Schemas
    @EnvironmentObject var outbox: Outbox

    var body: some View {
        NavigationStack {
            Form {
                Section("ArcGIS") {
                    if let u = auth.username {
                        LabeledContent("Signed in as", value: u)
                        Button("Sign out", role: .destructive) { auth.signOut() }
                    } else {
                        Button("Sign in (for the Recent map)") { Task { await auth.signIn() } }
                    }
                    if let e = auth.lastError { Text(e).font(.footnote).foregroundStyle(.red) }
                }
                Section {
                    ForEach(ReportKind.allCases) { k in
                        let f = schemas.form(k)
                        LabeledContent(k.title, value: f.fetched == .distantPast ? "Built-in copy" : "Checked " + f.fetched.formatted(date: .abbreviated, time: .shortened))
                    }
                    Button("Check for form changes now") { Task { await schemas.refresh() } }
                    if let e = schemas.error { Text(e).font(.footnote).foregroundStyle(.orange) }
                } header: { Text("Report forms") } footer: {
                    Text("Questions and choices come from the Stormwatch Survey123 forms. Edit and publish the form in Survey123, and this app picks up the change the next time it opens with a connection.")
                }
                Section("Alerts") {
                    ForEach(ReportKind.allCases) { k in
                        LabeledContent(k.title, value: Config.secret(k.flowKey) == nil ? "Not set up" : "Power Automate flow")
                    }
                }
                Section("Web version") {
                    Link("Stormwatch Responder (web)", destination: Config.responderWeb)
                }
                Section {
                    LabeledContent("Version", value: (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "") + " (" + (Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "") + ")")
                    LabeledContent("Connection", value: outbox.online ? "Online" : "Offline")
                } footer: {
                    Text("Botetourt County Emergency Management")
                }
            }
            .navigationTitle("Settings")
        }
    }
}
