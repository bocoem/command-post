import Foundation
import UIKit
import SwiftUI
import CoreLocation

/// One report on the Map or Reports page.
struct StormReport: Identifiable, Codable, Hashable {
    let source: StormSource
    let objectId: Int
    let typeCode: String
    let title: String
    let comments: String
    let created: Date
    let lat: Double
    let lng: Double
    /// Attachment IDs of the report's photos, newest list from queryAttachments.
    var photoIds: [Int] = []

    var id: String { "\(source.rawValue)-\(objectId)" }
    var coordinate: CLLocationCoordinate2D { .init(latitude: lat, longitude: lng) }
    /// Photo addresses, resized by ArcGIS to the width asked for (the same photos the web app shows).
    func photoURLs(width: Int) -> [URL] {
        photoIds.map { source.url.appendingPathComponent("\(objectId)/attachments/\($0)").appending(queryItems: [URLQueryItem(name: "w", value: "\(width)")]) }
    }
    /// The web map's symbol key: Lower(Replace(Trim(DefaultValue($feature.type,'other')),' ','_'))
    var symbolKey: String {
        let t = typeCode.trimmingCharacters(in: .whitespaces)
        return (t.isEmpty ? "other" : t).replacingOccurrences(of: " ", with: "_").lowercased()
    }
    /// "Thu Nov 12, 2026 4:05 PM", the web pop-up's date format.
    var whenText: String {
        let f = DateFormatter()
        f.dateFormat = "EEE MMM d, yyyy h:mm a"
        return f.string(from: created)
    }
}

/// The reports and map symbols the web app shows, read from the same public web map and views.
/// Kept on the phone, so the Map and Reports pages still open without a connection.
@MainActor
final class Feed: ObservableObject {
    static let shared = Feed()

    struct Symbol: Codable { let key: String; let label: String; let png: Data }

    @Published private(set) var reports: [StormSource: [StormReport]] = [:]
    @Published private(set) var symbols: [Symbol] = []
    @Published private(set) var updated: Date?
    @Published private(set) var loading = false
    @Published private(set) var error: String?

    private let dir: URL
    private var imageCache: [String: UIImage] = [:]

    init() {
        dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("Feed", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        if let d = try? Data(contentsOf: dir.appendingPathComponent("reports.json")),
           let saved = try? JSONDecoder().decode([String: [StormReport]].self, from: d) {
            for (k, v) in saved { if let s = StormSource(rawValue: k) { reports[s] = v } }
        }
        if let d = try? Data(contentsOf: dir.appendingPathComponent("symbols.json")),
           let s = try? JSONDecoder().decode([Symbol].self, from: d) { symbols = s }
        updated = UserDefaults.standard.object(forKey: "feed.updated") as? Date
    }
    }

    var all: [StormReport] { StormSource.allCases.flatMap { reports[$0] ?? [] } }

    /// The map symbol for a report, the same picture the web map uses. Unknown types use the "Other" symbol.
    func image(for key: String) -> UIImage? {
        if let i = imageCache[key] { return i }
        guard let s = symbols.first(where: { $0.key == key }) ?? symbols.first(where: { $0.key == "other" }),
              let img = UIImage(data: s.png, scale: 3) else { return nil }
        imageCache[key] = img
        return img
    }

    func refresh() async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        var errs: [String] = []
        if symbols.isEmpty || (updated ?? .distantPast) < Date().addingTimeInterval(-86400) {
            do { try await loadSymbols() } catch { errs.append("Map symbols: \(error.localizedDescription)") }
        }
        for s in StormSource.allCases {
            do {
                let labels = try await domainLabels(s)
                let feats = try await ArcGIS.query(s.url)
                let photos = (try? await ArcGIS.photoIndex(s.url)) ?? [:]
                reports[s] = feats.compactMap { f -> StormReport? in
                    guard var r = report(from: f, source: s, labels: labels) else { return nil }
                    r.photoIds = photos[r.objectId] ?? []
                    return r
                }
            } catch {
                errs.append("\(s.title): \(error.localizedDescription)")
            }
        }
        error = errs.isEmpty ? nil : errs.joined(separator: "\n")
        if errs.count < StormSource.allCases.count {
            updated = Date()
            UserDefaults.standard.set(updated, forKey: "feed.updated")
            var out: [String: [StormReport]] = [:]
            for (k, v) in reports { out[k.rawValue] = v }
            try? JSONEncoder().encode(out).write(to: dir.appendingPathComponent("reports.json"))
        }
    }

    /// Type names from the layer's choice list, like the web pop-up's DomainName($feature,'type').
    private var labelCache: [StormSource: [String: String]] = [:]
    private func domainLabels(_ s: StormSource) async throws -> [String: String] {
        if let c = labelCache[s] { return c }
        let j = try await ArcGIS.call(s.url, [:], post: false)
        var m: [String: String] = [:]
        for f in j["fields"] as? [[String: Any]] ?? [] where (f["name"] as? String)?.lowercased() == "type" {
            for cv in (f["domain"] as? [String: Any])?["codedValues"] as? [[String: Any]] ?? [] {
                m["\(cv["code"] ?? "")"] = cv["name"] as? String
            }
        }
        labelCache[s] = m
        return m
    }

    private func report(from f: [String: Any], source: StormSource, labels: [String: String]) -> StormReport? {
        let a = f["attributes"] as? [String: Any] ?? [:]
        let g = f["geometry"] as? [String: Any] ?? [:]
        guard let x = g["x"] as? Double, let y = g["y"] as? Double else { return nil }
        func s(_ k: String) -> String { (a.first { $0.key.lowercased() == k }?.value as? String) ?? "" }
        let oid = a.first { $0.key.lowercased() == "objectid" }?.value as? Int ?? 0
        let code = s("type")
        // The web pop-up title: the type's name, or what was typed in for "Other".
        var title = labels[code] ?? code
        if code.lowercased() == "other", !s("type_other").isEmpty { title = s("type_other") }
        if title.isEmpty { title = "Storm report" }
        let ms = a.first { $0.key.lowercased() == "creationdate" }?.value as? Double ?? 0
        return StormReport(source: source, objectId: oid, typeCode: code, title: title, comments: s("comments"),
                           created: Date(timeIntervalSince1970: ms / 1000), lat: y, lng: x)
    }

    /// Symbols and their labels from the web map's renderer (picture markers stored in the map itself).
    private func loadSymbols() async throws {
        let url = Config.portal.appendingPathComponent("sharing/rest/content/items/\(Config.webMapItem)/data")
        let j = try await ArcGIS.call(url, [:], post: false)
        let layers = j["operationalLayers"] as? [[String: Any]] ?? []
        guard let r = layers.lazy.compactMap({ (($0["layerDefinition"] as? [String: Any])?["drawingInfo"] as? [String: Any])?["renderer"] as? [String: Any] }).first(where: { $0["uniqueValueInfos"] != nil })
        else { return }
        var out: [Symbol] = []
        for u in r["uniqueValueInfos"] as? [[String: Any]] ?? [] {
            if let v = u["value"] as? String, let sym = u["symbol"] as? [String: Any],
               let b64 = sym["imageData"] as? String, let png = Data(base64Encoded: b64) {
                out.append(Symbol(key: v, label: u["label"] as? String ?? v, png: png))
            }
        }
        if let sym = r["defaultSymbol"] as? [String: Any], let b64 = sym["imageData"] as? String, let png = Data(base64Encoded: b64) {
            out.append(Symbol(key: "other", label: r["defaultLabel"] as? String ?? "Other", png: png))
        }
        guard !out.isEmpty else { return }
        symbols = out
        imageCache = [:]
        try? JSONEncoder().encode(out).write(to: dir.appendingPathComponent("symbols.json"))
    }
}

/// Web app colors (from the Stormwatch Responder pages).
enum Theme {
    static let page = Color(red: 0x0A / 255, green: 0x17 / 255, blue: 0x24 / 255)    // #0A1724
    static let card = Color(red: 0x0E / 255, green: 0x20 / 255, blue: 0x33 / 255)    // #0E2033
    static let border = Color(red: 0x23 / 255, green: 0x47 / 255, blue: 0x6B / 255)  // #23476B
    static let gold = Color(red: 0xFD / 255, green: 0xB8 / 255, blue: 0x33 / 255)    // #FDB833
    static let red = Color(red: 0xD0 / 255, green: 0x21 / 255, blue: 0x29 / 255)     // #D02129
    static let blue = Color(red: 0x2E / 255, green: 0x31 / 255, blue: 0x92 / 255)    // #2E3192
    static let muted = Color(red: 0xA9 / 255, green: 0xB8 / 255, blue: 0xC8 / 255)   // #A9B8C8
    static let soft = Color(red: 0xC9 / 255, green: 0xD3 / 255, blue: 0xDE / 255)    // #C9D3DE
    static let accent = gold
    static let navy = Color(red: 0x0E / 255, green: 0x20 / 255, blue: 0x33 / 255)   // Blue Ridge Navy, #0E2033
    static let slate = Color(red: 0x33 / 255, green: 0x44 / 255, blue: 0x5A / 255)  // Ridge Slate, #33445A
}
