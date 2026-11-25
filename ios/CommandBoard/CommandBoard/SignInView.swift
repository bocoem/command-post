import SwiftUI
import VisionKit
import AVFoundation

/// Sign in with a setup code from a Chief, a User manager or an Admin (typed, or scanned from its QR),
/// or with an incident code from the IC (mutual aid, view only). Email sign-in was retired Nov 24, 2026.
/// A truck iPad's setup code keeps it signed in until someone turns it off on the Users page.
struct SignInView: View {
    @EnvironmentObject var store: SessionStore
    enum Step { case setup, guest }
    @State private var step: Step = .setup
    @State private var setupCode = ""
    @State private var gName = ""
    @State private var gAgency = ""
    @State private var gCode = ""
    @State private var busy = false
    @State private var message: String?
    @State private var scanning = false
    @FocusState private var focus: Bool

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                Image("Patch").resizable().scaledToFit().frame(width: 110, height: 110).padding(.top, 40)
                VStack(spacing: 2) {
                    Text("BOTETOURT COUNTY · BEACON").font(.custom("BarlowCondensed-SemiBold", size: 14)).tracking(2).foregroundStyle(Theme.gold)
                    Text(AppConfig.appName.uppercased()).font(.custom("BarlowCondensed-ExtraBold", size: 40)).foregroundStyle(.white)
                }
                VStack(alignment: .leading, spacing: 14) {
                    switch step {
                    case .setup:
                        label("Setup code")
                        TextField("XXXXX-XXXXX", text: $setupCode)
                            .textInputAutocapitalization(.characters).autocorrectionDisabled().textContentType(.oneTimeCode)
                            .font(.system(size: 28, weight: .bold, design: .monospaced)).multilineTextAlignment(.center)
                            .focused($focus).submitLabel(.go).onSubmit(useSetup).field()
                            .onChange(of: setupCode) { _, v in if Gate.cleanSetup(v).count == 10 && !busy { useSetup() } }
                        Button(action: useSetup) { wide(busy ? "Checking…" : "Sign in") }.buttonStyle(.borderedProminent).disabled(busy || Gate.cleanSetup(setupCode).count != 10)
                        if DataScannerViewController.isSupported {
                            Button { startScan() } label: { wide("Scan setup code") }.buttonStyle(.bordered)
                        }
                        Text("Ask a Chief, a User manager or Emergency Management for a setup code. It's good for 24 hours. A truck iPad stays signed in until it's turned off; a person stays signed in while they keep using the app.")
                            .font(.footnote).foregroundStyle(Theme.muted)
                        Divider().overlay(Theme.border).padding(.vertical, 4)
                        Button { step = .guest; message = nil } label: { wide("I have an incident code") }.buttonStyle(.bordered)
                    case .guest:
                        label("Incident code (from the IC)")
                        TextField("G1234567", text: $gCode).textInputAutocapitalization(.characters).autocorrectionDisabled()
                            .font(.system(size: 26, weight: .bold, design: .monospaced)).focused($focus).field()
                        if DataScannerViewController.isSupported {
                            Button { startScan() } label: { wide("Scan incident code") }.buttonStyle(.bordered)
                        }
                        label("Your name and unit")
                        TextField("e.g. Capt. Smith, Engine 5", text: $gName).field()
                        label("Agency")
                        TextField("e.g. Roanoke County Fire & Rescue", text: $gAgency).field()
                        Button(action: guest) { wide(busy ? "Checking…" : "View the incident") }.buttonStyle(.borderedProminent).disabled(busy || gCode.count < 8 || gName.isEmpty)
                        Text("View only, this incident only, until it closes.").font(.footnote).foregroundStyle(Theme.muted)
                        Button("Back to setup code") { step = .setup; message = nil }.font(.footnote)
                    }
                    if let message { Text(message).font(.callout).foregroundStyle(Theme.gold).fixedSize(horizontal: false, vertical: true) }
                }
                .padding(20).background(Theme.card, in: RoundedRectangle(cornerRadius: 18)).overlay(RoundedRectangle(cornerRadius: 18).stroke(Theme.border))
                .frame(maxWidth: 460)
                Text("Life safety goes over the radio first.").font(.footnote).foregroundStyle(Theme.muted).padding(.bottom, 30)
            }
            .padding(.horizontal, 20).frame(maxWidth: .infinity)
        }
        .background(Theme.page.ignoresSafeArea())
        .onAppear { focus = true }
        .sheet(isPresented: $scanning) {
            QRScanner { text in
                scanning = false
                let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
                if t.lowercased().hasPrefix("beacon-incident:") {
                    gCode = String(t.dropFirst("beacon-incident:".count)).uppercased(); step = .guest
                } else if t.lowercased().hasPrefix("beacon-setup:") || Gate.cleanSetup(t).count == 10 {
                    step = .setup; setupCode = Gate.cleanSetup(t)
                } else { message = "That QR isn't a BEACON setup or incident code." }
            }
            .ignoresSafeArea()
            .overlay(alignment: .top) {
                HStack { Text("Point at the code").font(.custom("BarlowCondensed-ExtraBold", size: 20)).foregroundStyle(.white); Spacer(); Button("Cancel") { scanning = false }.buttonStyle(.borderedProminent) }
                    .padding().background(.black.opacity(0.55))
            }
        }
    }

    /// Open the camera to scan a code, or say how to turn the camera on if it's off for this app.
    private func startScan() {
        message = nil
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: scanning = true
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { yes in
                DispatchQueue.main.async { if yes { scanning = true } else { message = cameraOff } }
            }
        default: message = cameraOff
        }
    }
    private var cameraOff: String { "The camera is off for this app. Turn it on in Settings → \(AppConfig.appName) → Camera, or type the code." }

    private func label(_ s: String) -> some View { Text(s.uppercased()).font(.custom("BarlowCondensed-SemiBold", size: 13)).tracking(1.2).foregroundStyle(Theme.muted) }
    private func wide(_ s: String) -> some View { Text(s).font(.custom("BarlowCondensed-ExtraBold", size: 19)).tracking(0.6).frame(maxWidth: .infinity).padding(.vertical, 6) }

    private func useSetup() {
        let c = Gate.cleanSetup(setupCode); guard c.count == 10, !busy else { return }
        busy = true; message = nil
        Task {
            do { store.set(try await Gate.setup(code: c)) }
            catch { message = error.localizedDescription }
            busy = false
        }
    }
    private func guest() {
        busy = true; message = nil
        Task {
            do { store.set(try await Gate.guest(code: gCode.trimmingCharacters(in: .whitespaces).uppercased(), name: gName, agency: gAgency)) }
            catch { message = error.localizedDescription }
            busy = false
        }
    }
}

/// Camera QR reader (VisionKit). Calls back once with the first QR it reads.
struct QRScanner: UIViewControllerRepresentable {
    let found: (String) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(found) }
    func makeUIViewController(context: Context) -> DataScannerViewController {
        let vc = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])], qualityLevel: .balanced,
                                           recognizesMultipleItems: false, isHighFrameRateTrackingEnabled: false, isHighlightingEnabled: true)
        vc.delegate = context.coordinator
        try? vc.startScanning()
        return vc
    }
    func updateUIViewController(_ vc: DataScannerViewController, context: Context) {}
    static func dismantleUIViewController(_ vc: DataScannerViewController, coordinator: Coordinator) { vc.stopScanning() }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let found: (String) -> Void
        private var done = false
        init(_ f: @escaping (String) -> Void) { found = f }
        func dataScanner(_ s: DataScannerViewController, didAdd items: [RecognizedItem], allItems: [RecognizedItem]) {
            guard !done else { return }
            for case let .barcode(b) in items { if let v = b.payloadStringValue { done = true; s.stopScanning(); DispatchQueue.main.async { self.found(v) }; return } }
        }
    }
}

private extension View {
    func field() -> some View {
        self.padding(12).background(Theme.page, in: RoundedRectangle(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.border)).foregroundStyle(.white)
    }
}
