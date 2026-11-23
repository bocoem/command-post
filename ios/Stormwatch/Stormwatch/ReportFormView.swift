import SwiftUI
import MapKit
import PhotosUI

struct ReportFormView: View {
    @EnvironmentObject var schemas: Schemas
    @EnvironmentObject var outbox: Outbox
    @StateObject private var loc = Location.shared
    @AppStorage("kind") private var kindRaw = ReportKind.responder.rawValue

    @State private var answers: [String: String] = [:]   // question name → value
    @State private var pin: CLLocationCoordinate2D?
    @State private var address: String?
    @State private var photos: [UIImage] = []
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var showCamera = false
    @State private var showMap = false
    @State private var banner: String?
    @State private var showMissing = false

    private var kind: ReportKind { ReportKind(rawValue: kindRaw) ?? .responder }
    private var form: FormSchema { schemas.form(kind) }
    private var point: CLLocationCoordinate2D? { pin ?? loc.coordinate }

    var body: some View {
        NavigationStack {
            Form {
                if let b = banner {
                    Section { Label(b, systemImage: "checkmark.circle.fill").foregroundStyle(.green) }
                }
                Section {
                    Picker("Report as", selection: $kindRaw) {
                        ForEach(ReportKind.allCases) { Text($0.title).tag($0.rawValue) }
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: kindRaw) { _, _ in answers = [:]; photos = []; prefill() }
                }
                locationSection
                Section("Report") {
                    ForEach(shownQuestions.filter { $0.kind != .photo }) { q in
                        QuestionRow(q: q, value: binding(q.name), missing: showMissing && isMissing(q))
                        if let of = q.otherField, answers[q.name] == "other" {
                            TextField(q.otherLabel ?? "Other", text: binding(of, remember: false))
                        }
                    }
                }
                if let pq = form.photo, FormSchema.visible(pq.visibleWhen, answers) { photoSection(pq) }
                Section {
                    Button(action: submit) {
                        Label(outbox.online ? "Send report" : "Save, send when connected", systemImage: "paperplane.fill")
                            .frame(maxWidth: .infinity).font(.headline)
                    }
                } footer: {
                    Text(outbox.online
                         ? "Goes to Stormwatch \(kind.title) reports, the same place as the web form, and starts the \(kind.title.lowercased()) alert."
                         : "No connection. The report stays on this phone and is sent as soon as there is a connection, even if the app is closed.")
                }
            }
            .navigationTitle("\(kind.title) report")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Image(systemName: outbox.online ? "wifi" : "wifi.slash").foregroundStyle(outbox.online ? Color.secondary : Color.orange)
                        .accessibilityLabel(outbox.online ? "Connected" : "No connection")
                }
            }
            .onAppear { loc.start(); prefill() }
            .onChange(of: pickerItems) { _, items in Task { await loadPicked(items) } }
            .sheet(isPresented: $showCamera) { CameraView { img in if let img { photos.append(img) } }.ignoresSafeArea() }
            .sheet(isPresented: $showMap) {
                PinPicker(start: point ?? Location.county) { c in
                    pin = c
                    Task { address = await Location.address(for: c) }
                }
            }
            .task(id: loc.coordinate.map { "\(($0.latitude * 2000).rounded()),\(($0.longitude * 2000).rounded())" }) {
                if pin == nil, let c = loc.coordinate { address = await Location.address(for: c) }
            }
        }
    }

    // MARK: Sections

    private var locationSection: some View {
        Section {
            if let p = point {
                Map(initialPosition: .region(MKCoordinateRegion(center: p, latitudinalMeters: 400, longitudinalMeters: 400)), interactionModes: []) {
                    Marker("Report", coordinate: p).tint(.red)
                    UserAnnotation()
                }
                .id("\(p.latitude),\(p.longitude)")
                .frame(height: 150)
                .listRowInsets(EdgeInsets())
                .onTapGesture { showMap = true }
                VStack(alignment: .leading, spacing: 2) {
                    Text(address ?? String(format: "%.5f, %.5f", p.latitude, p.longitude))
                    Text(pin != nil ? "Pin placed on the map" : "Your location" + (loc.accuracy.map { String(format: " (within %.0f m)", $0) } ?? ""))
                        .font(.caption).foregroundStyle(.secondary)
                }
            } else if loc.status == .denied || loc.status == .restricted {
                Text("Location is off for Stormwatch. Place the pin on the map, or turn location on in Settings.").font(.callout)
            } else {
                HStack { ProgressView(); Text("Finding your location…") }
            }
            HStack {
                Button(pin != nil ? "Move pin" : "Place on map") { showMap = true }
                if pin != nil {
                    Spacer()
                    Button("Use my location") { pin = nil; address = nil }
                }
            }
            .buttonStyle(.borderless)
        } header: { Text(form.locationLabel) }
    }

    private func photoSection(_ q: FormSchema.Question) -> some View {
        Section {
            if !photos.isEmpty {
                ScrollView(.horizontal) {
                    HStack {
                        ForEach(photos.indices, id: \.self) { i in
                            Image(uiImage: photos[i]).resizable().scaledToFill().frame(width: 84, height: 84).clipped().cornerRadius(8)
                                .overlay(alignment: .topTrailing) {
                                    Button { photos.remove(at: i) } label: {
                                        Image(systemName: "xmark.circle.fill").symbolRenderingMode(.palette).foregroundStyle(.white, .black.opacity(0.6))
                                    }
                                    .padding(3)
                                    .accessibilityLabel("Remove photo \(i + 1)")
                                }
                        }
                    }
                }
            }
            if photos.count < q.maxPhotos {
                HStack {
                    if UIImagePickerController.isSourceTypeAvailable(.camera) {
                        Button { showCamera = true } label: { Label("Take photo", systemImage: "camera") }
                        Spacer()
                    }
                    PhotosPicker(selection: $pickerItems, maxSelectionCount: q.maxPhotos - photos.count, matching: .images) {
                        Label("Choose", systemImage: "photo.on.rectangle")
                    }
                }
                .buttonStyle(.borderless)
            }
        } header: {
            Text(q.label + (q.required ? " *" : ""))
        } footer: {
            Text(showMissing && q.required && photos.isEmpty ? "At least one photo is required." : "Up to \(q.maxPhotos).")
                .foregroundStyle(showMissing && q.required && photos.isEmpty ? .red : .secondary)
        }
    }

    // MARK: Logic

    private var shownQuestions: [FormSchema.Question] {
        form.questions.filter { FormSchema.visible($0.visibleWhen, answers) }
    }

    private func isMissing(_ q: FormSchema.Question) -> Bool {
        guard q.required else { return false }
        if q.kind == .photo { return photos.isEmpty }
        return (answers[q.name] ?? "").trimmingCharacters(in: .whitespaces).isEmpty
    }

    private func binding(_ name: String, remember: Bool = true) -> Binding<String> {
        Binding(get: { answers[name] ?? "" }, set: { v in
            answers[name] = v
            if remember, form.questions.first(where: { $0.name == name })?.remember == true || isNameOrPhone(name) {
                UserDefaults.standard.set(v, forKey: "remember.\(name.lowercased())")
            }
        })
    }

    /// Name and phone are filled in for the next report, on both forms.
    private func isNameOrPhone(_ n: String) -> Bool { ["name", "phone_contact", "phone"].contains(n.lowercased()) }

    private func prefill() {
        for q in form.questions where (q.remember || isNameOrPhone(q.name)) && (answers[q.name] ?? "").isEmpty {
            let key = q.name.lowercased()
            // The name carries over between the two forms ("name" on Responder, "Name" on Dispatch).
            if let v = UserDefaults.standard.string(forKey: "remember.\(key)"), !v.isEmpty { answers[q.name] = v }
        }
    }

    private func loadPicked(_ items: [PhotosPickerItem]) async {
        for it in items {
            if let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d) { photos.append(img) }
        }
        pickerItems = []
    }

    private func submit() {
        let shown = shownQuestions
        guard let p = point, !shown.contains(where: isMissing) else {
            showMissing = true
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            return
        }
        var values: [String: String] = [:]
        for q in shown where q.kind != .photo {
            let v = (answers[q.name] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if v.isEmpty { continue }
            values[q.field] = String(v.prefix(q.maxLength ?? 1000))
            if let of = q.otherField, v == "other", let o = answers[of]?.trimmingCharacters(in: .whitespacesAndNewlines), !o.isEmpty {
                values[of] = String(o.prefix(255))
            }
        }
        let typeQ = form.questions.first { $0.kind == .choice }
        var summary = "\(kind.title) report"
        if let tq = typeQ, let code = values[tq.field] {
            summary = code == "other" ? (values[tq.otherField ?? ""] ?? "Other") : (tq.choices.first { $0.value == code }?.label ?? code)
        }
        let pq = form.photo
        let jpegs = (pq != nil && FormSchema.visible(pq?.visibleWhen, answers)) ? photos.prefix(pq!.maxPhotos).compactMap { $0.resizedJPEG(maxSide: 2048, quality: 0.7) } : []
        outbox.add(kind: kind, values: values, summary: summary, lat: p.latitude, lng: p.longitude, address: address,
                   photos: Array(jpegs), photoKeyword: pq?.name)
        banner = outbox.online ? "\(summary): sending." : "\(summary): saved on this phone. It will send when connected."
        answers = [:]; photos = []; pin = nil; showMissing = false
        prefill()
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        Task { try? await Task.sleep(for: .seconds(6)); banner = nil }
    }
}

/// One question on the form.
struct QuestionRow: View {
    let q: FormSchema.Question
    @Binding var value: String
    let missing: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            switch q.kind {
            case .choice:
                Picker(selection: $value) {
                    Text("Choose").tag("")
                    ForEach(q.choices) { c in Text(c.label).tag(c.value) }
                } label: { label }
                .pickerStyle(.navigationLink)
            case .longText:
                label
                TextField("What you see, e.g. tree across both lanes, lines tangled.", text: $value, axis: .vertical).lineLimit(3...8)
            case .number, .integer:
                HStack { label; TextField("", text: $value).multilineTextAlignment(.trailing).keyboardType(q.kind == .integer ? .numberPad : .decimalPad) }
            case .date:
                DatePicker(selection: Binding(get: { Double(value).map { Date(timeIntervalSince1970: $0 / 1000) } ?? Date() },
                                              set: { value = String(Int($0.timeIntervalSince1970 * 1000)) })) { label }
            default:
                label
                TextField(q.label, text: $value)
                    .keyboardType(q.name.lowercased().contains("phone") ? .phonePad : .default)
                    .textContentType(contentType)
            }
            if missing { Text("Required").font(.caption).foregroundStyle(.red) }
        }
    }

    private var contentType: UITextContentType? {
        let n = q.name.lowercased()
        if n.contains("phone") { return .telephoneNumber }
        if n == "name" { return .name }
        return nil
    }

    private var label: some View {
        Text(q.label + (q.required ? " *" : "")).font(q.kind == .choice || q.kind == .number || q.kind == .integer || q.kind == .date ? .body : .caption)
            .foregroundStyle(q.kind == .choice || q.kind == .number || q.kind == .integer || q.kind == .date ? .primary : .secondary)
    }
}

/// Full-screen map to place the report pin.
struct PinPicker: View {
    let start: CLLocationCoordinate2D
    let done: (CLLocationCoordinate2D) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var center: CLLocationCoordinate2D?
    @State private var satellite = false

    var body: some View {
        NavigationStack {
            Map(initialPosition: .region(MKCoordinateRegion(center: start, latitudinalMeters: 800, longitudinalMeters: 800))) { UserAnnotation() }
                .mapStyle(satellite ? .hybrid : .standard)
                .onMapCameraChange(frequency: .continuous) { center = $0.region.center }
                .overlay { Image(systemName: "mappin").font(.system(size: 36)).foregroundStyle(.red).offset(y: -18).allowsHitTesting(false) }
                .overlay(alignment: .bottom) {
                    Picker("Map", selection: $satellite) { Text("Map").tag(false); Text("Satellite").tag(true) }
                        .pickerStyle(.segmented).padding().background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10)).padding()
                }
                .navigationTitle("Move the map under the pin")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) { Button("Use this spot") { done(center ?? start); dismiss() } }
                }
        }
    }
}

/// System camera.
struct CameraView: UIViewControllerRepresentable {
    let done: (UIImage?) -> Void
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let p = UIImagePickerController()
        p.sourceType = .camera
        p.delegate = context.coordinator
        return p
    }
    func updateUIViewController(_ vc: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coord { Coord(done) }
    final class Coord: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let done: (UIImage?) -> Void
        init(_ d: @escaping (UIImage?) -> Void) { done = d }
        func imagePickerController(_ p: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            done(info[.originalImage] as? UIImage); p.dismiss(animated: true)
        }
        func imagePickerControllerDidCancel(_ p: UIImagePickerController) { done(nil); p.dismiss(animated: true) }
    }
}

extension UIImage {
    func resizedJPEG(maxSide: CGFloat, quality: CGFloat) -> Data? {
        let s = max(size.width, size.height)
        let scale = s > maxSide ? maxSide / s : 1
        let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
        let fmt = UIGraphicsImageRendererFormat.default()
        fmt.scale = 1
        let img = UIGraphicsImageRenderer(size: target, format: fmt).image { _ in draw(in: CGRect(origin: .zero, size: target)) }
        return img.jpegData(compressionQuality: quality)
    }
}
