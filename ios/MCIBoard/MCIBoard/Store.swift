import Foundation
import Network
import SwiftUI
import UIKit

/// Everything on the board: the incident, its patients, the hospital board, and changes waiting to reach ArcGIS.
/// Triage never waits for the network: a patient appears at once and is sent in the background,
/// in order, and kept on this iPad until ArcGIS has it.
@MainActor
final class MCIStore: ObservableObject {
    @Published var incidents: [Incident] = []
    @Published var incidentsLoading = false
    @Published var incidentsError: String?
    @Published private(set) var incident: Incident?
    @Published var patients: [Patient] = []
    @Published var hospitals: [Hospital] = []
    @Published var units: [CadUnit] = []
    @Published var counts = Summary()
    @Published var outbox: [Edit] = []
    @Published var online = true
    @Published var lastSync: Date?
    @Published var syncError: String?
    @Published var toast: Toast?

    private weak var sessions: SessionStore?
    private(set) var services = Services.from([])
    /// Whose copy is open (GateSession.owner: gate id, else email). Truck iPads can have no email.
    private var email = ""
    private var loop: Task<Void, Never>?
    private let monitor = NWPathMonitor()
    private var monitoring = false
    private var flushing = false
    private var refreshing = false
    /// The outbox entry being sent right now (never fold a newer change into it).
    private var inFlight: String?
    /// Patients that just reached ArcGIS: kept on screen even if an older refresh doesn't have them yet.
    private var sentAt: [String: Date] = [:]
    /// Last change here or in ArcGIS; the board polls faster while things are moving.
    private var lastActivity = Date()
    private var bgTask: UIBackgroundTaskIdentifier = .invalid
    private var lastHosp = Date.distantPast, lastUnits = Date.distantPast, lastMe = Date.distantPast
    let location = LocationOnce()

    var level: Level { Level(sessions?.session?.level) }
    var me: String { sessions?.session?.name ?? "" }
    var isDevice: Bool { sessions?.session?.isDevice ?? false }
    /// Users page (the gate's own page): Chief and up or a User manager; never on a truck iPad account.
    var canManageUsers: Bool { !isDevice && (level.rank >= 5 || sessions?.session?.role == "User manager") }
    var usersURL: URL? {
        guard let t = token else { return nil }
        return URL(string: AppConfig.gateURL.absoluteString + "/users#t=" + t)   // token in the fragment: never sent to a server log
    }
    private var token: String? { sessions?.session?.token }

    // MARK: start / stop

    func start(_ s: SessionStore) async {
        sessions = s
        guard let sess = s.session else { stop(); clearMemory(); return }
        services = Services.from(sess.layers)
        if !monitoring {
            monitoring = true
            monitor.pathUpdateHandler = { [weak self] path in
                Task { @MainActor in
                    guard let self else { return }
                    let up = path.status == .satisfied
                    if up && !self.online { self.online = true; self.kick() } else if !up { self.online = false }
                }
            }
            monitor.start(queue: DispatchQueue(label: "mci.net"))
        }
        if email != sess.owner { load(for: sess.owner, alt: sess.email) }
        await refreshMe(force: true)
        resume()
        if let k = wantKey { wantKey = nil; await open(key: k) }
        else if incident == nil { await loadIncidents() }
    }

    /// Opened from the Command Board app (beaconmci://open?incident=KEY): go straight to that incident.
    private var wantKey: String?
    func open(key: String) async {
        guard sessions?.session != nil else { wantKey = key; return }
        if incident?.key == key { return }
        await loadIncidents()
        if let i = incidents.first(where: { $0.key == key }) { open(i) }
        else { show(Toast(text: "That incident isn't open in Command Post", kind: .warn)) }
    }

    func resume() {
        guard sessions?.session != nil, loop == nil else { return }
        loop = Task { [weak self] in
            while !Task.isCancelled {
                await self?.tick()
                let wait = self?.interval ?? AppConfig.refreshSeconds
                try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
            }
        }
    }

    /// 10 s while things are moving, 30 s after 5 quiet minutes, 60 s with no incident open.
    private var interval: Double {
        if incident == nil { return AppConfig.noIncidentSeconds }
        if !outbox.isEmpty || Date().timeIntervalSince(lastActivity) < 300 { return AppConfig.refreshSeconds }
        return AppConfig.idleRefreshSeconds
    }

    func pause() { loop?.cancel(); loop = nil; save() }
    func stop() { pause() }

    /// Leaving the screen: ask iPadOS for time to finish sending what's waiting.
    func goingAway() {
        pause()
        guard !outbox.isEmpty else { return }
        bgTask = UIApplication.shared.beginBackgroundTask(withName: "mci-send") { [weak self] in
            Task { @MainActor in self?.endBackground() }
        }
        Task { await flush(); save(); endBackground() }
    }
    private func endBackground() {
        if bgTask != .invalid { UIApplication.shared.endBackgroundTask(bgTask); bgTask = .invalid }
    }

    /// Send now and refresh (after a change, or when the network comes back).
    func kick() { Task { await flush(); await refresh() } }

    private func tick() async {
        if Date().timeIntervalSince(lastMe) > 300 { await refreshMe() }
        await flush()
        await refresh()
    }

    private func refreshMe(force: Bool = false) async {
        guard let s = sessions, var sess = s.session else { return }
        lastMe = Date()
        guard let me = await Gate.me(sess.token) else { return }   // offline: carry on with what we have
        let status = me["_status"] as? Int ?? 0
        if status == 403 { signOut(wipe: true); return }      // access removed: nothing stays on the iPad
        if status == 401 { signOut(wipe: false); return }     // expired: sign in again, unsent work is kept
        guard status == 200 else { return }
        if let t = me["token"] as? String, !t.isEmpty { sess.token = t }
        sess.level = me["level"] as? String ?? sess.level
        sess.name = me["name"] as? String ?? sess.name
        if let k = me["kind"] as? String { sess.kind = k }
        if let u = me["uid"] as? String, !u.isEmpty { sess.uid = u }
        sess.role = me["role"] as? String
        // access lowered on the Users page: drop what this level may no longer see, at once
        let was = Level(s.session?.level), now = Level(sess.level)
        if now.countsOnly && !was.countsOnly { patients = []; save() }
        else if !now.names && was.names { patients = patients.map { var p = $0; p.firstName = nil; p.lastName = nil; p.reunCase = nil; return p }; save() }
        sess.layers = (me["layers"] as? [[String: Any]] ?? []).compactMap { $0["url"] as? String }
        services = Services.from(sess.layers)
        if sess != s.session { s.set(sess) }
    }

    /// wipe: true for a chosen sign-out or removed access. false when the session simply expired: the encrypted copy
    /// (with anything unsent) stays for the same person's next sign-in, and is still cleared after keepDays.
    func signOut(wipe: Bool = true) {
        stop()
        if wipe { Vault.wipe(); UserDefaults.standard.removeObject(forKey: "incidentKey") } else { save() }
        clearMemory()
        sessions?.signOut()
    }

    private func clearMemory() {
        incident = nil; patients = []; hospitals = []; units = []; outbox = []; counts = Summary(); incidents = []
        email = ""; lastSync = nil; syncError = nil; sentAt = [:]; inFlight = nil
    }

    // MARK: this iPad's copy

    /// `alt`: the email the copy was saved under before sessions carried the gate id (so nothing unsent is lost on update).
    private func load(for who: String, alt: String = "") {
        email = who
        guard let v = Vault.load(), v.email == who || (!alt.isEmpty && v.email == alt) else { Vault.wipe(); return }
        incident = v.incident; patients = v.patients; hospitals = v.hospitals; units = v.units; outbox = v.outbox
    }

    func save() {
        guard !email.isEmpty else { return }
        Vault.save(Vault.Data(email: email, incident: incident, patients: patients, hospitals: hospitals, units: units, outbox: outbox))
    }

    // MARK: incidents

    func loadIncidents() async {
        guard let tok = token else { return }
        incidentsLoading = true; incidentsError = nil
        defer { incidentsLoading = false }
        var list: [Incident] = []
        do { list = try await Api.incidents(services, token: tok) }
        catch { incidentsError = (error as? ArcError)?.offline == true ? "No connection. Recent incidents on this iPad are below." : error.localizedDescription }
        var more: [Incident] = []
        if level.canEdit {
            do { more = try await Api.standaloneIncidents(services, token: tok) } catch { more = [] }
        }
        more += recentStandalone
        for i in more {
            if !list.contains(where: { $0.key == i.key }) { list.append(i) }
        }
        if let cur = incident, !list.contains(where: { $0.key == cur.key }) { list.insert(cur, at: 0) }
        incidents = list
    }

    func open(_ i: Incident) {
        if incident?.key != i.key { patients = []; counts = Summary() }
        incident = i
        UserDefaults.standard.set(i.key, forKey: "incidentKey")
        lastHosp = .distantPast
        save(); kick()
    }

    func leave() { incident = nil; patients = []; counts = Summary(); save() }

    /// An MCI with no Command Post incident (Command Board can link it later). Other iPads join it from the list.
    func startStandalone(name: String, practice: Bool) {
        let f = DateFormatter(); f.dateFormat = "yyyyMMdd-HHmm"; f.locale = Locale(identifier: "en_US_POSIX")
        let suffix = String((0..<2).map { _ in "ABCDEFGHJKLMNPQRSTUVWXYZ".randomElement()! })
        let i = Incident(key: "MCI-" + f.string(from: Date()) + "-" + suffix, name: name, type: "Mass casualty", start: Date(), exercise: practice, standalone: true,
                         lat: location.recent?.latitude, lon: location.recent?.longitude)
        var r = recentStandalone; r.insert(i, at: 0); recentStandalone = Array(r.prefix(10))
        open(i)
    }

    private var recentStandalone: [Incident] {
        get { (UserDefaults.standard.data(forKey: "standalone").flatMap { try? JSONDecoder().decode([Incident].self, from: $0) } ?? [])
                .filter { ($0.start ?? .distantPast) > Date().addingTimeInterval(-7 * 86400) } }
        set { UserDefaults.standard.set(try? JSONEncoder().encode(newValue), forKey: "standalone") }
    }

    // MARK: reading from ArcGIS

    func refresh() async {
        guard let inc = incident, let tok = token, !refreshing else { return }
        refreshing = true
        defer { refreshing = false }
        do {
            if level.countsOnly {
                let c = try await Api.summary(services, incident: inc.key, token: tok)
                if c != counts { counts = c; lastActivity = Date() }
            } else {
                merge(try await Api.patients(services, incident: inc.key, token: tok))
            }
            if Date().timeIntervalSince(lastHosp) > 30 {
                let h = try await Api.hospitals(services, token: tok)
                let waiting = Set(outbox.filter { $0.kind == .updateHospital || $0.kind == .addHospital }.compactMap(\.lid))
                hospitals = h.map { s in hospitals.first(where: { $0.oid == s.oid && waiting.contains($0.lid) }) ?? s }
                    + hospitals.filter { $0.oid == nil && waiting.contains($0.lid) }
                lastHosp = Date()
            }
            if level.canEdit && Date().timeIntervalSince(lastUnits) > 60 {
                lastUnits = Date()
                do { units = try await Api.units(services, token: tok) } catch { }
            }
            online = true; lastSync = Date(); syncError = nil
            save()
        } catch let e as ArcError {
            if e.code == 401 { signOut(wipe: false); return }
            if e.offline { online = false } else { syncError = e.message }
        } catch { syncError = error.localizedDescription }
    }

    /// ArcGIS is the record; a patient with a change still waiting to send keeps this iPad's version until it goes.
    private func merge(_ server: [Patient]) {
        let waiting = Set(outbox.filter { $0.kind == .addPatient || $0.kind == .updatePatient }.compactMap(\.lid))
        var lidFor: [Int: String] = [:]
        for p in patients { if let o = p.oid { lidFor[o] = p.lid } }
        var out: [Patient] = []
        for var s in server {
            guard let o = s.oid else { continue }
            if let l = lidFor[o] {
                if waiting.contains(l), let mine = patients.first(where: { $0.lid == l }) { out.append(mine); continue }
                s.lid = l
            }
            out.append(s)
        }
        out += patients.filter { $0.oid == nil && waiting.contains($0.lid) }
        // just sent but not in this answer yet (it was asked for before ArcGIS had it): keep it
        let have = Set(server.compactMap(\.oid))
        out += patients.filter { p in
            guard let o = p.oid, !have.contains(o), let t = sentAt[p.lid] else { return false }
            return Date().timeIntervalSince(t) < 90
        }
        if out != patients { patients = out; lastActivity = Date() }
    }

    // MARK: counts

    var summary: Summary {
        if level.countsOnly { return counts }
        var s = Summary()
        for p in patients where p.counted {
            guard let t = p.triage else { continue }
            s.total += 1; s.by[t, default: 0] += 1
            let st = p.status ?? .onScene
            if st.moved {
                s.transported += 1; s.moved[t, default: 0] += 1
                if let h = p.hospital { s.byHospital[h, default: [:]][t, default: 0] += 1 }
            } else if !st.done {
                s.onScene += 1
                s.waiting[t, default: 0] += 1
                if t == .red || t == .yellow {
                    s.waitingRY += 1
                    if let tt = p.triageTime, tt < (s.oldestWaiting ?? .distantFuture) { s.oldestWaiting = tt }
                }
            }
        }
        return s
    }

    func sent(to hospital: String, _ t: Triage) -> Int {
        patients.filter { $0.counted && $0.hospital == hospital && $0.triage == t && ($0.status?.moved ?? false) }.count
    }

    /// Tags on more than one patient in this incident.
    var dupeTags: [String] {
        var seen: [String: Int] = [:], shown: [String: String] = [:]
        for p in patients where p.counted { let k = p.tag.lowercased(); seen[k, default: 0] += 1; shown[k] = p.tag }
        return seen.filter { $0.value > 1 }.map { shown[$0.key] ?? $0.key }.sorted { $0.localizedStandardCompare($1) == .orderedAscending }
    }

    func isPending(_ p: Patient) -> Bool { outbox.contains { $0.lid == p.lid } }
    func tagInUse(_ tag: String) -> Patient? {
        let t = tag.trimmingCharacters(in: .whitespaces).lowercased()
        return patients.first { $0.counted && $0.tag.lowercased() == t }
    }

    // MARK: changes (all go through the outbox)

    @discardableResult
    func triage(tag: String, as t: Triage, ageGroup: String?, sex: String?, foundAt: String?, injuries: String?) -> Patient? {
        guard let inc = incident, level.canEdit else { return nil }
        let before = summary.total
        var p = Patient(incident: inc, tag: tag.trimmingCharacters(in: .whitespaces), triage: t)
        p.ageGroup = ageGroup; p.sex = sex; p.foundAt = foundAt; p.injuries = injuries
        let ll = location.recent
        patients.insert(p, at: 0)
        lastActivity = Date()
        outbox.append(Edit(kind: .addPatient, lid: p.lid, label: "Tag \(p.tag) · \(t.short)", attrs: p.attrs(names: false),
                           lat: ll?.latitude ?? inc.lat, lon: ll?.longitude ?? inc.lon))
        save(); kick()
        let after = summary.total
        if MCILevel.of(after) != MCILevel.of(before) {
            let l = MCILevel.of(after)
            show(Toast(text: "Now MCI Level \(l) · \(after) patients" + (l <= 2 ? " · Notify RHCC" : ""), kind: .warn))
        }
        return p
    }

    /// Saves only the fields that changed between `old` (what the person started from) and `new`,
    /// applied on top of the latest copy, so a change made meanwhile on another iPad isn't undone.
    func update(_ new: Patient, from old: Patient) {
        guard level.canEdit else { return }
        let names = level.names
        let a = new.attrs(names: names), b = old.attrs(names: names)
        let diff = a.filter { b[$0.key] != $0.value }
        guard !diff.isEmpty else { return }
        let base = patients.first { $0.lid == new.lid } ?? old
        let merged = base.applying(diff)
        if let i = patients.firstIndex(where: { $0.lid == new.lid }) { patients[i] = merged }
        if let j = outbox.firstIndex(where: { $0.kind == .addPatient && $0.lid == new.lid && $0.id != inFlight }) {
            // not sent yet: fold the change into the add
            outbox[j].attrs.merge(diff) { _, n in n }; outbox[j].label = "Tag \(merged.tag) · \(merged.triage?.short ?? "")"
        } else {
            outbox.append(Edit(kind: .updatePatient, lid: new.lid, oid: merged.oid, label: "Tag \(merged.tag) · " + describe(diff), attrs: diff))
        }
        lastActivity = Date()
        save(); kick()
    }

    /// Undo a triage that was just saved: gone if it hasn't left the iPad, otherwise marked entered in error (never deleted).
    func undo(_ p: Patient) {
        if let j = outbox.firstIndex(where: { $0.kind == .addPatient && $0.lid == p.lid && $0.id != inFlight && $0.sent != true }) {
            outbox.remove(at: j)
            outbox.removeAll { $0.lid == p.lid && $0.kind == .updatePatient }
            patients.removeAll { $0.lid == p.lid }
            save()
        } else {
            var n = p; n.statusRaw = PtStatus.error.rawValue
            update(n, from: p)
        }
        show(Toast(text: "Tag \(p.tag) undone", kind: .warn))
    }

    private func describe(_ d: [String: JV]) -> String {
        if d["hospital"] != nil { return "transport" }
        if d["triage"] != nil { return "re-triage" }
        if d["status"] != nil { return "status" }
        return "update"
    }

    func transport(_ p: Patient, unit: String?, hospital: String) {
        var n = p
        n.unit = unit; n.hospital = hospital; n.statusRaw = PtStatus.transported.rawValue; n.transportTime = Date()
        update(n, from: p)
        show(Toast(text: "Tag \(p.tag) → \(hospital)"))
    }

    func arrived(_ p: Patient) {
        var n = p; n.statusRaw = PtStatus.arrived.rawValue; n.arriveTime = Date()
        update(n, from: p)
    }

    /// A found person for family reunification (Command and up). HIPAA lets EMS share name, location and general
    /// condition with a disaster relief effort to notify family; the app sends only those.
    func sendToReunification(_ p: Patient) {
        guard level.names, let last = p.lastName, let inc = incident else { return }
        let code = "R-" + String((0..<6).map { _ in "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".randomElement()! })
        var minor = JV.null
        if let a = p.age { minor = JV.s(a < 18 ? "Yes" : "No") }
        else if let g = p.ageGroup, g.hasPrefix("Child") || g.hasPrefix("Infant") { minor = JV.s("Yes") }
        let attrs: [String: JV] = [
            "incident_key": .s(inc.key), "incident_name": .str(inc.name), "practice": inc.exercise ? .s("Yes") : .null,
            "case_no": .s(code), "rec_type": .s("Hospitalized"), "status": .s("Hospitalized"),
            "first_name": .str(p.firstName), "last_name": .s(last), "age": .num(p.age), "sex": .str(p.sex),
            "is_minor": minor,
            "located_at": .s(p.hospital.map { "Transported to " + $0 } ?? "MCI scene (tag \(p.tag))"),
            "notes": .s("From MCI tag \(p.tag)")
        ]
        outbox.append(Edit(kind: .addReunify, lid: nil, label: "Reunification · \(last)", attrs: attrs))
        var n = p; n.reunCase = code
        update(n, from: p)
        show(Toast(text: "Sent to Reunification (\(code))"))
    }

    func saveHospital(_ h: Hospital, isNew: Bool) {
        guard level.canEdit else { return }
        var h = h; h.updated = Date()
        if isNew {
            hospitals.append(h)
            outbox.append(Edit(kind: .addHospital, lid: h.lid, label: h.name, attrs: h.attrs()))
        } else {
            if let i = hospitals.firstIndex(where: { $0.lid == h.lid }) { hospitals[i] = h }
            if let j = outbox.firstIndex(where: { $0.kind == .addHospital && $0.lid == h.lid && $0.id != inFlight }) { outbox[j].attrs = h.attrs() }
            else if let oid = h.oid { outbox.append(Edit(kind: .updateHospital, lid: h.lid, oid: oid, label: h.name, attrs: h.attrs())) }
        }
        lastActivity = Date()
        save(); kick()
    }

    func seedHospitals() {
        for (n, l) in Lists.eopHospitals {
            if hospitals.contains(where: { $0.name == n }) { continue }
            var h = Hospital(name: n, level: l); h.status = "Unknown"
            saveHospital(h, isNew: true)
        }
    }

    // MARK: sending

    func flush() async {
        guard !flushing, let tok = token, !outbox.isEmpty else { return }
        flushing = true
        defer { flushing = false }
        send: for id in outbox.map(\.id) {
            guard let e = outbox.first(where: { $0.id == id }) else { continue }
            if !e.due { continue send }   // ArcGIS refused it recently: wait a little longer before asking again
            inFlight = id
            defer { inFlight = nil }
            do {
                switch e.kind {
                case .addPatient:
                    var found: Int?
                    // it went out before and the answer was lost: don't make a second copy if ArcGIS already has it
                    if e.sent == true { found = try await Api.findPatient(services, e.attrs, token: tok) }
                    if found == nil {
                        if let i = outbox.firstIndex(where: { $0.id == id }) { outbox[i].sent = true; save() }
                        found = try await Api.add(services.patientLayer, e.attrs, lat: e.lat, lon: e.lon, token: tok)
                    }
                    guard let oid = found else { continue send }
                    if let i = patients.firstIndex(where: { $0.lid == e.lid }) { patients[i].oid = oid }
                    for j in outbox.indices where outbox[j].lid == e.lid { outbox[j].oid = oid }
                    if let l = e.lid { sentAt[l] = Date() }
                case .updatePatient:
                    guard let oid = e.oid ?? patients.first(where: { $0.lid == e.lid })?.oid else { continue send }   // its add hasn't gone yet
                    try await Api.update(services.patientLayer, oid: oid, e.attrs, token: tok)
                case .addHospital:
                    let oid = try await Api.add(services.hospitalLayer, e.attrs, lat: nil, lon: nil, token: tok)
                    if let i = hospitals.firstIndex(where: { $0.lid == e.lid }) { hospitals[i].oid = oid }
                    for j in outbox.indices where outbox[j].lid == e.lid { outbox[j].oid = oid }
                case .updateHospital:
                    guard let oid = e.oid ?? hospitals.first(where: { $0.lid == e.lid })?.oid else { continue send }
                    try await Api.update(services.hospitalLayer, oid: oid, e.attrs, token: tok)
                case .addReunify:
                    _ = try await Api.add(services.reunifyLayer, e.attrs, lat: nil, lon: nil, token: tok)
                }
                outbox.removeAll { $0.id == id }
                online = true
                save()
            } catch let er as ArcError {
                if er.code == 401 { signOut(wipe: false); return }
                if er.offline { online = false; break send }
                if let i = outbox.firstIndex(where: { $0.id == id }) { outbox[i].tries += 1; outbox[i].lastTry = Date(); outbox[i].error = er.message }
                save()
            } catch {
                if let i = outbox.firstIndex(where: { $0.id == id }) { outbox[i].tries += 1; outbox[i].lastTry = Date(); outbox[i].error = error.localizedDescription }
                save()
            }
        }
    }

    /// "Send now" on the Unsent screen: try everything again straight away, ignoring the wait between tries.
    func retryNow() {
        for i in outbox.indices { outbox[i].lastTry = nil }
        kick()
    }

    /// Drop a change that ArcGIS keeps refusing (Command and up; from the Unsent screen).
    func discard(_ e: Edit) {
        outbox.removeAll { $0.id == e.id }
        if e.kind == .addPatient { patients.removeAll { $0.lid == e.lid && $0.oid == nil } }
        if e.kind == .addHospital { hospitals.removeAll { $0.lid == e.lid && $0.oid == nil } }
        lastHosp = .distantPast
        save(); kick()
    }

    func show(_ t: Toast) {
        toast = t
        let id = t.id
        Task { try? await Task.sleep(nanoseconds: 3_200_000_000); if toast?.id == id { toast = nil } }
    }
}
