import Foundation
import Security
import UIKit

/// Who is signed in on this device. The session token is kept in the Keychain (this device only, not in backups),
/// so the board keeps working offline and survives the app being closed or the iPad restarting.
/// Same sign-in as the Command Board app; this app uses the mci_level column.
struct GateSession: Codable, Equatable {
    var token: String
    var email: String
    var name: String
    var agency: String
    var level: String
    var incident: String?
    var layers: [String]
    /// "Person" or "Device" (truck iPad account; never expires, no Face ID). From /auth/setup and /me.
    var kind: String? = nil
    /// "User manager" can open the Users page without a Chief level.
    var role: String? = nil
    var isDevice: Bool { kind == "Device" }
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
        catch { throw Failure(message: "No connection. Signing in needs a connection once; after that triage keeps working offline.") }
        let j = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        if let e = j["error"] as? [String: Any] { throw Failure(message: e["message"] as? String ?? "Sign-in failed.") }
        return j
    }

    static func startEmail(_ email: String) async throws { _ = try await post("auth/start", ["email": email]) }

    /// One-time setup code (or its QR) from the Users page / Teams tab or EM Ops. Good for 24 hours, once per app.
    static func setup(code: String) async throws -> GateSession {
        session(from: try await post("auth/setup", ["code": cleanCode(code), "device": SessionStore.deviceId]))
    }

    /// "beacon-setup:abcde-12345" → "ABCDE12345" (dashes, spaces, case and the QR prefix don't matter).
    static func cleanCode(_ s: String) -> String {
        var t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.lowercased().hasPrefix("beacon-setup:") { t = String(t.dropFirst("beacon-setup:".count)) }
        return t.uppercased().filter { $0.isLetter || $0.isNumber }
    }

    static func verify(email: String, code: String) async throws -> GateSession {
        session(from: try await post("auth/verify", ["email": email, "code": code, "device": SessionStore.deviceId]))
    }

    private static func session(from j: [String: Any]) -> GateSession {
        GateSession(token: j["token"] as? String ?? "", email: j["email"] as? String ?? "", name: j["name"] as? String ?? "",
                    agency: j["agency"] as? String ?? "", level: j["level"] as? String ?? "Viewer",
                    incident: j["incident"] as? String, layers: [], kind: j["kind"] as? String, role: j["role"] as? String)
    }

    /// Current level and layers (asked on launch and every few minutes; the saved copy lets the app start offline).
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
