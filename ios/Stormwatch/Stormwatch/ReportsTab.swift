import SwiftUI

/// The web app's Reports page: intro, Residents / Responders / 911 Dispatch tabs, search, newest or oldest
/// first, refresh, and cards with the report photo on the left (swipe for more), type in gold,
/// "Source · date", and the comments. Resident names and contact details are not shown.
struct ReportsTab: View {
    @EnvironmentObject var feed: Feed
    @State private var source: StormSource = .residents
    @State private var search = ""
    @State private var newestFirst = true
    @State private var selected: StormReport?

    private var list: [StormReport] {
        var all = feed.reports[source] ?? []
        let q = search.trimmingCharacters(in: .whitespaces)
        if !q.isEmpty { all = all.filter { $0.comments.localizedCaseInsensitiveContains(q) } }
        return newestFirst ? all : all.reversed()
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 8) {
                Text("Newest reports first. Tap a tab to switch between residents, county responders and 911 Dispatch. Resident names and contact details are not shown.")
                    .font(.system(size: 13)).foregroundStyle(Theme.soft)
                    .padding(.horizontal, 4)
                HStack(spacing: 6) {
                    ForEach(StormSource.allCases) { s in
                        Button { source = s } label: {
                            Text(s.title).font(.system(size: 15, weight: source == s ? .semibold : .regular))
                                .lineLimit(1).minimumScaleFactor(0.8)
                                .frame(maxWidth: .infinity).padding(.vertical, 8)
                                .foregroundStyle(source == s ? Color.black : Theme.soft)
                                .background(source == s ? Theme.gold : Color(red: 0x15 / 255, green: 0x30 / 255, blue: 0x4A / 255), in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(source == s ? .isSelected : [])
                    }
                }
                HStack(spacing: 12) {
                    HStack {
                        Image(systemName: "magnifyingglass").foregroundStyle(Theme.muted)
                        TextField("Search", text: $search).textInputAutocapitalization(.never)
                        if !search.isEmpty {
                            Button { search = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.muted) }
                                .accessibilityLabel("Clear search")
                        }
                    }
                    .padding(.vertical, 8)
                    .overlay(alignment: .bottom) { Rectangle().fill(Theme.border).frame(height: 1) }
                    Button { newestFirst.toggle() } label: {
                        Label(newestFirst ? "Newest" : "Oldest", systemImage: "arrow.up.arrow.down").font(.subheadline)
                    }
                    .foregroundStyle(Theme.soft)
                    Button { Task { await feed.refresh() } } label: {
                        if feed.loading { ProgressView() } else { Image(systemName: "arrow.clockwise") }
                    }
                    .foregroundStyle(Theme.soft)
                    .accessibilityLabel("Refresh")
                }
                .padding(.horizontal, 4)

                if list.isEmpty {
                    Text(search.isEmpty ? "No reports yet." : "No reports match.")
                        .foregroundStyle(.secondary).padding(.vertical, 24).frame(maxWidth: .infinity)
                }
                ForEach(list) { r in
                    ReportCard(report: r).onTapGesture { selected = r }
                }
                HStack {
                    Text("Total: \(list.count)")
                    Spacer()
                    if let u = feed.updated { Text("Updated " + u.formatted(date: .omitted, time: .shortened)) }
                }
                .font(.caption).foregroundStyle(Theme.muted).padding(.horizontal, 4).padding(.top, 4)
                if let e = feed.error { Text(e).font(.caption).foregroundStyle(.orange).padding(.horizontal, 4) }
            }
            .padding(.horizontal, 8).padding(.vertical, 8)
        }
        .background(Theme.page)
        .refreshable { await feed.refresh() }
        .sheet(item: $selected) { r in ReportDetail(report: r).presentationDetents([.medium, .large]) }
    }
}

/// A web-style list card: photo on the left (swipe through several), text on the right, 120 points tall.
struct ReportCard: View {
    let report: StormReport

    var body: some View {
        HStack(spacing: 0) {
            ReportPhotos(urls: report.photoURLs(width: 400), height: 120)
                .frame(width: 110, height: 120)
                .clipped()
            VStack(alignment: .leading, spacing: 3) {
                Text(report.title).font(.system(size: 16, weight: .bold)).foregroundStyle(Theme.gold).lineLimit(1)
                Text("\(report.source.title) · \(report.created.formatted(date: .numeric, time: .shortened))")
                    .font(.system(size: 12)).foregroundStyle(Theme.muted)
                if !report.comments.isEmpty {
                    Text(report.comments).font(.system(size: 14)).foregroundStyle(.white).lineLimit(3)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10).padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(height: 120)
        .background(Theme.card)
        .overlay(Rectangle().stroke(Theme.border, lineWidth: 1))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}

/// Report photos, swipeable, with page dots when there is more than one (like the web list).
struct ReportPhotos: View {
    let urls: [URL]
    let height: CGFloat

    var body: some View {
        if urls.isEmpty {
            ZStack {
                Color(red: 0x15 / 255, green: 0x30 / 255, blue: 0x4A / 255)
                Image(systemName: "photo").font(.title2).foregroundStyle(Theme.border)
            }
            .accessibilityLabel("No photo")
        } else if urls.count == 1 {
            photo(urls[0])
        } else {
            TabView {
                ForEach(urls, id: \.self) { photo($0) }
            }
            .tabViewStyle(.page(indexDisplayMode: .always))
            .accessibilityLabel("\(urls.count) photos")
        }
    }

    private func photo(_ u: URL) -> some View {
        AsyncImage(url: u, transaction: Transaction(animation: .easeIn(duration: 0.15))) { phase in
            switch phase {
            case .success(let img): img.resizable().scaledToFill()
            case .failure: Image(systemName: "photo").foregroundStyle(Theme.border)
            default: ProgressView().tint(Theme.muted)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: height)
        .clipped()
        .accessibilityLabel("Report photo")
    }
}
