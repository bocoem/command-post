import SwiftUI
import MapKit

/// The web app's Map page: every report from residents, responders and 911 Dispatch, with the web map's
/// symbols, a layer list, a legend, search, your location and "+ Submit a responder report".
struct MapTab: View {
    @EnvironmentObject var feed: Feed
    @Binding var tab: AppTab

    @State private var position: MapCameraPosition = .region(MapTab.county)
    @State private var selected: StormReport?
    @State private var hidden: Set<StormSource> = []
    @State private var showLayers = false
    @State private var showLegend = false
    @State private var search = ""
    @State private var searching = false

    /// The web map's starting view of Botetourt County.
    static let county = MKCoordinateRegion(center: .init(latitude: 37.555, longitude: -79.795),
                                           span: .init(latitudeDelta: 0.75, longitudeDelta: 0.6))

    var body: some View {
        Group {
            Map(position: $position) {
                UserAnnotation()
                ForEach(feed.all.filter { !hidden.contains($0.source) }) { r in
                    Annotation(r.title, coordinate: r.coordinate, anchor: .center) {
                        Button { selected = r } label: { MapSymbol(report: r) }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(r.title), \(r.source.reportedBy)")
                    }
                    .annotationTitles(.hidden)
                }
            }
            .mapStyle(.standard(pointsOfInterest: .excludingAll))
            .mapControls { MapUserLocationButton(); MapCompass(); MapScaleView() }
            .environment(\.colorScheme, .dark)
            .safeAreaInset(edge: .bottom) {
                Button { tab = .submit } label: {
                    Text("+ Submit a responder report").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.gold)
                .foregroundStyle(.black)
                .padding(.horizontal).padding(.bottom, 8)
            }
            .overlay(alignment: .topLeading) {
                VStack(spacing: 8) {
                    mapButton("Home", "house") { withAnimation { position = .region(MapTab.county) } }
                    mapButton("Layers", "square.3.layers.3d") { showLayers = true }
                    mapButton("Legend", "list.bullet.rectangle") { showLegend = true }
                    mapButton("Search", "magnifyingglass") { searching = true }
                    mapButton("Refresh", feed.loading ? "hourglass" : "arrow.clockwise") { Task { await feed.refresh() } }
                }
                .padding(10)
            }
            .sheet(item: $selected) { r in ReportDetail(report: r).presentationDetents([.medium, .large]) }
            .onAppear { Location.shared.requestPermission() }
            .sheet(isPresented: $showLayers) { layers.presentationDetents([.medium]) }
            .sheet(isPresented: $showLegend) { LegendList().presentationDetents([.medium, .large]) }
            .alert("Find a place", isPresented: $searching) {
                TextField("Address or place", text: $search)
                Button("Search") { Task { await find() } }
                Button("Cancel", role: .cancel) {}
            }
        }
    }

    private func mapButton(_ label: String, _ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 17, weight: .semibold)).frame(width: 40, height: 40)
        }
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8))
        .accessibilityLabel(label)
    }

    private var layers: some View {
        NavigationStack {
            List {
                ForEach(StormSource.allCases) { s in
                    Toggle(isOn: Binding(get: { !hidden.contains(s) }, set: { on in if on { hidden.remove(s) } else { hidden.insert(s) } })) {
                        VStack(alignment: .leading) {
                            Text(s.layerTitle)
                            Text("\(feed.reports[s]?.count ?? 0) reports").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Layers").navigationBarTitleDisplayMode(.inline)
        }
    }

    private func find() async {
        let q = search.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return }
        let req = MKLocalSearch.Request()
        req.naturalLanguageQuery = q
        req.region = MapTab.county
        if let item = try? await MKLocalSearch(request: req).start().mapItems.first {
            withAnimation { position = .region(MKCoordinateRegion(center: item.placemark.coordinate, latitudinalMeters: 1500, longitudinalMeters: 1500)) }
        }
    }
}

/// A report's map symbol (the web map's picture), or a plain dot until the symbols have loaded.
struct MapSymbol: View {
    @EnvironmentObject var feed: Feed
    let report: StormReport
    var size: CGFloat = 26

    var body: some View {
        if let img = feed.image(for: report.symbolKey) {
            Image(uiImage: img).resizable().interpolation(.high).frame(width: size, height: size)
        } else {
            Circle().fill(Theme.gold).frame(width: size * 0.6, height: size * 0.6).overlay(Circle().stroke(.black, lineWidth: 1))
        }
    }
}

/// The web map's legend: what each symbol means.
struct LegendList: View {
    @EnvironmentObject var feed: Feed
    var body: some View {
        NavigationStack {
            List(feed.symbols, id: \.key) { s in
                HStack(spacing: 12) {
                    if let i = UIImage(data: s.png, scale: 3) { Image(uiImage: i).resizable().frame(width: 26, height: 26) }
                    Text(s.label)
                }
            }
            .overlay { if feed.symbols.isEmpty { Text("The map key loads the first time the app has a connection.").foregroundStyle(.secondary).padding() } }
            .navigationTitle("Map key").navigationBarTitleDisplayMode(.inline)
        }
    }
}

/// The web map's pop-up: title, who reported it, when, comments, and photos.
struct ReportDetail: View {
    let report: StormReport

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 10) {
                        MapSymbol(report: report, size: 32)
                        Text(report.title).font(.title3.bold()).foregroundStyle(Theme.gold)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("**Reported by:** \(report.source.reportedBy)")
                        Text("**When:** \(report.whenText)")
                    }
                    if !report.comments.isEmpty { Text(report.comments) }
                    Text("Photos").font(.headline).padding(.top, 4)
                    if report.photoIds.isEmpty {
                        Text("No photos.").foregroundStyle(.secondary)
                    } else {
                        ForEach(report.photoURLs(width: 1200), id: \.self) { u in
                            AsyncImage(url: u) { img in img.resizable().scaledToFit() } placeholder: { ProgressView().frame(height: 160) }
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                    }
                    Button {
                        let item = MKMapItem(placemark: MKPlacemark(coordinate: report.coordinate))
                        item.name = report.title
                        item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving])
                    } label: { Label("Directions", systemImage: "car.fill") }
                    .buttonStyle(.bordered)
                    .padding(.top, 4)
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
