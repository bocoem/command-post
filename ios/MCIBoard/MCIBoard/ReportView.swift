import SwiftUI
import UIKit

/// Patient tracking report (Command and up). Built on the iPad as a PDF marked RESTRICTED; shared with the share sheet
/// (AirDrop, Files, print). The file is removed from the iPad when the share sheet closes.
struct ReportView: View {
    @EnvironmentObject var store: MCIStore
    @State private var file: URL?
    @State private var includeNames = true

    var body: some View {
        let s = store.summary
        let rows = sorted
        ZStack {
            Backdrop()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("MCI patient tracking").font(.heavy(30)).foregroundStyle(.white)
                            Text("\(s.total) patients · Level \(s.level) · \(s.transported) transported").font(.semi(19)).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Toggle("Include names", isOn: $includeNames).fixedSize().font(.semi(17))
                        Button { file = Report.pdf(store: store, names: includeNames) } label: { Label("Share PDF", systemImage: "square.and.arrow.up") }
                            .buttonStyle(.borderedProminent).tint(Theme.gold).foregroundStyle(.black).font(.heavy(18))
                    }
                    Label("RESTRICTED: protected health information. Share only with people who need it for patient care, family notification or the incident record.", systemImage: "lock.fill")
                        .font(.callout).foregroundStyle(Theme.gold)
                    Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 8) {
                        GridRow {
                            ForEach(["Tag", "Triage", "Patient", "Status", "Transport", "Triaged"], id: \.self) { Text($0.uppercased()).font(.semi(13)).tracking(1).foregroundStyle(Theme.muted) }
                        }
                        Divider().gridCellColumns(6)
                        ForEach(rows) { p in
                            GridRow {
                                Text(p.tag).font(.system(size: 17, weight: .bold, design: .monospaced))
                                TriageChip(t: p.triage)
                                Text([includeNames ? p.name : nil, p.who.isEmpty ? nil : p.who].compactMap { $0 }.joined(separator: " · "))
                                Text(p.statusRaw)
                                Text([p.unit, p.hospital].compactMap { $0 }.joined(separator: " → "))
                                Text(p.triageTime?.hm ?? "")
                            }.font(.semi(17)).foregroundStyle(.white)
                        }
                    }.card()
                }.padding(18)
            }
        }
        .sheet(item: Binding(get: { file.map { ShareFile(url: $0) } }, set: { if $0 == nil { cleanup() } })) { f in
            ShareSheet(url: f.url) { cleanup() }
        }
    }

    private var sorted: [Patient] {
        store.patients.filter(\.counted).sorted { a, b in
            let x = a.triage?.order ?? 9, y = b.triage?.order ?? 9
            return x != y ? x < y : a.tag.localizedStandardCompare(b.tag) == .orderedAscending
        }
    }

    private func cleanup() { if let f = file { try? FileManager.default.removeItem(at: f) }; file = nil }
}

struct ShareFile: Identifiable { let url: URL; var id: String { url.path } }

enum Report {
    /// Text into the PDF page (runs inside the PDF renderer, off the main actor).
    nonisolated static func draw(_ t: String, _ x: CGFloat, _ y: CGFloat, _ w: CGFloat, size: CGFloat = 9, bold: Bool = false, color: UIColor = .black) {
        let a: [NSAttributedString.Key: Any] = [.font: bold ? UIFont.boldSystemFont(ofSize: size) : UIFont.systemFont(ofSize: size), .foregroundColor: color]
        (t as NSString).draw(with: CGRect(x: x, y: y, width: w, height: size * 2.6), options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], attributes: a, context: nil)
    }

    @MainActor
    static func pdf(store: MCIStore, names: Bool) -> URL? {
        guard let inc = store.incident else { return nil }
        let s = store.summary
        let rows = store.patients.filter(\.counted).sorted { ($0.triage?.order ?? 9, $0.tag) < ($1.triage?.order ?? 9, $1.tag) }
        let page = CGRect(x: 0, y: 0, width: 792, height: 612)   // letter, landscape
        let f = DateFormatter(); f.dateFormat = "yyyyMMdd-HHmm"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("MCI-\(f.string(from: Date()))-patients.pdf")
        let fmt = UIGraphicsPDFRendererFormat()
        fmt.documentInfo = [kCGPDFContextTitle as String: "MCI patient tracking (RESTRICTED)", kCGPDFContextCreator as String: "BEACON MCI Board"]
        let r = UIGraphicsPDFRenderer(bounds: page, format: fmt)
        let who = store.me
        let fills = Dictionary(uniqueKeysWithValues: Triage.allCases.map { ($0, UIColor($0.color)) })
        let cols: [(String, CGFloat)] = [("Tag", 50), ("Triage", 50), ("Name", names ? 120 : 0), ("Age / sex", 80), ("Injuries", names ? 150 : 230), ("Status", 82), ("Unit", 56), ("Hospital", 110), ("Triaged", 42), ("Moved", 42)]
        let shown = cols.filter { $0.1 > 0 }
        let stamp = Date().formatted(date: .abbreviated, time: .shortened)

        do {
            try r.writePDF(to: url) { ctx in
                var y: CGFloat = 0
                var pageNo = 0
                func header() {
                    ctx.beginPage(); pageNo += 1
                    UIColor(red: 0.82, green: 0.13, blue: 0.16, alpha: 1).setFill(); UIRectFill(CGRect(x: 0, y: 0, width: page.width, height: 22))
                    Report.draw("RESTRICTED · PROTECTED HEALTH INFORMATION · share only as needed for care, family notification or the incident record", 24, 6, 744, size: 8, bold: true, color: .white)
                    Report.draw("MCI Patient Tracking · \(inc.name)" + (inc.exercise ? " (PRACTICE)" : ""), 24, 32, 600, size: 15, bold: true)
                    Report.draw("\(inc.number ?? inc.key) · \(s.total) patients · MCI Level \(s.level) · red \(s.by[.red] ?? 0), yellow \(s.by[.yellow] ?? 0), green \(s.by[.green] ?? 0), gray \(s.by[.gray] ?? 0), black \(s.by[.black] ?? 0) · \(s.transported) transported", 24, 54, 744, size: 9)
                    Report.draw("Printed \(stamp) by \(who) · page \(pageNo)", 560, 34, 208, size: 8, color: .darkGray)
                    y = 76
                    var x: CGFloat = 24
                    for c in shown { Report.draw(c.0.uppercased(), x, y, c.1 - 4, size: 8, bold: true, color: .darkGray); x += c.1 }
                    y += 14
                    UIColor.lightGray.setFill(); UIRectFill(CGRect(x: 24, y: y - 2, width: 744, height: 0.6))
                }
                header()
                let tf = DateFormatter(); tf.dateFormat = "HH:mm"
                for (i, p) in rows.enumerated() {
                    if y > page.height - 40 { header() }
                    if i % 2 == 1 { UIColor(white: 0.95, alpha: 1).setFill(); UIRectFill(CGRect(x: 24, y: y - 2, width: 744, height: 18)) }
                    let tri = p.triage
                    let values: [String: String] = [
                        "Tag": p.tag, "Triage": tri?.short ?? "?", "Name": p.name ?? "", "Age / sex": p.who,
                        "Injuries": p.injuries ?? "", "Status": p.statusRaw, "Unit": p.unit ?? "", "Hospital": p.hospital ?? "",
                        "Triaged": p.triageTime.map { tf.string(from: $0) } ?? "", "Moved": p.transportTime.map { tf.string(from: $0) } ?? ""
                    ]
                    var x: CGFloat = 24
                    for c in shown {
                        if c.0 == "Triage", let t = tri {
                            (fills[t] ?? UIColor.gray).setFill(); UIRectFill(CGRect(x: x, y: y - 1, width: 42, height: 13))
                            Report.draw(t.short, x + 3, y, 40, size: 8, bold: true, color: t == .yellow ? .black : .white)
                        } else {
                            Report.draw(values[c.0] ?? "", x, y, c.1 - 6, size: 9, bold: c.0 == "Tag")
                        }
                        x += c.1
                    }
                    y += 18
                }
                if rows.isEmpty { Report.draw("No patients.", 24, y + 6, 300, size: 11) }
            }
        } catch { return nil }
        // the PDF is PHI: protect it like the rest of the app's files until it's shared and removed
        try? FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
        return url
    }
}

// MARK: - account

struct AccountSheet: View {
    @EnvironmentObject var store: MCIStore
    @EnvironmentObject var session: SessionStore
    @Environment(\.dismiss) private var dismiss
    @AppStorage("appLock") private var appLock = false
    @AppStorage("keepAwake") private var keepAwake = true
    @State private var confirm = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Signed in") {
                    LabeledContent("Name", value: session.session?.name ?? "")
                    LabeledContent("Email", value: session.session?.email ?? "")
                    LabeledContent("Agency", value: session.session?.agency ?? "")
                    LabeledContent("MCI access", value: store.level.name + (store.isDevice ? " · truck iPad" : ""))
                }
                Section {
                    Toggle("Keep the screen on during an incident", isOn: $keepAwake)
                    if !store.isDevice { Toggle("Extra lock: Face ID / passcode", isOn: $appLock) }
                } footer: { Text("Patient records are protected by this iPad's passcode and auto-lock: truck iPads must have both. The extra lock also asks on launch and after the app has been away \(Int(AppConfig.lockAfterSeconds / 60)) minutes; use it on a personal iPad.") }
                Section {
                    LabeledContent("Connection", value: store.online ? "Online" : "Offline")
                    LabeledContent("Last update", value: store.lastSync.map { "\($0.ago) ago" } ?? "—")
                    LabeledContent("Waiting to send", value: "\(store.outbox.count)")
                    if let e = store.syncError { Text(e).font(.footnote).foregroundStyle(Theme.gold) }
                } header: { Text("ArcGIS") } footer: {
                    Text("Patient records live in ArcGIS (BOCO_EMS_PatientCare), reached only through the BEACON gate. This iPad keeps an encrypted working copy of the open incident, cleared on sign-out and after \(Int(AppConfig.keepDays)) days.")
                }
                Section {
                    Button("Sign out", role: .destructive) { if store.outbox.isEmpty { out() } else { confirm = true } }
                } footer: { Text("Access is managed on the BEACON Users page (BEACON Team tab), by Chiefs, Admins and User managers.") }
            }
            .navigationTitle("Account").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .confirmationDialog("\(store.outbox.count) changes haven't reached ArcGIS", isPresented: $confirm, titleVisibility: .visible) {
                Button("Sign out and lose them", role: .destructive) { out() }
            } message: { Text("Get a connection and wait for them to send first if you can.") }
        }
    }
    private func out() { dismiss(); store.signOut() }
}

struct UnsentSheet: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(store.outbox) { e in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack { Text(e.label).font(.semi(19)); Spacer(); Text(e.created.ago + " ago").font(.footnote).foregroundStyle(Theme.muted) }
                            if let er = e.error { Text("ArcGIS said: \(er) (tried \(e.tries)×)").font(.footnote).foregroundStyle(Theme.gold) }
                        }
                        .swipeActions {
                            if store.level.names && e.tries > 0 { Button("Discard", role: .destructive) { store.discard(e) } }
                        }
                    }
                } footer: {
                    Text(store.online ? "Sending in order. Anything ArcGIS refuses stays here with the reason. Command can swipe to discard it." : "Offline. These send by themselves when the iPad is back online. They stay on this iPad until then.")
                }
            }
            .navigationTitle("Waiting to send").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .topBarLeading) { Button("Send now") { store.kick() } }
            }
        }
    }
}
