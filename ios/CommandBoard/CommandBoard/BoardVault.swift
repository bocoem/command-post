import Foundation

/// The app's own copy of every open board, written on each change (a few seconds after it).
/// It lives in the app's Documents folder, apart from the web page's storage, so a board survives the page storage
/// being cleared. On launch, any board here that is newer than the page's copy is handed back to the page.
enum BoardVault {
    struct Entry: Codable { var id: String; var name: String; var updated: String; var status: String; var saved: Date }

    private static var dir: URL {
        let d = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Boards", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }
    private static func safe(_ id: String) -> String { id.replacingOccurrences(of: "[^A-Za-z0-9_-]", with: "_", options: .regularExpression) }

    static func save(id: String, name: String, updated: String, status: String, json: String) {
        let base = dir.appendingPathComponent(safe(id))
        let file = base.appendingPathExtension("json"), prev = base.appendingPathExtension("prev.json")
        // keep the previous copy too, in case the newest write is ever cut off
        if FileManager.default.fileExists(atPath: file.path) {
            try? FileManager.default.removeItem(at: prev)
            try? FileManager.default.copyItem(at: file, to: prev)
        }
        try? Data(json.utf8).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        var idx = index()
        idx.removeAll { $0.id == id }
        idx.append(Entry(id: id, name: name, updated: updated, status: status, saved: Date()))
        if let d = try? JSONEncoder().encode(idx) { try? d.write(to: dir.appendingPathComponent("index.json"), options: .atomic) }
    }

    static func index() -> [Entry] {
        guard let d = try? Data(contentsOf: dir.appendingPathComponent("index.json")) else { return [] }
        return (try? JSONDecoder().decode([Entry].self, from: d)) ?? []
    }

    static func json(_ id: String) -> String? {
        let base = dir.appendingPathComponent(safe(id))
        for u in [base.appendingPathExtension("json"), base.appendingPathExtension("prev.json")] {
            if let d = try? Data(contentsOf: u), let s = String(data: d, encoding: .utf8), (try? JSONSerialization.jsonObject(with: d)) != nil { return s }
        }
        return nil
    }

    /// Remove copies of boards not saved for 30 days (they are in ArcGIS and the page's own storage).
    static func prune(olderThan days: Double = 30) {
        let cut = Date().addingTimeInterval(-days * 86400)
        var idx = index(), keep: [Entry] = []
        for e in idx {
            if e.saved < cut {
                let base = dir.appendingPathComponent(safe(e.id))
                try? FileManager.default.removeItem(at: base.appendingPathExtension("json"))
                try? FileManager.default.removeItem(at: base.appendingPathExtension("prev.json"))
            } else { keep.append(e) }
        }
        if keep.count != idx.count { idx = keep; if let d = try? JSONEncoder().encode(idx) { try? d.write(to: dir.appendingPathComponent("index.json"), options: .atomic) } }
    }

    /// Open boards from the last 3 days, for the page to compare with its own copies at launch.
    static func recent() -> [(Entry, String)] {
        let cut = Date().addingTimeInterval(-3 * 86400)
        return index().filter { $0.status != "Closed" && $0.saved > cut }.compactMap { e in json(e.id).map { (e, $0) } }
    }
}
