import SwiftUI

/// The header on every page, styled like the EOP Field Guide app's bar (BCEM Brand Standards, Edition 1.0):
/// Blue Ridge Navy, the seal (unaltered, on navy), the tri-bar, and BOTETOURT COUNTY / EMERGENCY MANAGEMENT
/// in Barlow Condensed on the left; the app's name, STORMWATCH / RESPONDER, on the right, in the same type. A plain bar, no glass buttons.
/// Tapping it goes to Info, like the seal and title on the web app.
struct AppHeader: View {
    @Binding var tab: AppTab

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 7) {
                Image("Seal")
                    .resizable()
                    .aspectRatio(1, contentMode: .fit)
                    .frame(width: 30, height: 30)
                TriBar().frame(width: 3, height: 26)
                MastheadText(top: "BOTETOURT COUNTY", bottom: "EMERGENCY MANAGEMENT", alignment: .leading)
                Spacer(minLength: 8)
                MastheadText(top: "STORMWATCH", bottom: "RESPONDER", alignment: .trailing)
            }
            .padding(.horizontal, 14)
            .frame(height: 44)
            .background(Theme.navy)
            Rectangle().fill(Theme.slate).frame(height: 0.5)
        }
        .contentShape(Rectangle())
        .onTapGesture { tab = .info }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Botetourt County Emergency Management, Stormwatch Responder")
        .accessibilityHint("Opens Info")
        .accessibilityAddTraits(.isButton)
    }
}

/// Two-line masthead text, the same as the Field Guide app: small gold Barlow SemiBold over large white Barlow ExtraBold.
struct MastheadText: View {
    let top: String
    let bottom: String
    var alignment: HorizontalAlignment = .leading

    var body: some View {
        VStack(alignment: alignment, spacing: -3) {
            Text(top)
                .font(.custom("BarlowCondensed-SemiBold", fixedSize: 10.5)).tracking(1.1)
                .foregroundStyle(Theme.gold)
            Text(bottom)
                .font(.custom("BarlowCondensed-ExtraBold", fixedSize: 17)).tracking(0.2)
                .foregroundStyle(.white)
        }
        .lineLimit(1)
        .fixedSize()
    }
}

/// The tri-bar: the one place all three program colors appear together (red, gold, indigo).
struct TriBar: View {
    var body: some View {
        VStack(spacing: 0) { Theme.red; Theme.gold; Theme.blue }
            .accessibilityHidden(true)
    }
}
