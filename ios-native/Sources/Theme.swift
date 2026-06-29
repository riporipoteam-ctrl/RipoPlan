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

    // Kept for compatibility with existing call sites — now flat/neutral.
    static var accentGradient: LinearGradient {
        LinearGradient(colors: [accent, accent], startPoint: .top, endPoint: .bottom)
    }
    static var coolGradient: LinearGradient {
        LinearGradient(colors: [accent, accent], startPoint: .top, endPoint: .bottom)
    }
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

// MARK: - Surfaces

struct Card: ViewModifier {
    var radius: CGFloat = 16
    var padding: CGFloat = 16
    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(Theme.ink2, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(Theme.stroke, lineWidth: 1))
    }
}

extension View {
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

/// Plain background (kept as a type so existing references compile).
struct AuroraBackground: View {
    var body: some View { Theme.ink.ignoresSafeArea() }
}
