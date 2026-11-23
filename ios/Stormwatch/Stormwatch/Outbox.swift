import Foundation
import Network
import BackgroundTasks
import UIKit

struct PendingReport: Codable, Identifiable {
    enum Stage: String, Codable { case saving, alert, done, failed }
    struct PhotoFile: Codable { let id: UUID; let file: String; var objectId: Int? }

    let id: UUID                      // also the report's GlobalID in ArcGIS
    let kind: ReportKind
    let created: Date
    var values: [String: String]      // field name → value, exactly as saved
    var summary: String
    var lat: Double
    var lng: Double
    var address: String?
    var photos: [PhotoFile]
    var photoKeyword: String?
    var stage: Stage = .saving
    var objectId: Int?
    var attempts = 0
    var lastError: String?
    var alertNote: String?            // set when the report saved but no alert went out
    var sentAt: Date?
}

/// Reports waiting to be sent. Each report is saved on the phone the moment it's submitted, then sent:
/// save to ArcGIS (with photos) → start the alert flow. Anything that fails is tried again when the
/// connection comes back, every 30 seconds while the app is open, and in the background.
@MainActor
final class Outbox: ObservableObject {
    static let shared = Outbox()
    static let bgTaskId = "org.bocoem.stormwatch.send"

    @Published private(set) var items: [PendingReport] = []
    @Published private(set) var online = true
    @Published private(set) var sending = false

    var waiting: [PendingReport] { items.filter { $0.stage == .saving || $0.stage == .alert } }
    var problems: [PendingReport] { items.filter { $0.stage == .failed } }

    private let dir: URL
    private let monitor = NWPathMonitor()
    private var timer: Timer?

    init() {
        dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Outbox", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        load()
        monitor.pathUpdateHandler = { path in
            Task { @MainActor in
                let o = Outbox.shared
                let was = o.online
                o.online = path.status == .satisfied
                if o.online && !was { o.kick() }
            }
        }
        monitor.start(queue: DispatchQueue(label: "sw.net"))
        timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { _ in
            Task { @MainActor in if !Outbox.shared.waiting.isEmpty { Outbox.shared.kick() } }
        }
    }

    // MARK: Storage

    private func file(_ id: UUID) -> URL { dir.appendingPathComponent("\(id.uuidString).json") }
    func photoURL(_ name: String) -> URL { dir.appendingPathComponent(name) }

    private func load() {
        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        items = files.filter { $0.pathExtension == "json" }
            .compactMap { try? JSONDecoder().decode(PendingReport.self, from: Data(contentsOf: $0)) }
            .sorted { $0.created > $1.created }
        // Sent reports stay listed for 3 days, then they and their photos are cleared off the phone.
        let cutoff = Date().addingTimeInterval(-3 * 86400)
        for r in items where r.stage == .done && (r.sentAt ?? r.created) < cutoff { remove(r) }
    }

    private func persist(_ r: PendingReport) {
        if let i = items.firstIndex(where: { $0.id == r.id }) { items[i] = r } else { items.insert(r, at: 0) }
        if let d = try? JSONEncoder().encode(r) {
            try? d.write(to: file(r.id), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
    }

    func remove(_ r: PendingReport) {
        try? FileManager.default.removeItem(at: file(r.id))
        r.photos.forEach { try? FileManager.default.removeItem(at: photoURL($0.file)) }
        items.removeAll { $0.id == r.id }
    }

    // MARK: Adding

    func add(kind: ReportKind, values: [String: String], summary: String, lat: Double, lng: Double, address: String?, photos: [Data], photoKeyword: String?) {
        let id = UUID()
        var files: [PendingReport.PhotoFile] = []
        for (i, p) in photos.enumerated() {
            let n = "\(id.uuidString)-\(i + 1).jpg"
            try? p.write(to: photoURL(n), options: .completeFileProtectionUntilFirstUserAuthentication)
            files.append(.init(id: UUID(), file: n))
        }
        persist(PendingReport(id: id, kind: kind, created: Date(), values: values, summary: summary, lat: lat, lng: lng,
                              address: address, photos: files, photoKeyword: photoKeyword))
        kick()
    }

    func retry(_ r: PendingReport) {
        var r = r
        r.stage = r.objectId == nil && r.sentAt == nil ? .saving : .alert
        r.lastError = nil
        r.attempts = 0
        persist(r)
        kick()
    }

    // MARK: Sending

    func kick() { Task { await sendAll() } }

    func sendAll() async {
        guard !sending else { return }
        sending = true
        defer { sending = false; scheduleBackground() }
        for r in waiting.reversed() { await send(r) } // oldest first
    }

    private func send(_ start: PendingReport) async {
        var r = start
        r.attempts += 1
        do {
            if r.stage == .saving {
                let photos = r.photos.compactMap { p -> ArcGIS.Photo? in
                    guard let d = try? Data(contentsOf: photoURL(p.file)) else { return nil }
                    return ArcGIS.Photo(globalId: p.id, name: "\(r.photoKeyword ?? "photo")-\(p.file.suffix(5))", jpeg: d)
                }
                let res = try await ArcGIS.submit(layer: r.kind.submitLayer, globalId: r.id, attributes: r.values,
                                                  lat: r.lat, lng: r.lng, photos: photos, keyword: r.photoKeyword)
                r.objectId = res.objectId
                for (n, a) in res.attachments.enumerated() {
                    // Match by photo ID; fall back to order if ArcGIS returns its own IDs.
                    let i = r.photos.firstIndex { ArcGIS.gid($0.id) == a.globalId.uppercased() } ?? (n < r.photos.count ? n : nil)
                    if let i { r.photos[i].objectId = a.objectId }
                }
                r.stage = .alert
                r.lastError = nil
                persist(r)
            }
            if r.stage == .alert {
                r.alertNote = try await Alerts.send(r)
                r.stage = .done
                r.sentAt = Date()
                r.lastError = nil
                persist(r)
            }
        } catch let f as ArcGIS.Failure {
            r.lastError = f.message
            // A refusal that can't fix itself (a bad value, a changed form) stops here so the person sees it.
            if !f.retryable { r.stage = .failed }
            persist(r)
        } catch let f as Alerts.Failure {
            r.lastError = f.message
            if !f.retryable || r.attempts >= 20 {
                // The report is saved in ArcGIS; only the alert did not go out. Say so plainly.
                r.alertNote = "Saved, but the alert did not go out: \(f.message)"
                r.stage = .done
                r.sentAt = Date()
            }
            persist(r)
        } catch {
            r.lastError = error.localizedDescription
            persist(r)
        }
    }

    // MARK: Background

    static func registerBackground() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: bgTaskId, using: nil) { task in
            Task { @MainActor in
                task.expirationHandler = { task.setTaskCompleted(success: false) }
                await Outbox.shared.sendAll()
                task.setTaskCompleted(success: Outbox.shared.waiting.isEmpty)
            }
        }
    }

    func scheduleBackground() {
        guard !waiting.isEmpty else { return }
        let req = BGProcessingTaskRequest(identifier: Self.bgTaskId)
        req.requiresNetworkConnectivity = true
        req.earliestBeginDate = Date().addingTimeInterval(60)
        try? BGTaskScheduler.shared.submit(req)
    }

    /// When the app is put away, ask iOS for a little more time to finish what's in progress.
    func finishInBackground() {
        guard !waiting.isEmpty else { return }
        let box = BackgroundTaskBox()
        box.id = UIApplication.shared.beginBackgroundTask(withName: "Send reports") { box.end() }
        Task { @MainActor in
            await sendAll()
            box.end()
        }
        scheduleBackground()
    }
}

/// Holds the id iOS gives for "a little more time", so it can be handed back exactly once.
@MainActor
final class BackgroundTaskBox {
    var id: UIBackgroundTaskIdentifier = .invalid
    func end() {
        guard id != .invalid else { return }
        UIApplication.shared.endBackgroundTask(id)
        id = .invalid
    }
}
