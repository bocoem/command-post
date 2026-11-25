import SwiftUI
import VisionKit

/// Triage: tag number, then one tap on a color saves the patient. Everything else can wait.
struct TriageView: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.horizontalSizeClass) private var hsize
    @AppStorage("autoNumber") private var autoNumber = true
    @State private var tag = ""
    @State private var ageGroup: String? = "Adult"
    @State private var sex: String?
    @State private var foundAt = ""
    @State private var injuries = ""
    @State private var scanning = false
    @State private var dupeOf: Patient?
    @State private var dupeColor: Triage?
    @State private var flash: Triage?
    @State private var open: Patient?
    @State private var last: Patient?
    @FocusState private var tagFocus: Bool

    var body: some View {
        ZStack {
            Backdrop()
            if hsize == .regular {
                HStack(alignment: .top, spacing: 18) {
                    ScrollView { main.padding(.vertical, 18) }.scrollDismissesKeyboard(.interactively)
                    recent.frame(width: 330).padding(.vertical, 18)
                }.padding(.horizontal, 18)
            } else {
                // iPhone: drag the screen to put the keyboard away and reach the color buttons
                ScrollView { VStack(spacing: 18) { main; recent } .padding(16) }.scrollDismissesKeyboard(.interactively)
            }
        }
        .onAppear { store.location.warm(); if tag.isEmpty && autoNumber { tag = nextTag() } }
        .sheet(isPresented: $scanning) { scanner }
        .sheet(item: $open) { p in PatientSheet(patient: p) }
        .confirmationDialog("Tag \(dupeOf?.tag ?? "") is already on the board", isPresented: Binding(get: { dupeOf != nil }, set: { if !$0 { dupeOf = nil } }), titleVisibility: .visible) {
            if let t = dupeColor { Button("Save as a new patient anyway") { commit(t) } }
            if let d = dupeOf { Button("Open tag \(d.tag)") { open = d } }
            Button("Cancel", role: .cancel) {}
        } message: { Text("It was triaged \(dupeOf?.triage?.short ?? "") \(dupeOf?.triageTime?.ago ?? "") ago. Check the tag number.") }
    }

    // MARK: main column

    private var main: some View {
        VStack(alignment: .leading, spacing: 18) {
            tagCard
            colorGrid
            if let l = last { undoBar(l) }
            details
            Text("Tap a color to save. Details, names and transport can be added later. Use JumpSTART for children under 8 (or under about 100 lb).")
                .font(.callout).foregroundStyle(Theme.muted)
        }
    }

    private var tagCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Caption("Triage tag #")
                Spacer()
                Toggle(isOn: $autoNumber) { Text("Number automatically").font(.semi(16)).foregroundStyle(Theme.muted) }.fixedSize()
            }
            HStack(spacing: 12) {
                TextField("Tag", text: $tag)
                    .font(.system(size: 46, weight: .heavy, design: .monospaced))
                    .keyboardType(.asciiCapable).textInputAutocapitalization(.characters).autocorrectionDisabled()
                    .focused($tagFocus).submitLabel(.done)
                    .padding(.horizontal, 16).padding(.vertical, 6)
                    .background(Theme.page, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(tagFocus ? Theme.gold : Theme.border, lineWidth: tagFocus ? 2 : 1))
                if TagScanner.available {
                    Button { scanning = true } label: {
                        VStack(spacing: 4) { Image(systemName: "barcode.viewfinder").font(.system(size: 34)); Text("Scan").font(.heavy(16)) }
                            .frame(width: 96, height: 84)
                    }
                    .buttonStyle(.plain).foregroundStyle(.black).background(Theme.gold, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
            }
        }.card()
    }

    private var colorGrid: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                ForEach([Triage.red, .yellow, .green]) { t in colorButton(t, height: hsize == .regular ? 170 : 130) }
            }
            HStack(spacing: 12) {
                ForEach([Triage.gray, .black]) { t in colorButton(t, height: 84) }
            }
        }
    }

    private func colorButton(_ t: Triage, height: CGFloat) -> some View {
        Button { save(t) } label: {
            VStack(spacing: 2) {
                Text(t.short).font(.heavy(height > 100 ? 46 : 30)).tracking(1.5)
                Text(t.word).font(.semi(height > 100 ? 20 : 17)).opacity(0.85)
            }
            .foregroundStyle(t.ink)
            .frame(maxWidth: .infinity, minHeight: height)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(LinearGradient(colors: [t.color, t.color.opacity(0.78)], startPoint: .top, endPoint: .bottom))
            )
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(flash == t ? Color.white : (t == .black ? Color.white.opacity(0.3) : .clear), lineWidth: flash == t ? 4 : 1))
            .shadow(color: t.color.opacity(0.45), radius: flash == t ? 18 : 8, y: 4)
            .scaleEffect(flash == t ? 1.03 : 1)
        }
        .buttonStyle(PressStyle())
        .accessibilityLabel("Save as \(t.word), \(t.short)")
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 12) {
            Caption("Optional")
            ChipPicker(options: Lists.ageGroups, value: $ageGroup)
            ChipPicker(options: Lists.sexes, value: $sex)
            HStack(spacing: 10) {
                TextField("Found at / sector", text: $foundAt).field()
                TextField("Injuries", text: $injuries).field()
            }
            let sectors = recentSectors
            if !sectors.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack { ForEach(sectors, id: \.self) { s in Button(s) { foundAt = s }.buttonStyle(.bordered).font(.semi(16)) } }
                }
            }
        }.card()
    }

    /// Mis-tapped a color? Undo puts it right (gone if it hasn't left the iPad, otherwise marked entered in error).
    private func undoBar(_ l: Patient) -> some View {
        // iPhone: what was saved on one line, the two buttons under it
        (hsize == .compact ? AnyLayout(VStackLayout(alignment: .leading, spacing: 10)) : AnyLayout(HStackLayout(spacing: 12))) {
            HStack(spacing: 12) {
                TriageChip(t: l.triage, big: true)
                Text("Tag \(l.tag) saved").font(.semi(20)).foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.7)
            }
            if hsize != .compact { Spacer() }
            HStack(spacing: 12) {
            Button { open = store.patients.first { $0.lid == l.lid } ?? l } label: { Label("Fix", systemImage: "pencil") }.buttonStyle(.bordered).font(.heavy(18))
            Button(role: .destructive) { store.undo(store.patients.first { $0.lid == l.lid } ?? l); last = nil } label: { Label("Undo", systemImage: "arrow.uturn.backward") }
                .buttonStyle(.borderedProminent).tint(Theme.red).font(.heavy(18))
            }
        }
        .card(12)
        .transition(.opacity)
    }

    // MARK: side column

    private var recent: some View {
        VStack(alignment: .leading, spacing: 10) {
            let s = store.summary
            HStack(spacing: 6) {
                ForEach(Triage.allCases) { t in
                    VStack(spacing: 0) {
                        Text("\(s.by[t] ?? 0)").font(.system(size: 22, weight: .heavy, design: .rounded))
                        Text(t.short).font(.heavy(11))
                    }
                    .foregroundStyle(t.ink).frame(maxWidth: .infinity).padding(.vertical, 6)
                    .background(t.color, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
            }
            Caption("Just triaged")
            let list = Array(store.patients.filter(\.counted).sorted { ($0.triageTime ?? .distantPast) > ($1.triageTime ?? .distantPast) }.prefix(14))
            if list.isEmpty { Text("Nobody yet.").font(.semi(17)).foregroundStyle(Theme.muted) }
            // iPad: this column scrolls by itself. iPhone: it sits in the screen's scroll (nested scrolls collapse on a phone)
            if hsize == .regular { ScrollView { recentList(list) } } else { recentList(list) }
        }
    }

    private func recentList(_ list: [Patient]) -> some View {
                VStack(spacing: 8) {
                    ForEach(list) { p in
                        Button { open = p } label: {
                            HStack(spacing: 10) {
                                TriageChip(t: p.triage)
                                Text(p.tag).font(.system(size: 20, weight: .bold, design: .monospaced)).foregroundStyle(.white)
                                Spacer()
                                if store.isPending(p) { Image(systemName: "arrow.up.circle").foregroundStyle(Theme.gold) }
                                Text(p.triageTime?.ago ?? "").font(.semi(15)).foregroundStyle(Theme.muted)
                            }
                            .padding(10).background(Theme.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }.buttonStyle(.plain)
                    }
                }
    }

    // MARK: saving

    private func save(_ t: Triage) {
        let tg = tag.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !tg.isEmpty else { Haptic.warn(); store.show(Toast(text: "Tag number first", kind: .err)); tagFocus = true; return }
        if let d = store.tagInUse(tg) { Haptic.warn(); dupeColor = t; dupeOf = d; return }
        commit(t)
    }

    private func commit(_ t: Triage) {
        let tg = tag.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let saved = store.triage(tag: tg, as: t, ageGroup: ageGroup, sex: sex, foundAt: foundAt.nilIfBlank, injuries: injuries.nilIfBlank) else { return }
        Haptic.done()
        withAnimation { last = saved }
        let lid = saved.lid
        Task { try? await Task.sleep(nanoseconds: 60_000_000_000); if last?.lid == lid { withAnimation { last = nil } } }
        store.show(Toast(text: "Tag \(tg) · \(t.short) saved"))
        withAnimation(.spring(duration: 0.25)) { flash = t }
        Task { try? await Task.sleep(nanoseconds: 450_000_000); withAnimation { flash = nil } }
        tag = autoNumber ? (Self.bump(tg) ?? nextTag()) : ""
        injuries = ""; sex = nil; ageGroup = "Adult"; dupeOf = nil; dupeColor = nil
        if !autoNumber { tagFocus = true }
    }

    private func nextTag() -> String {
        let n = store.patients.compactMap { Int($0.tag) }.max() ?? 0
        return String(n + 1)
    }

    /// "12" → "13", "A0099" → "A0100"
    static func bump(_ s: String) -> String? {
        guard let r = s.range(of: "[0-9]+$", options: .regularExpression), let n = Int(s[r]) else { return nil }
        let digits = s[r].count, next = String(n + 1)
        return String(s[s.startIndex..<r.lowerBound]) + String(repeating: "0", count: max(0, digits - next.count)) + next
    }

    private var recentSectors: [String] {
        var seen = Set<String>(), out: [String] = []
        for p in store.patients { if let f = p.foundAt, seen.insert(f.lowercased()).inserted { out.append(f) }; if out.count >= 8 { break } }
        return out
    }

    private var scanner: some View {
        ZStack(alignment: .top) {
            TagScanner { v in
                tag = String(v.prefix(30)); scanning = false; Haptic.done()
            }.ignoresSafeArea()
            HStack {
                Text("Point at the tag's barcode").font(.heavy(22)).foregroundStyle(.white)
                Spacer()
                Button("Cancel") { scanning = false }.font(.semi(20))
            }
            .padding(16).background(.ultraThinMaterial)
        }
    }
}

struct PressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.scaleEffect(configuration.isPressed ? 0.96 : 1).brightness(configuration.isPressed ? -0.06 : 0)
            .animation(.spring(duration: 0.18), value: configuration.isPressed)
    }
}

extension String {
    var nilIfBlank: String? { let t = trimmingCharacters(in: .whitespacesAndNewlines); return t.isEmpty ? nil : t }
}

// MARK: - camera barcode scanning (VisionKit, on the iPad itself; nothing leaves the device)

struct TagScanner: UIViewControllerRepresentable {
    let found: (String) -> Void
    static var available: Bool { DataScannerViewController.isSupported && DataScannerViewController.isAvailable }

    func makeCoordinator() -> Coordinator { Coordinator(found: found) }
    func makeUIViewController(context: Context) -> DataScannerViewController {
        let vc = DataScannerViewController(recognizedDataTypes: [.barcode()], qualityLevel: .balanced, recognizesMultipleItems: false,
                                           isHighFrameRateTrackingEnabled: false, isHighlightingEnabled: true)
        vc.delegate = context.coordinator
        DispatchQueue.main.async { try? vc.startScanning() }
        return vc
    }
    func updateUIViewController(_ vc: DataScannerViewController, context: Context) {}
    static func dismantleUIViewController(_ vc: DataScannerViewController, coordinator: Coordinator) { vc.stopScanning() }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let found: (String) -> Void
        private var done = false
        init(found: @escaping (String) -> Void) { self.found = found }
        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) { pick(addedItems) }
        func dataScanner(_ dataScanner: DataScannerViewController, didTapOn item: RecognizedItem) { pick([item]) }
        private func pick(_ items: [RecognizedItem]) {
            guard !done else { return }
            for i in items {
                if case .barcode(let b) = i, let v = b.payloadStringValue?.trimmingCharacters(in: .whitespacesAndNewlines), !v.isEmpty {
                    done = true; found(v); return
                }
            }
        }
    }
}

// MARK: - quick reference

struct TriageGuideSheet: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    guide("START (adults)", [
                        ("Walking?", "GREEN (Minor). Move them to the green area.", .green),
                        ("Not breathing?", "Open the airway. Still not breathing: BLACK. Starts breathing: RED.", .black),
                        ("Breathing over 30 a minute?", "RED (Immediate).", .red),
                        ("No radial pulse or cap refill over 2 seconds?", "RED. Control bleeding.", .red),
                        ("Can't follow simple commands?", "RED.", .red),
                        ("Otherwise", "YELLOW (Delayed).", .yellow)
                    ])
                    guide("JumpSTART (children under 8)", [
                        ("Walking?", "GREEN. Check infants and carried children separately.", .green),
                        ("Not breathing?", "Open the airway. Still not breathing: check pulse. Pulse: give 5 rescue breaths; breathing starts: RED, still not: BLACK. No pulse: BLACK.", .black),
                        ("Breathing under 15 or over 45 a minute?", "RED.", .red),
                        ("No palpable pulse?", "RED.", .red),
                        ("AVPU: P (inappropriate) or U?", "RED.", .red),
                        ("Otherwise", "YELLOW.", .yellow)
                    ])
                    VStack(alignment: .leading, spacing: 6) {
                        Text("GRAY · Expectant").font(.heavy(20)).foregroundStyle(.white)
                        Text("Alive but not expected to survive with the resources on hand. Re-triage as resources arrive.").font(.callout).foregroundStyle(Theme.muted)
                    }.card()
                    VStack(alignment: .leading, spacing: 6) {
                        Text("MCI levels (EOP)").font(.heavy(20)).foregroundStyle(.white)
                        ForEach([4, 3, 2, 1], id: \.self) { l in
                            HStack { LevelBadge(level: l); Text(MCILevel.range(l)).font(.semi(18)).foregroundStyle(.white) }
                        }
                        Text("Level 2 or 1: call RHCC at \(AppConfig.rhccPhone).").font(.callout).foregroundStyle(Theme.gold)
                    }.card()
                    Text("Quick reference only. Follow your county EMS protocols and medical control.").font(.footnote).foregroundStyle(Theme.muted)
                }.padding(20)
            }
            .background(Backdrop())
            .navigationTitle("Triage guide")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }

    private func guide(_ title: String, _ steps: [(String, String, Triage)]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.heavy(24)).foregroundStyle(.white)
            ForEach(Array(steps.enumerated()), id: \.offset) { _, s in
                HStack(alignment: .top, spacing: 12) {
                    TriageChip(t: s.2).frame(width: 84, alignment: .leading)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.0).font(.semi(19)).foregroundStyle(.white)
                        Text(s.1).font(.callout).foregroundStyle(Theme.muted)
                    }
                }
            }
        }.card()
    }
}
