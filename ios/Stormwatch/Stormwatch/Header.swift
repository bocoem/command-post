import SwiftUI

/// The header on every page, styled like the EOP Field Guide app's bar (BCEM Brand Standards, Edition 1.0):
/// Blue Ridge Navy, the seal (unaltered, on navy), the tri-bar, and BOTETOURT COUNTY / EMERGENCY MANAGEMENT
/// in Barlow Condensed on the left; the app's name, STORMWATCH / RESPONDER, on the right.
/// Tapping it goes to Info, like the seal and title on the web app.
struct AppHeader: View {
    @Binding var tab: AppTab

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 7) {
                Image("Seal")
                    .resizable()
                    .aspectRatio(1, contentMode: .fit)
                    .frame(width: 32, height: 32)
                TriBar().frame(width: 3, height: 28)
                VStack(alignment: .leading, spacing: -3) {
                    Text("BOTETOURT COUNTY")
                        .font(.custom("BarlowCondensed-SemiBold", fixedSize: 10.5)).tracking(1.1)
                        .foregroundStyle(Theme.gold)
                    Text("EMERGENCY MANAGEMENT")
                        .font(.custom("BarlowCondensed-ExtraBold", fixedSize: 17))
                        .foregroundStyle(.white)
                }
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: -2) {
                    Text("STORMWATCH")
                        .font(.custom("BarlowCondensed-ExtraBold", fixedSize: 19))
                        .foregroundStyle(.white)
                    Text("RESPONDER")
                        .font(.custom("IBMPlexMono-Medium", fixedSize: 9.5)).tracking(1.5)
                        .foregroundStyle(Theme.gold)
                }
                .lineLimit(1)
            }
            .padding(.horizontal, 14)
            .frame(height: 50)
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

/// The tri-bar: the one place all three program colors appear together (red, gold, indigo).
struct TriBar: View {
    var body: some View {
        VStack(spacing: 0) { Theme.red; Theme.gold; Theme.blue }
            .accessibilityHidden(true)
    }
}
