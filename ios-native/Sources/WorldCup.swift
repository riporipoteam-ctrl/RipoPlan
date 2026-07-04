import SwiftUI

/// World Cup 2026 themed background. When the user first mentions the World Cup
/// in a chat, a short branded intro plays (host colors sweep in, the trophy
/// sparkles, floating balls rise, "WORLD CUP 26" reveals), then it settles into
/// a subtle ambient tint behind the conversation.
///
/// (This is an original themed animation in the 2026 palette — not the
/// copyrighted TV broadcast intro, which can't be embedded reliably.)
struct WorldCupBackground: View {
    /// true while the big intro plays; false = subtle ambient only.
    @Binding var intro: Bool
    @State private var sweep = false
    @State private var balls = false
    @State private var titleIn = false
    @State private var shimmer = false

    // United 2026 host palette (vibrant multi-color).
    private let c1 = Color(hex: 0x00A859)   // green
    private let c2 = Color(hex: 0x0055A4)   // blue
    private let c3 = Color(hex: 0xE4002B)   // red
    private let gold = Color(hex: 0xF6B800)

    var body: some View {
        ZStack {
            // Animated color field (always on, very subtle when not intro).
            LinearGradient(colors: [c1, c2, c3],
                           startPoint: sweep ? .topLeading : .bottomLeading,
                           endPoint: sweep ? .bottomTrailing : .topTrailing)
                .opacity(intro ? 0.5 : 0.06)
                .ignoresSafeArea()
                .animation(.easeInOut(duration: 6).repeatForever(autoreverses: true), value: sweep)

            // Floating soccer balls rising.
            GeometryReader { geo in
                ForEach(0..<10, id: \.self) { i in
                    Image(systemName: "soccerball")
                        .font(.system(size: CGFloat(18 + (i % 4) * 10)))
                        .foregroundStyle(.white.opacity(intro ? 0.9 : 0.10))
                        .position(x: geo.size.width * (0.08 + 0.1 * CGFloat(i)),
                                  y: balls ? -60 : geo.size.height + 60)
                        .animation(.easeInOut(duration: Double(5 + i % 5))
                            .repeatForever(autoreverses: false).delay(Double(i) * 0.35), value: balls)
                }
            }
            .ignoresSafeArea()

            if intro {
                // Center branded reveal.
                VStack(spacing: 10) {
                    ZStack {
                        Image(systemName: "trophy.fill")
                            .font(.system(size: 66))
                            .foregroundStyle(gold)
                            .shadow(color: gold.opacity(0.8), radius: shimmer ? 26 : 8)
                        Image(systemName: "sparkles")
                            .font(.system(size: 30)).foregroundStyle(.white)
                            .offset(x: 34, y: -30).opacity(shimmer ? 1 : 0.3)
                    }
                    .scaleEffect(titleIn ? 1 : 0.4)
                    .opacity(titleIn ? 1 : 0)

                    Text("WORLD CUP")
                        .font(.system(size: 34, weight: .black, design: .rounded))
                        .foregroundStyle(.white)
                        .kerning(titleIn ? 4 : 20)
                        .opacity(titleIn ? 1 : 0)
                    Text("2026")
                        .font(.system(size: 48, weight: .black, design: .rounded))
                        .foregroundStyle(LinearGradient(colors: [gold, .white, gold], startPoint: .leading, endPoint: .trailing))
                        .opacity(titleIn ? 1 : 0)
                        .scaleEffect(titleIn ? 1 : 0.6)
                    Text("CANADA · MEXICO · USA")
                        .font(.system(size: 12, weight: .bold)).kerning(2)
                        .foregroundStyle(.white.opacity(0.9))
                        .opacity(titleIn ? 1 : 0)
                }
                .shadow(color: .black.opacity(0.35), radius: 12, y: 6)
                .transition(.opacity)
            }
        }
        .onAppear {
            sweep = true; balls = true
            withAnimation(.spring(response: 0.7, dampingFraction: 0.6).delay(0.15)) { titleIn = true }
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { shimmer = true }
        }
        .allowsHitTesting(false)
    }
}
