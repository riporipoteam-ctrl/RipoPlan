import SwiftUI

/// Shown once after sign up — a short intro, then a workspace-setup step that
/// names the workspace and spins up the starting team (Nebula-style).
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
    private var lastIntro: Int { slides.count - 1 }
    private var setupIndex: Int { slides.count }

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
                    WorkspaceSetupView(done: done).environmentObject(app).tag(setupIndex)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))

                if page <= lastIntro {
                    Button {
                        Haptic.medium(); withAnimation { page += 1 }
                    } label: {
                        Text("Continue").fontWeight(.bold)
                            .frame(maxWidth: .infinity).padding(.vertical, 15)
                            .background(Theme.accent, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .foregroundStyle(Theme.onAccent)
                    }
                    .pressable()
                    .padding(.horizontal, 24).padding(.bottom, 24)
                }
            }
        }
    }
}

/// Final onboarding step: name your workspace, see your starting team, create it.
struct WorkspaceSetupView: View {
    @EnvironmentObject var app: AppState
    var done: () -> Void
    @State private var name = ""
    @State private var busy = false

    private let team: [(String, String, String)] = [
        ("AskAI", "Chief of Staff", "#0D0D0D"),
        ("Researcher", "Research Analyst", "#3b82f6"),
        ("Builder", "Automation Builder", "#8b5cf6"),
        ("Writer", "Content Writer", "#10b981"),
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                Spacer(minLength: 24)
                SparkMark(size: 40, color: Theme.text)
                Text("Set up your workspace").font(.system(size: 24, weight: .bold)).foregroundStyle(Theme.text)
                Text("Name it and we'll spin up your starting team of agents.")
                    .font(.subheadline).foregroundStyle(Theme.muted).multilineTextAlignment(.center).padding(.horizontal, 30)

                TextField("Workspace name (e.g. My Team)", text: $name)
                    .foregroundStyle(Theme.text).tint(Theme.accent)
                    .padding(.horizontal, 14).padding(.vertical, 13)
                    .background(Theme.ink3, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.stroke, lineWidth: 1))
                    .padding(.horizontal, 22)

                VStack(spacing: 10) {
                    ForEach(team, id: \.0) { (n, role, color) in
                        HStack(spacing: 12) {
                            AgentAvatar(name: n, color: color, size: 42, spark: n == "AskAI")
                            VStack(alignment: .leading, spacing: 2) {
                                Text(n).foregroundStyle(Theme.text).fontWeight(.semibold)
                                Text(role).foregroundStyle(Theme.muted).font(.caption)
                            }
                            Spacer()
                            Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.good)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .background(Theme.ink2, in: RoundedRectangle(cornerRadius: 14))
                    }
                }
                .padding(.horizontal, 22)

                Button {
                    busy = true
                    Task {
                        await app.setupWorkspace(name: name.isEmpty ? (app.workspace?.name ?? "My Workspace") : name)
                        Haptic.success(); busy = false; done()
                    }
                } label: {
                    HStack { if busy { ProgressView().tint(Theme.onAccent) }; Text(busy ? "Building your team…" : "Create my workspace").fontWeight(.bold) }
                        .frame(maxWidth: .infinity).padding(.vertical, 15)
                        .background(Theme.accent, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .foregroundStyle(Theme.onAccent)
                }
                .pressable().disabled(busy).padding(.horizontal, 22)

                Button("Skip") { done() }.font(.subheadline).foregroundStyle(Theme.muted)
                Spacer(minLength: 24)
            }
        }
        .onAppear { if name.isEmpty { name = app.workspace?.name ?? "" } }
    }
}
