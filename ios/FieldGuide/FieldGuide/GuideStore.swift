import Foundation

/// Keeps the guide on the phone and in step with ArcGIS.
///
/// Open the app → the saved copy shows at once → a small check asks ArcGIS whether the
/// EM Field Guide was republished → only then is the new version downloaded and swapped in.
/// No signal: the saved copy keeps working. First launch with no signal: the copy built into the app.
@MainActor
final class GuideStore: ObservableObject {
    static let shared = GuideStore()

    @Published private(set) var guide = Guide()
    @Published private(set) var isLoaded = false
    @Published private(set) var isRefreshing = false
    @Published private(set) var lastChecked: Date?
    @Published private(set) var problem: String?
    @Published private(set) var offline = false

    private let defaults = UserDefaults.standard
    private let modifiedKey = "guide.itemModified"
    private let checkedKey = "guide.lastChecked"
    private var lastAttempt: Date?

    private static var cacheURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("guide-config.json")
    }

    init() {
        lastChecked = defaults.object(forKey: checkedKey) as? Date
    }

    /// Loads the saved copy (or the built-in one) off the main thread.
    func loadSaved() async {
        guard !isLoaded else { return }
        let cache = Self.cacheURL
        let (loaded, cacheDamaged): (Guide?, Bool) = await Task.detached(priority: .userInitiated) { () -> (Guide?, Bool) in
            var damaged = false
            if let d = try? Data(contentsOf: cache) {
                if let g = try? GuideParser.parse(d) { return (g, false) }
                damaged = true
            }
            if let u = Bundle.main.url(forResource: "GuideSeed", withExtension: "json"),
               let d = try? Data(contentsOf: u), let g = try? GuideParser.parse(d) { return (g, damaged) }
            return (nil, damaged)
        }.value
        if cacheDamaged {
            // Unreadable saved copy: drop it so the next check downloads the guide again.
            try? FileManager.default.removeItem(at: cache)
            defaults.removeObject(forKey: modifiedKey)
        }
        if let loaded, guide.isEmpty { guide = loaded }
        isLoaded = true
    }

    /// Checks ArcGIS for a newer published guide. `force` downloads it even if nothing changed.
    func refresh(force: Bool = false) async {
        if isRefreshing { return }
        if !force, let t = lastAttempt, Date().timeIntervalSince(t) < 60 { return }
        lastAttempt = Date()
        isRefreshing = true
        defer { isRefreshing = false }

        do {
            let modified = try await itemModified()
            let saved = defaults.object(forKey: modifiedKey) as? Double
            let haveCache = FileManager.default.fileExists(atPath: Self.cacheURL.path)
            if force || !haveCache || saved != modified {
                let (data, response) = try await Config.session.data(from: Config.publishedConfig)
                guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
                let parsed = try await Task.detached(priority: .userInitiated) { try GuideParser.parse(data) }.value
                try data.write(to: Self.cacheURL, options: .atomic)
                defaults.set(modified, forKey: modifiedKey)
                guide = parsed
            }
            lastChecked = Date()
            defaults.set(lastChecked, forKey: checkedKey)
            problem = nil
            offline = false
        } catch {
            let ns = error as NSError
            offline = ns.domain == NSURLErrorDomain &&
                [NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost,
                 NSURLErrorTimedOut, NSURLErrorCannotFindHost, NSURLErrorDataNotAllowed].contains(ns.code)
            problem = offline ? nil : error.localizedDescription
        }
    }

    private func itemModified() async throws -> Double {
        let (data, _) = try await Config.session.data(from: Config.itemInfo)
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let modified = json["modified"] as? Double else { throw GuideError.badFormat }
        return modified
    }

    // MARK: Search

    struct Hit: Identifiable {
        let page: GuidePage
        let section: String
        let snippet: String
        var id: String { page.id }
    }

    func search(_ query: String) -> [Hit] {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else { return [] }
        var titleHits: [Hit] = []
        var textHits: [Hit] = []
        for section in guide.sections {
            for id in section.pageIDs {
                guard let p = guide.pages[id] else { continue }
                if p.title.localizedCaseInsensitiveContains(q) {
                    titleHits.append(Hit(page: p, section: section.title, snippet: Self.snippet(p.text, q)))
                } else if p.text.localizedCaseInsensitiveContains(q) {
                    textHits.append(Hit(page: p, section: section.title, snippet: Self.snippet(p.text, q)))
                }
            }
        }
        return titleHits + textHits
    }

    static func snippet(_ text: String, _ q: String) -> String {
        guard let r = text.range(of: q, options: [.caseInsensitive, .diacriticInsensitive]) else {
            return String(text.prefix(140))
        }
        let start = text.index(r.lowerBound, offsetBy: -60, limitedBy: text.startIndex) ?? text.startIndex
        let end = text.index(r.upperBound, offsetBy: 100, limitedBy: text.endIndex) ?? text.endIndex
        let lead = start > text.startIndex ? "…" : ""
        let tail = end < text.endIndex ? "…" : ""
        return lead + String(text[start..<end]) + tail
    }
}
