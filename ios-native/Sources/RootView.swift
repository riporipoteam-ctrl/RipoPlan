import SwiftUI

struct RootView: View {
    @EnvironmentObject var app: AppState
    // Light by default; user flips this in Settings → Dark mode.
    @AppStorage("askai.dark") private var darkMode = false
    @AppStorage("askai.onboarded") private var onboarded = false

    var body: some View {
        ZStack {
            Theme.ink.ignoresSafeArea()
            if app.booting {
                SplashView()
            } else if app.authed {
                if onboarded {
                    RootShell().transition(.opacity)
                } else {
                    OnboardingView(done: { withAnimation { onboarded = true } })
                        .environmentObject(app)
                        .transition(.opacity)
                }
            } else {
                AuthView()
                    .transition(.opacity)
            }
        }
        .preferredColorScheme(darkMode ? .dark : .light)
        .tint(Theme.accent)
        .animation(.easeInOut(duration: 0.4), value: app.authed)
        .animation(.easeInOut(duration: 0.4), value: app.booting)
        .task { await app.boot() }
    }
}

/// Launch splash — glass tile with a living spark, expanding ripples, and a
/// shimmering status line (no flat "Loading…" screen).
struct SplashView: View {
    @State private var appear = false
    @State private var sway = false
    @State private var ripple = false

    var body: some View {
        ZStack {
            AuroraBackground()

            // Expanding ripple rings behind the tile.
            ZStack {
                Circle().stroke(Theme.stroke, lineWidth: 1.5)
                    .frame(width: 150, height: 150)
                    .scaleEffect(ripple ? 2.6 : 1).opacity(ripple ? 0 : 0.8)
                Circle().stroke(Theme.stroke, lineWidth: 1.5)
                    .frame(width: 150, height: 150)
                    .scaleEffect(ripple ? 1.9 : 0.85).opacity(ripple ? 0 : 0.5)
            }
            .animation(.easeOut(duration: 2.2).repeatForever(autoreverses: false), value: ripple)

            VStack(spacing: 22) {
                RoundedRectangle(cornerRadius: 30, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .frame(width: 118, height: 118)
                    .overlay(
                        BrandSpark(size: 58)
                            .rotationEffect(.degrees(sway ? 7 : -7))
                            .scaleEffect(sway ? 1.05 : 0.95)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 30, style: .continuous)
                            .stroke(Theme.stroke, lineWidth: 1)
                    )
                    .shadow(color: Color.black.opacity(0.16), radius: 28, y: 14)
                    .scaleEffect(appear ? 1 : 0.8)
                Text("AskAI")
                    .font(.system(size: 30, weight: .heavy, design: .rounded))
                    .foregroundStyle(Theme.text)
                ShimmerText(text: "Waking your agents…")
            }
            .opacity(appear ? 1 : 0)
        }
        .onAppear {
            withAnimation(.spring(response: 0.55, dampingFraction: 0.7)) { appear = true }
            withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) { sway = true }
            ripple = true
        }
    }
}
