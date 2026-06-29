import SwiftUI

/// Shown once after sign up — a short, swipeable intro.
struct OnboardingView: View {
    @EnvironmentObject var app: AppState
    var done: () -> Void
    @State private var page = 0

    private struct Slide { let icon: String; let title: String; let body: String }
    private let slides = [
        Slide(icon: "sparkles", title: "Welcome to AskAI", body: "Your own team of AI agents that chat, search the web, build things, and get work done."),
        Slide(icon: "person.2.fill", title: "A team, not a bot", body: "Message agents in one chat, @mention several at once, or spin up new specialists anytime."),
        Slide(icon: "bolt.fill", title: "Works in the background", body: "Schedule jobs and get a daily briefing — your agents keep working even when you're away."),
    ]

    var body: some View {
        ZStack {
            AuroraBackground()
            VStack {
                TabView(selection: $page) {
                    ForEach(slides.indices, id: \.self) { i in
                        VStack(spacing: 18) {
                            Spacer()
                            ZStack {
                                RoundedRectangle(cornerRadius: 28, style: .continuous)
                                    .fill(.ultraThinMaterial).frame(width: 110, height: 110)
                                Image(systemName: slides[i].icon).font(.system(size: 46, weight: .semibold)).foregroundStyle(Theme.text)
                            }
                            .liquidGlass(28)
                            Text(slides[i].title).font(.system(size: 26, weight: .bold)).foregroundStyle(Theme.text)
                                .multilineTextAlignment(.center)
                            Text(slides[i].body).font(.body).foregroundStyle(Theme.muted)
                                .multilineTextAlignment(.center).padding(.horizontal, 36)
                            Spacer()
                        }
                        .tag(i)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .always))

                Button {
                    Haptic.medium()
                    if page < slides.count - 1 { withAnimation { page += 1 } } else { Haptic.success(); done() }
                } label: {
                    Text(page < slides.count - 1 ? "Continue" : "Get started").fontWeight(.bold)
                        .frame(maxWidth: .infinity).padding(.vertical, 15)
                        .background(Theme.accent, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .foregroundStyle(Theme.onAccent)
                }
                .pressable()
                .padding(.horizontal, 24).padding(.bottom, 24)

                Button("Skip") { done() }.font(.subheadline).foregroundStyle(Theme.muted).padding(.bottom, 16)
            }
        }
    }
}
