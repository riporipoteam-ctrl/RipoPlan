import SwiftUI
import WebKit

/// The native app shell: a full-bleed web view rendering the live AskAI app,
/// topped with a Liquid Glass status-bar bar (frosted material), a slim
/// load-progress bar, a branded animated launch splash (so there's never a
/// flat black "Loading…" screen), and an offline retry state.
struct RootView: View {
    @State private var progress: Double = 0
    @State private var isLoading = true
    @State private var failed = false
    @State private var booted = false        // first web load finished
    @State private var web: WKWebView?

    private let appURL = URL(string: "https://riporipoteam-ctrl.github.io/RipoPlan/")!
    // Match the web app's default (light) theme so there's no dark flash.
    private let canvas = Color(red: 0.965, green: 0.953, blue: 0.933)   // #f6f3ee
    private let accent = Color(red: 0.66, green: 0.42, blue: 1.0)
    private let accent2 = Color(red: 1.0, green: 0.37, blue: 0.66)

    var body: some View {
        GeometryReader { geo in
            let topInset = geo.safeAreaInsets.top

            ZStack(alignment: .top) {
                canvas.ignoresSafeArea()

                WebView(url: appURL, progress: $progress, isLoading: $isLoading, failed: $failed) { web = $0 }
                    .ignoresSafeArea()
                    .opacity(failed ? 0 : 1)

                // Liquid Glass bar behind the status bar / Dynamic Island.
                glassBar(height: topInset)

                // Slim top progress indicator.
                if isLoading && progress > 0.02 && progress < 1 && booted {
                    ProgressView(value: progress)
                        .progressViewStyle(.linear)
                        .tint(accent)
                        .frame(height: 2)
                        .padding(.top, max(topInset, 1))
                        .transition(.opacity)
                        .animation(.easeOut(duration: 0.2), value: progress)
                }

                if failed { offlineView }

                // Branded launch splash — covers the load, then fades away.
                if !booted && !failed {
                    SplashView(accent: accent, accent2: accent2, canvas: canvas)
                        .transition(.opacity)
                }
            }
            .ignoresSafeArea()
        }
        .onChange(of: isLoading) { loading in
            if !loading && !booted {
                // Let the page paint, then fade the splash out smoothly.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                    withAnimation(.easeInOut(duration: 0.45)) { booted = true }
                }
            }
        }
    }

    // MARK: - Liquid Glass status bar
    @ViewBuilder
    private func glassBar(height: CGFloat) -> some View {
        Rectangle()
            .fill(.ultraThinMaterial)
            .frame(height: height)
            .overlay(
                LinearGradient(colors: [.white.opacity(0.10), .clear],
                               startPoint: .top, endPoint: .bottom)
            )
            .ignoresSafeArea()
            .allowsHitTesting(false)
    }

    // MARK: - Offline / error
    private var offlineView: some View {
        VStack(spacing: 18) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 44, weight: .semibold))
                .foregroundStyle(.black.opacity(0.55))
            Text("Can’t reach AskAI")
                .font(.title3.bold())
                .foregroundStyle(.black.opacity(0.85))
            Text("Check your connection and try again.")
                .font(.subheadline)
                .foregroundStyle(.black.opacity(0.5))
            Button {
                failed = false
                booted = false
                web?.load(URLRequest(url: appURL))
            } label: {
                Text("Retry")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 34).padding(.vertical, 12)
                    .background(
                        LinearGradient(colors: [accent, accent2],
                                       startPoint: .leading, endPoint: .trailing),
                        in: Capsule()
                    )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(canvas.ignoresSafeArea())
    }
}

/// A four-point "sparkle" mark matching the AskAI app icon.
struct SparkShape: Shape {
    func path(in rect: CGRect) -> Path {
        let w = rect.width, h = rect.height
        let cx = rect.midX, cy = rect.midY
        func p(_ fx: CGFloat, _ fy: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + fx * w, y: rect.minY + fy * h)
        }
        var path = Path()
        path.move(to: CGPoint(x: cx, y: rect.minY))
        path.addCurve(to: CGPoint(x: rect.maxX, y: cy),
                      control1: p(0.55, 0.30), control2: p(0.70, 0.45))
        path.addCurve(to: CGPoint(x: cx, y: rect.maxY),
                      control1: p(0.70, 0.55), control2: p(0.55, 0.70))
        path.addCurve(to: CGPoint(x: rect.minX, y: cy),
                      control1: p(0.45, 0.70), control2: p(0.30, 0.55))
        path.addCurve(to: CGPoint(x: cx, y: rect.minY),
                      control1: p(0.30, 0.45), control2: p(0.45, 0.30))
        path.closeSubpath()
        return path
    }
}

/// Branded animated splash: frosted glass tile + gradient spark + wordmark.
struct SplashView: View {
    let accent: Color
    let accent2: Color
    let canvas: Color
    @State private var appear = false

    private var sparkGradient: LinearGradient {
        LinearGradient(colors: [accent, accent2], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    var body: some View {
        ZStack {
            LinearGradient(colors: [.white, canvas, accent.opacity(0.12)],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()

            // soft glow blob
            Circle()
                .fill(accent.opacity(0.18))
                .frame(width: 320, height: 320)
                .blur(radius: 70)
                .offset(y: -120)

            VStack(spacing: 22) {
                ZStack {
                    RoundedRectangle(cornerRadius: 30, style: .continuous)
                        .fill(.ultraThinMaterial)
                        .frame(width: 116, height: 116)
                        .overlay(
                            RoundedRectangle(cornerRadius: 30, style: .continuous)
                                .stroke(accent.opacity(0.25), lineWidth: 1)
                        )
                        .shadow(color: accent.opacity(0.35), radius: 26, x: 0, y: 18)

                    ZStack {
                        SparkShape().fill(sparkGradient)
                            .frame(width: 62, height: 62)
                        SparkShape().fill(sparkGradient)
                            .frame(width: 22, height: 22)
                            .offset(x: 30, y: -28)
                            .opacity(0.9)
                    }
                }
                .scaleEffect(appear ? 1 : 0.86)
                .opacity(appear ? 1 : 0)

                VStack(spacing: 6) {
                    Text("AskAI")
                        .font(.system(size: 26, weight: .heavy, design: .rounded))
                        .foregroundStyle(sparkGradient)
                    Text("Loading…")
                        .font(.system(size: 13))
                        .foregroundStyle(.black.opacity(0.45))
                }
                .opacity(appear ? 1 : 0)
            }
        }
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) { appear = true }
        }
    }
}
