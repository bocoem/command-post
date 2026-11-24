import SwiftUI
import Charts

/// The big picture: MCI level, counts by color, who is waiting, where patients went.
struct OverviewView: View {
    @EnvironmentObject var store: MCIStore

    var body: some View {
        let s = store.summary
        ZStack {
            Backdrop()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    levelBanner(s)
                    if s.level <= 2 { rhcc(s) }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                        ForEach(Triage.allCases) { t in TriageTile(t: t, n: s.by[t] ?? 0, moved: s.moved[t] ?? 0) }
                    }
                    waitingStrip(s)
                    if !store.level.countsOnly { benchmarks(s) }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 200), spacing: 12)], spacing: 12) {
                        StatTile(value: "\(s.total)", label: "Patients")
                        StatTile(value: "\(s.onScene)", label: "Still on scene")
                        StatTile(value: "\(s.transported)", label: "Transported", color: Theme.blue)
                        StatTile(value: "\(s.waitingRY)", label: "Red / yellow waiting", sub: s.oldestWaiting.map { "Longest wait \($0.ago)" }, color: s.waitingRY > 0 ? Theme.red : .white)
                    }
                    destinations(s)
                    if store.level.countsOnly {
                        Text("Your access shows counts only. Patient details are for EMS officers.").font(.footnote).foregroundStyle(Theme.muted)
                    }
                }.padding(18)
            }
            .refreshable { await store.refresh() }
        }
    }

    private func levelBanner(_ s: Summary) -> some View {
        let hot = s.level <= 2
        let thresholds = [0, 0, 101, 31, 16]
        let plural = s.total == 1 ? "" : "s"
        let next = s.level > 1 ? " · Level \(s.level - 1) at \(thresholds[s.level])" : ""
        let line = "\(s.total) patient\(plural) so far" + next
        return HStack(spacing: 18) {
            VStack(alignment: .leading, spacing: 0) {
                Text("MCI LEVEL").font(.heavy(20)).tracking(2).foregroundStyle(hot ? .white.opacity(0.85) : .black.opacity(0.7))
                Text("\(s.level)").font(.system(size: 84, weight: .heavy, design: .rounded)).foregroundStyle(hot ? .white : .black)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(MCILevel.range(s.level)).font(.heavy(26)).foregroundStyle(hot ? .white : .black)
                Text(line)
                    .font(.semi(19)).foregroundStyle(hot ? .white.opacity(0.85) : .black.opacity(0.7))
                if let st = firstTriage { Text("First triage \(st.hm) · \(st.ago) ago").font(.semi(17)).foregroundStyle(hot ? .white.opacity(0.75) : .black.opacity(0.6)) }
            }
            Spacer()
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(LinearGradient(colors: hot ? [Theme.red, Theme.red.opacity(0.75)] : [Theme.gold, Theme.gold.opacity(0.8)], startPoint: .topLeading, endPoint: .bottomTrailing))
        )
        .shadow(color: (hot ? Theme.red : Theme.gold).opacity(0.35), radius: 14, y: 6)
    }

    private var firstTriage: Date? { store.patients.filter(\.counted).compactMap(\.triageTime).min() }

    /// Still on scene, by color: what the IC and transport officer chase.
    private func waitingStrip(_ s: Summary) -> some View {
        HStack(spacing: 10) {
            Text("STILL ON SCENE").font(.heavy(16)).tracking(1.2).foregroundStyle(Theme.gold)
            ForEach([Triage.red, .yellow, .green, .gray]) { t in
                HStack(spacing: 6) {
                    Circle().fill(t.color).frame(width: 14, height: 14)
                    Text("\(s.waiting[t] ?? 0)").font(.system(size: 22, weight: .heavy, design: .rounded)).foregroundStyle(.white)
                    Text(t.short).font(.semi(15)).foregroundStyle(Theme.muted)
                }
                .padding(.horizontal, 10).padding(.vertical, 6).background(Theme.page, in: Capsule())
            }
            Spacer()
            if let o = s.oldestWaiting { Text("Longest red/yellow wait \(o.ago)").font(.semi(16)).foregroundStyle(Theme.red) }
        }.card(12)
    }

    /// MCI benchmarks the IC reports on the radio (same words as Command Board).
    private func benchmarks(_ s: Summary) -> some View {
        let reds = s.by[.red] ?? 0
        let lastMove = store.patients.compactMap(\.transportTime).max()
        let marks: [(String, Bool, String?)] = [
            ("Triage started", firstTriage != nil, firstTriage?.hm),
            ("All RED transported", reds > 0 && (s.waiting[.red] ?? 0) == 0, nil),
            ("All patients transported", s.total > 0 && s.onScene == 0, lastMove?.hm),
            ("RHCC notified", rhccAt != nil, rhccAt?.hm)
        ]
        return VStack(alignment: .leading, spacing: 10) {
            Text("BENCHMARKS").font(.heavy(18)).tracking(1.2).foregroundStyle(Theme.gold)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 240), spacing: 10)], spacing: 10) {
                ForEach(Array(marks.enumerated()), id: \.offset) { _, m in
                    HStack(spacing: 10) {
                        Image(systemName: m.1 ? "checkmark.circle.fill" : "circle").font(.title2).foregroundStyle(m.1 ? Theme.ok : Theme.muted)
                        Text(m.0).font(.semi(19)).foregroundStyle(.white)
                        Spacer()
                        if let t = m.2, m.1 { Text(t).font(.semi(16)).foregroundStyle(Theme.muted) }
                    }
                    .padding(12).background(Theme.page, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
            }
        }.card(16)
    }

    /// When RHCC was called for this incident (kept on this iPad).
    @AppStorage("rhccNotified") private var rhccLog = ""   // "key=epoch;key=epoch"
    private var rhccAt: Date? {
        guard let k = store.incident?.key else { return nil }
        for part in rhccLog.split(separator: ";") {
            let kv = part.split(separator: "=")
            if kv.count == 2, kv[0] == Substring(k), let t = Double(kv[1]) { return Date(timeIntervalSince1970: t) }
        }
        return nil
    }
    private func markRhcc() {
        guard let k = store.incident?.key else { return }
        rhccLog = (rhccLog.split(separator: ";").map(String.init).filter { !$0.hasPrefix(k + "=") } + ["\(k)=\(Int(Date().timeIntervalSince1970))"]).suffix(20).joined(separator: ";")
    }

    @ViewBuilder private func rhcc(_ s: Summary) -> some View {
        if let t = rhccAt {
            HStack {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.ok)
                Text("RHCC notified at \(t.hm)").font(.semi(19)).foregroundStyle(.white)
                Spacer()
                Text("Call again if the level changes").font(.footnote).foregroundStyle(Theme.muted)
            }.card(12)
        } else {
            rhccCard(s)
        }
    }

    private func rhccCard(_ s: Summary) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "phone.arrow.up.right.fill").font(.title2).foregroundStyle(Theme.red)
                Text("Level \(s.level): call RHCC").font(.heavy(26)).foregroundStyle(.white)
                Spacer()
                if let u = URL(string: "tel:" + AppConfig.rhccPhone.filter(\.isNumber)) {
                    Link(destination: u) { Label(AppConfig.rhccPhone, systemImage: "phone.fill").font(.heavy(20)) }
                        .buttonStyle(.borderedProminent).tint(Theme.red)
                }
            }
            Text("Tell them: who you are and a callback number, the radio channel, the MCI level and patient count (\(s.by[.red] ?? 0) red, \(s.by[.yellow] ?? 0) yellow, \(s.by[.green] ?? 0) green), what you need, hospitals already contacted, actions taken, and what happened.")
                .font(.callout).foregroundStyle(Theme.muted)
            Button { markRhcc() } label: { Label("RHCC notified", systemImage: "checkmark") }.buttonStyle(.bordered).font(.heavy(18))
        }.card(18, tint: Theme.red)
    }

    private struct Bar: Identifiable { let id = UUID(); let hospital: String; let triage: Triage; let n: Int }

    @ViewBuilder private func destinations(_ s: Summary) -> some View {
        let bars = s.byHospital.flatMap { h, m in m.map { Bar(hospital: h, triage: $0.key, n: $0.value) } }
            .sorted { $0.hospital == $1.hospital ? $0.triage.order < $1.triage.order : $0.hospital < $1.hospital }
        VStack(alignment: .leading, spacing: 12) {
            Text("WHERE PATIENTS WENT").font(.heavy(18)).tracking(1.2).foregroundStyle(Theme.gold)
            if bars.isEmpty {
                Text("No transports yet.").font(.semi(18)).foregroundStyle(Theme.muted)
            } else {
                Chart(bars) { b in
                    BarMark(x: .value("Patients", b.n), y: .value("Hospital", b.hospital))
                        .foregroundStyle(by: .value("Triage", b.triage.short))
                }
                .chartForegroundStyleScale(domain: Triage.allCases.map(\.short), range: Triage.allCases.map(\.color))
                .chartLegend(position: .bottom)
                .frame(height: CGFloat(max(120, Set(bars.map(\.hospital)).count * 56)))
            }
        }.card(18)
    }
}

// MARK: - hospital board

struct HospitalsView: View {
    @EnvironmentObject var store: MCIStore
    @State private var editing: Hospital?
    @State private var adding = false

    var body: some View {
        ZStack {
            Backdrop()
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        Text("Update capacity after each call with the hospital or RHCC. Check VHASS for live status.").font(.callout).foregroundStyle(Theme.muted)
                        Spacer()
                        if store.level.canEdit {
                            if store.hospitals.isEmpty { Button("Add EOP hospitals") { store.seedHospitals() }.buttonStyle(.bordered) }
                            Button { adding = true } label: { Label("Hospital", systemImage: "plus") }.buttonStyle(.borderedProminent).tint(Theme.gold).foregroundStyle(.black)
                        }
                    }
                    if store.hospitals.isEmpty { Text("No hospitals on the board yet.").font(.semi(19)).foregroundStyle(Theme.muted).padding(.top, 20) }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 330), spacing: 14)], spacing: 14) {
                        ForEach(store.hospitals) { h in
                            HospitalCard(h: h, canEdit: store.level.canEdit) { editing = h }
                        }
                    }
                }.padding(18)
            }
            .refreshable { await store.refresh() }
        }
        .sheet(item: $editing) { h in HospitalSheet(h: h, isNew: false) }
        .sheet(isPresented: $adding) { HospitalSheet(h: Hospital(name: ""), isNew: true) }
    }
}

struct HospitalCard: View {
    @EnvironmentObject var store: MCIStore
    let h: Hospital
    let canEdit: Bool
    var edit: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(h.name).font(.heavy(23)).foregroundStyle(.white).lineLimit(2)
                    if let l = h.level { Text(l).font(.semi(16)).foregroundStyle(Theme.muted) }
                }
                Spacer()
                Text(h.status.uppercased()).font(.heavy(14)).tracking(1).foregroundStyle(.black)
                    .padding(.horizontal, 9).padding(.vertical, 4).background(h.statusColor, in: Capsule())
            }
            ForEach([Triage.red, .yellow, .green]) { t in
                let n = store.sent(to: h.name, t), cap = h.cap(t)
                HStack(spacing: 10) {
                    Text(t.short).font(.heavy(14)).foregroundStyle(t.ink).frame(width: 66).padding(.vertical, 3).background(t.color, in: RoundedRectangle(cornerRadius: 6))
                    ProgressView(value: Double(min(n, cap ?? max(n, 1))), total: Double(max(cap ?? max(n, 1), 1)))
                        .tint(cap.map { n >= $0 } ?? false ? Theme.red : t.color)
                    Text("\(n) / \(cap.map(String.init) ?? "?")").font(.system(size: 17, weight: .bold, design: .rounded)).foregroundStyle(.white).frame(width: 64, alignment: .trailing)
                }
            }
            HStack {
                if let d = h.driveMin { Label("\(Int(d)) min", systemImage: "car").font(.semi(16)).foregroundStyle(Theme.muted) }
                if let p = h.phone, let u = URL(string: "tel:" + p.filter { $0.isNumber || $0 == "+" }) {
                    Link(destination: u) { Label(p, systemImage: "phone.fill").font(.semi(16)) }
                }
                Spacer()
                Text(h.updated.map { "Updated \($0.ago) ago" } ?? "Not updated").font(.footnote).foregroundStyle(Theme.muted)
            }
            if let n = h.notes { Text(n).font(.callout).foregroundStyle(Theme.muted) }
            if canEdit { Button(action: edit) { Label("Update", systemImage: "square.and.pencil").frame(maxWidth: .infinity) }.buttonStyle(.bordered) }
        }.card(16, tint: h.closed ? Theme.red : nil)
    }
}

struct HospitalSheet: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    @State var h: Hospital
    let isNew: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section("Hospital") {
                    TextField("Name", text: $h.name)
                    TextField("Capability (Level I trauma, burn, pediatric)", text: Binding(get: { h.level ?? "" }, set: { h.level = $0.nilIfBlank }))
                    Picker("Status", selection: $h.status) { ForEach(Lists.hospStatus, id: \.self) { Text($0) } }.pickerStyle(.segmented)
                }
                Section {
                    cap("Immediate (Red)", \.capRed)
                    cap("Delayed (Yellow)", \.capYellow)
                    cap("Minor (Green)", \.capGreen)
                } header: { Text("Can take") } footer: { Text("Leave blank if you don't know yet.") }
                Section("Contact") {
                    TextField("ED / medical control phone", text: Binding(get: { h.phone ?? "" }, set: { h.phone = $0.nilIfBlank })).keyboardType(.phonePad)
                    TextField("Drive time (minutes)", text: Binding(get: { h.driveMin.map { String(Int($0)) } ?? "" }, set: { h.driveMin = Double($0.filter(\.isNumber)) })).keyboardType(.numberPad)
                    TextField("Notes", text: Binding(get: { h.notes ?? "" }, set: { h.notes = $0.nilIfBlank }), axis: .vertical)
                }
            }
            .scrollContentBackground(.hidden).background(Backdrop())
            .navigationTitle(isNew ? "Add hospital" : h.name).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { store.saveHospital(h, isNew: isNew); Haptic.done(); dismiss() }.font(.heavy(19)).disabled(h.name.nilIfBlank == nil)
                }
            }
        }
    }

    private func cap(_ label: String, _ k: WritableKeyPath<Hospital, Int?>) -> some View {
        HStack {
            Text(label)
            Spacer()
            Button { h[keyPath: k] = max(0, (h[keyPath: k] ?? 0) - 1) } label: { Image(systemName: "minus.circle.fill").font(.title2) }.buttonStyle(.plain)
            Text(h[keyPath: k].map(String.init) ?? "?").font(.system(size: 22, weight: .heavy, design: .rounded)).frame(minWidth: 44)
            Button { h[keyPath: k] = (h[keyPath: k] ?? 0) + 1 } label: { Image(systemName: "plus.circle.fill").font(.title2) }.buttonStyle(.plain)
            Button("Clear") { h[keyPath: k] = nil }.font(.footnote).buttonStyle(.plain).foregroundStyle(Theme.muted)
        }
    }
}
