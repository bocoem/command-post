import SwiftUI
import WebKit

/// A Survey123 form, the same one the web app's Submit and House Check pages embed.
/// Survey123 saves the report and starts its webhooks (the Stormwatch alert flows) itself,
/// so a report from this app follows exactly the same path as one from the web app.
struct SurveyTab: View {
    let title: String
    let url: URL
    @StateObject private var web = SurveyWeb()

    var body: some View {
        NavigationStack {
            SurveyWebView(web: web, url: url)
                .ignoresSafeArea(edges: .bottom)
                .overlay {
                    if let e = web.error {
                        VStack(spacing: 12) {
                            Image(systemName: "wifi.slash").font(.largeTitle).foregroundStyle(Theme.gold)
                            Text("The form couldn't load.").font(.headline)
                            Text(e).font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                            Text("Life safety goes over the radio first. Anything life-threatening goes through 911 Dispatch or your radio channel.")
                                .font(.footnote).multilineTextAlignment(.center).padding(.top, 4)
                            Button("Try again") { web.reload(url) }.buttonStyle(.borderedProminent)
                        }
                        .padding(28)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Theme.page)
                    }
                }
                .overlay(alignment: .top) {
                    if web.progress < 1 && web.error == nil {
                        ProgressView(value: web.progress).tint(Theme.gold)
                    }
                }
                .background(Theme.page)
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Button { web.reload(url) } label: { Label("Start a new form", systemImage: "arrow.counterclockwise") }
                            Link(destination: url) { Label("Open in Safari", systemImage: "safari") }
                        } label: { Image(systemName: "ellipsis.circle") }
                        .accessibilityLabel("Form options")
                    }
                }
        }
    }
}

@MainActor
final class SurveyWeb: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    @Published var progress: Double = 0
    @Published var error: String?
    let view: WKWebView
    private var observer: NSKeyValueObservation?

    override init() {
        let config = WKWebViewConfiguration()
        // Default data store: Survey123 keeps its remembered answers (your name and phone) between reports.
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        view = WKWebView(frame: .zero, configuration: config)
        super.init()
        view.navigationDelegate = self
        view.uiDelegate = self
        view.isOpaque = false
        view.backgroundColor = UIColor(Theme.page)
        view.scrollView.backgroundColor = UIColor(Theme.page)
        view.allowsBackForwardNavigationGestures = false
        observer = view.observe(\.estimatedProgress, options: [.new]) { [weak self] v, _ in
            Task { @MainActor in self?.progress = v.estimatedProgress }
        }
    }

    func load(_ url: URL) {
        guard view.url == nil else { return }
        error = nil
        view.load(URLRequest(url: url))
    }

    func reload(_ url: URL) {
        error = nil
        view.load(URLRequest(url: url, cachePolicy: .reloadRevalidatingCacheData))
    }

    nonisolated func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        Task { @MainActor in self.show(error) }
    }

    nonisolated func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        Task { @MainActor in self.show(error) }
    }

    nonisolated func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task { @MainActor in self.error = nil }
    }

    private func show(_ e: Error) {
        let ns = e as NSError
        if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return }
        error = ns.code == NSURLErrorNotConnectedToInternet
            ? "No connection. The form needs a connection to send, the same as the web app."
            : e.localizedDescription
    }

    /// Links that open a new window (help links, map attributions) open in Safari, not over the form.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = navigationAction.request.url { UIApplication.shared.open(u) }
        return nil
    }

    /// Camera for photo questions: allowed for the Survey123 site (iOS still asks the person the first time).
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(origin.host.hasSuffix("arcgis.com") ? .grant : .prompt)
    }
}

struct SurveyWebView: UIViewRepresentable {
    @ObservedObject var web: SurveyWeb
    let url: URL
    func makeUIView(context: Context) -> WKWebView {
        web.load(url)
        return web.view
    }
    func updateUIView(_ v: WKWebView, context: Context) {}
}

extension ReportForm {
    /// The same links the web app's Submit and House Check pages embed.
    var url: URL {
        URL(string: "https://survey123.arcgis.com/share/\(formItem)?portalUrl=https://botetourt.maps.arcgis.com&hide=footer")!
    }
}
