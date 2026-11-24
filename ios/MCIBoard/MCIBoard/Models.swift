import SwiftUI

// MARK: - Access level (from the gate; mci_level column of BEACON_App_Access)

struct Level: Equatable {
    static let order = ["None", "Guest", "Viewer", "Officer", "Command", "Chief", "Admin"]
    let name: String
    let rank: Int
    init(_ s: String?) { name = s ?? "None"; rank = Level.order.firstIndex(of: s ?? "None") ?? 0 }
    /// Officer and up: triage, update, transport, hospital board.
    var canEdit: Bool { rank >= 3 }
    /// Command and up: patient names, Reunification hand-off, patient report, marking a record entered in error.
    var names: Bool { rank >= 4 }
    /// Viewer: counts only (by color, status, hospital), never patient rows.
    var countsOnly: Bool { rank < 3 }
}

// MARK: - Triage and status (same words as the EM Ops schema, so the web MCI page, Command Board and dashboards agree)

enum Triage: String, CaseIterable, Identifiable, Codable {
    case red = "Immediate (Red)", yellow = "Delayed (Yellow)", green = "Minor (Green)", gray = "Expectant (Gray)", black = "Deceased (Black)"
    var id: String { rawValue }
    var short: String { switch self { case .red: return "RED"; case .yellow: return "YELLOW"; case .green: return "GREEN"; case .gray: return "GRAY"; case .black: return "BLACK" } }
    var word: String { switch self { case .red: return "Immediate"; case .yellow: return "Delayed"; case .green: return "Minor"; case .gray: return "Expectant"; case .black: return "Deceased" } }
    var color: Color { switch self { case .red: return Theme.tRed; case .yellow: return Theme.tYellow; case .green: return Theme.tGreen; case .gray: return Theme.tGray; case .black: return Theme.tBlack } }
    var ink: Color { self == .yellow ? .black : .white }
    var order: Int { Triage.allCases.firstIndex(of: self) ?? 9 }
    /// Hospital board capacity column for this color (gray and black aren't transported to an ED).
    var capField: String? { switch self { case .red: return "cap_red"; case .yellow: return "cap_yellow"; case .green: return "cap_green"; default: return nil } }
}

enum PtStatus: String, CaseIterable, Identifiable {
    case onScene = "On scene", treatment = "Treatment area", awaiting = "Awaiting transport", transported = "Transported",
         arrived = "Arrived at hospital", released = "Released on scene", refused = "Refused", deceased = "Deceased", error = "Entered in error"
    var id: String { rawValue }
    /// No longer waiting on scene.
    var done: Bool { [.transported, .arrived, .released, .refused, .deceased, .error].contains(self) }
    var moved: Bool { self == .transported || self == .arrived }
    var color: Color {
        switch self {
        case .onScene: return Theme.muted
        case .treatment: return Theme.gold
        case .awaiting: return Color.orange
        case .transported: return Theme.blue
        case .arrived: return Theme.ok
        case .released, .refused: return Theme.muted
        case .deceased: return Theme.tGray
        case .error: return Theme.red
        }
    }
    /// What someone on scene can pick (entered in error is Command only, from the patient screen).
    static var pickable: [PtStatus] { allCases.filter { $0 != .error } }
}

enum Lists {
    static let ageGroups = ["Adult", "Child (1-8)", "Infant (<1)", "Unknown"]
    static let sexes = ["Male", "Female", "Unknown"]
    static let hospStatus = ["Open", "Limited", "Diversion", "Closed", "Unknown"]
    /// Hospitals named in the county EOP (added from the Hospitals screen when the board is empty).
    static let eopHospitals = [("Carilion Roanoke Memorial Hospital", "Level I trauma"), ("LewisGale Medical Center", "Level II trauma")]
}

/// EOP MCI levels (same thresholds as EM Ops and Command Board).
enum MCILevel {
    static func of(_ n: Int) -> Int { n >= 101 ? 1 : n >= 31 ? 2 : n >= 16 ? 3 : 4 }
    static func range(_ l: Int) -> String { ["", "101+ patients", "31–100 patients", "16–30 patients", "up to 15 patients"][max(1, min(4, l))] }
}

// MARK: - A stored value for ArcGIS attributes (so unsent edits can be saved to disk)

enum JV: Codable, Equatable {
    case s(String), d(Double), null
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let d = try? c.decode(Double.self) { self = .d(d) }
        else { self = .s(try c.decode(String.self)) }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self { case .s(let x): try c.encode(x); case .d(let x): try c.encode(x); case .null: try c.encodeNil() }
    }
    var any: Any { switch self { case .s(let x): return x; case .d(let x): return x; case .null: return NSNull() } }
    static func str(_ s: String?) -> JV { let t = (s ?? "").trimmingCharacters(in: .whitespacesAndNewlines); return t.isEmpty ? .null : .s(t) }
    static func num(_ n: Int?) -> JV { n.map { .d(Double($0)) } ?? .null }
    static func time(_ d: Date?) -> JV { d.map { .d(($0.timeIntervalSince1970 * 1000).rounded()) } ?? .null }
}

/// Reading ArcGIS JSON (numbers arrive as NSNumber, dates as epoch milliseconds).
enum AV {
    static func str(_ v: Any?) -> String? { if let s = v as? String { let t = s.trimmingCharacters(in: .whitespaces); return t.isEmpty ? nil : t }; if let n = v as? NSNumber { return n.stringValue }; return nil }
    static func dbl(_ v: Any?) -> Double? { if let n = v as? NSNumber { return n.doubleValue }; if let s = v as? String { return Double(s) }; return nil }
    static func int(_ v: Any?) -> Int? { dbl(v).map { Int($0) } }
    static func date(_ v: Any?) -> Date? { dbl(v).map { Date(timeIntervalSince1970: $0 / 1000) } }
}

// MARK: - Records

struct Incident: Codable, Identifiable, Equatable, Hashable {
    var key: String
    var name: String
    var number: String?
    var type: String?
    var location: String?
    var start: Date?
    var exercise: Bool = false
    /// Started in this app, not from a Command Post incident.
    var standalone: Bool = false
    var lat: Double?
    var lon: Double?
    var id: String { key }
}

struct Patient: Codable, Identifiable, Equatable {
    var lid: String                 // this app's own id (stays the same before and after it reaches ArcGIS)
    var oid: Int?                   // ArcGIS OBJECTID, once sent
    var incidentKey: String
    var incidentName: String
    var practice = false
    var tag: String
    var triageRaw: String
    var statusRaw: String
    var ageGroup: String?
    var age: Int?
    var sex: String?
    var firstName: String?
    var lastName: String?
    var injuries: String?
    var vitals: String?
    var treatment: String?
    var foundAt: String?
    var unit: String?
    var hospital: String?
    var notes: String?
    var reunCase: String?
    var triageTime: Date?
    var transportTime: Date?
    var arriveTime: Date?
    var id: String { lid }

    var triage: Triage? { Triage(rawValue: triageRaw) }
    var status: PtStatus? { PtStatus(rawValue: statusRaw) }
    var counted: Bool { status != .error }
    var name: String? { let n = [firstName, lastName].compactMap { $0 }.joined(separator: " "); return n.isEmpty ? nil : n }
    var who: String { [ageGroup, age.map { "\($0)" }, sex].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ") }

    init(lid: String = UUID().uuidString, incident: Incident, tag: String, triage: Triage) {
        self.lid = lid; incidentKey = incident.key; incidentName = incident.name; practice = incident.exercise
        self.tag = tag; triageRaw = triage.rawValue; statusRaw = triage == .black ? PtStatus.deceased.rawValue : PtStatus.onScene.rawValue
        triageTime = Date()
    }

    init(arc a: [String: Any]) {
        let o = AV.int(a["OBJECTID"] ?? a["objectid"]); oid = o; lid = "o\(o ?? 0)"
        incidentKey = AV.str(a["incident_key"]) ?? ""; incidentName = AV.str(a["incident_name"]) ?? ""; practice = AV.str(a["practice"]) == "Yes"
        tag = AV.str(a["tag_no"]) ?? "?"; triageRaw = AV.str(a["triage"]) ?? ""; statusRaw = AV.str(a["status"]) ?? PtStatus.onScene.rawValue
        ageGroup = AV.str(a["age_group"]); age = AV.int(a["age"]); sex = AV.str(a["sex"])
        firstName = AV.str(a["first_name"]); lastName = AV.str(a["last_name"])
        injuries = AV.str(a["injuries"]); vitals = AV.str(a["vitals"]); treatment = AV.str(a["treatment"]); foundAt = AV.str(a["found_at"])
        unit = AV.str(a["unit"]); hospital = AV.str(a["hospital"]); notes = AV.str(a["notes"]); reunCase = AV.str(a["reun_case"])
        triageTime = AV.date(a["triage_time"]); transportTime = AV.date(a["transport_time"]); arriveTime = AV.date(a["arrive_time"])
    }

    /// Applies changed ArcGIS attributes (from attrs()) onto this record, leaving every other field as it is.
    func applying(_ d: [String: JV]) -> Patient {
        var p = self
        for (k, v) in d {
            let str: String? = { if case .s(let x) = v { return x }; return nil }()
            let num: Double? = { if case .d(let x) = v { return x }; return nil }()
            let date: Date? = num.map { Date(timeIntervalSince1970: $0 / 1000) }
            switch k {
            case "tag_no": p.tag = str ?? p.tag
            case "triage": if let s = str { p.triageRaw = s }
            case "status": if let s = str { p.statusRaw = s }
            case "age_group": p.ageGroup = str
            case "age": p.age = num.map { Int($0) }
            case "sex": p.sex = str
            case "first_name": p.firstName = str
            case "last_name": p.lastName = str
            case "injuries": p.injuries = str
            case "vitals": p.vitals = str
            case "treatment": p.treatment = str
            case "found_at": p.foundAt = str
            case "unit": p.unit = str
            case "hospital": p.hospital = str
            case "notes": p.notes = str
            case "reun_case": p.reunCase = str
            case "triage_time": p.triageTime = date
            case "transport_time": p.transportTime = date
            case "arrive_time": p.arriveTime = date
            default: break
            }
        }
        return p
    }

    /// ArcGIS attributes. Names are only included for Command and up (the gate refuses them from anyone else).
    func attrs(names: Bool) -> [String: JV] {
        var o: [String: JV] = [
            "incident_key": .s(incidentKey), "incident_name": .str(incidentName), "practice": practice ? .s("Yes") : .null,
            "tag_no": .str(tag), "triage": .s(triageRaw), "status": .s(statusRaw), "age_group": .str(ageGroup), "age": .num(age), "sex": .str(sex),
            "injuries": .str(injuries), "vitals": .str(vitals), "treatment": .str(treatment), "found_at": .str(foundAt),
            "unit": .str(unit), "hospital": .str(hospital), "notes": .str(notes),
            "triage_time": .time(triageTime), "transport_time": .time(transportTime), "arrive_time": .time(arriveTime)
        ]
        if names { o["first_name"] = .str(firstName); o["last_name"] = .str(lastName); o["reun_case"] = .str(reunCase) }
        return o
    }
}

struct Hospital: Codable, Identifiable, Equatable {
    var lid: String
    var oid: Int?
    var name: String
    var level: String?
    var status: String = "Unknown"
    var capRed: Int?
    var capYellow: Int?
    var capGreen: Int?
    var phone: String?
    var driveMin: Double?
    var updated: Date?
    var notes: String?
    var id: String { lid }

    init(name: String, level: String? = nil) { lid = UUID().uuidString; self.name = name; self.level = level }
    init(arc a: [String: Any]) {
        let o = AV.int(a["OBJECTID"] ?? a["objectid"]); oid = o; lid = "o\(o ?? 0)"
        name = AV.str(a["name"]) ?? "Hospital"; level = AV.str(a["level"]); status = AV.str(a["status"]) ?? "Unknown"
        capRed = AV.int(a["cap_red"]); capYellow = AV.int(a["cap_yellow"]); capGreen = AV.int(a["cap_green"])
        phone = AV.str(a["phone"]); driveMin = AV.dbl(a["drive_min"]); updated = AV.date(a["updated"]); notes = AV.str(a["notes"])
    }
    func cap(_ t: Triage) -> Int? { switch t { case .red: return capRed; case .yellow: return capYellow; case .green: return capGreen; default: return nil } }
    var closed: Bool { status == "Closed" || status == "Diversion" }
    var statusColor: Color { switch status { case "Open": return Theme.ok; case "Limited": return Theme.gold; case "Diversion", "Closed": return Theme.red; default: return Theme.muted } }
    func attrs() -> [String: JV] {
        ["name": .str(name), "level": .str(level), "status": .str(status), "cap_red": .num(capRed), "cap_yellow": .num(capYellow), "cap_green": .num(capGreen),
         "phone": .str(phone), "drive_min": driveMin.map { JV.d($0) } ?? JV.null, "notes": .str(notes), "updated": .time(Date())]
    }
}

struct CadUnit: Identifiable, Equatable, Codable {
    var id: String
    var status: String?
    var dept: String?
    var type: String?
}

/// Counts for one incident: from the patient list (Officer and up) or from ArcGIS counts (Viewer).
struct Summary: Equatable {
    var by: [Triage: Int] = [:]
    var moved: [Triage: Int] = [:]
    var waiting: [Triage: Int] = [:]
    var total = 0, transported = 0, waitingRY = 0, onScene = 0
    var oldestWaiting: Date?
    var byHospital: [String: [Triage: Int]] = [:]
    var level: Int { MCILevel.of(total) }
}

/// A change made on this iPad that hasn't reached ArcGIS yet. Kept on disk until it does.
struct Edit: Codable, Identifiable, Equatable {
    enum Kind: String, Codable { case addPatient, updatePatient, addHospital, updateHospital, addReunify }
    var id = UUID().uuidString
    var kind: Kind
    var lid: String?
    var oid: Int?
    var label: String
    var attrs: [String: JV]
    var lat: Double?
    var lon: Double?
    var created = Date()
    var tries = 0
    var error: String?
    /// An add that went out at least once: before sending it again, check ArcGIS didn't already save it.
    var sent: Bool? = nil
}

struct Toast: Identifiable, Equatable {
    enum Kind { case ok, warn, err }
    let id = UUID()
    let text: String
    var kind: Kind = .ok
}
