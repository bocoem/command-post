import SwiftUI
import WebKit

enum Pane: String, CaseIterable, Identifiable, Hashable {
    case overview, triage, patients, transport, hospitals, report
    var id: String { rawValue }
    var title: String {
        switch self {
        case .overview: return "Overview"
        case .triage: return "Triage"
        case .patients: return "Patients"
        case .transport: return "Transport"
        case .hospitals: return "Hospitals"
        case .report: return "Patient report"
        }
    }
    /// tab label on iPhone
    var short: String { self == .report ? "Report" : title }
    var icon: String {
        switch self {
        case .overview: return "chart.bar.xaxis"
        case .triage: return "tag.fill"
        case .patients: return "person.3.fill"
        case .transport: return "car.fill"
        case .hospitals: return "building.2.fill"
        case .report: return "doc.text.fill"
        }
    }
    func allowed(_ l: Level) -> Bool {
        switch self {
        case .overview, .hospitals: return true
        case .triage, .patients, .transport: return l.canEdit
        case .report: return l.names
        }
    }
}

struct RootView: View {
    @EnvironmentObject var store: MCIStore
    var body: some View {
        ZStack(alignment: .top) {
            if store.incident == nil { IncidentPicker() } else { MainView() }
            if let t = store.toast {
                ToastView(toast: t).padding(.top, 8).transition(.move(edge: .top).combined(with: .opacity)).zIndex(5)
            }
        }
        .animation(.spring(duration: 0.35), value: store.toast)
        .onOpenURL { url in
            guard url.scheme == "beaconmci", let key = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "incident" })?.value, !key.isEmpty else { return }
            Task { await store.open(key: key) }
        }
    }
}

struct MainView: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.horizontalSizeClass) private var hsize
    @State private var pane: Pane? = nil
    @State private var sheet: SheetKind?
    @State private var visibility = NavigationSplitViewVisibility.all

    enum SheetKind: String, Identifiable { case account, guide, unsent, users, report; var id: String { rawValue } }

    var body: some View {
        Group { if hsize == .compact { phone } else { split } }
        .sheet(item: $sheet) { k in
            switch k {
            case .account: AccountSheet()
            case .guide: TriageGuideSheet()
            case .unsent: UnsentSheet()
            case .users: UsersSheet()
            case .report: ReportSheet()
            }
        }
        .onAppear { if pane == nil { pane = store.level.canEdit ? .triage : .overview } }
    }

    /// iPhone: a tab bar (the iPad sidebar collapses into a screen with no way back on a phone).
    /// The patient report and the sidebar extras live in the incident bar's menu.
    private var phone: some View {
        let s = store.summary, tabs = Pane.allCases.filter { $0.allowed(store.level) && $0 != .report }
        return TabView(selection: Binding(get: { pane ?? (store.level.canEdit ? .triage : .overview) }, set: { pane = $0 })) {
            ForEach(tabs) { p in
                detail(p)
                    .safeAreaInset(edge: .top, spacing: 0) { IncidentBar(open: { sheet = $0 }) }
                    .tabItem { Label(p.short, systemImage: p.icon) }
                    .badge(p == .transport ? s.waitingRY : 0)
                    .tag(p)
            }
        }
        .toolbarBackground(Theme.navy, for: .tabBar)
        .toolbarBackground(.visible, for: .tabBar)
    }

    private var split: some View {
        NavigationSplitView(columnVisibility: $visibility) {
            sidebar
        } detail: {
            NavigationStack {
                detail(pane ?? (store.level.canEdit ? .triage : .overview))
                    .safeAreaInset(edge: .top, spacing: 0) { IncidentBar() }
                    .toolbar(.hidden, for: .navigationBar)
            }
        }
        .navigationSplitViewStyle(.balanced)
    }

    private var sidebar: some View {
        let s = store.summary
        return List(selection: $pane) {
            Section {
                ForEach(Pane.allCases.filter { $0.allowed(store.level) }) { p in
                    HStack {
                        Label(p.title, systemImage: p.icon).font(.semi(21))
                        Spacer()
                        badge(p, s)
                    }
                    .padding(.vertical, 6)
                    .tag(p)
                }
            } header: {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Image("Patch").resizable().scaledToFit().frame(width: 34)
                        VStack(alignment: .leading, spacing: 0) {
                            Text("BEACON").font(.semi(12)).tracking(2).foregroundStyle(Theme.gold)
                            Text("MCI BOARD").font(.heavy(24)).foregroundStyle(.white)
                        }
                    }
                }.padding(.bottom, 8).textCase(nil)
            }
            Section {
                Button { sheet = .guide } label: { Label("START / JumpSTART", systemImage: "list.bullet.clipboard") }
                if !store.outbox.isEmpty {
                    Button { sheet = .unsent } label: { Label("\(store.outbox.count) waiting to send", systemImage: "arrow.up.circle") }.foregroundStyle(Theme.gold)
                }
                if store.canManageUsers {
                    Button { sheet = .users } label: { Label("Users", systemImage: "person.badge.key") }
                }
                Button { sheet = .account } label: { Label(store.me.isEmpty ? "Account" : store.me, systemImage: "person.crop.circle") }
            }
        }
        .listStyle(.sidebar)
        .scrollContentBackground(.hidden)
        .background(Theme.navy)
        .safeAreaInset(edge: .bottom) {
            HStack { SyncPill(); Spacer(); Text(store.level.name.uppercased()).font(.heavy(13)).tracking(1).foregroundStyle(Theme.gold) }
                .padding(12)
        }
        .navigationTitle("")
    }

    @ViewBuilder private func badge(_ p: Pane, _ s: Summary) -> some View {
        switch p {
        case .patients: if s.total > 0 { count("\(s.total)", Theme.border) }
        case .transport: if s.waitingRY > 0 { count("\(s.waitingRY)", Theme.red) }
        default: EmptyView()
        }
    }
    private func count(_ t: String, _ c: Color) -> some View {
        Text(t).font(.heavy(15)).foregroundStyle(.white).padding(.horizontal, 8).padding(.vertical, 2).background(c, in: Capsule())
    }

    @ViewBuilder private func detail(_ p: Pane) -> some View {
        switch p {
        case .overview: OverviewView()
        case .triage: TriageView()
        case .patients: PatientsView()
        case .transport: TransportView()
        case .hospitals: HospitalsView()
        case .report: ReportView()
        }
    }
}

/// Top of every screen: which incident, how big, and the connection.
struct IncidentBar: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.horizontalSizeClass) private var hsize
    @State private var confirmLeave = false
    /// set on iPhone: opens the sheets the iPad sidebar has
    var open: ((MainView.SheetKind) -> Void)? = nil
    var body: some View {
        Group { if hsize == .compact { compact } else { wide } }
        .background(.ultraThinMaterial)
        .overlay(alignment: .bottom) { Rectangle().fill(store.summary.level <= 2 ? Theme.red : Theme.gold).frame(height: 2) }
        .confirmationDialog("Switch incident?", isPresented: $confirmLeave, titleVisibility: .visible) {
            Button("Switch incident") { store.leave() }
        } message: { Text("Anything waiting to send keeps sending.") }
    }

    private var compact: some View {
        let s = store.summary
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(store.incident?.name ?? "").font(.heavy(20)).foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.8)
                if store.incident?.exercise == true { PracticeChip() }
                Spacer(minLength: 4)
                menu
            }
            HStack(spacing: 10) {
                LevelBadge(level: s.level)
                Text("\(s.total)").font(.system(size: 22, weight: .heavy, design: .rounded)).foregroundColor(.white)
                    + Text(" pts").font(.semi(14)).foregroundColor(Theme.muted)
                Spacer(minLength: 4)
                SyncPill()
            }
        }
        .padding(.horizontal, 14).padding(.top, 6).padding(.bottom, 8)
    }

    private var menu: some View {
        Menu {
            if let open {
                Button { open(.guide) } label: { Label("START / JumpSTART", systemImage: "list.bullet.clipboard") }
                if Pane.report.allowed(store.level) { Button { open(.report) } label: { Label("Patient report", systemImage: "doc.text.fill") } }
                if !store.outbox.isEmpty { Button { open(.unsent) } label: { Label("\(store.outbox.count) waiting to send", systemImage: "arrow.up.circle") } }
                if store.canManageUsers { Button { open(.users) } label: { Label("Users", systemImage: "person.badge.key") } }
                Button { open(.account) } label: { Label(store.me.isEmpty ? "Account" : store.me, systemImage: "person.crop.circle") }
                Divider()
            }
            Button { confirmLeave = true } label: { Label("Switch incident", systemImage: "arrow.left.arrow.right") }
        } label: {
            Image(systemName: "ellipsis.circle").font(.system(size: 26)).foregroundStyle(Theme.gold).frame(width: 44, height: 44)
        }
    }

    private var wide: some View {
        let s = store.summary
        return HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text(store.incident?.name ?? "").font(.heavy(24)).foregroundStyle(.white).lineLimit(1)
                    if store.incident?.exercise == true { PracticeChip() }
                }
                Text([store.incident?.number, store.incident?.standalone == true ? "MCI only · " + (store.incident?.key ?? "") : nil, store.incident?.location]
                    .compactMap { $0 }.joined(separator: " · "))
                    .font(.semi(15)).foregroundStyle(Theme.muted).lineLimit(1)
            }
            Spacer(minLength: 8)
            LevelBadge(level: s.level)
            Text("\(s.total)").font(.system(size: 26, weight: .heavy, design: .rounded)).foregroundColor(.white)
                + Text(" pts").font(.semi(15)).foregroundColor(Theme.muted)
            SyncPill()
            menu
        }
        .padding(.horizontal, 18).padding(.vertical, 10)
    }
}

/// iPhone: the patient report opens as a sheet from the incident bar menu.
struct ReportSheet: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ReportView()
                .navigationTitle("Patient report").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

// MARK: - pick the incident

struct IncidentPicker: View {
    @EnvironmentObject var store: MCIStore
    @State private var newName = ""
    @State private var practice = false
    @State private var showNew = false

    var body: some View {
        ZStack {
            Backdrop()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(spacing: 14) {
                        Image("Patch").resizable().scaledToFit().frame(width: 64)
                        VStack(alignment: .leading, spacing: 0) {
                            Text("BOTETOURT COUNTY · BEACON").font(.semi(13)).tracking(2).foregroundStyle(Theme.gold)
                            Text("MCI BOARD").font(.heavy(40)).foregroundStyle(.white)
                        }
                        Spacer()
                        SyncPill()
                    }
                    HStack {
                        Text("Pick the incident").font(.heavy(28)).foregroundStyle(.white)
                        Spacer()
                        Button { Task { await store.loadIncidents() } } label: { Label("Refresh", systemImage: "arrow.clockwise") }.font(.semi(18))
                    }
                    if let e = store.incidentsError { Text(e).font(.callout).foregroundStyle(Theme.gold) }
                    if store.incidentsLoading && store.incidents.isEmpty { ProgressView().frame(maxWidth: .infinity).padding(30) }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 300), spacing: 14)], spacing: 14) {
                        ForEach(store.incidents) { i in
                            Button { store.open(i) } label: { IncidentCard(i: i) }.buttonStyle(.plain)
                        }
                    }
                    if !store.incidentsLoading && store.incidents.isEmpty && store.incidentsError == nil {
                        Text("No open incidents in Command Post.").font(.semi(18)).foregroundStyle(Theme.muted)
                    }
                    if store.level.canEdit {
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Theme.red)
                                Text("Declare an MCI here").font(.heavy(22)).foregroundStyle(.white)
                            }
                            Text("No Command Post incident yet? Start triage now. Other iPads see it in this list, and Command Board can link it later.")
                                .font(.callout).foregroundStyle(Theme.muted)
                            if showNew {
                                Caption("Name (change it now or later in Command Post)")
                                TextField("e.g. I-81 MM 150 bus crash", text: $newName).font(.title3).field()
                                Toggle("Practice / drill", isOn: $practice).font(.semi(18))
                                Button {
                                    store.startStandalone(name: newName.trimmingCharacters(in: .whitespaces), practice: practice)
                                } label: { Text("Start MCI") }
                                .buttonStyle(BigButtonStyle(color: Theme.red, ink: .white))
                                .disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty)
                            } else {
                                Button {
                                    newName = "MCI " + Date().formatted(date: .abbreviated, time: .shortened); showNew = true
                                } label: { Text("Declare MCI") }.buttonStyle(BigButtonStyle(color: Theme.red, ink: .white)).frame(maxWidth: 320)
                            }
                        }.card(18, tint: Theme.red)
                    }
                    Text("Signed in as \(store.me) · \(store.level.name)").font(.footnote).foregroundStyle(Theme.muted)
                    Button("Sign out", role: .destructive) { store.signOut() }.font(.footnote)
                }
                .padding(24).frame(maxWidth: 1100).frame(maxWidth: .infinity)
            }
        }
        .task { await store.loadIncidents() }
        .onAppear { store.location.warm() }
    }
}

struct IncidentCard: View {
    let i: Incident
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(i.standalone ? "MCI ONLY" : (i.type ?? "INCIDENT").uppercased()).font(.semi(13)).tracking(1.2).foregroundStyle(i.standalone ? Theme.red : Theme.gold)
                Spacer()
                if i.exercise { PracticeChip() }
            }
            Text(i.name).font(.heavy(24)).foregroundStyle(.white).lineLimit(2).multilineTextAlignment(.leading)
            Text([i.number, i.location].compactMap { $0 }.joined(separator: " · ")).font(.semi(16)).foregroundStyle(Theme.muted).lineLimit(1)
            if let s = i.start { Text("Started \(s.hm) · \(s.ago) ago").font(.footnote).foregroundStyle(Theme.muted) }
        }
        .frame(maxWidth: .infinity, minHeight: 120, alignment: .topLeading)
        .card(16)
        .contentShape(Rectangle())
    }
}

/// The BEACON Users page (served by the gate; same page as the Teams tab): add people and truck iPads, turn them off,
/// issue setup codes. The page enforces who can do what.
struct UsersSheet: View {
    @EnvironmentObject var store: MCIStore
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Group {
                if let u = store.usersURL { WebPage(url: u) } else { Text("Sign in again to manage users.").foregroundStyle(Theme.muted) }
            }
            .background(Backdrop())
            .navigationTitle("BEACON Users").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

struct WebPage: UIViewRepresentable {
    let url: URL
    func makeUIView(context: Context) -> WKWebView {
        let c = WKWebViewConfiguration()
        c.websiteDataStore = .nonPersistent()      // nothing from the page stays on the iPad
        let v = WKWebView(frame: .zero, configuration: c)
        v.isOpaque = false; v.backgroundColor = UIColor(Theme.page)
        v.load(URLRequest(url: url))
        return v
    }
    func updateUIView(_ v: WKWebView, context: Context) {}
}
