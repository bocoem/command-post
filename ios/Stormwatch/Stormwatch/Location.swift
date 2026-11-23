import Foundation
import CoreLocation
import MapKit

/// Current position for new reports, plus a street address for display.
@MainActor
final class Location: NSObject, ObservableObject, CLLocationManagerDelegate {
    static let shared = Location()

    @Published var coordinate: CLLocationCoordinate2D?
    @Published var accuracy: Double?
    @Published var status: CLAuthorizationStatus = .notDetermined

    private let manager = CLLocationManager()

    /// Center of Botetourt County, used until a position comes in.
    static let county = CLLocationCoordinate2D(latitude: 37.5577, longitude: -79.7884)

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        status = manager.authorizationStatus
    }

    func start() {
        if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() }
        manager.startUpdatingLocation()
    }

    func stop() { manager.stopUpdatingLocation() }

    /// Asks once, so the Map can show where you are and the Survey123 form can place your report.
    func requestPermission() {
        if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() }
    }

    nonisolated func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        guard let l = locs.last else { return }
        Task { @MainActor in
            self.coordinate = l.coordinate
            self.accuracy = l.horizontalAccuracy
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        let s = m.authorizationStatus
        Task { @MainActor in
            self.status = s
            if s == .authorizedWhenInUse || s == .authorizedAlways { m.startUpdatingLocation() }
        }
    }

    nonisolated func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {}

    /// Street address for a point (needs a connection; empty when offline).
    static func address(for c: CLLocationCoordinate2D) async -> String? {
        let p = try? await CLGeocoder().reverseGeocodeLocation(CLLocation(latitude: c.latitude, longitude: c.longitude)).first
        guard let p else { return nil }
        let street = [p.subThoroughfare, p.thoroughfare].compactMap { $0 }.joined(separator: " ")
        let parts = [street.isEmpty ? p.name : street, p.locality].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: ", ")
    }
}
