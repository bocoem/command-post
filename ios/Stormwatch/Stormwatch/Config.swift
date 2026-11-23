import Foundation

/// County settings. These match the published Stormwatch Responder web app
/// (Experience Builder item 0f7a1564b1db45c2adcb469b56973330) and its Survey123 forms.
enum Config {
    static let portal = URL(string: "https://botetourt.maps.arcgis.com")!
    static let services = "https://services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/"
    static func layer(_ path: String) -> URL { URL(string: services + path)! }

    /// "Storm Reports - Public Map", the web map behind the web app's Map and Reports pages.
    static let webMapItem = "565be72ebd21458b83e678e9dbec50e2"
    static let responderWeb = URL(string: "https://experience.arcgis.com/experience/0f7a1564b1db45c2adcb469b56973330")!
}

/// The two Survey123 forms the web app embeds on its Submit and House Check pages.
/// Survey123 saves each report and starts the alert flows, so the app adds nothing of its own.
enum ReportForm: String, CaseIterable, Identifiable {
    case responder, housecheck
    var id: String { rawValue }
    var title: String { self == .responder ? "Submit a report" : "House Check" }
    /// Survey123 form item.
    var formItem: String { self == .responder ? "87946e73db344d4da8e41655a205e6e7" : "3c05a771c9124f6096c7de50b40201b5" }
}

/// The three report sources on the web app's Map and Reports pages. All three are public, read-only views.
enum StormSource: String, CaseIterable, Identifiable, Codable {
    case residents, responders, dispatch
    var id: String { rawValue }
    /// Tab names, in the web app's order.
    var title: String {
        switch self { case .residents: return "Residents"; case .responders: return "Responders"; case .dispatch: return "911 Dispatch" }
    }
    /// "Reported by" line in the map pop-up.
    var reportedBy: String {
        switch self { case .residents: return "Residents"; case .responders: return "County responders"; case .dispatch: return "911 Dispatch" }
    }
    var layerTitle: String {
        switch self { case .residents: return "Public reports"; case .responders: return "Responder reports"; case .dispatch: return "911 Dispatch reports" }
    }
    var url: URL {
        switch self {
        case .residents: return Config.layer("Public_Storm_Situation_Update_3_view/FeatureServer/0")
        case .responders: return Config.layer("Responder_Storm_Situation_Reports_4_view/FeatureServer/0")
        case .dispatch: return Config.layer("Dispatch_Storm_Situation_Public_view/FeatureServer/0")
        }
    }
}
