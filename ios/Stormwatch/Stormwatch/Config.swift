import Foundation

/// County settings. Layer addresses match Command Post (arc.js); form items are the Stormwatch Survey123 forms.
enum Config {
    static let portal = URL(string: "https://botetourt.maps.arcgis.com")!
    static let services = "https://services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/"
    static func layer(_ path: String) -> URL { URL(string: services + path)! }

    /// Optional sign-in, only for the Recent map. Uses the "Command Post" OAuth app item;
    /// its redirect URIs must include `redirectURI`.
    static let clientId = "n2nFWHs6Eb9dg9Cs"
    static let callbackScheme = "bocostormwatch"
    static let redirectURI = "bocostormwatch://auth"

    /// Other Stormwatch reports, shown read-only on the Recent map (signed in).
    static let dispatchResults = layer("survey123_25c0b913f91447e88a85ccf562bdfcbb_results/FeatureServer/0")
    static let publicResults = layer("survey123_8249fcd3b5db4db3a982ab6f4e65acb2_results/FeatureServer/0")

    static let responderWeb = URL(string: "https://experience.arcgis.com/experience/0f7a1564b1db45c2adcb469b56973330")!

    /// Alert flow addresses come from Secrets.plist (kept on the Mac, not in GitHub).
    static func secret(_ key: String) -> URL? {
        guard let url = Bundle.main.url(forResource: "Secrets", withExtension: "plist"),
              let d = NSDictionary(contentsOf: url), let s = (d[key] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
              s.hasPrefix("https://") else { return nil }
        return URL(string: s)
    }
}

/// The report this app sends. Stormwatch Responder sends responder reports only; dispatch and the
/// public keep their web forms. Another report type can be added here later.
enum ReportKind: String, Codable, CaseIterable, Identifiable {
    case responder
    var id: String { rawValue }
    var title: String { "Responder" }

    /// Survey123 form item.
    var formItem: String { "87946e73db344d4da8e41655a205e6e7" }
    var formTitle: String { "Responder Storm Situation Reports" }
    /// Feature service item behind the form.
    var serviceItem: String { "dfd41d9ce5c444d8927d1c548998e87d" }
    /// The public, add-only layer the Survey123 web form submits to. No sign-in needed.
    var submitLayer: URL { Config.layer("survey123_\(formItem)_form/FeatureServer/0") }
    /// The full layer (for the webhook message, which names the main service like Survey123 does).
    var mainLayer: URL { Config.layer("survey123_\(formItem)/FeatureServer/0") }
    /// Read-only results view (signed in).
    var resultsLayer: URL { Config.layer("survey123_\(formItem)_results/FeatureServer/0") }
    /// Secrets.plist key for this report's alert flow.
    var flowKey: String { "ResponderFlowURL" }
}
