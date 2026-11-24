import Foundation
import CoreLocation

/// This iPad's copy of the open incident: patients, hospital board and any changes not yet in ArcGIS.
/// Encrypted by iPadOS file protection (unreadable while the iPad is locked), left out of iCloud and computer backups,
/// and wiped on sign-out. Cleared after AppConfig.keepDays when nothing is waiting to send.
enum Vault {
    struct Data: Codable {
        var email: String
        var incident: Incident?
        var patients: [Patient] = []
        var hospitals: [Hospital] = []
        var units: [CadUnit] = []
        var outbox: [Edit] = []
        var saved = Date()
    }

    private static var dir: URL {
        var d = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("MCI", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.completeUnlessOpen])
        var v = URLResourceValues(); v.isExcludedFromBackup = true
        try? d.setResourceValues(v)
        return d
    }
    private static var file: URL { dir.appendingPathComponent("board.json") }

    static func save(_ v: Data) {
        guard let d = try? JSONEncoder().encode(v) else { return }
        try? d.write(to: file, options: [.atomic, .completeFileProtectionUnlessOpen])
    }

    static func load() -> Data? {
        guard let d = try? Foundation.Data(contentsOf: file), let v = try? JSONDecoder().decode(Data.self, from: d) else { return nil }
        if v.outbox.isEmpty && v.saved < Date().addingTimeInterval(-AppConfig.keepDays * 86400) { wipe(); return nil }
        return v
    }

    static func wipe() {
        try? FileManager.default.removeItem(at: file)
        // anything shared from the report screen
        let tmp = FileManager.default.temporaryDirectory
        for f in (try? FileManager.default.contentsOfDirectory(at: tmp, includingPropertiesForKeys: nil)) ?? [] where f.lastPathComponent.hasPrefix("MCI-") {
            try? FileManager.default.removeItem(at: f)
        }
    }
}

/// Where the iPad is, for the patient's map point (falls back to the incident location).
@MainActor
final class LocationOnce: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var last: CLLocation?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    }

    func warm() {
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways: manager.requestLocation()
        default: break
        }
    }

    /// A fix from the last 5 minutes, if there is one (never waits).
    var recent: CLLocationCoordinate2D? {
        guard let l = last ?? manager.location, l.timestamp.timeIntervalSinceNow > -300, l.horizontalAccuracy >= 0, l.horizontalAccuracy < 500 else { return nil }
        return l.coordinate
    }

    nonisolated func locationManager(_ m: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let l = locations.last
        Task { @MainActor in self.last = l }
    }
    nonisolated func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {}
    nonisolated func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        Task { @MainActor in self.warm() }
    }
}

extension Date {
    /// "4m", "1h 12m"
    var ago: String {
        let s = max(0, Int(-timeIntervalSinceNow))
        if s < 60 { return "\(s)s" }
        if s < 3600 { return "\(s / 60)m" }
        return "\(s / 3600)h \((s % 3600) / 60)m"
    }
    var hm: String { formatted(date: .omitted, time: .shortened) }
}
