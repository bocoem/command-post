import SwiftUI
import WebKit

/// One guide page, drawn from the HTML published in ArcGIS. Works with no signal.
struct PageView: View {
    let pageID: String
    @EnvironmentObject private var store: GuideStore
    @EnvironmentObject private var router: Router
    @StateObject private var holder = WebHolder()

    private var webLink: URL {
        var c = URLComponents(url: Config.guideWeb.appendingPathComponent("page/Field-Guide/"), resolvingAgainstBaseURL: false)!
        c.queryItems = [URLQueryItem(name: "views", value: pageID)]
        return c.url!
    }

    var body: some View {
        Group {
            if let page = store.guide.pages[pageID] {
                GuideWebView(html: page.html, holder: holder)
                    .ignoresSafeArea(edges: .bottom)
                    .navigationTitle(page.title.uppercased())
            } else {
                ContentUnavailableView("Page not in the guide",
                                       systemImage: "doc.questionmark",
                                       description: Text("This page was removed from the EM Field Guide in ArcGIS."))
            }
        }
        .background(Theme.guideCanvas)
        .navigationBarTitleDisplayMode(.inline)
        // Page options live in one small button in the corner, keeping the header clean.
        .overlay(alignment: .bottomTrailing) {
            Menu {
                Button { holder.find(nil) } label: { Label("Find on this page", systemImage: "magnifyingglass") }
                ShareLink(item: webLink) { Label("Share link", systemImage: "square.and.arrow.up") }
                Button { router.safari = SafariLink(url: webLink) } label: { Label("Open on the web", systemImage: "safari") }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(Theme.gold)
                    .frame(width: 46, height: 46)
                    .background(Theme.navy.opacity(0.94), in: Circle())
                    .overlay(Circle().stroke(Theme.slate, lineWidth: 1))
                    .shadow(color: .black.opacity(0.35), radius: 6, y: 2)
            }
            .accessibilityLabel("Page options")
            .padding(.trailing, 16)
            .padding(.bottom, 14)
        }
        .onAppear {
            if let q = router.pendingFind {
                holder.pendingFind = q
                router.pendingFind = nil
            }
        }
    }
}

@MainActor
final class WebHolder: ObservableObject {
    weak var view: WKWebView?
    var pendingFind: String?

    func find(_ text: String?) {
        guard let v = view, let f = v.findInteraction else { return }
        if let text { f.searchText = text }
        f.presentFindNavigator(showingReplace: false)
    }
}

struct GuideWebView: UIViewRepresentable {
    let html: String
    let holder: WebHolder

    func makeCoordinator() -> Coordinator { Coordinator(holder: holder) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = GuideWebView.dataStore
        config.dataDetectorTypes = [.phoneNumber, .link]
        let v = WKWebView(frame: .zero, configuration: config)
        v.isOpaque = false
        v.backgroundColor = UIColor(Theme.guideCanvas)
        v.scrollView.backgroundColor = UIColor(Theme.guideCanvas)
        v.scrollView.contentInsetAdjustmentBehavior = .automatic
        v.isFindInteractionEnabled = true
        v.allowsLinkPreview = false
        v.navigationDelegate = context.coordinator
        v.uiDelegate = context.coordinator
        holder.view = v
        load(v, context: context)
        return v
    }

    func updateUIView(_ v: WKWebView, context: Context) {
        // The guide was republished while this page was open: show the new version.
        if context.coordinator.loadedHTML != html { load(v, context: context) }
    }

    private func load(_ v: WKWebView, context: Context) {
        context.coordinator.loadedHTML = html
        v.loadHTMLString(Self.wrap(html), baseURL: Config.guideWeb)
    }

    /// One in-memory store shared by every guide page (guide pages keep nothing between launches).
    @MainActor static let dataStore = WKWebsiteDataStore.nonPersistent()

    /// Experience Builder shows each page in a frame with an 8 px margin (the pages offset it with -8 px).
    static func wrap(_ body: String) -> String {
        """
        <!doctype html><html><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
        <style>
        html,body{background:#0A1724;color:#F2F4F7;margin:0}
        body{margin:8px;-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:rgba(253,184,51,.25)}
        /* BCEM brand text face (bundled with the app); the content itself is exactly as published in ArcGIS. */
        body,body *{font-family:'Barlow',-apple-system,'Helvetica Neue',sans-serif !important}
        a{color:#FDB833}
        img{max-width:100%;height:auto}
        table{max-width:100%}
        </style></head><body>
        \(body)
        <div style="height:calc(16px + env(safe-area-inset-bottom))"></div>
        </body></html>
        """
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        var loadedHTML = ""
        let holder: WebHolder
        init(holder: WebHolder) { self.holder = holder }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let url = action.request.url else { return .cancel }
            // Jumps within the same page (#section) stay on the page.
            if let current = webView.url, url.fragment != nil,
               url.absoluteString.components(separatedBy: "#").first == current.absoluteString.components(separatedBy: "#").first {
                return .allow
            }
            if action.navigationType == .linkActivated || action.targetFrame == nil {
                Router.shared.open(url)
                return .cancel
            }
            return .allow
        }

        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let u = navigationAction.request.url { Router.shared.open(u) }
            return nil
        }

        nonisolated func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            Task { @MainActor in
                guard let q = self.holder.pendingFind else { return }
                self.holder.pendingFind = nil
                try? await Task.sleep(nanoseconds: 250_000_000)
                self.holder.find(q)
            }
        }

        /// If iOS reclaims the web engine in the background, redraw the saved HTML.
        /// (A plain reload() would fetch the live web guide instead, which fails without signal.)
        nonisolated func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            Task { @MainActor in
                guard !self.loadedHTML.isEmpty else { return }
                webView.loadHTMLString(GuideWebView.wrap(self.loadedHTML), baseURL: Config.guideWeb)
            }
        }
    }
}
