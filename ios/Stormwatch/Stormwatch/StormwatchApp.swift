import SwiftUI

@main
struct StormwatchApp: App {
    @Environment(\.scenePhase) private var phase
    @StateObject private var feed = Feed.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(feed)
                .tint(Theme.gold)
                .preferredColorScheme(.dark)
        }
        .onChange(of: phase) { _, p in
            switch p {
            case .active:
                Task { await feed.refresh() }
            default: break
            }
        }
    }
}

/// The web app's five pages, in its menu order. Info is the home page.
enum AppTab: Hashable { case map, reports, submit, info, housecheck }

struct RootView: View {
    @State private var tab: AppTab = .info

    var body: some View {
        TabView(selection: $tab) {
            MapTab(tab: $tab)
                .tabItem { Label("Map", systemImage: "map") }.tag(AppTab.map)
            ReportsTab()
                .tabItem { Label("Reports", systemImage: "list.bullet.rectangle") }.tag(AppTab.reports)
            SurveyTab(title: ReportForm.responder.title, url: ReportForm.responder.url)
                .tabItem { Label("Submit", systemImage: "plus.circle") }.tag(AppTab.submit)
            InfoTab(tab: $tab)
                .tabItem { Label("Info", systemImage: "info.circle") }.tag(AppTab.info)
            SurveyTab(title: ReportForm.housecheck.title, url: ReportForm.housecheck.url)
                .tabItem { Label("House Check", systemImage: "house") }.tag(AppTab.housecheck)
        }
    }
}
