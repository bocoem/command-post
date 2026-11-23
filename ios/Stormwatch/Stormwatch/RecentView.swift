import SwiftUI
import MapKit

/// The last 3 days of Stormwatch reports (responder, dispatch and public), on a map and in a list.
/// Reading them needs an ArcGIS sign-in; sending reports does not.
struct RecentView: View {
    @EnvironmentObject var auth: Auth

    struct Report: Identifiable {
        let id: String
        let source: String
        let type: String
        let comments: String
        let who: String
        let when: Date
        let coord: CLLocationCoordinate2D
    }

    @State private var reports: [Report] = []
    @State private var loading = false
    @State private var error: String?
    @State private var showList = false
    @State private var selected: String?

    var body: some View {
        NavigationStack {
            Group {
                if !auth.isSignedIn {
                    VStack(spacing: 16) {
                        Image(systemName: "map").font(.system(size: 44)).foregroundStyle(.secondary)
                        Text("Sign in with ArcGIS to see recent Stormwatch reports.").multilineTextAlignment(.center)
                        Text("You don't need to sign in to send a report.").font(.footnote).foregroundStyle(.secondary)
                        Button("Sign in with ArcGIS") { Task { await auth.signIn() } }.buttonStyle(.borderedProminent)
                        if let e = auth.lastError { Text(e).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center) }
                    }
                    .padding(32)
                } else if showList {
                    List(reports) { r in row(r) }
                        .overlay { if reports.isEmpty && !loading { Text("No reports in the last 3 days.").foregroundStyle(.secondary) } }
                } else {
                    Map(selection: $selected) {
                        UserAnnotation()
                        ForEach(reports) { r in
                            Marker(r.type, systemImage: symbol(r.source), coordinate: r.coord).tint(color(r.source)).tag(r.id)
                        }
                    }
                    .mapControls { MapUserLocationButton(); MapCompass(); MapScaleView() }
                    .safeAreaInset(edge: .bottom) {
                        if let s = selected, let r = reports.first(where: { $0.id == s }) {
                            row(r).padding().background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12)).padding(.horizontal)
                        }
                    }
                }
            }
            .navigationTitle("Recent reports")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if auth.isSignedIn {
                    ToolbarItem(placement: .topBarLeading) {
                        Button(showList ? "Map" : "List") { showList.toggle() }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        if loading { ProgressView() } else { Button { Task { await load() } } label: { Image(systemName: "arrow.clockwise") }.accessibilityLabel("Refresh") }
                    }
                }
            }
            .safeAreaInset(edge: .top) {
                if let e = error { Text(e).font(.caption).foregroundStyle(.red).padding(6).frame(maxWidth: .infinity).background(.bar) }
            }
            .task(id: auth.isSignedIn) { if auth.isSignedIn { await load() } }
        }
    }

    private func row(_ r: Report) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Image(systemName: symbol(r.source)).foregroundStyle(color(r.source))
                Text(r.type).font(.headline)
                Spacer()
                Text(r.source).font(.caption).foregroundStyle(.secondary)
            }
            if !r.comments.isEmpty { Text(r.comments).font(.subheadline).lineLimit(3) }
            Text([r.who, r.when.formatted(date: .abbreviated, time: .shortened)].filter { !$0.isEmpty }.joined(separator: " · "))
                .font(.caption).foregroundStyle(.secondary)
        }
    }

    private func symbol(_ s: String) -> String { s == "Responder" ? "shield.fill" : s == "Dispatch" ? "headset" : "person.fill" }
    private func color(_ s: String) -> Color { s == "Responder" ? .red : s == "Dispatch" ? .blue : .orange }

    private func load() async {
        loading = true
        defer { loading = false }
        let since = Date().addingTimeInterval(-3 * 86400)
        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = TimeZone(identifier: "UTC")
        df.dateFormat = "yyyy-MM-dd HH:mm:ss"
        let clause = "CreationDate >= TIMESTAMP '\(df.string(from: since))'"
        let sources: [(String, URL, [FormSchema.Choice])] = [
            ("Responder", ReportKind.responder.resultsLayer, Schemas.shared.form(.responder).questions.first { $0.name == "type" }?.choices ?? []),
            ("Dispatch", Config.dispatchResults, Schemas.shared.form(.responder).questions.first { $0.name == "type" }?.choices ?? []),
            ("Public", Config.publicResults, [])
        ]
        var all: [Report] = []
        var errs: [String] = []
        for (name, url, choices) in sources {
            do {
                let feats = try await ArcGIS.query(url, where: clause, order: "CreationDate DESC")
                for f in feats {
                    let a = f["attributes"] as? [String: Any] ?? [:]
                    let g = f["geometry"] as? [String: Any] ?? [:]
                    guard let x = g["x"] as? Double, let y = g["y"] as? Double else { continue }
                    func s(_ k: String) -> String { (a.first { $0.key.lowercased() == k }?.value as? String) ?? "" }
                    let code = s("type")
                    let label = code == "other" ? (s("type_other").isEmpty ? "Other" : s("type_other"))
                        : (choices.first { $0.value == code }?.label ?? code.replacingOccurrences(of: "_", with: " ").capitalized)
                    let ms = a.first { $0.key.lowercased() == "creationdate" }?.value as? Double ?? 0
                    let oid = a.first { $0.key.lowercased() == "objectid" }.map { "\($0.value)" } ?? UUID().uuidString
                    all.append(Report(id: "\(name)-\(oid)",
                                      source: name, type: label.isEmpty ? "Report" : label, comments: s("comments"), who: s("name"),
                                      when: Date(timeIntervalSince1970: ms / 1000), coord: .init(latitude: y, longitude: x)))
                }
            } catch {
                errs.append("\(name): \(error.localizedDescription)")
            }
        }
        reports = all.sorted { $0.when > $1.when }
        error = errs.isEmpty ? nil : errs.joined(separator: "\n")
    }
}
