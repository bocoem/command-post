import SwiftUI
import WebKit
import UIKit

/// The board itself: the same page as the website, built into the app (board.html), running in a web view.
/// The app gives the page its sign-in (window.BEACON_GATE) and answers its requests:
/// alarms, keep the screen on, keep a copy of the board in the app's own storage, share files, sign out.
struct BoardScreen: View {
    @EnvironmentObject var store: SessionStore
    @StateObject private var web = BoardWeb()
    @Environment(\.scenePhase) private var phase

    var body: some View {
        BoardWebView(web: web)
            .ignoresSafeArea()
            .background(Theme.page.ignoresSafeArea())
            .task(id: store.session?.email) {
                guard let s = store.session else { return }
                web.store = store
                Alarms.ask()
                await web.start(s)
            }
            .onChange(of: phase) { _, p in
                switch p {
                case .background: web.goingAway()
                case .active: web.back()
                default: break
                }
            }
            .sheet(item: $web.shareItem) { item in ShareSheet(urls: item.urls) }
    }
}

struct ShareItem: Identifiable { let id = UUID(); let urls: [URL] }

@MainActor
final class BoardWeb: NSObject, ObservableObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    let view: WKWebView
    weak var store: SessionStore?
    @Published var shareItem: ShareItem?
    private var started = false
    private var bgTask: UIBackgroundTaskIdentifier = .invalid

    override init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()          // the board's own saved boards and settings stay between launches
        config.allowsInlineMediaPlayback = true
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        view = WKWebView(frame: .zero, configuration: config)
        super.init()
        config.userContentController.add(self, name: "beacon")
        view.navigationDelegate = self
        view.uiDelegate = self
        view.isOpaque = false
        view.backgroundColor = UIColor(Theme.page)
        view.scrollView.backgroundColor = UIColor(Theme.page)
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.allowsBackForwardNavigationGestures = false
        if #available(iOS 16.4, *) { view.isInspectable = true }
    }

    func start(_ s: GateSession) async {
        var s = s
        // Ask the gate for this person's current level and layers. Offline: use the last copy and open anyway.
        if let me = await Gate.me(s.token) {
            let status = me["_status"] as? Int ?? 0
            if status == 401 || status == 403 { store?.signOut(); return }
            if status == 200 {
                if let t = me["token"] as? String, !t.isEmpty { s.token = t }
                s.level = me["level"] as? String ?? s.level
                s.name = me["name"] as? String ?? s.name
                s.layers = (me["layers"] as? [[String: Any]] ?? []).compactMap { $0["url"] as? String }
                if let k = me["kind"] as? String { s.kind = k }
                s.role = me["role"] as? String ?? s.role
                store?.set(s)
            }
        }
        guard !started else { return }
        started = true
        let ucc = view.configuration.userContentController
        ucc.removeAllUserScripts()
        ucc.addUserScript(WKUserScript(source: Self.bootScript(s), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        guard let url = Bundle.main.url(forResource: AppConfig.boardFile, withExtension: "html") else { return }
        view.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
    }

    /// Runs before the page: who is signed in, and any board in the app's own storage that the page has lost or has older.
    static func bootScript(_ s: GateSession) -> String {
        let gate: [String: Any] = ["url": AppConfig.gateURL.absoluteString, "token": s.token, "email": s.email, "name": s.name, "agency": s.agency,
                                   "level": s.level, "app": AppConfig.appKey, "incident": s.incident ?? NSNull(), "layers": s.layers.map { ["url": $0] },
                                   "kind": s.kind ?? "Person", "role": s.role ?? ""]
        BoardVault.prune()
        let saved = BoardVault.recent().map { ["id": $0.0.id, "updated": $0.0.updated, "json": $0.1] }
        let g = String(data: try! JSONSerialization.data(withJSONObject: gate), encoding: .utf8)!
        let v = String(data: (try? JSONSerialization.data(withJSONObject: saved)) ?? Data("[]".utf8), encoding: .utf8) ?? "[]"
        return """
        window.BEACON_GATE = \(g);
        (function () { try {
          var K = 'bcem.cp.incidents.v1', all = JSON.parse(localStorage.getItem(K) || '{}') || {}, saved = \(v), n = 0;
          saved.forEach(function (b) { var have = all[b.id]; if (!have || (have.updated || '') < (b.updated || '')) { all[b.id] = JSON.parse(b.json); n++; } });
          if (n) { localStorage.setItem(K, JSON.stringify(all)); window.BEACON_RESTORED = n; }
        } catch (e) {} })();
        """
    }

    // MARK: messages from the page
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        guard let b = m.body as? [String: Any], let type = b["type"] as? String else { return }
        switch type {
        case "backup":
            if let id = b["id"] as? String, let json = b["json"] as? String {
                BoardVault.save(id: id, name: b["name"] as? String ?? "", updated: b["updated"] as? String ?? "", status: b["status"] as? String ?? "", json: json)
            }
        case "alarms": Alarms.schedule(b["items"] as? [[String: Any]] ?? [])
        case "awake": UIApplication.shared.isIdleTimerDisabled = (b["on"] as? Bool) ?? false
        case "token": store?.refresh(token: b["token"] as? String, level: b["level"] as? String, name: b["name"] as? String)
        case "share":
            // one file (name + text) or several (files: [{name, text}])
            var list = (b["files"] as? [[String: Any]]) ?? []
            if list.isEmpty { list = [["name": b["name"] as? String ?? "board.txt", "text": b["text"] as? String ?? ""]] }
            let urls: [URL] = list.compactMap { f in
                let name = (f["name"] as? String ?? "board.txt").replacingOccurrences(of: "/", with: "-")
                let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
                guard (try? Data((f["text"] as? String ?? "").utf8).write(to: url, options: .atomic)) != nil else { return nil }
                return url
            }
            if !urls.isEmpty { shareItem = ShareItem(urls: urls) }
        case "print":
            printHTML(b["html"] as? String ?? "", name: b["name"] as? String ?? "Incident report")
        case "signin":
            // the gate no longer accepts this session (expired or access removed)
            if (b["reason"] as? String) != nil { store?.signOut() }
        case "signout":
            Alarms.clear(); UIApplication.shared.isIdleTimerDisabled = false; store?.signOut()
        default: break
        }
    }

    // MARK: app going to the background / coming back
    func goingAway() {
        // ask iPadOS for time to finish sending the last change to ArcGIS
        bgTask = UIApplication.shared.beginBackgroundTask(withName: "board-save") { [weak self] in self?.endBg() }
        view.evaluateJavaScript("try{document.dispatchEvent(new Event('visibilitychange'))}catch(e){}")
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in self?.endBg() }
    }
    func back() { view.evaluateJavaScript("try{CP.arc.connect()}catch(e){}") }
    private func endBg() { if bgTask != .invalid { UIApplication.shared.endBackgroundTask(bgTask); bgTask = .invalid } }

    // MARK: links: anything outside the board opens in Safari
    func webView(_ w: WKWebView, decidePolicyFor a: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let u = a.request.url else { return .cancel }
        if u.isFileURL {
            // the board's own links (e.g. "Full board") reload the built-in page with the same query
            if u.lastPathComponent == "commandboard.html", let page = Bundle.main.url(forResource: AppConfig.boardFile, withExtension: "html"),
               var c = URLComponents(url: page, resolvingAgainstBaseURL: false) {
                c.query = URLComponents(url: u, resolvingAgainstBaseURL: false)?.query
                if let to = c.url { w.loadFileURL(to, allowingReadAccessTo: page.deletingLastPathComponent()) }
                return .cancel
            }
            return .allow
        }
        if let sc = u.scheme?.lowercased(), ["mailto", "sms", "tel", "maps", "facetime"].contains(sc) { await UIApplication.shared.open(u); return .cancel }
        if u.scheme == "blob" || u.scheme == "data" || u.scheme == "about" { return .allow }
        if a.navigationType == .linkActivated || a.targetFrame == nil { await UIApplication.shared.open(u); return .cancel }
        return .allow
    }
    func webView(_ w: WKWebView, createWebViewWith c: WKWebViewConfiguration, for a: WKNavigationAction, windowFeatures f: WKWindowFeatures) -> WKWebView? {
        if let u = a.request.url, !u.isFileURL, u.scheme != "about", u.scheme != "blob" {
            UIApplication.shared.open(u) { [weak self] ok in
                // "Open MCI Board app" on an iPad that doesn't have it: say so instead of doing nothing
                if !ok, u.scheme == "beaconmci" { self?.notice("The MCI Board app isn't on this device. Install it from TestFlight, then tap Open MCI Board app again.") }
            }
        }
        return nil
    }
    // page dialogs: the board uses its own, but if a browser alert or confirm appears it must really be asked
    // (e.g. "changes not sent yet, sign out anyway?"), never answered "yes" on the person's behalf.
    func webView(_ w: WKWebView, runJavaScriptAlertPanelWithMessage msg: String, initiatedByFrame f: WKFrameInfo, completionHandler done: @escaping () -> Void) {
        let a = UIAlertController(title: nil, message: msg, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in done() })
        guard let vc = topController() else { done(); return }
        vc.present(a, animated: true)
    }
    func webView(_ w: WKWebView, runJavaScriptConfirmPanelWithMessage msg: String, initiatedByFrame f: WKFrameInfo, completionHandler done: @escaping (Bool) -> Void) {
        let a = UIAlertController(title: nil, message: msg, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in done(false) })
        a.addAction(UIAlertAction(title: "OK", style: .destructive) { _ in done(true) })
        guard let vc = topController() else { done(false); return }
        vc.present(a, animated: true)
    }
    private func notice(_ msg: String) {
        let a = UIAlertController(title: nil, message: msg, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default))
        topController()?.present(a, animated: true)
    }
    private func topController() -> UIViewController? {
        var vc = view.window?.rootViewController
        while let p = vc?.presentedViewController { vc = p }
        return vc
    }
    /// Print or save the incident report as a PDF (AirPrint, or Share → Save to Files from the print preview).
    private func printHTML(_ html: String, name: String) {
        guard !html.isEmpty else { return }
        let info = UIPrintInfo(dictionary: nil)
        info.outputType = .general
        info.jobName = name
        let pc = UIPrintInteractionController.shared
        pc.printInfo = info
        let fmt = UIMarkupTextPrintFormatter(markupText: html)
        fmt.perPageContentInsets = UIEdgeInsets(top: 36, left: 36, bottom: 36, right: 36)
        pc.printFormatter = fmt
        if UIDevice.current.userInterfaceIdiom == .pad {
            let r = CGRect(x: view.bounds.midX, y: view.bounds.maxY - 80, width: 1, height: 1)
            pc.present(from: r, in: view, animated: true)
        } else {
            pc.present(animated: true)
        }
    }
    // if the web content process is ever killed by iPadOS, reload the board (it reopens the open incident)
    func webViewWebContentProcessDidTerminate(_ w: WKWebView) { w.reload() }
}

struct BoardWebView: UIViewRepresentable {
    let web: BoardWeb
    func makeUIView(context: Context) -> WKWebView { web.view }
    func updateUIView(_ v: WKWebView, context: Context) {}
}

struct ShareSheet: UIViewControllerRepresentable {
    let urls: [URL]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: urls, applicationActivities: nil) }
    func updateUIViewController(_ c: UIActivityViewController, context: Context) {}
}
