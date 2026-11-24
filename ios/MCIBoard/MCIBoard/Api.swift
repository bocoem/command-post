import Foundation

/// Where each ArcGIS layer is (addresses come from the gate's /me answer; defaults until then).
struct Services: Equatable {
    var cp: String, patients: String, ops: String, prot: String, units: String

    static func from(_ layers: [String]) -> Services {
        let d = AppConfig.defaultServices
        func find(_ pattern: String, _ key: String) -> String {
            let hit = layers.first { $0.range(of: pattern, options: .regularExpression) != nil }
            return (hit ?? d[key] ?? "").replacingOccurrences(of: "https://", with: "").trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        }
        return Services(cp: find("BOCO_Command_Post/FeatureServer", "cp"), patients: find("PatientCare/FeatureServer", "patients"),
                        ops: find("BOCO_EM_Operations/FeatureServer", "ops"), prot: find("BOCO_EM_Protected/FeatureServer", "prot"),
                        units: find("CAD_Units[^/]*/FeatureServer", "units"))
    }
    var patientLayer: String { patients + "/\(AppConfig.patientLayer)" }
    var hospitalLayer: String { ops + "/\(AppConfig.hospitalLayer)" }
    var reunifyLayer: String { prot + "/\(AppConfig.reunifyLayer)" }
    var incidentLayer: String { cp + "/\(AppConfig.incidentLayer)" }
    var unitLayer: String { units + "/0" }
}

struct ArcError: LocalizedError {
    let message: String
    var code = 0
    var offline = false
    var errorDescription: String? { message }
}

/// ArcGIS through the BEACON gate. Every call is a POST, so no patient detail ever sits in a web address or a server log.
enum Api {
    private static let session: URLSession = {
        let c = URLSessionConfiguration.ephemeral          // nothing cached on disk by the network layer
        c.timeoutIntervalForRequest = 20
        c.waitsForConnectivity = false
        c.urlCache = nil
        return URLSession(configuration: c)
    }()
    private static let safe = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")

    static func form(_ p: [String: String]) -> Data {
        Data(p.map { ($0.key.addingPercentEncoding(withAllowedCharacters: safe) ?? "") + "=" + ($0.value.addingPercentEncoding(withAllowedCharacters: safe) ?? "") }
            .joined(separator: "&").utf8)
    }

    static func call(_ layer: String, _ op: String, _ params: [String: String], token: String) async throws -> [String: Any] {
        guard let url = URL(string: AppConfig.gateURL.absoluteString + "/arc/" + layer + (op.isEmpty ? "" : "/" + op)) else { throw ArcError(message: "Bad address") }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var p = params; p["f"] = "json"
        req.httpBody = form(p)
        let data: Data, resp: URLResponse
        do { (data, resp) = try await session.data(for: req) }
        catch { throw ArcError(message: "No connection", offline: true) }
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard let j = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
            throw ArcError(message: "Unexpected answer from the gate (\(status))", code: status, offline: status >= 500 || status == 0)
        }
        if let e = j["error"] as? [String: Any] {
            let code = AV.int(e["code"]) ?? status
            throw ArcError(message: AV.str(e["message"]) ?? "ArcGIS error", code: status == 401 ? 401 : code)
        }
        if status == 401 { throw ArcError(message: "Signed out", code: 401) }
        return j
    }

    static func query(_ layer: String, where w: String, fields: String = "*", order: String? = nil, geometry: Bool = false, extra: [String: String] = [:], token: String) async throws -> [[String: Any]] {
        var p = ["where": w, "outFields": fields, "returnGeometry": geometry ? "true" : "false", "resultRecordCount": "4000"]
        if geometry { p["outSR"] = "4326" }
        if let order { p["orderByFields"] = order }
        p.merge(extra) { _, b in b }
        let j = try await call(layer, "query", p, token: token)
        return (j["features"] as? [[String: Any]] ?? []).map { (f: [String: Any]) -> [String: Any] in
            var a = f["attributes"] as? [String: Any] ?? [:]
            if let g = f["geometry"] as? [String: Any] { a["_x"] = g["x"]; a["_y"] = g["y"] }
            return a
        }
    }

    private static func json(_ o: Any) -> String { String(data: (try? JSONSerialization.data(withJSONObject: o)) ?? Data("[]".utf8), encoding: .utf8) ?? "[]" }

    /// Adds one record; returns its OBJECTID.
    static func add(_ layer: String, _ attrs: [String: JV], lat: Double?, lon: Double?, token: String) async throws -> Int {
        var f: [String: Any] = ["attributes": attrs.mapValues { $0.any }]
        if let lat, let lon { f["geometry"] = ["x": lon, "y": lat, "spatialReference": ["wkid": 4326]] }
        let j = try await call(layer, "addFeatures", ["features": json([f]), "rollbackOnFailure": "true"], token: token)
        let r = (j["addResults"] as? [[String: Any]])?.first ?? [:]
        guard (r["success"] as? Bool) == true, let id = AV.int(r["objectId"]) else {
            throw ArcError(message: AV.str((r["error"] as? [String: Any])?["description"]) ?? "ArcGIS did not save it")
        }
        return id
    }

    static func update(_ layer: String, oid: Int, _ attrs: [String: JV], token: String) async throws {
        var a = attrs.mapValues { $0.any }; a["OBJECTID"] = oid
        let j = try await call(layer, "updateFeatures", ["features": json([["attributes": a]]), "rollbackOnFailure": "true"], token: token)
        let r = (j["updateResults"] as? [[String: Any]])?.first ?? [:]
        guard (r["success"] as? Bool) == true else {
            throw ArcError(message: AV.str((r["error"] as? [String: Any])?["description"]) ?? "ArcGIS did not save the change")
        }
    }

    static func sq(_ s: String) -> String { "'" + s.replacingOccurrences(of: "'", with: "''") + "'" }

    // MARK: what the app reads

    /// An add whose answer was lost: is it already in ArcGIS? (same incident, tag and triage time to the second)
    static func findPatient(_ s: Services, _ attrs: [String: JV], token: String) async throws -> Int? {
        guard case .s(let inc)? = attrs["incident_key"], case .s(let tag)? = attrs["tag_no"], case .d(let ms)? = attrs["triage_time"] else { return nil }
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm:ss"; f.timeZone = TimeZone(identifier: "UTC"); f.locale = Locale(identifier: "en_US_POSIX")
        let t = Date(timeIntervalSince1970: ms / 1000)
        let w = "incident_key = \(sq(inc)) AND tag_no = \(sq(tag)) AND triage_time >= TIMESTAMP '\(f.string(from: t.addingTimeInterval(-2)))' AND triage_time <= TIMESTAMP '\(f.string(from: t.addingTimeInterval(2)))'"
        return try await query(s.patientLayer, where: w, fields: "OBJECTID", token: token).compactMap { AV.int($0["OBJECTID"] ?? $0["objectid"]) }.first
    }

    static func patients(_ s: Services, incident: String, token: String) async throws -> [Patient] {
        try await query(s.patientLayer, where: "incident_key = " + sq(incident), order: "triage_time DESC", token: token).map(Patient.init(arc:))
    }

    /// Viewer: counts only, grouped by color, status and hospital (the gate refuses anything more).
    static func summary(_ s: Services, incident: String, token: String) async throws -> Summary {
        let stats = json([["statisticType": "count", "onStatisticField": "OBJECTID", "outStatisticFieldName": "n"]])
        let rows = try await query(s.patientLayer, where: "incident_key = " + sq(incident), fields: "", extra: ["outStatistics": stats, "groupByFieldsForStatistics": "triage,status,hospital"], token: token)
        var out = Summary()
        for r in rows {
            guard let t = Triage(rawValue: AV.str(r["triage"]) ?? ""), let n = AV.int(r["n"] ?? r["N"]) else { continue }
            let st = PtStatus(rawValue: AV.str(r["status"]) ?? "")
            if st == .error { continue }
            out.total += n; out.by[t, default: 0] += n
            if st?.moved == true {
                out.transported += n; out.moved[t, default: 0] += n
                if let h = AV.str(r["hospital"]) { out.byHospital[h, default: [:]][t, default: 0] += n }
            } else if st?.done != true {
                out.onScene += n; if t == .red || t == .yellow { out.waitingRY += n }
            }
        }
        return out
    }

    static func hospitals(_ s: Services, token: String) async throws -> [Hospital] {
        try await query(s.hospitalLayer, where: "1=1", order: "drive_min,name", token: token).map(Hospital.init(arc:))
    }

    static func units(_ s: Services, token: String) async throws -> [CadUnit] {
        let rows = try await query(s.unitLayer, where: "1=1", fields: "UnitID,StatusName,UnitTypeDesc,DeptName", token: token)
        return rows.compactMap { (a: [String: Any]) -> CadUnit? in
            guard let id = AV.str(a["UnitID"]) else { return nil }
            let u = CadUnit(id: id, status: AV.str(a["StatusName"]), dept: AV.str(a["DeptName"]), type: AV.str(a["UnitTypeDesc"]))
            let hay = [u.type, u.id].compactMap { $0 }.joined(separator: " ")
            return hay.range(of: "amb|medic|ems|rescue|als|bls", options: [.regularExpression, .caseInsensitive]) != nil ? u : nil
        }.sorted { $0.id.localizedStandardCompare($1.id) == .orderedAscending }
    }

    /// Open Command Post incidents.
    static func incidents(_ s: Services, token: String) async throws -> [Incident] {
        let base = "OBJECTID,incident_key,incident_number,incident_name,incident_type,start_time,location_desc"
        var rows: [[String: Any]]
        do { rows = try await query(s.incidentLayer, where: "closed_time IS NULL", fields: base + ",exercise", order: "start_time DESC", geometry: true, token: token) }
        catch let e as ArcError where !e.offline && e.code != 401 {
            rows = try await query(s.incidentLayer, where: "closed_time IS NULL", fields: base, order: "start_time DESC", geometry: true, token: token)
        }
        return rows.compactMap { (a: [String: Any]) -> Incident? in
            guard let key = AV.str(a["incident_key"]) else { return nil }
            return Incident(key: key, name: AV.str(a["incident_name"]) ?? key, number: AV.str(a["incident_number"]), type: AV.str(a["incident_type"]),
                            location: AV.str(a["location_desc"]), start: AV.date(a["start_time"]), exercise: AV.str(a["exercise"]) == "Yes",
                            standalone: false, lat: AV.dbl(a["_y"]), lon: AV.dbl(a["_x"]))
        }
    }

    /// MCIs started in this app (no Command Post incident) with patients in the last 3 days, so a second iPad can join.
    static func standaloneIncidents(_ s: Services, token: String) async throws -> [Incident] {
        let rows = try await query(s.patientLayer, where: "incident_key LIKE 'MCI-%' AND triage_time > CURRENT_TIMESTAMP - INTERVAL '3' DAY",
                                   fields: "incident_key,incident_name,practice", extra: ["returnDistinctValues": "true"], token: token)
        var seen = Set<String>()
        return rows.compactMap { (a: [String: Any]) -> Incident? in
            guard let key = AV.str(a["incident_key"]), seen.insert(key).inserted else { return nil }
            return Incident(key: key, name: AV.str(a["incident_name"]) ?? key, exercise: AV.str(a["practice"]) == "Yes", standalone: true)
        }
    }
}
