import SwiftUI
import UIKit

/// Design system — a clean **ChatGPT-style monochrome** look: white/black, no
/// purple. Adaptive: light by default, full dark mode (toggled in Settings).
enum Theme {
    static let ink = Color(light: 0xFFFFFF, dark: 0x0D0D0D)        // app background
    static let ink2 = Color(light: 0xF4F4F5, dark: 0x1C1C1E)       // raised surfaces (composer, sidebar rows)
    static let ink3 = Color(light: 0xECECEE, dark: 0x262628)       // pressed / dividers fill
    static let stroke = Color(lightUI: UIColor.black.withAlphaComponent(0.08),
                              darkUI: UIColor.white.withAlphaComponent(0.10))
    static let text = Color(light: 0x0D0D0D, dark: 0xECECEC)
    static let muted = Color(light: 0x6E6E80, dark: 0x9A9AA0)
    // Primary action color is near-black on light, near-white on dark (ChatGPT).
    static let accent = Color(light: 0x0D0D0D, dark: 0xFFFFFF)
    static let onAccent = Color(light: 0xFFFFFF, dark: 0x0D0D0D)
    static let good = Color(hex: 0x16A34A)
    static let warn = Color(hex: 0xD97706)
    static let bad = Color(hex: 0xE11D48)

    // Monochrome "brand" — pure black/white (ChatGPT-clean). The gradient hooks
    // stay so hero elements share one style, but they resolve to ink.
    static let brandA = accent
    static let brandB = accent
    static let brandC = accent
    static var brandGradient: LinearGradient {
        LinearGradient(colors: [accent, accent], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    static var accentGradient: LinearGradient { brandGradient }
    static var coolGradient: LinearGradient { brandGradient }
    static var backdrop: LinearGradient {
        LinearGradient(colors: [ink, ink], startPoint: .top, endPoint: .bottom)
    }
}

extension Color {
    init(hex: UInt32) {
        let a = hex > 0xFFFFFF ? Double((hex >> 24) & 0xFF) / 255 : 1
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >> 8) & 0xFF) / 255
        let b = Double(hex & 0xFF) / 255
        self = Color(.sRGB, red: r, green: g, blue: b, opacity: a)
    }
    /// Adaptive color that resolves to `light`/`dark` hex per interface style.
    init(light: UInt32, dark: UInt32) {
        self = Color(UIColor { tc in
            UIColor(Color(hex: tc.userInterfaceStyle == .dark ? dark : light))
        })
    }
    init(lightUI: UIColor, darkUI: UIColor) {
        self = Color(UIColor { tc in tc.userInterfaceStyle == .dark ? darkUI : lightUI })
    }
    /// Agent avatar color from a hex string (kept subtle/monochrome-friendly).
    init(hexString: String?) {
        let s = (hexString ?? "").trimmingCharacters(in: CharacterSet(charactersIn: "# ")).lowercased()
        if let v = UInt32(s, radix: 16), s.count == 6 { self.init(hex: v) }
        else { self = Theme.muted }
    }
}

// MARK: - Liquid glass surfaces
// Real frosted-glass material with a top sheen + specular edge + soft shadow.
// (Apple's iOS-26 `glassEffect` API isn't in the CI SDK, so this is the richest
// liquid-glass look that compiles everywhere — content shows through the blur.)

struct LiquidGlass: ViewModifier {
    var radius: CGFloat = 22
    var stroke: Bool = true
    var shadow: Bool = true
    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        content
            .background(.ultraThinMaterial, in: shape)
            .overlay(   // top sheen
                shape.fill(
                    LinearGradient(colors: [Color.white.opacity(0.45), Color.white.opacity(0.04), .clear],
                                   startPoint: .top, endPoint: .bottom)
                )
                .blendMode(.plusLighter)
                .opacity(0.5)
                .allowsHitTesting(false)
            )
            .overlay(   // specular edge
                stroke ? shape.stroke(
                    LinearGradient(colors: [Color.white.opacity(0.55), Color.white.opacity(0.08),
                                            Color.black.opacity(0.05)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing),
                    lineWidth: 1
                ) : nil
            )
            .shadow(color: shadow ? Color.black.opacity(0.16) : .clear, radius: 18, x: 0, y: 10)
    }
}

struct Card: ViewModifier {
    var radius: CGFloat = 16
    var padding: CGFloat = 16
    func body(content: Content) -> some View {
        content.padding(padding).modifier(LiquidGlass(radius: radius, shadow: true))
    }
}

extension View {
    func liquidGlass(_ radius: CGFloat = 22, stroke: Bool = true, shadow: Bool = true) -> some View {
        modifier(LiquidGlass(radius: radius, stroke: stroke, shadow: shadow))
    }
    func card(radius: CGFloat = 16, padding: CGFloat = 16) -> some View {
        modifier(Card(radius: radius, padding: padding))
    }
    /// Back-compat alias used by older views.
    func glass(radius: CGFloat = 16, padding: CGFloat = 16) -> some View {
        modifier(Card(radius: radius, padding: padding))
    }
    func pressable() -> some View { buttonStyle(PressableStyle()) }
}

struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.7 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

// MARK: - Haptics

enum Haptic {
    static func light() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    static func medium() { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
    static func rigid() { UIImpactFeedbackGenerator(style: .rigid).impactOccurred() }
    static func soft() { UIImpactFeedbackGenerator(style: .soft).impactOccurred() }
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    static func warning() { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
    static func selection() { UISelectionFeedbackGenerator().selectionChanged() }
}

// MARK: - Brand mark (monochrome sparkle, used sparingly)

struct SparkMark: View {
    var size: CGFloat = 44
    var color: Color = Theme.text
    var body: some View {
        ZStack {
            SparkShape().fill(color).frame(width: size, height: size)
            SparkShape().fill(color).opacity(0.85)
                .frame(width: size * 0.36, height: size * 0.36)
                .offset(x: size * 0.42, y: -size * 0.42)
        }
    }
}

struct SparkShape: Shape {
    func path(in rect: CGRect) -> Path {
        let cx = rect.midX, cy = rect.midY, w = rect.width, h = rect.height
        func p(_ fx: CGFloat, _ fy: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + fx * w, y: rect.minY + fy * h)
        }
        var path = Path()
        path.move(to: CGPoint(x: cx, y: rect.minY))
        path.addCurve(to: CGPoint(x: rect.maxX, y: cy), control1: p(0.55, 0.30), control2: p(0.70, 0.45))
        path.addCurve(to: CGPoint(x: cx, y: rect.maxY), control1: p(0.70, 0.55), control2: p(0.55, 0.70))
        path.addCurve(to: CGPoint(x: rect.minX, y: cy), control1: p(0.45, 0.70), control2: p(0.30, 0.55))
        path.addCurve(to: CGPoint(x: cx, y: rect.minY), control1: p(0.30, 0.45), control2: p(0.45, 0.30))
        path.closeSubpath()
        return path
    }
}

/// Neutral ambient background — barely-there monochrome blobs, gently drifting,
/// so the liquid-glass surfaces have depth to refract without any color cast.
struct AuroraBackground: View {
    @State private var drift = false
    var body: some View {
        ZStack {
            Theme.ink
            Circle().fill(Color(lightUI: .black, darkUI: .white).opacity(0.05))
                .frame(width: 380, height: 380).blur(radius: 90)
                .offset(x: drift ? -110 : -150, y: drift ? -270 : -230)
            Circle().fill(Color(lightUI: .black, darkUI: .white).opacity(0.04))
                .frame(width: 340, height: 340).blur(radius: 95)
                .offset(x: drift ? 150 : 110, y: drift ? 340 : 390)
        }
        .ignoresSafeArea()
        .onAppear {
            withAnimation(.easeInOut(duration: 9).repeatForever(autoreverses: true)) { drift = true }
        }
    }
}

/// Monochrome hero spark (home, sidebar wordmark, model pill, splash).
struct BrandSpark: View {
    var size: CGFloat = 44
    var body: some View {
        ZStack {
            SparkShape().fill(Theme.text).frame(width: size, height: size)
            SparkShape().fill(Theme.text).opacity(0.85)
                .frame(width: size * 0.36, height: size * 0.36)
                .offset(x: size * 0.42, y: -size * 0.42)
        }
        .frame(width: size * 1.3, height: size * 1.3)
    }
}
