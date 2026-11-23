import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var store: GuideStore
    @EnvironmentObject private var lifelines: LifelineStore
    @EnvironmentObject private var router: Router
    @State private var query = ""
    @State private var selected: LifelineReading?

    private var searching: Bool { query.trimmingCharacters(in: .whitespaces).count >= 2 }

    var body: some View {
        List {
            if searching {
                searchResults
            } else {
                formButton
                lifelineSection
                guideSections
                footer
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(.compact)
        .contentMargins(.top, 8, for: .scrollContent)
        .scrollContentBackground(.hidden)
        .background(Theme.page)
        .navigationTitle("EOP FIELD GUIDE")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search the guide")
        .autocorrectionDisabled()
        .refreshable {
            async let l: Void = lifelines.refresh(force: true)
            await store.refresh(force: true)
            await l
        }
        .overlay {
            if !store.isLoaded {
                ProgressView().tint(Theme.gold)
            } else if store.guide.isEmpty {
                ContentUnavailableView {
                    Label("No guide yet", systemImage: "book.closed")
                } description: {
                    Text("Connect once to download the guide from ArcGIS. After that it works without signal.")
                } actions: {
                    Button("Try again") { Task { await store.refresh(force: true) } }.buttonStyle(.borderedProminent)
                }
            }
        }
        .sheet(item: $selected) { reading in
            LifelineSheet(reading: reading).presentationDetents([.medium, .large])
        }
    }

    // MARK: Status

    private var status: SyncStatus {
        if store.isRefreshing { return .init(text: "Checking for updates…", icon: "arrow.triangle.2.circlepath", color: Theme.muted, busy: true) }
        if store.offline { return .init(text: "No signal · using the saved guide", icon: "wifi.slash", color: Theme.gold) }
        if store.problem != nil { return .init(text: "Couldn’t reach ArcGIS · using the saved guide", icon: "exclamationmark.triangle.fill", color: Theme.gold) }
        if let d = store.guide.publishedAt {
            return .init(text: "Up to date · Published " + d.formatted(.dateTime.month(.abbreviated).day()) + " at " + d.formatted(date: .omitted, time: .shortened),
                         icon: "checkmark.circle.fill", color: Theme.stabilized)
        }
        return .init(text: "Saved on this device", icon: "internaldrive", color: Theme.muted)
    }

    // MARK: Lifelines

    /// "Update my lifeline" is a call to action, so it leads in Signal Red with white type (5.3:1).
    @ViewBuilder private var formButton: some View {
        if store.guide.lifelineFormURL != nil {
            Section {
                Button { router.push(.form) } label: {
                    HStack {
                        Image(systemName: "square.and.pencil")
                        Text(store.guide.lifelineFormTitle.uppercased())
                            .font(BrandFont.display(21)).tracking(0.5)
                        Spacer()
                        Image(systemName: "chevron.right").font(.footnote.weight(.bold))
                    }
                    .foregroundStyle(.white)
                    .padding(.vertical, 6)
                }
                .listRowBackground(Theme.red)
            }
        }
    }

    private var lifelineSection: some View {
        Section {
            let readings = lifelines.snapshot?.readings ?? LifelineDef.all.map { LifelineReading(field: $0.field, code: nil, detail: nil) }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                ForEach(readings) { r in
                    Button { selected = r } label: { LifelineChip(name: store.lifelineName(r.field), reading: r) }
                        .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 4)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
        } header: {
            HStack {
                BrandLabel("Lifeline status")
                Spacer()
                if let t = lifelines.snapshot?.asOf {
                    BrandLabel(t.formatted(.dateTime.month(.abbreviated).day().hour().minute()), size: 11, color: Theme.muted)
                }
            }
        } footer: {
            if lifelines.failed && lifelines.snapshot != nil {
                Text("Last known status. Pull down to try again.").font(BrandFont.body(13, relativeTo: .footnote))
            } else if lifelines.snapshot == nil {
                Text("Status shows once the app has signal.").font(BrandFont.body(13, relativeTo: .footnote))
            }
        }
    }

    // MARK: Guide

    private var guideSections: some View {
        ForEach(store.guide.sections) { section in
            Section {
                ForEach(section.pageIDs, id: \.self) { id in
                    if let page = store.guide.pages[id] {
                        NavigationLink(value: Route.page(id)) {
                            Text(page.title)
                                .font(BrandFont.body(17, weight: .semibold))
                                .foregroundStyle(Theme.text)
                        }
                        .listRowBackground(Theme.card)
                    }
                }
            } header: {
                BrandLabel(section.title)
            }
        }
    }

    private var footer: some View {
        Section {
            HomeFooter(status: status)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 24, trailing: 0))
        }
    }

    // MARK: Search

    @ViewBuilder private var searchResults: some View {
        let hits = store.search(query)
        if hits.isEmpty {
            Section {
                Text("Nothing in the guide matches \"\(query)\".")
                    .font(BrandFont.body())
                    .foregroundStyle(Theme.muted)
            }
            .listRowBackground(Theme.card)
        } else {
            Section {
                ForEach(hits) { hit in
                    Button {
                        router.pendingFind = query.trimmingCharacters(in: .whitespaces)
                        router.push(.page(hit.page.id))
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(hit.page.title).font(BrandFont.body(17, weight: .semibold)).foregroundStyle(Theme.text)
                            BrandLabel(hit.section, size: 10)
                            Text(hit.snippet).font(BrandFont.body(14, relativeTo: .footnote)).foregroundStyle(Theme.muted).lineLimit(3)
                        }
                        .padding(.vertical, 2)
                    }
                    .listRowBackground(Theme.card)
                }
            } header: {
                BrandLabel("\(hits.count) page\(hits.count == 1 ? "" : "s")")
            }
        }
    }
}

struct LifelineChip: View {
    let name: String
    let reading: LifelineReading

    var body: some View {
        HStack(spacing: 9) {
            RoundedRectangle(cornerRadius: 2).fill(reading.color).frame(width: 5)
            VStack(alignment: .leading, spacing: 3) {
                Text(name).font(BrandFont.body(15, weight: .semibold, relativeTo: .subheadline))
                    .foregroundStyle(Theme.text)
                    .lineLimit(2).minimumScaleFactor(0.85)
                BrandLabel(reading.label, size: 10, color: reading.color)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 9).padding(.trailing, 8)
        .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

struct LifelineSheet: View {
    let reading: LifelineReading
    @EnvironmentObject private var store: GuideStore
    @EnvironmentObject private var lifelines: LifelineStore
    @EnvironmentObject private var router: Router
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(store.lifelineName(reading.field).uppercased())
                        .font(BrandFont.display(32))
                        .foregroundStyle(.white)
                    BrandLabel(reading.label, size: 12, color: reading.color)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(reading.color.opacity(0.16), in: Capsule())
                    if let d = reading.detail, !d.isEmpty {
                        Text(d).font(BrandFont.body()).foregroundStyle(Theme.text)
                    } else {
                        Text("No description with the latest status.").font(BrandFont.body()).foregroundStyle(Theme.muted)
                    }
                    if let t = lifelines.snapshot?.asOf {
                        BrandLabel("As of " + t.formatted(date: .abbreviated, time: .shortened), size: 11, color: Theme.muted)
                    }
                    VStack(spacing: 10) {
                        if store.guide.lifelineFormURL != nil {
                            Button {
                                dismiss()
                                router.push(.form)
                            } label: {
                                Label(store.guide.lifelineFormTitle.uppercased(), systemImage: "square.and.pencil")
                                    .font(BrandFont.display(19))
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(Theme.red)
                            .foregroundStyle(.white)
                        }
                        if let page = store.lifelinePage(reading.field) {
                            Button {
                                dismiss()
                                router.push(.page(page.id))
                            } label: {
                                Label("Open the \(page.title) guide", systemImage: "book")
                                    .font(BrandFont.body(17, weight: .semibold))
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                    .controlSize(.large)
                    .padding(.top, 6)
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Theme.page)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } }
            }
        }
    }
}

extension GuideStore {
    /// The guide's own page for a lifeline, from the Lifelines menu folder in ArcGIS.
    func lifelinePage(_ field: String) -> GuidePage? {
        guard let def = LifelineDef.all.first(where: { $0.field == field }) else { return nil }
        let folder = guide.sections.first { $0.title.localizedCaseInsensitiveContains("lifeline") }
        let candidates = (folder?.pageIDs ?? guide.sections.flatMap(\.pageIDs)).compactMap { guide.pages[$0] }
        return candidates.first { $0.title.localizedCaseInsensitiveContains(def.keyword) }
    }

    func lifelineName(_ field: String) -> String {
        lifelinePage(field)?.title ?? LifelineDef.all.first { $0.field == field }?.fallback ?? field
    }
}

struct SyncStatus {
    var text: String
    var icon: String
    var color: Color
    var busy = false
}

/// Sign-off card at the bottom of the home screen: the tri-bar carrying
/// Respond · Prepare · Recover, the 911 reminder, and whether the guide is current.
struct HomeFooter: View {
    let status: SyncStatus

    var body: some View {
        VStack(spacing: 20) {
            HStack(alignment: .top, spacing: 0) {
                Pillar(word: "RESPOND", note: "Alerts and the EOC", color: Theme.red)
                Pillar(word: "PREPARE", note: "Education and kits", color: Theme.gold)
                Pillar(word: "RECOVER", note: "Assistance and mitigation", color: Theme.indigo)
            }

            HStack(spacing: 8) {
                Image(systemName: "phone.fill").font(.system(size: 13, weight: .bold))
                Text("IN AN EMERGENCY, DIAL 911")
                    .font(BrandFont.display(17, relativeTo: .headline))
                    .tracking(0.6)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 18)
            .padding(.vertical, 9)
            .background(Theme.red.opacity(0.16), in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.red.opacity(0.75), lineWidth: 1))
            .accessibilityElement(children: .combine)

            VStack(spacing: 5) {
                HStack(spacing: 6) {
                    if status.busy {
                        ProgressView().controlSize(.mini).tint(status.color)
                    } else {
                        Image(systemName: status.icon).font(.system(size: 12, weight: .semibold))
                    }
                    Text(status.text)
                        .font(BrandFont.body(13, weight: .semibold, relativeTo: .footnote))
                }
                .foregroundStyle(status.color)
                Text("Updates itself from ArcGIS and works without signal.")
                    .font(BrandFont.body(12, relativeTo: .caption))
                    .foregroundStyle(Theme.muted)
            }
            .multilineTextAlignment(.center)
        }
        .padding(.bottom, 22)
        .frame(maxWidth: .infinity)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    /// One stage of the program: its color as a segment of the tri-bar, the word, and what it covers.
    private struct Pillar: View {
        let word: String
        let note: String
        let color: Color
        var body: some View {
            VStack(spacing: 8) {
                color.frame(height: 5)
                Text(word)
                    .font(BrandFont.display(19, relativeTo: .headline))
                    .tracking(0.8)
                    .foregroundStyle(.white)
                    .padding(.top, 8)
                Text(note)
                    .font(BrandFont.body(11.5, relativeTo: .caption))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .padding(.horizontal, 6)
            }
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .combine)
        }
    }
}
