import SwiftUI
import WebKit

/// The native app shell: a full-bleed web view rendering the live AskAI app,
/// topped with an official Liquid Glass status-bar bar (iOS 26+, with a frosted
/// material fallback), a slim load-progress bar, and an offline retry state.
struct RootView: View {
    @State private var progress: Double = 0
    @State private var isLoading = true
    @State private var failed = false
    @State private var web: WKWebView?

    private let appURL = URL(string: "https://riporipoteam-ctrl.github.io/RipoPlan/")!
    private let ink = Color(red: 0.043, green: 0.043, blue: 0.063)
    private let accent = Color(red: 0.43, green: 0.37, blue: 0.99)

    var body: some View {
        GeometryReader { geo in
            let topInset = geo.safeAreaInsets.top

            ZStack(alignment: .top) {
                ink.ignoresSafeArea()

                WebView(url: appURL, progress: $progress, isLoading: $isLoading, failed: $failed) { web = $0 }
                    .ignoresSafeArea()
                    .opacity(failed ? 0 : 1)

                // Liquid Glass bar behind the status bar / Dynamic Island.
                glassBar(height: topInset)

                // Slim top progress indicator.
                if isLoading && progress > 0.02 && progress < 1 {
                    ProgressView(value: progress)
                        .progressViewStyle(.linear)
                        .tint(accent)
                        .frame(height: 2)
                        .padding(.top, max(topInset, 1))
                        .transition(.opacity)
                        .animation(.easeOut(duration: 0.2), value: progress)
                }

                if failed { offlineView }
            }
            .ignoresSafeArea()
        }
    }

    // MARK: - Liquid Glass status bar
    @ViewBuilder
    private func glassBar(height: CGFloat) -> some View {
        Group {
            if #available(iOS 26.0, *) {
                Color.clear
                    .frame(height: height)
                    .glassEffect(in: Rectangle())
            } else {
                Rectangle()
                    .fill(.ultraThinMaterial)
                    .frame(height: height)
                    .overlay(
                        LinearGradient(colors: [.white.opacity(0.06), .clear],
                                       startPoint: .top, endPoint: .bottom)
                    )
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }

    // MARK: - Offline / error
    private var offlineView: some View {
        VStack(spacing: 18) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 44, weight: .semibold))
                .foregroundStyle(.white.opacity(0.85))
            Text("Can’t reach AskAI")
                .font(.title3.bold())
                .foregroundStyle(.white)
            Text("Check your connection and try again.")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.65))
            Button {
                failed = false
                web?.load(URLRequest(url: appURL))
            } label: {
                Text("Retry")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 34).padding(.vertical, 12)
                    .background(
                        LinearGradient(colors: [accent, Color(red: 0.93, green: 0.28, blue: 0.6)],
                                       startPoint: .leading, endPoint: .trailing),
                        in: Capsule()
                    )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ink.ignoresSafeArea())
    }
}
