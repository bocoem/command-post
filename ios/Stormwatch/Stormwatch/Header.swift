import SwiftUI

/// The web app's header, on every page: banner art, the BCEM seal, the "Stormwatch Responder" lockup,
/// and the red / gold / indigo bar. The pictures are the web app's own files, downloaded and kept on the phone.
struct AppHeader: View {
    @EnvironmentObject var feed: Feed
    @Binding var tab: AppTab

    var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .leading) {
                if let b = feed.header["banner"] {
                    Image(uiImage: b).resizable().scaledToFill()
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
                        .clipped()
                } else {
                    Theme.card
                }
                HStack(spacing: 10) {
                    if let s = feed.header["seal"] {
                        Image(uiImage: s).resizable().scaledToFit().frame(width: 50, height: 50)
                    } else {
                        Circle().fill(Theme.card).frame(width: 50, height: 50)
                    }
                    if let l = feed.header["lockup"] {
                        Image(uiImage: l).resizable().scaledToFit().frame(height: 42)
                    } else {
                        VStack(alignment: .leading, spacing: 0) {
                            Text("BOTETOURT COUNTY EMERGENCY MANAGEMENT").font(.system(size: 7, weight: .heavy)).foregroundStyle(Theme.gold)
                            Text("STORMWATCH").font(.system(size: 26, weight: .black))
                            Text("R E S P O N D E R").font(.system(size: 9, weight: .heavy)).foregroundStyle(Theme.gold)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 12)
            }
            .frame(height: 70)
            .contentShape(Rectangle())
            .onTapGesture { tab = .info } // same as the web: the seal and title go to Info
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Stormwatch Responder. Botetourt County Emergency Management")
            .accessibilityAddTraits(.isButton)
            HStack(spacing: 0) { Theme.red; Theme.gold; Theme.blue }.frame(height: 3)
        }
        .background(Theme.card)
    }
}
