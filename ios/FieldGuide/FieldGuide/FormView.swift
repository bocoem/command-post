import SwiftUI
import WebKit

/// "Update my lifeline": the same public Survey123 Lifeline Report form the EM Field Guide embeds.
/// Its address is read from the guide in ArcGIS. Survey123 saves the report and starts the
/// Teams alert and Lifeline Status flow, so a report from the app takes the same path as one from the web.
struct FormView: View {
    @EnvironmentObject private var store: GuideStore
    @StateObject private var web = FormWeb()

    var body: some View {
        Group {
            if let url = store.guide.lifelineFormURL {
                FormWebView(web: web, url: url)
                    .ignoresSafeArea(edges: .bottom)
                    .overlay {
                        if let e = web.error {
                            VStack(spacing: 12) {
                                Image(systemName: "wifi.slash").font(.largeTitle).foregroundStyle(Theme.gold)
                                Text("THE FORM COULDN'T LOAD").font(BrandFont.display(24))
                                Text(e).font(.footnote).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                                Text("Report urgent lifeline changes to the EOC by phone or radio.")
                                    .font(.footnote).multilineTextAlignment(.center).padding(.top, 4)
                                Button("Try again") { web.reload(url) }.buttonStyle(.borderedProminent).tint(Theme.red).foregroundStyle(.white)
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
            } else {
                ContentUnavailableView("Form not found",
                                       systemImage: "square.and.pencil",
                                       description: Text("The EM Field Guide in ArcGIS has no lifeline form page."))
            }
        }
        .background(Theme.page)
        .navigationTitle(store.guide.lifelineFormTitle.uppercased())
        .navigationBarTitleDisplayMode(.inline)
    }
}

@MainActor
final class FormWeb: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    @Published var progress: Double = 0
    @Published var error: String?
    let view: WKWebView
    private var observer: NSKeyValueObservation?

    override init() {
        let config = WKWebViewConfiguration()
        // Default data store: Survey123 remembers the lead's name and agency between reports.
        config.websiteDataStore = .default()
        view = WKWebView(frame: .zero, configuration: config)
        super.init()
        view.navigationDelegate = self
        view.uiDelegate = self
        view.isOpaque = false
        view.backgroundColor = UIColor(Theme.page)
        view.scrollView.backgroundColor = UIColor(Theme.page)
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
            ? "No connection. The form needs signal to send, the same as on the web."
            : e.localizedDescription
    }

    /// Help links and attributions open in Safari, not over the form.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = navigationAction.request.url { UIApplication.shared.open(u) }
        return nil
    }

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let host = origin.host.lowercased()
        let survey123 = host == "arcgis.com" || host.hasSuffix(".arcgis.com")
        decisionHandler(survey123 ? .grant : .prompt)
    }
}

struct FormWebView: UIViewRepresentable {
    @ObservedObject var web: FormWeb
    let url: URL
    func makeUIView(context: Context) -> WKWebView {
        web.load(url)
        return web.view
    }
    func updateUIView(_ v: WKWebView, context: Context) {}
}
