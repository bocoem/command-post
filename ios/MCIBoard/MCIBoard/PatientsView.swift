import SwiftUI

struct PatientsView: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.horizontalSizeClass) private var hsize
    @State private var q = ""
    @State private var filter = "On scene"
    @State private var colors: Set<Triage> = []
    @State private var open: Patient?
    @State private var moving: Patient?

    var body: some View {
        ZStack {
            Backdrop()
            VStack(spacing: 12) {
                controls
                if !store.dupeTags.isEmpty { DupeTagsBar(tags: store.dupeTags) }
                let list = shown
                if list.isEmpty {
                    ContentUnavailableView(store.patients.isEmpty ? "No patients yet" : "Nobody matches", systemImage: "person.3",
                                           description: Text(store.patients.isEmpty ? "Triage patients from the Triage screen." : "Change the search or filters."))
                } else {
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(list) { p in
                                PatientRow(p: p, pending: store.isPending(p), names: store.level.names,
                                           onTransport: { moving = p }, onArrived: { store.arrived(p) })
                                    .onTapGesture { open = p }
                                    .contextMenu { quickMenu(p) }
                            }
                        }.padding(.bottom, 20)
                    }.scrollDismissesKeyboard(.interactively)
                }
            }.padding(.horizontal, hsize == .compact ? 12 : 18).padding(.top, hsize == .compact ? 10 : 14)
        }
        .sheet(item: $open) { p in PatientSheet(patient: p) }
        .sheet(item: $moving) { p in TransportSheet(patient: p) }
    }

    private var controls: some View {
        VStack(spacing: 10) {
            // iPhone: search on its own line, the filter under it
            (hsize == .compact ? AnyLayout(VStackLayout(spacing: 8)) : AnyLayout(HStackLayout(spacing: 10))) {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundStyle(Theme.muted)
                    TextField(store.level.names ? "Tag, name, injury, unit, hospital" : "Tag, injury, unit, hospital", text: $q)
                        .autocorrectionDisabled().textInputAutocapitalization(.never)
                    if !q.isEmpty { Button { q = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.muted) } }
                }.field()
                Picker("", selection: $filter) {
                    ForEach(["On scene", "All", "Transported"], id: \.self) { Text($0) }
                }.pickerStyle(.segmented).frame(maxWidth: hsize == .compact ? CGFloat.infinity : 380)
            }
            ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 8) {
                ForEach(Triage.allCases) { t in
                    let on = colors.contains(t), n = store.patients.filter { $0.counted && $0.triage == t && matchesFilter($0) }.count
                    Button { if on { colors.remove(t) } else { colors.insert(t) }; Haptic.tap() } label: {
                        HStack(spacing: 6) { Text(t.short).font(.heavy(15)); Text("\(n)").font(.system(size: 15, weight: .heavy, design: .rounded)) }
                            .foregroundStyle(on || colors.isEmpty ? t.ink : .white.opacity(0.7))
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .background((on || colors.isEmpty ? t.color : Theme.card), in: Capsule())
                            .overlay(Capsule().stroke(on ? Color.white : .clear, lineWidth: 2))
                    }.buttonStyle(.plain)
                }
                Spacer()
            } }
        }
    }

    @ViewBuilder private func quickMenu(_ p: Patient) -> some View {
        Section("Re-triage tag \(p.tag)") {
            ForEach(Triage.allCases.filter { $0 != p.triage }) { t in
                Button(t.short + " · " + t.word) { store.update(p.retriaged(t), from: p) }
            }
        }
        Section("Status") {
            ForEach(PtStatus.pickable.filter { $0.rawValue != p.statusRaw }) { st in
                Button(st.rawValue) {
                    if st == .transported { moving = p; return }
                    var n = p; n.statusRaw = st.rawValue; if st == .arrived { n.arriveTime = Date() }; store.update(n, from: p)
                }
            }
        }
    }

    private func matchesFilter(_ p: Patient) -> Bool {
        let st = p.status ?? .onScene
        switch filter {
        case "On scene": return !st.done
        case "Transported": return st.moved
        default: return true
        }
    }

    private var shown: [Patient] {
        let words = q.lowercased().split(separator: " ").map(String.init)
        return store.patients.filter { p in
            guard p.counted, matchesFilter(p), colors.isEmpty || (p.triage.map { colors.contains($0) } ?? false) else { return false }
            if words.isEmpty { return true }
            let hay = [p.tag, p.injuries, p.unit, p.hospital, p.foundAt, p.statusRaw, store.level.names ? p.name : nil].compactMap { $0 }.joined(separator: " ").lowercased()
            return words.allSatisfy { hay.contains($0) }
        }.sorted {
            let a = $0.triage?.order ?? 9, b = $1.triage?.order ?? 9
            return a != b ? a < b : ($0.triageTime ?? .distantPast) < ($1.triageTime ?? .distantPast)
        }
    }
}

struct PatientRow: View {
    let p: Patient
    let pending: Bool
    let names: Bool
    var onTransport: () -> Void
    var onArrived: () -> Void
    @Environment(\.horizontalSizeClass) private var hsize

    var body: some View {
        Group { if hsize == .compact { compact } else { wide } }
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.border))
        .contentShape(Rectangle())
    }

    /// iPhone: tag and status on top, who in the middle, where they are going and the button underneath
    private var compact: some View {
        HStack(spacing: 0) {
            Rectangle().fill(p.triage?.color ?? Theme.muted).frame(width: 8)
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    TriageChip(t: p.triage)
                    Text(p.tag).font(.system(size: 22, weight: .heavy, design: .monospaced)).foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.6)
                    Spacer(minLength: 4)
                    if pending { Image(systemName: "arrow.up.circle").foregroundStyle(Theme.gold) }
                    StatusChip(s: p.status, raw: p.statusRaw)
                }
                if names, let n = p.name { Text(n).font(.heavy(19)).foregroundStyle(.white).lineLimit(1) }
                Text(p.who.isEmpty ? "No details yet" : p.who).font(.semi(16)).foregroundStyle(names && p.name != nil ? Theme.muted : .white).lineLimit(2)
                if let i = p.injuries { Text(i).font(.callout).foregroundStyle(Theme.muted).lineLimit(1) }
                HStack(spacing: 8) {
                    if let h = p.hospital {
                        Text([p.unit, "→ " + h].compactMap { $0 }.joined(separator: " ")).font(.semi(15)).foregroundStyle(Theme.blue).lineLimit(1)
                    } else if let t = p.triageTime {
                        Text("On scene \(t.ago)").font(.semi(15)).foregroundStyle(waitColor(t))
                    }
                    Spacer(minLength: 4)
                    action
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
        }
    }

    private var wide: some View {
        HStack(spacing: 0) {
            Rectangle().fill(p.triage?.color ?? Theme.muted).frame(width: 10)
            HStack(alignment: .center, spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    TriageChip(t: p.triage)
                    Text(p.tag).font(.system(size: 26, weight: .heavy, design: .monospaced)).foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.6)
                }.frame(width: 120, alignment: .leading)
                VStack(alignment: .leading, spacing: 4) {
                    if names, let n = p.name { Text(n).font(.heavy(21)).foregroundStyle(.white) }
                    Text(p.who.isEmpty ? "No details yet" : p.who).font(.semi(17)).foregroundStyle(names && p.name != nil ? Theme.muted : .white)
                    if let i = p.injuries { Text(i).font(.callout).foregroundStyle(Theme.muted).lineLimit(1) }
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 6) {
                    HStack(spacing: 6) {
                        if pending { Image(systemName: "arrow.up.circle").foregroundStyle(Theme.gold) }
                        StatusChip(s: p.status, raw: p.statusRaw)
                    }
                    if let h = p.hospital {
                        Text([p.unit, "→ " + h].compactMap { $0 }.joined(separator: " ")).font(.semi(15)).foregroundStyle(Theme.blue).lineLimit(1)
                    } else if let t = p.triageTime {
                        Text("On scene \(t.ago)").font(.semi(15)).foregroundStyle(waitColor(t))
                    }
                }
                action
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
        }
    }

    @ViewBuilder private var action: some View {
        let st = p.status ?? .onScene
        if !st.done && (p.triage == .red || p.triage == .yellow || p.triage == .green) {
            Button(action: onTransport) { Label("Transport", systemImage: "car.fill").font(.heavy(17)) }
                .buttonStyle(.borderedProminent).tint(Theme.blue)
        } else if st == .transported {
            Button(action: onArrived) { Label("Arrived", systemImage: "checkmark").font(.heavy(17)) }
                .buttonStyle(.bordered).tint(Theme.ok)
        }
    }

    private func waitColor(_ t: Date) -> Color {
        let m = -t.timeIntervalSinceNow / 60
        if p.triage == .red && m > 20 { return Theme.red }
        if m > 45 { return Theme.gold }
        return Theme.muted
    }
}

// MARK: - one patient

struct PatientSheet: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    let patient: Patient
    @State private var p: Patient
    @State private var moving = false
    @State private var confirmReun = false
    @State private var confirmError = false

    init(patient: Patient) { self.patient = patient; _p = State(initialValue: patient) }

    private var live: Patient { store.patients.first { $0.lid == patient.lid } ?? patient }
    private var canEdit: Bool { store.level.canEdit }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 12) {
                        Text(p.tag).font(.system(size: 40, weight: .heavy, design: .monospaced))
                        Spacer()
                        if store.isPending(live) { Label("Waiting to send", systemImage: "arrow.up.circle").font(.semi(15)).foregroundStyle(Theme.gold) }
                    }
                    HStack(spacing: 8) {
                        ForEach(Triage.allCases) { t in
                            Button { p = p.retriaged(t); Haptic.tap() } label: {
                                Text(t.short).font(.heavy(17)).foregroundStyle(t.ink).frame(maxWidth: .infinity).padding(.vertical, 12)
                                    .background(t.color.opacity(p.triage == t ? 1 : 0.35), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(p.triage == t ? Color.white : .clear, lineWidth: 3))
                            }.buttonStyle(.plain)
                        }
                    }.disabled(!canEdit)
                    Picker("Status", selection: $p.statusRaw) {
                        ForEach(PtStatus.pickable.filter { $0 != .transported || patient.status == .transported }) { Text($0.rawValue).tag($0.rawValue) }
                        if p.status == nil || p.status == .error { Text(p.statusRaw).tag(p.statusRaw) }
                    }.disabled(!canEdit)
                } header: { Text("Triage") }

                Section("Patient") {
                    Picker("Age group", selection: Binding(get: { p.ageGroup ?? "" }, set: { p.ageGroup = $0.isEmpty ? nil : $0 })) {
                        Text("—").tag(""); ForEach(Lists.ageGroups, id: \.self) { Text($0).tag($0) }
                    }
                    TextField("Age", text: Binding(get: { p.age.map(String.init) ?? "" }, set: { p.age = Int($0.filter(\.isNumber)) })).keyboardType(.numberPad)
                    Picker("Sex", selection: Binding(get: { p.sex ?? "" }, set: { p.sex = $0.isEmpty ? nil : $0 })) {
                        Text("—").tag(""); ForEach(Lists.sexes, id: \.self) { Text($0).tag($0) }
                    }
                }.disabled(!canEdit)

                if store.level.names {
                    Section {
                        TextField("First name", text: opt(\.firstName)).textContentType(.givenName)
                        TextField("Last name", text: opt(\.lastName)).textContentType(.familyName)
                    } header: { Text("Identity") } footer: { Text("Names are shown only to Command level and up. Officers see tags.") }
                }

                Section("Care") {
                    TextField("Injuries / chief complaint", text: opt(\.injuries), axis: .vertical).lineLimit(2...5)
                    TextField("Vitals", text: opt(\.vitals))
                    TextField("Treatment given", text: opt(\.treatment), axis: .vertical).lineLimit(1...4)
                    TextField("Found at / sector", text: opt(\.foundAt))
                    TextField("Notes", text: opt(\.notes), axis: .vertical).lineLimit(1...4)
                }.disabled(!canEdit)

                Section("Transport") {
                    LabeledContent("Unit", value: p.unit ?? "—")
                    LabeledContent("Destination", value: p.hospital ?? "—")
                    if let t = p.triageTime { LabeledContent("Triaged", value: t.formatted(date: .omitted, time: .shortened) + " · \(t.ago) ago") }
                    if let t = p.transportTime { LabeledContent("Transported", value: t.formatted(date: .omitted, time: .shortened)) }
                    if let t = p.arriveTime { LabeledContent("Arrived", value: t.formatted(date: .omitted, time: .shortened)) }
                    if let by = live.editedBy {
                        LabeledContent("Last changed", value: by + (live.editedAt.map { " · " + $0.formatted(date: .omitted, time: .shortened) } ?? ""))
                    }
                    if canEdit && !(p.status?.done ?? false) && [Triage.red, .yellow, .green].contains(p.triage ?? .black) {
                        Button { saveIfChanged(); moving = true } label: { Label("Transport…", systemImage: "car.fill") }
                    }
                    if canEdit && p.status == .transported {
                        Button { store.arrived(live); dismiss() } label: { Label("Arrived at hospital", systemImage: "checkmark.circle") }
                    }
                }

                if store.level.names {
                    Section {
                        if let c = p.reunCase {
                            LabeledContent("Reunification case", value: c)
                        } else {
                            Button { confirmReun = true } label: { Label("Send to Reunification", systemImage: "person.2.wave.2") }
                                .disabled(p.lastName == nil)
                        }
                        if p.status != .error {
                            Button(role: .destructive) { confirmError = true } label: { Label("Mark entered in error", systemImage: "xmark.bin") }
                        }
                    } header: { Text("Command") } footer: {
                        Text(p.lastName == nil ? "Add a last name to send this person to Reunification." : "Reunification gets the name, age, sex and where the person went, so families can be told. Nothing clinical is sent.")
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Backdrop())
            .navigationTitle("Tag \(p.tag)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                if canEdit { ToolbarItem(placement: .confirmationAction) { Button("Save") { saveIfChanged(); dismiss() }.font(.heavy(19)) } }
            }
            .sheet(isPresented: $moving, onDismiss: { dismiss() }) { TransportSheet(patient: live) }
            .confirmationDialog("Send \(p.name ?? "this patient") to Reunification?", isPresented: $confirmReun, titleVisibility: .visible) {
                Button("Send") { saveIfChanged(); store.sendToReunification(live); dismiss() }
            } message: { Text("Creates a Hospitalized record in Reunification so the family can be told where they are.") }
            .confirmationDialog("Mark tag \(p.tag) entered in error?", isPresented: $confirmError, titleVisibility: .visible) {
                Button("Entered in error", role: .destructive) {
                    var n = p; n.statusRaw = PtStatus.error.rawValue; store.update(n, from: patient); dismiss()
                }
            } message: { Text("It stays in ArcGIS (nothing is deleted) but drops out of every count.") }
        }
    }

    /// Only what was changed on this screen is saved, on top of the latest copy (another iPad may have changed other fields).
    @State private var saved = false
    private func saveIfChanged() {
        guard !saved, p != patient else { return }
        var n = p
        if n.status == .arrived && n.arriveTime == nil { n.arriveTime = Date() }   // picked "Arrived" here: stamp the time
        store.update(n, from: patient); saved = true
    }

    private func opt(_ k: WritableKeyPath<Patient, String?>) -> Binding<String> {
        Binding(get: { p[keyPath: k] ?? "" }, set: { p[keyPath: k] = $0.isEmpty ? nil : $0 })
    }
}
