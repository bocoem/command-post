import Foundation

/// Starts the Stormwatch alert flow in Power Automate for a saved report.
/// On the web, Survey123 starts these flows with its webhook after each submission. Reports from this
/// app go straight to the same layer, not through Survey123, so the app sends the same webhook message itself.
enum Alerts {
    struct Failure: LocalizedError {
        let message: String
        let retryable: Bool
        var errorDescription: String? { message }
    }

    /// Returns a note when no alert was sent on purpose (no flow address in this copy), nil when it went out.
    static func send(_ r: PendingReport) async throws -> String? {
        // House checks have no alert flow (same as the web form).
        guard let key = r.kind.flowKey else { return nil }
        guard let url = Config.secret(key) else {
            return "Saved. This copy of the app has no alert address (Secrets.plist), so no alert was sent."
        }
        var req = URLRequest(url: url, timeoutInterval: 30)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: payload(r))
        let data: Data
        let resp: URLResponse
        do { (data, resp) = try await URLSession.shared.data(for: req) }
        catch { throw Failure(message: "No connection to Power Automate (\(error.localizedDescription)).", retryable: true) }
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        if (200..<300).contains(code) { return nil }
        let text = String(data: data.prefix(300), encoding: .utf8) ?? ""
        // 408, 429 and 5xx clear up on their own; other answers mean the flow refused this message.
        throw Failure(message: "Power Automate answered HTTP \(code). \(text)", retryable: code == 408 || code == 429 || code >= 500)
    }

    /// The Survey123 webhook message ("addData" event), filled in from the saved report.
    static func payload(_ r: PendingReport) -> [String: Any] {
        let gid = ArcGIS.gid(r.id)
        let oid: Any = r.objectId.map { $0 as Any } ?? NSNull()
        let created = Int((r.sentAt ?? Date()).timeIntervalSince1970 * 1000)
        var attrs: [String: Any] = [:]
        for (k, v) in r.values { attrs[k] = v }
        attrs["globalid"] = gid
        attrs["objectid"] = oid
        attrs["CreationDate"] = created
        attrs["EditDate"] = created
        attrs["Creator"] = ""
        attrs["Editor"] = ""
        let geometry: [String: Any] = ["x": r.lng, "y": r.lat, "spatialReference": ["wkid": 4326]]
        let layer = r.kind.submitLayer.absoluteString

        var photos: [[String: Any]] = []
        for (i, p) in r.photos.enumerated() {
            var a: [String: Any] = ["globalId": ArcGIS.gid(p.id), "name": "\(r.photoKeyword ?? "photo")-\(i + 1).jpg",
                                    "contentType": "image/jpeg", "keywords": r.photoKeyword ?? "photo",
                                    "parentGlobalId": gid]
            if let oid = r.objectId { a["parentObjectId"] = oid }
            if let aid = p.objectId, let oid = r.objectId {
                a["id"] = aid
                a["url"] = "\(layer)/\(oid)/attachments/\(aid)"
            }
            photos.append(a)
        }

        var feature: [String: Any] = [
            "attributes": attrs,
            "geometry": geometry,
            "layerInfo": ["id": 0, "name": "survey", "type": "Feature Layer", "globalIdField": "globalid", "objectIdField": "objectid"] as [String: Any],
            "result": ["globalId": gid, "objectId": oid, "uniqueId": oid, "success": true] as [String: Any]
        ]
        if !photos.isEmpty { feature["attachments"] = [r.photoKeyword ?? "photo": photos] }

        var addAttrs = attrs
        addAttrs.removeValue(forKey: "objectid")
        return [
            "eventType": "addData",
            "feature": feature,
            "applyEdits": [["id": 0, "adds": [["attributes": addAttrs, "geometry": geometry] as [String: Any]]] as [String: Any]],
            "edits": [["id": 0, "addResults": [["objectId": oid, "globalId": gid, "success": true] as [String: Any]]] as [String: Any]],
            "surveyInfo": [
                "formItemId": r.kind.formItem,
                "formTitle": r.kind.formTitle,
                "serviceItemId": r.kind.serviceItem,
                "serviceUrl": String(layer.dropLast(2))
            ],
            "portalInfo": ["url": Config.portal.absoluteString],
            "userInfo": ["username": "", "fullName": r.values.first { $0.key.lowercased() == "name" }?.value ?? ""],
            "source": "Stormwatch app"
        ]
    }
}
