import SwiftUI

/// The web app's Info page (its home page): "About this app", same wording and colors.
struct InfoTab: View {
    @EnvironmentObject var feed: Feed
    @Binding var tab: AppTab

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    header
                    radio
                    card("How it works", "Three steps") {
                        step("1", "Check the map", "Open Map to see every report near you. Tap any dot for details and photos.")
                        step("2", "Work the list", "Reports shows the newest first, split into residents, responders and 911 Dispatch.")
                        step("3", "File a field report", "Use Submit for anything not already on the map: roads blocked, water over the road, damage, snow and ice. Add a photo and your callback number.")
                    }
                    card("Sources", "Where reports come from") {
                        source("Residents", "Public storm report form")
                        source("County responders", "Field crews and staff")
                        source("911 Dispatch", "Calls logged by dispatchers")
                    }
                    card("Map key", "What the symbols mean") {
                        if feed.symbols.isEmpty {
                            Text("The map key loads the first time the app has a connection.").foregroundStyle(Theme.muted)
                        }
                        ForEach(feed.symbols, id: \.key) { s in
                            HStack(spacing: 10) {
                                if let i = UIImage(data: s.png, scale: 3) { Image(uiImage: i).resizable().frame(width: 22, height: 22) }
                                Text(s.label)
                                Spacer()
                            }
                        }
                    }
                    card("Before you submit", "Keep reports clean") {
                        Text("Report types, comments and photos appear on the map. Do not put patient information, victim names or addresses of people involved in comments or photos. Your name and phone number go to Emergency Management and are not shown on the map.")
                            .foregroundStyle(Theme.soft)
                    }
                    HStack(spacing: 10) {
                        Button { tab = .map } label: { Text("View the map").bold().frame(maxWidth: .infinity).padding(.vertical, 10) }
                            .foregroundStyle(.white)
                            .background(Color(red: 0x15 / 255, green: 0x30 / 255, blue: 0x4A / 255), in: RoundedRectangle(cornerRadius: 4))
                            .overlay(RoundedRectangle(cornerRadius: 4).stroke(Theme.gold, lineWidth: 2))
                        Button { tab = .submit } label: { Text("Submit a report").bold().frame(maxWidth: .infinity).padding(.vertical, 10) }
                            .foregroundStyle(.black)
                            .background(Theme.gold, in: RoundedRectangle(cornerRadius: 4))
                    }
                    Link("Open the web version", destination: Config.responderWeb).font(.footnote)
                    Text("Version " + (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "") + " (" + (Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "") + ")")
                        .font(.caption2).foregroundStyle(Theme.muted)
                    Text("Reports go to Botetourt County Emergency Management and the Storm Reports channel.\n© Botetourt County Emergency Management · Fire & EMS · Sheriff's Office")
                        .font(.caption).foregroundStyle(Theme.muted).multilineTextAlignment(.center).padding(.top, 4)
                }
                .padding(14)
                .frame(maxWidth: 760)
                .frame(maxWidth: .infinity)
            }
            .background(Theme.page)
            .navigationTitle("Info")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("EMERGENCY MANAGEMENT · FIRE & EMS · SHERIFF'S OFFICE")
                .font(.system(size: 11, weight: .heavy)).tracking(1.3).foregroundStyle(Theme.gold)
            Text("Stormwatch Responder").font(.system(size: 30, weight: .heavy))
            Text("The field view of storm reports across Botetourt County. See what residents, county responders and 911 Dispatch have reported, and file what you find on scene.")
                .font(.system(size: 16)).foregroundStyle(Theme.soft)
            HStack(spacing: 0) { Theme.red; Theme.gold; Theme.blue }.frame(height: 4).clipShape(Capsule()).padding(.top, 8)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 10))
        .overlay(alignment: .leading) { Rectangle().fill(Theme.gold).frame(width: 5).clipShape(RoundedRectangle(cornerRadius: 2)) }
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(red: 0x1C / 255, green: 0x3A / 255, blue: 0x5C / 255)))
    }

    private var radio: some View {
        HStack(spacing: 14) {
            Text("!").font(.system(size: 26, weight: .black))
            VStack(alignment: .leading, spacing: 2) {
                Text("Life safety goes over the radio first.").font(.system(size: 16, weight: .heavy))
                Text("Use this app for situational reports, not active emergencies. Anything life-threatening goes through 911 Dispatch or your radio channel.")
                    .font(.system(size: 14))
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.red, in: RoundedRectangle(cornerRadius: 10))
    }

    private func card<C: View>(_ kicker: String, _ title: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(kicker.uppercased()).font(.system(size: 11, weight: .heavy)).tracking(1.2).foregroundStyle(Theme.gold)
            Text(title).font(.system(size: 20, weight: .bold))
            content()
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(red: 0x1C / 255, green: 0x3A / 255, blue: 0x5C / 255)))
    }

    private func step(_ n: String, _ title: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(n).font(.system(size: 15, weight: .heavy)).foregroundStyle(.black)
                .frame(width: 28, height: 28).background(Theme.gold, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(title).bold()
                Text(text).foregroundStyle(Theme.soft)
            }
        }
    }

    private func source(_ title: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(title).bold()
            Text(text).font(.subheadline).foregroundStyle(Theme.muted)
        }
    }
}
