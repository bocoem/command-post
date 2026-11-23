import Foundation

/// Minimal ArcGIS REST client. Everything here is anonymous: the app reads public views and sends to
/// the public, add-only Survey123 layers, the same as the web app.
enum ArcGIS {
    struct Failure: LocalizedError {
        let message: String
        /// True when trying again later could work (network down, server busy).
        let retryable: Bool
        var errorDescription: String? { message }
    }

    struct Photo {
        let globalId: UUID
        let name: String
        let jpeg: Data
    }

    struct AddResult {
        let objectId: Int?
        let globalId: String
        let attachments: [(globalId: String, objectId: Int?)]
    }

    // MARK: Requests

    static func call(_ url: URL, _ params: [String: String], post: Bool = true) async throws -> [String: Any] {
        var p = params
        p["f"] = "json"
        var req: URLRequest
        if post {
            req = URLRequest(url: url, timeoutInterval: 60)
            req.httpMethod = "POST"
            req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            req.httpBody = formBody(p)
        } else {
            var c = URLComponents(url: url, resolvingAgainstBaseURL: false)!
            c.queryItems = p.map { URLQueryItem(name: $0.key, value: $0.value) }
            req = URLRequest(url: c.url!, timeoutInterval: 30)
        }
        let data: Data
        let resp: URLResponse
        do { (data, resp) = try await URLSession.shared.data(for: req) }
        catch { throw Failure(message: "No connection to ArcGIS (\(error.localizedDescription)).", retryable: true) }
        if let h = resp as? HTTPURLResponse, h.statusCode >= 500 || h.statusCode == 429 {
            throw Failure(message: "ArcGIS is busy (HTTP \(h.statusCode)).", retryable: true)
        }
        guard let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw Failure(message: "ArcGIS sent back something unreadable.", retryable: true)
        }
        if let e = j["error"] as? [String: Any] {
            let code = e["code"] as? Int ?? 0
            let msg = (e["message"] as? String ?? "ArcGIS error") + ((e["details"] as? [String])?.first.map { " (\($0))" } ?? "")
            throw Failure(message: msg, retryable: code >= 500 || code == 0)
        }
        return j
    }

    static func formBody(_ p: [String: String]) -> Data {
        // Encode everything except unreserved characters, so JSON and base64 survive intact.
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        let s = p.map { "\($0.key.addingPercentEncoding(withAllowedCharacters: allowed)!)=\($0.value.addingPercentEncoding(withAllowedCharacters: allowed)!)" }
            .joined(separator: "&")
        return Data(s.utf8)
    }

    static func gid(_ u: UUID) -> String { "{\(u.uuidString.uppercased())}" }

    /// Sends one report and its photos in a single request, the way Survey123 does.
    /// The report's own ID is its GlobalID and each photo has its own, so if the answer is lost and the
    /// report is sent again, ArcGIS refuses the copy instead of saving it twice.
    static func submit(layer: URL, globalId: UUID, attributes: [String: Any], lat: Double, lng: Double, photos: [Photo], keyword: String?) async throws -> AddResult {
        var a = attributes
        a["globalid"] = gid(globalId)
        let geometry: [String: Any] = ["x": lng, "y": lat, "spatialReference": ["wkid": 4326]]
        let feature: [String: Any] = ["attributes": a, "geometry": geometry]
        var p: [String: String] = [
            "adds": String(data: try JSONSerialization.data(withJSONObject: [feature]), encoding: .utf8)!,
            "useGlobalIds": "true",
            "rollbackOnFailure": "true"
        ]
        if !photos.isEmpty {
            let adds: [[String: Any]] = photos.map { ph in
                var x: [String: Any] = ["globalId": gid(ph.globalId), "parentGlobalId": gid(globalId), "contentType": "image/jpeg",
                                        "name": ph.name, "data": ph.jpeg.base64EncodedString()]
                if let keyword { x["keywords"] = keyword }
                return x
            }
            p["attachments"] = String(data: try JSONSerialization.data(withJSONObject: ["adds": adds]), encoding: .utf8)!
        }
        let j = try await call(layer.appendingPathComponent("applyEdits"), p)
        let r = (j["addResults"] as? [[String: Any]])?.first ?? [:]
        let atts = (j["attachments"] as? [String: Any])?["addResults"] as? [[String: Any]] ?? []
        if r["success"] as? Bool == true {
            return AddResult(objectId: r["objectId"] as? Int, globalId: r["globalId"] as? String ?? gid(globalId),
                             attachments: atts.map { (globalId: $0["globalId"] as? String ?? "", objectId: $0["objectId"] as? Int) })
        }
        let err = r["error"] as? [String: Any] ?? (atts.first { $0["success"] as? Bool == false }?["error"] as? [String: Any]) ?? [:]
        let desc = err["description"] as? String ?? "ArcGIS refused the report."
        let code = err["code"] as? Int ?? 0
        // ArcGIS says: "Cannot insert duplicate key row ... unique index '..._globalid'" (code 1000).
        // That means an earlier try was saved and only its answer was lost.
        if desc.localizedCaseInsensitiveContains("globalid") && (desc.localizedCaseInsensitiveContains("duplicate") || desc.localizedCaseInsensitiveContains("exist")) {
            return AddResult(objectId: nil, globalId: gid(globalId), attachments: [])
        }
        throw Failure(message: "\(desc) (code \(code))", retryable: code >= 500)
    }

    /// Reads a public layer, newest first.
    static func query(_ layer: URL, where clause: String = "1=1", order: String = "CreationDate DESC", max: Int = 200) async throws -> [[String: Any]] {
        let p = ["where": clause, "outFields": "*", "returnGeometry": "true", "outSR": "4326",
                 "orderByFields": order, "resultRecordCount": "\(max)"]
        let j = try await call(layer.appendingPathComponent("query"), p, post: false)
        return j["features"] as? [[String: Any]] ?? []
    }

    /// Public URLs of a report's photos.
    static func photoURLs(_ layer: URL, objectId: Int) async throws -> [URL] {
        let j = try await call(layer.appendingPathComponent("\(objectId)/attachments"), [:], post: false)
        let infos = j["attachmentInfos"] as? [[String: Any]] ?? []
        return infos.filter { ($0["contentType"] as? String ?? "image").hasPrefix("image") }
            .compactMap { $0["id"] as? Int }
            .map { layer.appendingPathComponent("\(objectId)/attachments/\($0)") }
    }
}
