import SwiftUI

/// The eight lifelines in EOP order, matched to the Lifeline Status fields.
/// Names on screen come from the guide's own Lifelines pages in ArcGIS (keyword match).
struct LifelineDef {
    let field: String
    let keyword: String
    let fallback: String

    static let all: [LifelineDef] = [
        .init(field: "safetysecurity", keyword: "Safety", fallback: "Safety & Security"),
        .init(field: "foodhydrationshelter", keyword: "Food", fallback: "Food, Water, Shelter"),
        .init(field: "healthmedical", keyword: "Health", fallback: "Health & Medical"),
        .init(field: "energy", keyword: "Energy", fallback: "Energy"),
        .init(field: "communications", keyword: "Communications", fallback: "Communications"),
        .init(field: "transportation", keyword: "Transportation", fallback: "Transportation"),
        .init(field: "hazardousmaterials", keyword: "Hazardous", fallback: "Hazardous Materials"),
        .init(field: "watersystems", keyword: "Water Systems", fallback: "Water Systems"),
    ]
}

struct LifelineReading: Codable, Identifiable, Hashable {
    let field: String
    let code: String?
    let detail: String?
    var id: String { field }

    /// Same words as SIGNAL and the Lifeline Report form. Stored codes are unchanged.
    var label: String {
        switch code {
        case "Minimal Impact": return "Stabilized"
        case "Moderate Impact": return "Impacted"
        case "Significant Impact": return "Destabilized"
        case nil, "": return "Not assessed"
        default: return code!
        }
    }

    var color: Color {
        switch code {
        case "Minimal Impact": return Theme.stabilized
        case "Moderate Impact": return Theme.impacted
        case "Significant Impact": return Theme.destabilized
        default: return Theme.unknown
        }
    }
}

struct LifelineSnapshot: Codable {
    var readings: [LifelineReading]
    var summary: String?
    var asOf: Date?
}

/// Reads the newest row of EmergencyInformation_public › Lifeline Status, the same row SIGNAL shows.
@MainActor
final class LifelineStore: ObservableObject {
    static let shared = LifelineStore()
    @Published private(set) var snapshot: LifelineSnapshot?
    @Published private(set) var failed = false
    private let key = "lifelines.snapshot"
    private var lastAttempt: Date?

    init() {
        if let d = UserDefaults.standard.data(forKey: key),
           let s = try? JSONDecoder().decode(LifelineSnapshot.self, from: d) { snapshot = s }
    }

    func refresh(force: Bool = false) async {
        if !force, let t = lastAttempt, Date().timeIntervalSince(t) < 30 { return }
        lastAttempt = Date()
        do {
            let (data, _) = try await Config.session.data(from: Config.lifelineStatus)
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let features = json["features"] as? [[String: Any]],
                  let a = features.first?["attributes"] as? [String: Any] else { throw GuideError.badFormat }
            let readings = LifelineDef.all.map {
                LifelineReading(field: $0.field, code: a[$0.field] as? String, detail: a[$0.field + "desc"] as? String)
            }
            var asOf: Date?
            if let ms = (a["EditDate"] as? Double) ?? (a["CreationDate"] as? Double) {
                asOf = Date(timeIntervalSince1970: ms / 1000)
            }
            let s = LifelineSnapshot(readings: readings, summary: a["description"] as? String, asOf: asOf)
            snapshot = s
            failed = false
            if let d = try? JSONEncoder().encode(s) { UserDefaults.standard.set(d, forKey: key) }
        } catch {
            failed = true
        }
    }
}
