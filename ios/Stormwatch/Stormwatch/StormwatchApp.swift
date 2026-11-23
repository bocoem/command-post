import SwiftUI

@main
struct StormwatchApp: App {
    @Environment(\.scenePhase) private var phase
    @StateObject private var auth = Auth.shared
    @StateObject private var outbox = Outbox.shared
    @StateObject private var schemas = Schemas.shared

    init() { Outbox.registerBackground() }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .environmentObject(outbox)
                .environmentObject(schemas)
                .tint(Theme.accent)
        }
        .onChange(of: phase) { _, p in
            switch p {
            case .active:
                outbox.kick()
                Task { await schemas.refresh() }
            case .background:
                outbox.finishInBackground()
            default: break
            }
        }
    }
}

enum Theme {
    static let navy = Color(red: 0.055, green: 0.125, blue: 0.2)   // #0e2033, the Stormwatch form background
    static let accent = Color(red: 0.12, green: 0.36, blue: 0.70)
    static let gold = Color(red: 0.85, green: 0.65, blue: 0.13)
}

/// No sign-in needed to send: reports go to the same public, add-only layers the Survey123 web forms use.
struct RootView: View {
    @EnvironmentObject var outbox: Outbox

    var body: some View {
        TabView {
            ReportFormView()
                .tabItem { Label("Report", systemImage: "square.and.pencil") }
            OutboxView()
                .tabItem { Label("Sent", systemImage: "tray.full") }
                .badge(outbox.waiting.count + outbox.problems.count)
            RecentView()
                .tabItem { Label("Recent", systemImage: "map") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
    }
}
