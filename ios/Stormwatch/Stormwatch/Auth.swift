import Foundation
import AuthenticationServices
import CryptoKit
import UIKit

/// ArcGIS Online sign-in (OAuth 2.0 with PKCE), the same way Command Post signs in.
/// The refresh token stays in the keychain, so queued reports can be sent later without the person present.
@MainActor
final class Auth: NSObject, ObservableObject {
    static let shared = Auth()

    struct Session: Codable {
        var token: String
        var expires: Date
        var refresh: String?
        var refreshExpires: Date?
        var user: String
    }

    @Published private(set) var session: Session?
    @Published var lastError: String?

    var isSignedIn: Bool { session != nil }
    var username: String? { session?.user }

    private var webSession: ASWebAuthenticationSession?

    override init() {
        super.init()
        if let d = Keychain.get("session"), let s = try? JSONDecoder().decode(Session.self, from: d) {
            session = s
        }
    }

    private func save(_ s: Session?) {
        session = s
        Keychain.set(s.flatMap { try? JSONEncoder().encode($0) }, for: "session")
    }

    func signOut() { save(nil) }

    /// A valid token, refreshed if needed. Nil if not signed in or the sign-in has run out.
    /// When the network is down the current token is returned, and the request itself fails and is retried later.
    func validToken() async -> String? {
        guard var s = session else { return nil }
        if s.expires > Date().addingTimeInterval(60) { return s.token }
        guard let refresh = s.refresh else { return nil }
        let body = form(["client_id": Config.clientId, "grant_type": "refresh_token", "refresh_token": refresh])
        var req = URLRequest(url: Config.portal.appendingPathComponent("sharing/rest/oauth2/token"))
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        req.httpBody = body
        do {
            let (data, _) = try await URLSession.shared.data(for: req)
            let j = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
            guard let tok = j["access_token"] as? String else {
                // The refresh token was refused (expired or revoked): the person has to sign in again.
                save(nil)
                lastError = "Your ArcGIS sign-in ran out. Sign in again to send reports."
                return nil
            }
            s.token = tok
            s.expires = Date().addingTimeInterval((j["expires_in"] as? Double ?? 1800) - 60)
            save(s)
            return tok
        } catch {
            return s.token
        }
    }

    func signIn() async {
        lastError = nil
        let verifier = Self.randomURLSafe(64)
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URL
        var c = URLComponents(url: Config.portal.appendingPathComponent("sharing/rest/oauth2/authorize"), resolvingAgainstBaseURL: false)!
        c.queryItems = [
            .init(name: "client_id", value: Config.clientId),
            .init(name: "response_type", value: "code"),
            .init(name: "redirect_uri", value: Config.redirectURI),
            .init(name: "code_challenge", value: challenge),
            .init(name: "code_challenge_method", value: "S256"),
            .init(name: "expiration", value: "20160") // refresh token good for 14 days
        ]
        do {
            let callback: URL = try await withCheckedThrowingContinuation { cont in
                let ws = ASWebAuthenticationSession(url: c.url!, callbackURLScheme: Config.callbackScheme) { url, err in
                    if let url { cont.resume(returning: url) } else { cont.resume(throwing: err ?? URLError(.cancelled)) }
                }
                ws.presentationContextProvider = self
                ws.prefersEphemeralWebBrowserSession = false
                self.webSession = ws
                ws.start()
            }
            let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
            if let e = items.first(where: { $0.name == "error_description" })?.value ?? items.first(where: { $0.name == "error" })?.value {
                lastError = "Sign-in failed: \(e)"
                return
            }
            guard let code = items.first(where: { $0.name == "code" })?.value else { lastError = "Sign-in failed: no code returned."; return }
            var req = URLRequest(url: Config.portal.appendingPathComponent("sharing/rest/oauth2/token"))
            req.httpMethod = "POST"
            req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            req.httpBody = form(["client_id": Config.clientId, "grant_type": "authorization_code", "code": code,
                                 "redirect_uri": Config.redirectURI, "code_verifier": verifier])
            let (data, _) = try await URLSession.shared.data(for: req)
            let j = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
            guard let tok = j["access_token"] as? String else {
                let msg = ((j["error"] as? [String: Any])?["message"] as? String) ?? "no token"
                lastError = "Sign-in failed: \(msg)"
                return
            }
            save(Session(token: tok,
                         expires: Date().addingTimeInterval((j["expires_in"] as? Double ?? 1800) - 60),
                         refresh: j["refresh_token"] as? String,
                         refreshExpires: (j["refresh_token_expires_in"] as? Double).map { Date().addingTimeInterval($0) },
                         user: j["username"] as? String ?? "signed in"))
            Outbox.shared.kick()
        } catch let e as ASWebAuthenticationSessionError where e.code == .canceledLogin {
            // Person closed the sign-in sheet.
        } catch {
            lastError = "Sign-in failed: \(error.localizedDescription)"
        }
    }

    private func form(_ p: [String: String]) -> Data {
        var c = URLComponents()
        c.queryItems = p.map { URLQueryItem(name: $0.key, value: $0.value) }
        return Data((c.percentEncodedQuery ?? "").replacingOccurrences(of: "+", with: "%2B").utf8)
    }

    private static func randomURLSafe(_ n: Int) -> String {
        var b = [UInt8](repeating: 0, count: n)
        _ = SecRandomCopyBytes(kSecRandomDefault, n, &b)
        return Data(b).base64URL
    }
}

extension Auth: ASWebAuthenticationPresentationContextProviding {
    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
        }
    }
}

extension Data {
    var base64URL: String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}
