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

/// Branded dark launch splash — no flat black/"Loading…" screen.
struct SplashView: View {
    @State private var appear = false
    var body: some View {
        ZStack {
            AuroraBackground()
            VStack(spacing: 20) {
                RoundedRectangle(cornerRadius: 30, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .frame(width: 116, height: 116)
                    .overlay(BrandSpark(size: 58))
                    .overlay(
                        RoundedRectangle(cornerRadius: 30, style: .continuous)
                            .stroke(Theme.stroke, lineWidth: 1)
                    )
                    .shadow(color: Color.black.opacity(0.18), radius: 30, y: 16)
                    .scaleEffect(appear ? 1 : 0.85)
                    .opacity(appear ? 1 : 0)
                Text("AskAI")
                    .font(.system(size: 28, weight: .heavy, design: .rounded))
                    .foregroundStyle(Theme.text)
                    .opacity(appear ? 1 : 0)
                ProgressView().tint(Theme.muted).opacity(appear ? 1 : 0)
            }
        }
        .onAppear { withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) { appear = true } }
    }
}
