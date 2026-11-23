import SwiftUI
import UIKit

/// Botetourt County Emergency Management brand (Brand Standards, Edition 1.0, 2026).
/// Navy carries the brand; red, gold and indigo are signals. Never white type on gold.
enum Theme {
    // Core palette (Color-Codes.txt)
    static let navy = Color(hex: 0x0E2033)          // Blue Ridge Navy · primary field color
    static let red = Color(hex: 0xD02129)           // Signal Red · Respond: alerts, calls to action
    static let gold = Color(hex: 0xFDB833)          // Harvest Gold · Prepare
    static let indigo = Color(hex: 0x2E3192)        // Defense Indigo · Recover
    static let slate = Color(hex: 0x33445A)         // Ridge Slate
    static let fog = Color(hex: 0xF2F4F7)           // Morning Fog

    // How the app uses them
    static let page = navy                          // backgrounds
    static let card = Color(hex: 0x16283D)          // a panel one step up from navy (navy + slate)
    static let text = fog
    static let muted = fog.opacity(0.68)
    /// The guide pages' own canvas, as published in ArcGIS, behind each page.
    static let guideCanvas = Color(hex: 0x0A1724)

    // Lifeline status. Green is the lifeline convention used on SIGNAL; it appears only as a status signal.
    static let stabilized = Color(hex: 0x2E9E5B)
    static let impacted = gold
    static let destabilized = red
    static let unknown = fog.opacity(0.45)
}

/// Brand type: Barlow Condensed 800 for headlines (always uppercase), Barlow for text,
/// IBM Plex Mono 500 for labels, timestamps and IDs (caps, +16% tracking).
enum BrandFont {
    static func display(_ size: CGFloat, relativeTo style: Font.TextStyle = .title2) -> Font {
        .custom("BarlowCondensed-ExtraBold", size: size, relativeTo: style)
    }
    static func subhead(_ size: CGFloat, relativeTo style: Font.TextStyle = .headline) -> Font {
        .custom("BarlowCondensed-SemiBold", size: size, relativeTo: style)
    }
    static func body(_ size: CGFloat = 17, weight: Font.Weight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
        let name: String
        switch weight {
        case .bold, .heavy, .black: name = "Barlow-Bold"
        case .semibold: name = "Barlow-SemiBold"
        case .medium: name = "Barlow-Medium"
        default: name = "Barlow-Regular"
        }
        return .custom(name, size: size, relativeTo: style)
    }
    static func label(_ size: CGFloat = 12, relativeTo style: Font.TextStyle = .caption) -> Font {
        .custom("IBMPlexMono-Medium", size: size, relativeTo: style)
    }

    static func uiFont(_ name: String, _ size: CGFloat) -> UIFont {
        UIFont(name: name, size: size) ?? .systemFont(ofSize: size, weight: .bold)
    }
}

/// Plex Mono label: caps with +16% tracking, per the type hierarchy.
struct BrandLabel: View {
    let text: String
    var size: CGFloat = 12
    var color: Color = Theme.gold
    init(_ text: String, size: CGFloat = 12, color: Color = Theme.gold) {
        self.text = text; self.size = size; self.color = color
    }
    var body: some View {
        Text(text.uppercased())
            .font(BrandFont.label(size))
            .tracking(size * 0.16)
            .foregroundStyle(color)
    }
}

/// The tri-bar: the one place all three program colors appear together.
struct TriBar: View {
    var vertical = true
    var body: some View {
        let stack = [Theme.red, Theme.gold, Theme.indigo]
        Group {
            if vertical {
                VStack(spacing: 0) { ForEach(0..<3, id: \.self) { stack[$0] } }
            } else {
                HStack(spacing: 0) { ForEach(0..<3, id: \.self) { stack[$0] } }
            }
        }
        .accessibilityHidden(true)
    }
}

/// Masthead, left side: seal, tri-bar, BOTETOURT COUNTY / EMERGENCY MANAGEMENT.
/// Seal at 30 pt (90 px on iPhone, above the 48 px screen minimum), unaltered, on navy.
struct NavLockup: View {
    var body: some View {
        HStack(alignment: .center, spacing: 7) {
            Image("Seal")
                .resizable()
                .aspectRatio(1, contentMode: .fit)
                .frame(width: 30, height: 30)
            TriBar().frame(width: 3, height: 26)
            MastheadText(top: "BOTETOURT COUNTY", bottom: "EMERGENCY MANAGEMENT", alignment: .leading)
        }
        .fixedSize()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Botetourt County Emergency Management")
    }
}

/// Masthead, right side: the app's name, set exactly like the county wording so the two sides match.
struct AppNameMark: View {
    var body: some View {
        Text("FIELD GUIDE")
            .font(.custom("BarlowCondensed-ExtraBold", fixedSize: 17)).tracking(0.2)
            .foregroundStyle(.white)
            .lineLimit(1)
            .fixedSize()
            .accessibilityLabel("Field Guide")
    }
}

/// Two lines: gold Barlow Condensed SemiBold, tracked caps, over white Barlow Condensed 800.
struct MastheadText: View {
    let top: String
    let bottom: String
    let alignment: HorizontalAlignment
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
    }
}

extension View {
    /// The masthead on every screen: county lockup on the left (after the back arrow),
    /// app name on the right, nothing in the middle. The bar holds nothing else.
    func brandNavBar() -> some View {
        self
            .toolbar {
                PlainToolbarItem(placement: .topBarLeading) { NavLockup() }
                ToolbarItem(placement: .principal) { Color.clear.frame(width: 1, height: 1) }
                PlainToolbarItem(placement: .topBarTrailing) { AppNameMark() }
            }
            .toolbarRole(.editor)
    }
}

/// A toolbar item drawn straight on the navy bar, without the iOS 26 glass capsule behind it.
struct PlainToolbarItem<Content: View>: ToolbarContent {
    let placement: ToolbarItemPlacement
    @ViewBuilder let content: () -> Content

    var body: some ToolbarContent {
        if #available(iOS 26.0, *) {
            ToolbarItem(placement: placement) { content() }
                .sharedBackgroundVisibility(.hidden)
        } else {
            ToolbarItem(placement: placement) { content() }
        }
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: 1)
    }
}

/// Navigation bars in Blue Ridge Navy with Barlow Condensed titles.
enum BrandAppearance {
    @MainActor static func apply() {
        let a = UINavigationBarAppearance()
        a.configureWithOpaqueBackground()
        a.backgroundColor = UIColor(Theme.navy)
        a.shadowColor = UIColor(Theme.slate)
        a.titleTextAttributes = [
            .font: BrandFont.uiFont("BarlowCondensed-ExtraBold", 21),
            .foregroundColor: UIColor.white,
            .kern: 0.6,
        ]
        a.largeTitleTextAttributes = [
            .font: BrandFont.uiFont("BarlowCondensed-ExtraBold", 34),
            .foregroundColor: UIColor.white,
        ]
        let button = UIBarButtonItemAppearance()
        button.normal.titleTextAttributes = [.font: BrandFont.uiFont("Barlow-SemiBold", 17)]
        a.buttonAppearance = button
        a.backButtonAppearance = button
        let nav = UINavigationBar.appearance()
        nav.standardAppearance = a
        nav.scrollEdgeAppearance = a
        nav.compactAppearance = a
        nav.tintColor = UIColor(Theme.gold)
    }
}
