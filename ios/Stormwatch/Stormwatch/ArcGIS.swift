import Foundation

/// Minimal ArcGIS REST client for the Map and Reports pages. Read-only and anonymous: the app reads the
/// same public views as the web app. Reports are sent through the Survey123 forms, not from here.
enum ArcGIS {
    struct Failure: LocalizedError {
        let message: String
        /// True when trying again later could work (network down, server busy).
        let retryable: Bool
        var errorDescription: String? { message }
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
