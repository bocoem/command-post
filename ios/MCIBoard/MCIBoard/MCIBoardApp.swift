import SwiftUI
import UIKit
import LocalAuthentication

@main
struct MCIBoardApp: App {
    @StateObject private var session = SessionStore.shared
    @StateObject private var store = MCIStore()
    @Environment(\.scenePhase) private var phase
    @AppStorage("appLock") private var appLock = false      // truck iPads: the iPad passcode is the lock
    @AppStorage("keepAwake") private var keepAwake = true    // screen stays on while an incident is open
    @State private var locked = true
    @State private var awayAt: Date?

    var body: some Scene {
        WindowGroup {
            ZStack {
                Group {
                    if session.session == nil { SignInView() } else { RootView() }
                }
                // Face ID / passcode before patient records show (on launch and after the app has been away)
                if session.session != nil && appLock && locked && !(session.session?.isDevice ?? false) { LockView { locked = false } }
                // hide patient details in the app switcher and when Control Center is pulled down
                if session.session != nil && phase != .active { PrivacyShield() }
            }
            .environmentObject(session)
            .environmentObject(store)
            .tint(Theme.gold)
            .preferredColorScheme(.dark)
            .task(id: session.session?.email) { await store.start(session) }
            // just signed in: no second check needed right away
            .onChange(of: session.session?.email) { old, new in if old == nil && new != nil { locked = false } }
            .onChange(of: phase) { _, p in
                switch p {
                case .background:
                    awayAt = Date(); store.goingAway()
                case .active:
                    if let a = awayAt, Date().timeIntervalSince(a) > AppConfig.lockAfterSeconds { locked = true }
                    awayAt = nil
                    store.resume(); store.kick()
                default: break
                }
                awake()
            }
            .onChange(of: store.incident?.key) { _, _ in awake() }
            .onChange(of: keepAwake) { _, _ in awake() }
        }
    }
}

extension MCIBoardApp {
    /// Keep the screen on while an incident is open and the app is in front (like Command Board).
    func awake() { UIApplication.shared.isIdleTimerDisabled = keepAwake && phase == .active && store.incident != nil && session.session != nil }
}

struct PrivacyShield: View {
    var body: some View {
        ZStack {
            Backdrop()
            VStack(spacing: 14) {
                Image("Patch").resizable().scaledToFit().frame(width: 96)
                Text("MCI BOARD").font(.heavy(30)).foregroundStyle(.white)
                Text("Patient records hidden").font(.semi(17)).foregroundStyle(Theme.muted)
            }
        }
    }
}

struct LockView: View {
    let unlocked: () -> Void
    @State private var message: String?
    init(unlocked: @escaping () -> Void) { self.unlocked = unlocked }
    var body: some View {
        ZStack {
            Backdrop()
            VStack(spacing: 18) {
                Image("Patch").resizable().scaledToFit().frame(width: 110)
                Text("MCI BOARD IS LOCKED").font(.heavy(30)).foregroundStyle(.white)
                Text("Patient records need Face ID, Touch ID or the iPad passcode.").font(.semi(18)).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                Button { unlock() } label: { Label("Unlock", systemImage: "faceid") }
                    .buttonStyle(BigButtonStyle()).frame(maxWidth: 320)
                if let message { Text(message).font(.callout).foregroundStyle(Theme.gold).multilineTextAlignment(.center) }
            }.padding(30)
        }
        .onAppear { unlock() }
    }
    private func unlock() {
        let c = LAContext()
        var e: NSError?
        guard c.canEvaluatePolicy(.deviceOwnerAuthentication, error: &e) else {
            // no passcode on this iPad: nothing to check against (county devices should have one)
            message = "This iPad has no passcode. Set one in Settings to protect patient records."
            unlocked(); return
        }
        c.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Unlock MCI patient records") { ok, _ in
            DispatchQueue.main.async { if ok { unlocked() } }
        }
    }
}

/// Sign in with a one-time setup code or its QR (from the Users page, the BEACON Team tab or EM Ops).
/// People and truck iPads both use setup codes. Email sign-in was retired Nov 24, 2026.
struct SignInView: View {
    @EnvironmentObject var session: SessionStore
    @State private var setup = ""
    @State private var busy = false
    @State private var scanning = false
    @State private var message: String?
    @FocusState private var focus: Bool

    var body: some View {
        ZStack {
            Backdrop()
            ScrollView {
                VStack(spacing: 22) {
                    Image("Patch").resizable().scaledToFit().frame(width: 110, height: 110).padding(.top, 50)
                    VStack(spacing: 2) {
                        Text("BOTETOURT COUNTY · BEACON").font(.semi(14)).tracking(2).foregroundStyle(Theme.gold)
                        Text("MCI BOARD").font(.heavy(44)).foregroundStyle(.white)
                        Text("Triage · Patient tracking · Hospitals").font(.semi(17)).foregroundStyle(Theme.muted)
                    }
                    VStack(alignment: .leading, spacing: 14) {
                        Caption("Setup code")
                            TextField("XXXXX-XXXXX", text: $setup)
                                .font(.system(size: 30, weight: .bold, design: .monospaced))
                                .textInputAutocapitalization(.characters).autocorrectionDisabled().keyboardType(.asciiCapable)
                                .focused($focus).submitLabel(.go).onSubmit(useSetup).field()
                            HStack(spacing: 10) {
                                Button(action: useSetup) { Text(busy ? "Checking…" : "Sign in") }
                                    .buttonStyle(BigButtonStyle()).disabled(busy || Gate.cleanCode(setup).count < 10)
                                if TagScanner.available {
                                    Button { scanning = true } label: { Label("Scan QR", systemImage: "qrcode.viewfinder") }
                                        .buttonStyle(BigButtonStyle(color: Theme.cardHi, ink: .white)).frame(maxWidth: 180)
                                }
                            }
                            Text("Get a setup code from whoever manages BEACON users (the Users page in the BEACON Team, or Emergency Management). It works once, for 24 hours.")
                                .font(.footnote).foregroundStyle(Theme.muted)
                        if let message { Text(message).font(.callout).foregroundStyle(Theme.gold).fixedSize(horizontal: false, vertical: true) }
                    }
                    .card(20).frame(maxWidth: 460)
                    Text("Life safety goes over the radio first.").font(.footnote).foregroundStyle(Theme.muted).padding(.bottom, 30)
                }
                .padding(.horizontal, 20).frame(maxWidth: .infinity)
            }
        }
        .onAppear { focus = true }
        .sheet(isPresented: $scanning) {
            ZStack(alignment: .top) {
                TagScanner { v in setup = v; scanning = false; Haptic.done(); useSetup() }.ignoresSafeArea()
                HStack {
                    Text("Point at the setup QR code").font(.heavy(22)).foregroundStyle(.white)
                    Spacer()
                    Button("Cancel") { scanning = false }.font(.semi(20))
                }.padding(16).background(.ultraThinMaterial)
            }
        }
    }

    private func useSetup() {
        guard !busy, Gate.cleanCode(setup).count >= 10 else { return }
        busy = true; message = nil
        Task {
            do { session.set(try await Gate.setup(code: setup)) }
            catch { message = error.localizedDescription }
            busy = false
        }
    }
}
