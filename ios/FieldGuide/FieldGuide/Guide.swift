import Foundation

/// One guide page: one view of the Field Guide page in Experience Builder, with its HTML.
struct GuidePage: Identifiable, Hashable, Codable {
    let id: String          // Experience Builder view id, e.g. "view_6"
    let title: String       // menu label in ArcGIS
    let html: String        // the page's embed HTML, exactly as published
    let text: String        // plain text, for search
}

/// A menu group: "Start here", then the ArcGIS menu folders (Lifelines, Incidents, Operations).
struct GuideSection: Identifiable, Hashable, Codable {
    let id: String
    let title: String
    let pageIDs: [String]
}

struct Guide: Codable {
    var sections: [GuideSection] = []
    var pages: [String: GuidePage] = [:]
    var lifelineFormURL: URL?
    var lifelineFormTitle = "Update my lifeline"
    var publishedAt: Date?

    var isEmpty: Bool { pages.isEmpty }
}

enum GuideError: LocalizedError {
    case badFormat, noPages
    var errorDescription: String? {
        switch self {
        case .badFormat: return "The guide from ArcGIS wasn't in the expected format."
        case .noPages: return "The guide from ArcGIS had no pages."
        }
    }
}

/// Reads the published Experience Builder configuration and turns it into the guide.
/// Everything comes from ArcGIS: page names, menu order and folders, page HTML and the lifeline form link.
/// Rename, reorder, add or edit a page in the EM Field Guide, publish, and the app follows.
enum GuideParser {
    typealias JSON = [String: Any]

    static func parse(_ data: Data) throws -> Guide {
        guard let root = try JSONSerialization.jsonObject(with: data) as? JSON,
              let pages = root["pages"] as? [String: JSON],
              let views = root["views"] as? [String: JSON],
              let layouts = root["layouts"] as? [String: JSON],
              let widgets = root["widgets"] as? [String: JSON]
        else { throw GuideError.badFormat }

        func layoutIDs(_ value: Any?) -> [String] {
            guard let d = value as? [String: String] else { return [] }
            return ["LARGE", "MEDIUM", "SMALL"].compactMap { d[$0] }
        }

        func widgetIDs(inLayout id: String) -> [String] {
            guard let layout = layouts[id], let content = layout["content"] as? [String: JSON] else { return [] }
            let order = (layout["order"] as? [String]) ?? content.keys.sorted()
            return order.compactMap { content[$0]?["widgetId"] as? String }
        }

        func embed(in layout: Any?, type: String) -> JSON? {
            for lid in layoutIDs(layout) {
                for wid in widgetIDs(inLayout: lid) {
                    guard let w = widgets[wid], (w["uri"] as? String)?.contains("embed") == true,
                          let cfg = w["config"] as? JSON, (cfg["embedType"] as? String) == type else { continue }
                    return cfg
                }
            }
            return nil
        }

        func html(forView vid: String) -> String? {
            guard let v = views[vid], let cfg = embed(in: v["layout"], type: "code"),
                  let code = cfg["embedCode"] as? String, !code.isEmpty else { return nil }
            return code
        }

        func viewID(fromLink link: String?) -> String? {
            guard let link, let c = URLComponents(string: link) else { return nil }
            return c.queryItems?.first(where: { $0.name == "views" })?.value?
                .split(separator: ",").first.map(String.init)
        }

        var guide = Guide()
        var startHere: [String] = []
        var more: [String] = []
        var seenFolder = false

        func makePage(_ pid: String) -> String? {
            guard let p = pages[pid], (p["isVisible"] as? Bool) != false else { return nil }
            let label = (p["label"] as? String) ?? ""
            switch p["type"] as? String {
            case "LINK":
                guard let vid = viewID(fromLink: p["linkUrl"] as? String),
                      let code = html(forView: vid) else { return nil }
                if guide.pages[vid] == nil {
                    let title = label.isEmpty ? ((views[vid]?["label"] as? String) ?? "Guide") : label
                    guide.pages[vid] = GuidePage(id: vid, title: title, html: code, text: plainText(code))
                }
                return vid
            case "NORMAL":
                // A page holding a web-address embed is the lifeline form ("Update my lifeline").
                if let cfg = embed(in: p["layout"], type: "url"),
                   let u = url(fromExpression: cfg["expression"] as? String) {
                    guide.lifelineFormURL = u
                    if !label.isEmpty { guide.lifelineFormTitle = label }
                }
                return nil
            default:
                return nil
            }
        }

        let structure = (root["pageStructure"] as? [[String: [String]]]) ?? []
        for entry in structure {
            for (pid, children) in entry {
                let p = pages[pid] ?? [:]
                if (p["type"] as? String) == "FOLDER" {
                    guard (p["isVisible"] as? Bool) != false else { continue }
                    seenFolder = true
                    let ids = children.compactMap(makePage)
                    if !ids.isEmpty {
                        guide.sections.append(GuideSection(id: pid, title: (p["label"] as? String) ?? "Guide", pageIDs: ids))
                    }
                } else if let id = makePage(pid) {
                    if seenFolder { more.append(id) } else { startHere.append(id) }
                }
            }
        }
        if !startHere.isEmpty { guide.sections.insert(GuideSection(id: "start", title: "Start here", pageIDs: startHere), at: 0) }
        if !more.isEmpty { guide.sections.append(GuideSection(id: "more", title: "More", pageIDs: more)) }

        // Views that aren't in the menu still open when another page links to them.
        for (vid, v) in views where guide.pages[vid] == nil {
            if let code = html(forView: vid) {
                guide.pages[vid] = GuidePage(id: vid, title: (v["label"] as? String) ?? "Guide", html: code, text: plainText(code))
            }
        }

        if let ts = root["timestamp"] as? String, let ms = Double(ts) {
            guide.publishedAt = Date(timeIntervalSince1970: ms / 1000)
        } else if let ms = root["timestamp"] as? Double {
            guide.publishedAt = Date(timeIntervalSince1970: ms / 1000)
        }

        guard !guide.pages.isEmpty else { throw GuideError.noPages }
        return guide
    }

    /// The embed's address is stored as HTML, e.g. "<p>https://survey123…&amp;embed=fullscreen</p>".
    static func url(fromExpression s: String?) -> URL? {
        guard let s else { return nil }
        let t = decodeEntities(s.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard t.hasPrefix("http") else { return nil }
        return URL(string: t)
    }

    static func plainText(_ html: String) -> String {
        var s = html.replacingOccurrences(of: "(?is)<(style|script)[^>]*>.*?</\\1>", with: " ", options: .regularExpression)
        s = s.replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
        s = decodeEntities(s)
        return s.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
    }

    static func decodeEntities(_ input: String) -> String {
        var s = input
        let named: [String: String] = ["&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"",
                                       "&#39;": "'", "&apos;": "'", "&middot;": "·", "&mdash;": "—",
                                       "&ndash;": "–", "&rarr;": "→", "&hellip;": "…", "&bull;": "•"]
        for (k, v) in named where s.contains(k) { s = s.replacingOccurrences(of: k, with: v) }
        guard s.contains("&#") else { return s }
        let regex = try! NSRegularExpression(pattern: "&#(x?)([0-9a-fA-F]+);")
        let ns = s as NSString
        var out = ""
        var last = 0
        for m in regex.matches(in: s, range: NSRange(location: 0, length: ns.length)) {
            out += ns.substring(with: NSRange(location: last, length: m.range.location - last))
            let hex = ns.substring(with: m.range(at: 1)) == "x"
            let num = ns.substring(with: m.range(at: 2))
            if let code = UInt32(num, radix: hex ? 16 : 10), let scalar = Unicode.Scalar(code) {
                out += String(Character(scalar))
            }
            last = m.range.location + m.range.length
        }
        out += ns.substring(from: last)
        return out
    }
}
