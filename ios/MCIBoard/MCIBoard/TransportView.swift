import SwiftUI

/// Transport officer: who is waiting (reds first, longest wait first), who is on the way, and who has arrived.
struct TransportView: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.horizontalSizeClass) private var hsize
    @State private var moving: Patient?
    @State private var open: Patient?

    var body: some View {
        ZStack {
            Backdrop()
            if hsize == .regular {
                HStack(alignment: .top, spacing: 16) {
                    column("Waiting for transport", waiting, empty: "Nobody waiting.") { p in waitingCard(p) }
                    column("On the way", enRoute, empty: "No one en route.") { p in enRouteCard(p) }.frame(maxWidth: 380)
                }.padding(18)
            } else {
                ScrollView {
                    VStack(spacing: 16) {
                        column("Waiting for transport", waiting, empty: "Nobody waiting.") { p in waitingCard(p) }
                        column("On the way", enRoute, empty: "No one en route.") { p in enRouteCard(p) }
                    }.padding(16)
                }
            }
        }
        .sheet(item: $moving) { p in TransportSheet(patient: p) }
        .sheet(item: $open) { p in PatientSheet(patient: p) }
    }

    private var waiting: [Patient] {
        store.patients.filter { p in p.counted && !(p.status?.done ?? false) && [Triage.red, .yellow, .green].contains(p.triage ?? .black) }
            .sorted { a, b in
                let x = a.triage?.order ?? 9, y = b.triage?.order ?? 9
                return x != y ? x < y : (a.triageTime ?? .distantPast) < (b.triageTime ?? .distantPast)
            }
    }
    private var enRoute: [Patient] {
        store.patients.filter { $0.counted && $0.status == .transported }.sorted { ($0.transportTime ?? .distantPast) > ($1.transportTime ?? .distantPast) }
    }

    private func column<C: View>(_ title: String, _ list: [Patient], empty: String, @ViewBuilder row: @escaping (Patient) -> C) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(title.uppercased()).font(.heavy(18)).tracking(1.2).foregroundStyle(Theme.gold)
                Spacer()
                Text("\(list.count)").font(.system(size: 20, weight: .heavy, design: .rounded)).foregroundStyle(.white)
            }
            if list.isEmpty { Text(empty).font(.semi(18)).foregroundStyle(Theme.muted).padding(.vertical, 8) }
            // iPad: each column scrolls on its own. iPhone: the whole screen is one scroll (a scroll view inside a
            // scroll view collapses to nothing on a phone, which hid the lists)
            if hsize == .regular { ScrollView { LazyVStack(spacing: 10) { ForEach(list) { p in row(p) } } } }
            else { LazyVStack(spacing: 10) { ForEach(list) { p in row(p) } } }
        }
    }

    private func waitingCard(_ p: Patient) -> some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 6).fill(p.triage?.color ?? Theme.muted).frame(width: 8, height: 54)
            VStack(alignment: .leading, spacing: 2) {
                HStack { TriageChip(t: p.triage); Text(p.tag).font(.system(size: 22, weight: .heavy, design: .monospaced)).foregroundStyle(.white) }
                Text([store.level.names ? p.name : nil, p.who.isEmpty ? nil : p.who, p.foundAt].compactMap { $0 }.joined(separator: " · "))
                    .font(.semi(16)).foregroundStyle(Theme.muted).lineLimit(1)
            }
            Spacer()
            if let t = p.triageTime { Text(t.ago).font(.system(size: 18, weight: .bold, design: .rounded)).foregroundStyle(p.triage == .red && t.timeIntervalSinceNow < -1200 ? Theme.red : Theme.muted) }
            Button { moving = p } label: { Label("Assign", systemImage: "car.fill").font(.heavy(18)) }.buttonStyle(.borderedProminent).tint(Theme.blue)
        }
        .padding(12).background(Theme.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.border))
        .contentShape(Rectangle()).onTapGesture { open = p }
    }

    private func enRouteCard(_ p: Patient) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack { TriageChip(t: p.triage); Text(p.tag).font(.system(size: 20, weight: .heavy, design: .monospaced)).foregroundStyle(.white); Spacer()
                if let t = p.transportTime { Text(t.hm).font(.semi(16)).foregroundStyle(Theme.muted) } }
            Text([p.unit, p.hospital.map { "→ " + $0 }].compactMap { $0 }.joined(separator: " ")).font(.semi(17)).foregroundStyle(Theme.blue).lineLimit(2)
            Button { store.arrived(p) } label: { Label("Arrived", systemImage: "checkmark.circle.fill").frame(maxWidth: .infinity) }
                .buttonStyle(.bordered).tint(Theme.ok).font(.heavy(17))
        }
        .padding(12).background(Theme.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.border))
    }
}

/// Pick the unit and the hospital. Shows how many of this color each hospital already has against what it said it can take.
struct TransportSheet: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    let patient: Patient
    @State private var unit = ""
    @State private var hospital: String?
    @State private var other = ""

    init(patient: Patient) { self.patient = patient }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(spacing: 12) {
                        TriageChip(t: patient.triage, big: true)
                        Text(patient.tag).font(.system(size: 34, weight: .heavy, design: .monospaced)).foregroundStyle(.white)
                        Spacer()
                        Text(patient.who).font(.semi(18)).foregroundStyle(Theme.muted)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Caption("Transport unit")
                        TextField("e.g. Medic 12", text: $unit).font(.title2).autocorrectionDisabled().field()
                        if !usedUnits.isEmpty {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    ForEach(usedUnits, id: \.self) { u in
                                        Button(u) { unit = u; Haptic.tap() }.buttonStyle(.bordered).tint(unit == u ? Theme.gold : Theme.muted).font(.heavy(17))
                                    }
                                }
                            }
                        }
                        let ems = store.units.filter { unit.isEmpty || $0.id.localizedCaseInsensitiveContains(unit) }.prefix(18)
                        if !ems.isEmpty {
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 130), spacing: 8)], spacing: 8) {
                                ForEach(Array(ems)) { u in
                                    Button { unit = u.id; Haptic.tap() } label: {
                                        VStack(spacing: 1) {
                                            Text(u.id).font(.heavy(18)).lineLimit(1)
                                            Text(u.status ?? "").font(.caption).lineLimit(1).opacity(0.75)
                                        }
                                        .foregroundStyle(unit == u.id ? .black : .white).frame(maxWidth: .infinity).padding(.vertical, 8)
                                        .background(unit == u.id ? Theme.gold : Theme.page, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                                        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.border))
                                    }.buttonStyle(.plain)
                                }
                            }
                            Text("Units from CAD (Fire & EMS).").font(.footnote).foregroundStyle(Theme.muted)
                        }
                    }.card()

                    VStack(alignment: .leading, spacing: 10) {
                        Caption("Destination")
                        if store.hospitals.isEmpty { Text("The hospital board is empty. Type the destination below, or set up hospitals on the Hospitals screen.").font(.callout).foregroundStyle(Theme.muted) }
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 280), spacing: 10)], spacing: 10) {
                            ForEach(store.hospitals) { h in hospitalChoice(h) }
                        }
                        TextField("Other destination", text: $other).field()
                            .onChange(of: other) { _, v in if !v.isEmpty { hospital = nil } }
                        Text(guidance).font(.callout).foregroundStyle(Theme.gold)
                    }.card()

                    Button { go() } label: {
                        Text(destination.map { "Transported to \($0)" } ?? "Pick a destination").lineLimit(1).minimumScaleFactor(0.7)
                    }
                    .buttonStyle(BigButtonStyle(color: destination == nil ? Theme.border : Theme.blue, ink: .white))
                    .disabled(destination == nil)
                }.padding(20)
            }
            .background(Backdrop())
            .navigationTitle("Transport tag \(patient.tag)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Transported") { go() }.font(.heavy(19)).disabled(destination == nil)
                }
            }
        }
        .onAppear { unit = patient.unit ?? ""; hospital = patient.hospital ?? suggested?.name }
    }

    private var destination: String? { hospital ?? other.nilIfBlank }
    private func go() {
        guard let dest = destination else { return }
        store.transport(live, unit: unit.nilIfBlank, hospital: dest); Haptic.done(); dismiss()
    }

    /// Units already used on this incident, newest first (quicker than searching CAD, and works when CAD is stale).
    private var usedUnits: [String] {
        var seen = Set<String>(), out: [String] = []
        for p in store.patients.sorted(by: { ($0.transportTime ?? .distantPast) > ($1.transportTime ?? .distantPast) }) {
            if let u = p.unit, seen.insert(u.lowercased()).inserted { out.append(u) }
            if out.count >= 8 { break }
        }
        return out
    }

    /// EOP: reds to the highest-level trauma center with room; others to the nearest open ED with room.
    private var suggested: Hospital? {
        let t = patient.triage ?? .green
        let open = store.hospitals.filter { h in
            guard !h.closed else { return false }
            if let c = h.cap(t) { return store.sent(to: h.name, t) < c }
            return true
        }
        func rank(_ h: Hospital) -> Int {
            let l = (h.level ?? "").lowercased()
            if l.contains("level i ") || l.hasSuffix("level i") || l.contains("level 1") { return 0 }
            if l.contains("level ii") || l.contains("level 2") { return 1 }
            return 2
        }
        if t == .red { return open.min { (rank($0), $0.driveMin ?? 999) < (rank($1), $1.driveMin ?? 999) } }
        return open.min { ($0.driveMin ?? 999) < ($1.driveMin ?? 999) }
    }

    private var live: Patient { store.patients.first { $0.lid == patient.lid } ?? patient }

    private var guidance: String {
        switch patient.triage ?? .green {
        case .red: return "EOP: RED to the highest-level trauma center that can take them."
        case .yellow: return "EOP: spread YELLOW across the nearest open EDs."
        default: return "EOP: move GREENs early, by bus or van if you can, to keep trauma beds open."
        }
    }

    private func hospitalChoice(_ h: Hospital) -> some View {
        let t = patient.triage ?? .green
        let n = store.sent(to: h.name, t), cap = h.cap(t)
        let full = cap.map { n >= $0 } ?? false
        let on = hospital == h.name
        return Button { hospital = h.name; other = ""; Haptic.tap() } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(h.name).font(.heavy(19)).foregroundStyle(on ? .black : .white).lineLimit(2).multilineTextAlignment(.leading)
                    if suggested?.lid == h.lid { Text("SUGGESTED").font(.heavy(11)).tracking(0.8).foregroundStyle(.black).padding(.horizontal, 6).padding(.vertical, 2).background(Theme.ok, in: Capsule()) }
                    Spacer()
                    Text(h.status.uppercased()).font(.heavy(12)).foregroundStyle(on ? .black : h.statusColor)
                }
                HStack {
                    Text("\(t.short): \(n) sent / \(cap.map(String.init) ?? "?") can take").font(.semi(16)).foregroundStyle(on ? .black : (full ? Theme.red : Theme.muted))
                    Spacer()
                    if let d = h.driveMin { Text("\(Int(d)) min").font(.semi(16)).foregroundStyle(on ? .black : Theme.muted) }
                }
                if let c = cap, c > 0 {
                    ProgressView(value: min(Double(n), Double(c)), total: Double(c)).tint(full ? Theme.red : t.color)
                }
            }
            .padding(12).frame(maxWidth: .infinity, alignment: .leading)
            .background(on ? Theme.gold : Theme.page, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(on ? Theme.gold : Theme.border))
            .opacity(h.closed ? 0.45 : 1)
        }
        .buttonStyle(.plain)
        .disabled(h.closed)
    }
}
