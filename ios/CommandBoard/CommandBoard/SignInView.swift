import SwiftUI

/// Sign in with an email code (people on the county list), or with an incident code from the IC (mutual aid, view only).
struct SignInView: View {
    @EnvironmentObject var store: SessionStore
    enum Step { case email, code, guest }
    @State private var step: Step = .email
    @AppStorage("lastEmail") private var email = ""
    @State private var code = ""
    @State private var gName = ""
    @State private var gAgency = ""
    @State private var gCode = ""
    @State private var busy = false
    @State private var message: String?
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
                    case .email:
                        label("Your email")
                        TextField("name@example.com", text: $email)
                            .textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                            .focused($focus).submitLabel(.send).onSubmit(sendCode).field()
                        Button(action: sendCode) { wide(busy ? "Sending…" : "Email me a code") }.buttonStyle(.borderedProminent).disabled(busy || !email.contains("@"))
                        Text("Your email has to be on the county's Command Board list. Ask Emergency Management to be added.").font(.footnote).foregroundStyle(Theme.muted)
                        Divider().overlay(Theme.border).padding(.vertical, 4)
                        Button { step = .guest; message = nil } label: { wide("I have an incident code") }.buttonStyle(.bordered)
                    case .code:
                        label("Code sent to \(email)")
                        TextField("6-digit code", text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode)
                            .font(.system(size: 30, weight: .bold, design: .monospaced)).focused($focus).field()
                            .onChange(of: code) { _, v in if v.filter(\.isNumber).count == 6 { verify() } }
                        Button(action: verify) { wide(busy ? "Checking…" : "Sign in") }.buttonStyle(.borderedProminent).disabled(busy || code.filter(\.isNumber).count != 6)
                        Text("The code works for 10 minutes. Check junk mail if it doesn't arrive.").font(.footnote).foregroundStyle(Theme.muted)
                        HStack { Button("Send a new code", action: sendCode); Spacer(); Button("Use a different email") { step = .email; code = "" } }.font(.footnote)
                    case .guest:
                        label("Incident code (from the IC)")
                        TextField("G1234567", text: $gCode).textInputAutocapitalization(.characters).autocorrectionDisabled()
                            .font(.system(size: 26, weight: .bold, design: .monospaced)).focused($focus).field()
                        label("Your name and unit")
                        TextField("e.g. Capt. Smith, Engine 5", text: $gName).field()
                        label("Agency")
                        TextField("e.g. Roanoke County Fire & Rescue", text: $gAgency).field()
                        Button(action: guest) { wide(busy ? "Checking…" : "View the incident") }.buttonStyle(.borderedProminent).disabled(busy || gCode.count < 8 || gName.isEmpty)
                        Text("View only, this incident only, until it closes.").font(.footnote).foregroundStyle(Theme.muted)
                        Button("Back to email sign-in") { step = .email; message = nil }.font(.footnote)
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
    }

    private func label(_ s: String) -> some View { Text(s.uppercased()).font(.custom("BarlowCondensed-SemiBold", size: 13)).tracking(1.2).foregroundStyle(Theme.muted) }
    private func wide(_ s: String) -> some View { Text(s).font(.custom("BarlowCondensed-ExtraBold", size: 19)).tracking(0.6).frame(maxWidth: .infinity).padding(.vertical, 6) }

    private func sendCode() {
        let e = email.trimmingCharacters(in: .whitespaces).lowercased(); guard e.contains("@") else { return }
        busy = true; message = nil
        Task {
            do { try await Gate.startEmail(e); email = e; code = ""; step = .code; message = "If \(e) is on the list, a code is on its way." }
            catch { message = error.localizedDescription }
            busy = false
        }
    }
    private func verify() {
        guard !busy else { return }
        busy = true; message = nil
        Task {
            do { store.set(try await Gate.verify(email: email, code: code.filter(\.isNumber))) }
            catch { message = error.localizedDescription; code = "" }
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

private extension View {
    func field() -> some View {
        self.padding(12).background(Theme.page, in: RoundedRectangle(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.border)).foregroundStyle(.white)
    }
}
