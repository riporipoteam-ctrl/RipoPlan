import SwiftUI
import UIKit

/// Design system for the native AskAI app — a dark "command center" look that is
/// deliberately different from the light website: deep ink background, liquid
/// glass surfaces, vivid violet→pink accents, rounded display type.
enum Theme {
    static let ink = Color(hex: 0x0B0B12)
    static let ink2 = Color(hex: 0x12121C)
    static let card = Color(hex: 0x17172192)        // translucent card base
    static let stroke = Color.white.opacity(0.08)
    static let text = Color(hex: 0xF2F2F7)
    static let muted = Color(hex: 0x9A9AB0)
    static let accent = Color(hex: 0xA855F7)
    static let accent2 = Color(hex: 0xFF5EA8)
    static let accent3 = Color(hex: 0x6366F1)
    static let good = Color(hex: 0x34D399)
    static let warn = Color(hex: 0xFBBF24)
    static let bad = Color(hex: 0xFB7185)

    static var accentGradient: LinearGradient {
        LinearGradient(colors: [accent, accent2], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
    static var coolGradient: LinearGradient {
        LinearGradient(colors: [accent3, accent], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
    static var backdrop: LinearGradient {
        LinearGradient(colors: [ink2, ink], startPoint: .top, endPoint: .bottom)
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
}

// MARK: - Glass surfaces

struct GlassCard: ViewModifier {
    var radius: CGFloat = 22
    var padding: CGFloat = 16
    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: radius, style: .continuous)
                            .fill(Color.white.opacity(0.03))
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(
                        LinearGradient(colors: [Color.white.opacity(0.18), Color.white.opacity(0.03)],
                                       startPoint: .topLeading, endPoint: .bottomTrailing),
                        lineWidth: 1
                    )
            )
    }
}

extension View {
    func glass(radius: CGFloat = 22, padding: CGFloat = 16) -> some View {
        modifier(GlassCard(radius: radius, padding: padding))
    }
    /// iOS-style press feedback.
    func pressable() -> some View { buttonStyle(PressableStyle()) }
}

struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: configuration.isPressed)
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

// MARK: - The AskAI spark mark (matches the app icon family)

struct SparkMark: View {
    var size: CGFloat = 44
    var gradient: LinearGradient = Theme.accentGradient
    var body: some View {
        ZStack {
            SparkShape().fill(gradient).frame(width: size, height: size)
            SparkShape().fill(gradient).opacity(0.9)
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

/// Animated aurora background used behind hero areas.
struct AuroraBackground: View {
    @State private var drift = false
    var body: some View {
        ZStack {
            Theme.backdrop.ignoresSafeArea()
            Circle().fill(Theme.accent.opacity(0.28)).frame(width: 360, height: 360)
                .blur(radius: 90).offset(x: drift ? -120 : -80, y: drift ? -260 : -300)
            Circle().fill(Theme.accent3.opacity(0.22)).frame(width: 320, height: 320)
                .blur(radius: 90).offset(x: drift ? 140 : 110, y: drift ? -180 : -150)
            Circle().fill(Theme.accent2.opacity(0.18)).frame(width: 300, height: 300)
                .blur(radius: 100).offset(x: drift ? 90 : 130, y: drift ? 320 : 360)
        }
        .ignoresSafeArea()
        .onAppear {
            withAnimation(.easeInOut(duration: 9).repeatForever(autoreverses: true)) { drift.toggle() }
        }
    }
}

// Avatar color helper for agents (hex string -> Color).
extension Color {
    init(hexString: String?) {
        let s = (hexString ?? "").trimmingCharacters(in: CharacterSet(charactersIn: "# ")).lowercased()
        if let v = UInt32(s, radix: 16), s.count == 6 { self.init(hex: v) }
        else { self = Theme.accent }
    }
}
