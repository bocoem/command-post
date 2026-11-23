import SwiftUI

/// Reports from this phone: waiting, sent, and any that need attention.
struct OutboxView: View {
    @EnvironmentObject var outbox: Outbox

    var body: some View {
        NavigationStack {
            List {
                if !outbox.online && !outbox.waiting.isEmpty {
                    Section {
                        Label("No connection. \(outbox.waiting.count) report\(outbox.waiting.count == 1 ? "" : "s") will send when the phone is back online, even if the app is closed.",
                              systemImage: "wifi.slash").foregroundStyle(.orange)
                    }
                }
                if !outbox.problems.isEmpty {
                    Section("Needs attention") { ForEach(outbox.problems) { Row(r: $0) } }
                }
                if !outbox.waiting.isEmpty {
                    Section("Waiting to send") { ForEach(outbox.waiting) { Row(r: $0) } }
                }
                let sent = outbox.items.filter { $0.stage == .done }
                Section("Sent (last 3 days)") {
                    if sent.isEmpty { Text("Nothing sent from this phone yet.").foregroundStyle(.secondary) }
                    ForEach(sent) { Row(r: $0) }
                }
            }
            .navigationTitle("Sent from this phone")
            .navigationBarTitleDisplayMode(.inline)
            .refreshable { await outbox.sendAll() }
        }
    }

    struct Row: View {
        @EnvironmentObject var outbox: Outbox
        let r: PendingReport

        var body: some View {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    icon
                    Text(r.summary).font(.headline).lineLimit(2)
                    Spacer()
                    Text(r.kind == .responder ? "Report" : "House check").font(.caption).padding(.horizontal, 6).padding(.vertical, 2).background(.quaternary, in: Capsule())
                }
                Text(r.address ?? String(format: "%.5f, %.5f", r.lat, r.lng)).font(.subheadline).foregroundStyle(.secondary)
                Text(status).font(.caption).foregroundStyle(color)
                if let e = r.lastError, r.stage != .done { Text(e).font(.caption2).foregroundStyle(.secondary) }
                if r.stage == .failed || (r.stage != .done && r.attempts > 2) {
                    HStack {
                        Button("Try again") { outbox.retry(r) }.buttonStyle(.bordered)
                        if r.stage == .failed {
                            Button("Delete", role: .destructive) { outbox.remove(r) }.buttonStyle(.bordered)
                        }
                    }
                    .font(.caption)
                }
            }
            .padding(.vertical, 2)
        }

        private var icon: some View {
            Group {
                switch r.stage {
                case .done: Image(systemName: r.alertNote == nil ? "checkmark.circle.fill" : "checkmark.circle.badge.questionmark").foregroundStyle(r.alertNote == nil ? .green : .orange)
                case .failed: Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.red)
                default: Image(systemName: "clock.arrow.circlepath").foregroundStyle(.orange)
                }
            }
        }

        private var status: String {
            let t = r.created.formatted(date: .omitted, time: .shortened)
            switch r.stage {
            case .saving: return "Made \(t). Waiting to save" + (r.photos.isEmpty ? "" : " with \(r.photos.count) photo\(r.photos.count == 1 ? "" : "s")") + "."
            case .alert: return r.kind.flowKey == nil ? "Saved." : "Saved. Waiting to start the alert."
            case .failed: return "ArcGIS refused this report. Check the message below, then try again or delete it."
            case .done:
                let when = (r.sentAt ?? r.created).formatted(date: .abbreviated, time: .shortened)
                if r.kind.flowKey == nil { return "Saved \(when)." }
                return r.alertNote ?? "Saved and alert sent \(when)."
            }
        }

        private var color: Color {
            switch r.stage {
            case .done: return r.alertNote == nil ? .secondary : .orange
            case .failed: return .red
            default: return .orange
            }
        }
    }
}
