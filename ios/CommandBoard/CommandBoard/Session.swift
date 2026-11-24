import Foundation
import Security
import UIKit

/// Who is signed in on this device. The session token is kept in the Keychain (not in the web page),
/// so the board keeps working offline and survives the app being closed or the iPad restarting.
struct GateSession: Codable, Equatable {
    var token: String
    var email: String
    var name: String
    var agency: String
    var level: String
    var incident: String?
    var layers: [String]
    /// "Person" or "Device" (a truck iPad: stays signed in until turned off on the Users page). Older saved sessions have none.
    var kind: String?
    /// "User manager" lets someone use the Users screen without a Chief level on the boards.
    var role: String?
}

@MainActor
final class SessionStore: ObservableObject {
    static let shared = SessionStore()
    @Published private(set) var session: GateSession?

    init() { session = Keychain.load() }

    func set(_ s: GateSession?) { session = s; if let s { Keychain.save(s) } else { Keychain.clear() } }

    /// The page got a fresh token or level from the gate (/me).
    func refresh(token: String?, level: String?, name: String?) {
        guard var s = session else { return }
        if let token, !token.isEmpty { s.token = token }
        if let level, !level.isEmpty { s.level = level }
        if let name, !name.isEmpty { s.name = name }
        if s != session { set(s) }
    }

    func signOut() { set(nil) }

    static var deviceId: String { UIDevice.current.identifierForVendor?.uuidString ?? "unknown" }
}

/// Calls to the gate for signing in.
enum Gate {
    struct Failure: LocalizedError { let message: String; var errorDescription: String? { message } }

    static func post(_ path: String, _ body: [String: String]) async throws -> [String: Any] {
        var req = URLRequest(url: AppConfig.gateURL.appendingPathComponent(path))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body.merging(["app": AppConfig.appKey]) { a, _ in a })
        req.timeoutInterval = 20
        let data: Data
        do { (data, _) = try await URLSession.shared.data(for: req) }
        catch { throw Failure(message: "No connection. Signing in needs a connection once; after that the board works offline.") }
        let j = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        if let e = j["error"] as? [String: Any] { throw Failure(message: e["message"] as? String ?? "Sign-in failed.") }
        return j
    }

    static func startEmail(_ email: String) async throws { _ = try await post("auth/start", ["email": email]) }

    /// Setup code (typed, or scanned from its QR "beacon-setup:XXXXXXXXXX") from a Chief, a User manager or an Admin.
    static func setup(code: String) async throws -> GateSession {
        session(from: try await post("auth/setup", ["code": code, "device": SessionStore.deviceId]))
    }
    /// Pull the 10-character code out of whatever was typed or scanned.
    static func cleanSetup(_ raw: String) -> String {
        var t = raw.uppercased()
        if let r = t.range(of: "BEACON-SETUP:") { t = String(t[r.upperBound...]) }
        return String(t.filter { $0.isLetter || $0.isNumber })
    }

    static func verify(email: String, code: String) async throws -> GateSession {
        session(from: try await post("auth/verify", ["email": email, "code": code, "device": SessionStore.deviceId]))
    }

    static func guest(code: String, name: String, agency: String) async throws -> GateSession {
        session(from: try await post("auth/guest", ["code": code, "name": name, "agency": agency]))
    }

    private static func session(from j: [String: Any]) -> GateSession {
        GateSession(token: j["token"] as? String ?? "", email: j["email"] as? String ?? "", name: j["name"] as? String ?? "",
                    agency: j["agency"] as? String ?? "", level: j["level"] as? String ?? "Viewer",
                    incident: j["incident"] as? String, layers: [], kind: j["kind"] as? String, role: j["role"] as? String)
    }

    /// Layers this level may use (the page asks again on every launch; this copy lets it start offline).
    static func me(_ token: String) async -> [String: Any]? {
        var req = URLRequest(url: AppConfig.gateURL.appendingPathComponent("me"))
        req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        req.timeoutInterval = 15
        guard let (data, resp) = try? await URLSession.shared.data(for: req) else { return nil }
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        var j = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        j["_status"] = code
        return j
    }
}

enum Keychain {
    private static let account = "session"
    static func save(_ s: GateSession) {
        guard let data = try? JSONEncoder().encode(s) else { return }
        clear()
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: AppConfig.keychainService,
                                kSecAttrAccount as String: account, kSecValueData as String: data,
                                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        SecItemAdd(q as CFDictionary, nil)
    }
    static func load() -> GateSession? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: AppConfig.keychainService,
                                kSecAttrAccount as String: account, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return try? JSONDecoder().decode(GateSession.self, from: d)
    }
    static func clear() {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: AppConfig.keychainService, kSecAttrAccount as String: account]
        SecItemDelete(q as CFDictionary)
    }
}
