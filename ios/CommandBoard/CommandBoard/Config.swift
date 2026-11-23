import SwiftUI

/// Settings for this app. The MCI Board app uses the same files with its own Config.
enum AppConfig {
    /// The BEACON gate (Cloudflare Worker): email sign-in, access levels, and the only way this app reaches ArcGIS.
    static let gateURL = URL(string: "https://beacon-gate.bocoem.workers.dev")!
    /// Which app this is, for the gate ("cb" = Command Board, "mci" = MCI Board).
    static let appKey = "cb"
    static let appName = "Command Board"
    /// The board page built into the app (ios/shared/build_web.py makes it from the website's page).
    static let boardFile = "board"
    /// Keychain and file names (kept apart from the MCI app's).
    static let keychainService = "com.dmurray.CommandBoard.session"
}

/// BCEM / BEACON colors (same values as the board's CSS and the other county apps).
enum Theme {
    static let page = Color(red: 0x0A / 255, green: 0x17 / 255, blue: 0x24 / 255)   // #0A1724
    static let navy = Color(red: 0x0E / 255, green: 0x20 / 255, blue: 0x33 / 255)   // #0E2033
    static let card = Color(red: 0x12 / 255, green: 0x27 / 255, blue: 0x3D / 255)
    static let border = Color(red: 0x23 / 255, green: 0x47 / 255, blue: 0x6B / 255)
    static let gold = Color(red: 0xFD / 255, green: 0xB8 / 255, blue: 0x33 / 255)   // #FDB833
    static let red = Color(red: 0xD0 / 255, green: 0x21 / 255, blue: 0x29 / 255)    // #D02129
    static let blue = Color(red: 0x2E / 255, green: 0x31 / 255, blue: 0x92 / 255)   // #2E3192
    static let muted = Color(red: 0xA9 / 255, green: 0xB8 / 255, blue: 0xC8 / 255)
}
