import SwiftUI
import UIKit

// MARK: - surfaces

struct CardStyle: ViewModifier {
    var pad: CGFloat = 16
    var tint: Color? = nil
    func body(content: Content) -> some View {
        content.padding(pad)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(LinearGradient(colors: [Theme.cardHi, Theme.card], startPoint: .top, endPoint: .bottom))
            )
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke((tint ?? Theme.border).opacity(tint == nil ? 1 : 0.7), lineWidth: tint == nil ? 1 : 1.5))
    }
}

extension View {
    func card(_ pad: CGFloat = 16, tint: Color? = nil) -> some View { modifier(CardStyle(pad: pad, tint: tint)) }
    func field() -> some View {
        self.padding(12).background(Theme.page, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.border)).foregroundStyle(.white)
    }
}

struct Caption: View {
    let text: String
    init(_ t: String) { text = t }
    var body: some View { Text(text.uppercased()).font(.semi(13)).tracking(1.3).foregroundStyle(Theme.muted) }
}

/// Page background used by every screen.
struct Backdrop: View {
    var body: some View {
        LinearGradient(colors: [Theme.navy, Theme.page], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
    }
}

// MARK: - triage

struct TriageChip: View {
    let t: Triage?
    var big = false
    var body: some View {
        Text(t?.short ?? "?")
            .font(.heavy(big ? 20 : 14)).tracking(0.8)
            .foregroundStyle(t?.ink ?? .white)
            .padding(.horizontal, big ? 12 : 8).padding(.vertical, big ? 5 : 3)
            .background((t?.color ?? Theme.muted), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(t == .black ? Color.white.opacity(0.6) : .clear))
    }
}

struct StatusChip: View {
    let s: PtStatus?
    let raw: String
    var body: some View {
        Text(raw).font(.semi(14)).foregroundStyle(s?.color ?? Theme.muted)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background((s?.color ?? Theme.muted).opacity(0.14), in: Capsule())
    }
}

/// Count tile for one triage color.
struct TriageTile: View {
    let t: Triage
    let n: Int
    let moved: Int
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(t.short).font(.heavy(16)).tracking(1).foregroundStyle(t.ink.opacity(0.85))
            Text("\(n)").font(.system(size: 52, weight: .heavy, design: .rounded)).foregroundStyle(t.ink).contentTransition(.numericText())
            Text("\(moved) transported").font(.semi(15)).foregroundStyle(t.ink.opacity(0.8))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(LinearGradient(colors: [t.color, t.color.opacity(0.82)], startPoint: .topLeading, endPoint: .bottomTrailing))
        )
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(t == .black ? Color.white.opacity(0.35) : .clear))
        .shadow(color: t.color.opacity(0.35), radius: 10, y: 4)
    }
}

struct StatTile: View {
    let value: String
    let label: String
    var sub: String? = nil
    var color: Color = .white
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value).font(.system(size: 34, weight: .heavy, design: .rounded)).foregroundStyle(color).minimumScaleFactor(0.6).lineLimit(1)
            Text(label.uppercased()).font(.semi(13)).tracking(1.1).foregroundStyle(Theme.muted)
            if let sub { Text(sub).font(.footnote).foregroundStyle(Theme.muted) }
        }
        .frame(maxWidth: .infinity, alignment: .leading).card(14)
    }
}

struct LevelBadge: View {
    let level: Int
    var body: some View {
        Text("LEVEL \(level)").font(.heavy(16)).tracking(1)
            .foregroundStyle(level <= 2 ? .white : .black)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(level <= 2 ? Theme.red : Theme.gold, in: Capsule())
    }
}

struct PracticeChip: View {
    var body: some View {
        Text("PRACTICE").font(.heavy(13)).tracking(1).foregroundStyle(.black)
            .padding(.horizontal, 8).padding(.vertical, 3).background(Color.cyan, in: Capsule())
    }
}

// MARK: - status of the connection

struct SyncPill: View {
    @EnvironmentObject var store: MCIStore
    var body: some View {
        TimelineView(.periodic(from: .now, by: 5)) { _ in
            HStack(spacing: 6) {
                Circle().fill(color).frame(width: 9, height: 9)
                Text(text).font(.semi(14)).foregroundStyle(Theme.muted).lineLimit(1)
            }
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(Theme.page.opacity(0.7), in: Capsule())
            .overlay(Capsule().stroke(Theme.border))
        }
    }
    private var color: Color {
        if !store.online { return Theme.red }
        if !store.outbox.isEmpty { return Theme.gold }
        if store.syncError != nil { return .orange }
        return Theme.ok
    }
    private var text: String {
        if !store.online { return store.outbox.isEmpty ? "Offline" : "Offline · \(store.outbox.count) to send" }
        if !store.outbox.isEmpty { return "Sending \(store.outbox.count)…" }
        if store.syncError != nil { return "ArcGIS problem" }
        if let t = store.lastSync { return "Live · \(t.ago)" }
        return "Connecting…"
    }
}

struct ToastView: View {
    let toast: Toast
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: toast.kind == .ok ? "checkmark.circle.fill" : toast.kind == .warn ? "exclamationmark.triangle.fill" : "xmark.octagon.fill")
                .foregroundStyle(toast.kind == .ok ? Theme.ok : toast.kind == .warn ? Theme.gold : Theme.red)
            Text(toast.text).font(.semi(19)).foregroundStyle(.white)
        }
        .padding(.horizontal, 18).padding(.vertical, 12)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().stroke(Theme.border))
        .shadow(color: .black.opacity(0.4), radius: 12, y: 6)
    }
}

enum Haptic {
    static func tap() { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
    static func done() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    static func warn() { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
}

/// Big filled button in the app's style.
struct BigButtonStyle: ButtonStyle {
    var color: Color = Theme.gold
    var ink: Color = .black
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.heavy(20)).tracking(0.6).foregroundStyle(ink)
            .frame(maxWidth: .infinity).padding(.vertical, 14)
            .background(color.opacity(configuration.isPressed ? 0.75 : 1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    let url: URL
    var done: () -> Void = {}
    func makeUIViewController(context: Context) -> UIActivityViewController {
        let c = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        c.completionWithItemsHandler = { _, _, _, _ in done() }
        return c
    }
    func updateUIViewController(_ c: UIActivityViewController, context: Context) {}
}

/// Small segmented chooser that reads well with gloves on.
struct ChipPicker: View {
    let options: [String]
    @Binding var value: String?
    var allowNone = true
    var body: some View {
        HStack(spacing: 8) {
            ForEach(options, id: \.self) { o in
                let on = value == o
                Button { value = (on && allowNone) ? nil : o; Haptic.tap() } label: {
                    Text(o).font(.semi(17)).lineLimit(1).minimumScaleFactor(0.7)
                        .foregroundStyle(on ? .black : .white)
                        .padding(.horizontal, 12).padding(.vertical, 9)
                        .frame(maxWidth: .infinity)
                        .background(on ? Theme.gold : Theme.page, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(on ? Theme.gold : Theme.border))
                }.buttonStyle(.plain)
            }
        }
    }
}
