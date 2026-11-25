import SwiftUI

public enum CleavePalette {
    public static let canvas = Color(red: 0.969, green: 0.965, blue: 0.953)         // #F7F6F3
    public static let surface = Color.white                                       // #FFFFFF
    public static let recessed = Color(red: 0.953, green: 0.949, blue: 0.933)     // #F3F2EE
    public static let hairline = Color(red: 0.918, green: 0.918, blue: 0.918)     // #EAEAEA
    public static let inkPrimary = Color(red: 0.090, green: 0.094, blue: 0.086)   // #171816
    public static let inkBody = Color(red: 0.251, green: 0.255, blue: 0.243)      // #40413E
    public static let inkMuted = Color(red: 0.451, green: 0.455, blue: 0.439)     // #737470

    public static let greenBg = Color(red: 0.922, green: 0.961, blue: 0.933)      // #EBF5EE
    public static let greenInk = Color(red: 0.122, green: 0.353, blue: 0.220)     // #1F5A38
    public static let blueBg = Color(red: 0.918, green: 0.953, blue: 0.984)       // #EAF3FB
    public static let blueInk = Color(red: 0.110, green: 0.310, blue: 0.478)      // #1C4F7A
    public static let yellowBg = Color(red: 0.984, green: 0.957, blue: 0.882)     // #FBF4E1
    public static let yellowInk = Color(red: 0.459, green: 0.322, blue: 0.0)      // #755200
    public static let redBg = Color(red: 0.984, green: 0.925, blue: 0.922)        // #FBECEB
    public static let redInk = Color(red: 0.557, green: 0.169, blue: 0.141)       // #8E2B24

    public static let logoGradient = LinearGradient(
        colors: [
            Color(red: 0.141, green: 0.420, blue: 0.302), // #246B4D
            Color(red: 0.141, green: 0.467, blue: 0.447), // #247772
            Color(red: 0.196, green: 0.490, blue: 0.702)  // #327DB3
        ],
        startPoint: .bottomLeading,
        endPoint: .topTrailing
    )
}

/// Official Cleave split-C mark rendered natively as vector geometry matching public/cleave-logo.svg.
public struct CleaveSplitCMark: Shape {
    public init() {}

    public func path(in rect: CGRect) -> Path {
        let sx = rect.width / 600.0
        let sy = rect.height / 720.0
        let tx = rect.minX - 40.0 * sx
        let ty = rect.minY - 30.0 * sy

        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: tx + x * sx, y: ty + y * sy)
        }

        var path = Path()
        // Upper split C segment
        path.move(to: p(86, 425))
        path.addCurve(to: p(156, 180), control1: p(70, 334), control2: p(93, 245))
        path.addCurve(to: p(392, 86), control1: p(219, 114), control2: p(306, 85))
        path.addCurve(to: p(576, 211), control1: p(495, 87), control2: p(578, 131))
        path.addCurve(to: p(476, 305), control1: p(575, 269), control2: p(531, 305))
        path.addCurve(to: p(400, 275), control1: p(445, 305), control2: p(416, 294))
        path.closeSubpath()

        // Lower split C segment
        path.move(to: p(93, 455))
        path.addLine(to: p(330, 350))
        path.addCurve(to: p(336, 465), control1: p(303, 391), control2: p(307, 438))
        path.addCurve(to: p(451, 472), control1: p(366, 493), control2: p(412, 491))
        path.addCurve(to: p(518, 454), control1: p(476, 460), control2: p(494, 452))
        path.addCurve(to: p(576, 518), control1: p(553, 457), control2: p(576, 483))
        path.addCurve(to: p(372, 656), control1: p(576, 592), control2: p(490, 655))
        path.addCurve(to: p(93, 455), control1: p(239, 657), control2: p(127, 577))
        path.closeSubpath()

        return path
    }
}

public struct CleaveLogoLockup: View {
    public init() {}

    public var body: some View {
        HStack(spacing: 8) {
            CleaveSplitCMark()
                .fill(CleavePalette.logoGradient)
                .frame(width: 24, height: 28)
            Text("Cleave")
                .font(.system(size: 22, weight: .regular, design: .serif))
                .foregroundStyle(CleavePalette.inkPrimary)
                .tracking(-0.3)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Cleave")
    }
}

public struct CleavePillTag: View {
    public enum Tone { case green, blue, yellow, red, neutral }
    let text: String
    let tone: Tone

    public init(_ text: String, tone: Tone = .neutral) {
        self.text = text
        self.tone = tone
    }

    private var bg: Color {
        switch tone {
        case .green: return CleavePalette.greenBg
        case .blue: return CleavePalette.blueBg
        case .yellow: return CleavePalette.yellowBg
        case .red: return CleavePalette.redBg
        case .neutral: return CleavePalette.recessed
        }
    }

    private var fg: Color {
        switch tone {
        case .green: return CleavePalette.greenInk
        case .blue: return CleavePalette.blueInk
        case .yellow: return CleavePalette.yellowInk
        case .red: return CleavePalette.redInk
        case .neutral: return CleavePalette.inkBody
        }
    }

    public var body: some View {
        Text(text)
            .font(.system(size: 10.5, weight: .semibold, design: .monospaced))
            .foregroundStyle(fg)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(bg, in: Capsule())
    }
}

public struct CleavePrimaryButtonStyle: ButtonStyle {
    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 11)
            .background(CleavePalette.inkPrimary, in: RoundedRectangle(cornerRadius: 8))
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .opacity(configuration.isPressed ? 0.92 : 1.0)
            .animation(.easeOut(duration: 0.14), value: configuration.isPressed)
    }
}

public struct CleaveSecondaryButtonStyle: ButtonStyle {
    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13.5, weight: .medium))
            .foregroundStyle(CleavePalette.inkPrimary)
            .padding(.horizontal, 13)
            .padding(.vertical, 9)
            .background(CleavePalette.surface, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(CleavePalette.hairline, lineWidth: 1))
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.easeOut(duration: 0.14), value: configuration.isPressed)
    }
}

public struct EditorialCardModifier: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .padding(18)
            .background(CleavePalette.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(CleavePalette.hairline, lineWidth: 1))
    }
}

public extension View {
    func editorialCard() -> some View {
        modifier(EditorialCardModifier())
    }
}
