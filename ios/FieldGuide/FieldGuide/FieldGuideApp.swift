import SwiftUI
import SafariServices
import WebKit

@main
struct FieldGuideApp: App {
    @Environment(\.scenePhase) private var phase
    @StateObject private var store = GuideStore.shared
    @StateObject private var lifelines = LifelineStore.shared
    @StateObject private var router = Router.shared

    init() {
        BrandAppearance.apply()
        WebWarmup.start()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .environmentObject(lifelines)
                .environmentObject(router)
                .tint(Theme.gold)
                .preferredColorScheme(.dark)
                .font(BrandFont.body())
                .task {
                    await store.loadSaved()
                    Task { await lifelines.refresh(force: true) }
                    await store.refresh()
                }
        }
        .onChange(of: phase) { _, p in
            guard p == .active, store.isLoaded else { return }
            Task {
                await lifelines.refresh()
                await store.refresh()
            }
        }
    }
}

/// Starts the web engine while the home screen draws, so the first guide page opens instantly.
enum WebWarmup {
    @MainActor private static var view: WKWebView?
    @MainActor static func start() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = GuideWebView.dataStore
        let v = WKWebView(frame: .zero, configuration: config)
        v.loadHTMLString("<html></html>", baseURL: nil)
        view = v
    }
}

enum Route: Hashable {
    case page(String)
    case form
}

struct SafariLink: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

/// Where a tap goes. Links inside guide pages point at the web guide; here they open the native page instead.
@MainActor
final class Router: ObservableObject {
    static let shared = Router()
    @Published var path: [Route] = []
    @Published var safari: SafariLink?
    /// Search words to highlight on the next page opened from search.
    var pendingFind: String?

    func push(_ r: Route) {
        if path.last != r { path.append(r) }
    }

    func open(_ url: URL) {
        let scheme = url.scheme?.lowercased() ?? ""
        if ["tel", "telprompt", "mailto", "sms", "facetime", "maps"].contains(scheme) {
            UIApplication.shared.open(url)
            return
        }
        if url.host?.lowercased().hasSuffix("experience.arcgis.com") == true, url.path.contains(Config.guideItem) {
            let view = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "views" })?.value?
                .split(separator: ",").first.map(String.init)
            if let view, GuideStore.shared.guide.pages[view] != nil {
                push(.page(view))
            } else if url.path.localizedCaseInsensitiveContains("lifeline") {
                push(.form)
            } else {
                path.removeAll()
            }
            return
        }
        if scheme == "http" || scheme == "https" {
            safari = SafariLink(url: url)
        } else {
            UIApplication.shared.open(url)
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var router: Router

    var body: some View {
        NavigationStack(path: $router.path) {
            HomeView()
                .brandNavBar()
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .page(let id): PageView(pageID: id).brandNavBar()
                    case .form: FormView().brandNavBar()
                    }
                }
        }
        .sheet(item: $router.safari) { link in
            SafariView(url: link.url).ignoresSafeArea()
        }
    }
}

struct SafariView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController {
        let vc = SFSafariViewController(url: url)
        vc.preferredControlTintColor = UIColor(Theme.gold)
        vc.preferredBarTintColor = UIColor(Theme.card)
        return vc
    }
    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}
