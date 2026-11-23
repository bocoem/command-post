import SwiftUI

/// The web app's Reports page: newest first, with tabs for residents, county responders and 911 Dispatch,
/// search by comments, a record count and refresh. Resident names and contact details are not shown.
struct ReportsTab: View {
    @EnvironmentObject var feed: Feed
    @State private var source: StormSource = .residents
    @State private var search = ""
    @State private var selected: StormReport?

    private var list: [StormReport] {
        let all = feed.reports[source] ?? []
        let q = search.trimmingCharacters(in: .whitespaces)
        return q.isEmpty ? all : all.filter { $0.comments.localizedCaseInsensitiveContains(q) }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Newest reports first. Tap a tab to switch between residents, county responders and 911 Dispatch. Resident names and contact details are not shown.")
                        .font(.footnote).foregroundStyle(Theme.soft)
                        .listRowBackground(Color.clear)
                    Picker("Source", selection: $source) {
                        ForEach(StormSource.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                }
                Section {
                    if list.isEmpty {
                        Text(search.isEmpty ? "No reports yet." : "No reports match.").foregroundStyle(.secondary)
                    }
                    ForEach(list) { r in
                        Button { selected = r } label: { card(r) }
                            .listRowBackground(Theme.card)
                    }
                } header: {
                    HStack {
                        Text("\(list.count) report\(list.count == 1 ? "" : "s")")
                        Spacer()
                        if let u = feed.updated { Text("Updated " + u.formatted(date: .omitted, time: .shortened)) }
                    }
                }
                if let e = feed.error {
                    Section { Text(e).font(.caption).foregroundStyle(.orange) }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.page)
            .searchable(text: $search, prompt: "Search comments")
            .refreshable { await feed.refresh() }
            .navigationTitle("Reports")
            .sheet(item: $selected) { r in ReportDetail(report: r).presentationDetents([.medium, .large]) }
        }
    }

    /// The web list card: type in gold, "Source · date", then the comments.
    private func card(_ r: StormReport) -> some View {
        HStack(alignment: .top, spacing: 10) {
            MapSymbol(report: r, size: 28)
            VStack(alignment: .leading, spacing: 3) {
                Text(r.title).font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.gold)
                Text("\(r.source.title) · \(r.created.formatted(date: .abbreviated, time: .shortened))")
                    .font(.system(size: 12)).foregroundStyle(Theme.muted)
                if !r.comments.isEmpty {
                    Text(r.comments).font(.system(size: 13)).foregroundStyle(.white).lineLimit(3).multilineTextAlignment(.leading)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
    }
}
