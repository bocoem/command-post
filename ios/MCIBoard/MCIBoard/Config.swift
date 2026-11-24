import SwiftUI

/// Settings for the MCI Board app. Same gate and sign-in as the Command Board app, its own access column (mci_level).
enum AppConfig {
    /// The BEACON gate (Cloudflare Worker): setup-code sign-in, access levels, and the only way this app reaches ArcGIS.
    static let gateURL = URL(string: "https://beacon-gate.dmurray-5fa.workers.dev")!
    /// Which app this is, for the gate ("cb" = Command Board, "mci" = MCI Board).
    static let appKey = "mci"
    static let appName = "MCI Board"
    /// Keychain name (kept apart from the Command Board app's).
    static let keychainService = "com.dmurray.MCIBoard.session"

    /// ArcGIS services, used until the gate says otherwise (/me lists the real addresses).
    static let defaultServices = [
        "cp": "services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/BOCO_Command_Post/FeatureServer",
        "patients": "services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/BOCO_EMS_PatientCare/FeatureServer",
        "ops": "services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/BOCO_EM_Operations/FeatureServer",
        "prot": "services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/BOCO_EM_Protected/FeatureServer",
        "units": "services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/CAD_Units_Fire_EMS/FeatureServer"
    ]
    /// Layer numbers (EM Ops schema): PROT_MCI_Patients, OPS_Hospitals, PROT_Reunification, CP_Incidents.
    static let patientLayer = 0, hospitalLayer = 15, reunifyLayer = 2, incidentLayer = 0

    /// How often the board asks ArcGIS for changes while it is open.
    static let refreshSeconds: Double = 10
    /// After 5 quiet minutes (no changes here or in ArcGIS) the board slows to this, to keep gate traffic down on all-day iPads.
    static let idleRefreshSeconds: Double = 30
    /// With no incident open, only sign-in checks and sending run.
    static let noIncidentSeconds: Double = 60
    /// Optional extra lock (off by default: truck iPads rely on the iPad's own passcode and auto-lock).
    /// When on: Face ID / passcode on launch and after the app has been away this long.
    static let lockAfterSeconds: Double = 120
    /// Patient copies on this iPad are cleared after this many days with nothing waiting to send.
    static let keepDays: Double = 3
    /// Regional Healthcare Coordination Center (EOP): call at MCI Level 1 or 2.
    static let rhccPhone = "1-866-679-7422"
}

/// BCEM / BEACON colors (same values as the board's CSS and the other county apps).
enum Theme {
    static let page = Color(red: 0x0A / 255, green: 0x17 / 255, blue: 0x24 / 255)   // #0A1724
    static let navy = Color(red: 0x0E / 255, green: 0x20 / 255, blue: 0x33 / 255)   // #0E2033
    static let card = Color(red: 0x12 / 255, green: 0x27 / 255, blue: 0x3D / 255)
    static let cardHi = Color(red: 0x18 / 255, green: 0x32 / 255, blue: 0x4E / 255)
    static let border = Color(red: 0x23 / 255, green: 0x47 / 255, blue: 0x6B / 255)
    static let gold = Color(red: 0xFD / 255, green: 0xB8 / 255, blue: 0x33 / 255)   // #FDB833
    static let red = Color(red: 0xD0 / 255, green: 0x21 / 255, blue: 0x29 / 255)    // #D02129
    static let blue = Color(red: 0x3D / 255, green: 0x7B / 255, blue: 0xFF / 255)
    static let ok = Color(red: 0x2F / 255, green: 0xBF / 255, blue: 0x71 / 255)
    static let muted = Color(red: 0xA9 / 255, green: 0xB8 / 255, blue: 0xC8 / 255)

    // triage tag colors
    static let tRed = Color(red: 0xD9 / 255, green: 0x2B / 255, blue: 0x33 / 255)
    static let tYellow = Color(red: 0xF5 / 255, green: 0xC5 / 255, blue: 0x18 / 255)
    static let tGreen = Color(red: 0x2F / 255, green: 0xBF / 255, blue: 0x71 / 255)
    static let tGray = Color(red: 0x7C / 255, green: 0x8B / 255, blue: 0x9A / 255)
    static let tBlack = Color(red: 0x10 / 255, green: 0x10 / 255, blue: 0x14 / 255)
}

extension Font {
    /// Barlow Condensed (BCEM brand), bundled in Fonts/.
    static func heavy(_ size: CGFloat) -> Font { .custom("BarlowCondensed-ExtraBold", size: size) }
    static func semi(_ size: CGFloat) -> Font { .custom("BarlowCondensed-SemiBold", size: size) }
}
