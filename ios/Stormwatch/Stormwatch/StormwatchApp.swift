import SwiftUI

@main
struct StormwatchApp: App {
    @Environment(\.scenePhase) private var phase
    @StateObject private var outbox = Outbox.shared
    @StateObject private var schemas = Schemas.shared
    @StateObject private var feed = Feed.shared

    init() { Outbox.registerBackground() }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(outbox)
                .environmentObject(schemas)
                .environmentObject(feed)
                .tint(Theme.gold)
                .preferredColorScheme(.dark)
        }
        .onChange(of: phase) { _, p in
            switch p {
            case .active:
                outbox.kick()
                Task { await schemas.refresh() }
                Task { await feed.refresh() }
            case .background:
                outbox.finishInBackground()
            default: break
            }
        }
    }
}

/// The web app's five pages, in its menu order. Info is the home page.
enum AppTab: Hashable { case map, reports, submit, info, housecheck }

struct RootView: View {
    @EnvironmentObject var outbox: Outbox
    @State private var tab: AppTab = .info

    var body: some View {
        TabView(selection: $tab) {
            MapTab(tab: $tab)
                .tabItem { Label("Map", systemImage: "map") }.tag(AppTab.map)
            ReportsTab()
                .tabItem { Label("Reports", systemImage: "list.bullet.rectangle") }.tag(AppTab.reports)
            ReportFormView(kind: .responder)
                .tabItem { Label("Submit", systemImage: "plus.circle") }.tag(AppTab.submit)
                .badge(outbox.waiting.count + outbox.problems.count)
            InfoTab(tab: $tab)
                .tabItem { Label("Info", systemImage: "info.circle") }.tag(AppTab.info)
            ReportFormView(kind: .housecheck)
                .tabItem { Label("House Check", systemImage: "house") }.tag(AppTab.housecheck)
        }
    }
}
