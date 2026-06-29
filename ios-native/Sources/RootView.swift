import SwiftUI

struct RootView: View {
    @EnvironmentObject var app: AppState

    var body: some View {
        ZStack {
            Theme.ink.ignoresSafeArea()
            if app.booting {
                SplashView()
            } else if app.authed {
                MainTabView()
                    .transition(.opacity)
            } else {
                AuthView()
                    .transition(.opacity)
            }
        }
        .preferredColorScheme(.dark)
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
                    .overlay(SparkMark(size: 60))
                    .overlay(
                        RoundedRectangle(cornerRadius: 30, style: .continuous)
                            .stroke(Color.white.opacity(0.15), lineWidth: 1)
                    )
                    .shadow(color: Theme.accent.opacity(0.5), radius: 30, y: 16)
                    .scaleEffect(appear ? 1 : 0.85)
                    .opacity(appear ? 1 : 0)
                Text("AskAI")
                    .font(.system(size: 28, weight: .heavy, design: .rounded))
                    .foregroundStyle(Theme.accentGradient)
                    .opacity(appear ? 1 : 0)
                ProgressView().tint(Theme.muted).opacity(appear ? 1 : 0)
            }
        }
        .onAppear { withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) { appear = true } }
    }
}
