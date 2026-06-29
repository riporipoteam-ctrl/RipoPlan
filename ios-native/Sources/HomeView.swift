import SwiftUI
import Foundation

struct Suggestion: Identifiable {
    let id = UUID()
    let icon: String
    let label: String
    let seed: String
    let tint: Color
}

let SUGGESTIONS: [Suggestion] = [
    .init(icon: "trophy.fill", label: "Follow the World Cup", seed: "Give me a live World Cup update — recent results, today's fixtures, and the current standings.", tint: Theme.warn),
    .init(icon: "photo.fill", label: "Create an image", seed: "Create an image of ", tint: Theme.accent2),
    .init(icon: "globe", label: "Build a website", seed: "Build me a website for ", tint: Theme.accent3),
    .init(icon: "magnifyingglass", label: "Research a topic", seed: "Research and summarize the latest on ", tint: Theme.good),
    .init(icon: "pencil.line", label: "Write or edit", seed: "Help me write ", tint: Theme.accent),
    .init(icon: "person.badge.plus", label: "New agent", seed: "Make a new agent called ", tint: Color(hex: 0x0EA5E9)),
]

struct HomeView: View {
    @EnvironmentObject var app: AppState
    @State private var path: [String] = []
    @State private var text = ""
    @State private var sending = false

    private func greeting() -> String {
        let h = Calendar.current.component(.hour, from: Date())
        switch h { case 0..<5: return "Working late"; case 5..<12: return "Good morning"; case 12..<18: return "Good afternoon"; default: return "Good evening" }
    }

    var body: some View {
        NavigationStack(path: $path) {
            ZStack {
                AuroraBackground()
                ScrollView {
                    VStack(spacing: 22) {
                        Spacer(minLength: 24)
                        // Hero
                        VStack(spacing: 14) {
                            RoundedRectangle(cornerRadius: 24, style: .continuous)
                                .fill(.ultraThinMaterial)
                                .frame(width: 72, height: 72)
                                .overlay(SparkMark(size: 38))
                                .shadow(color: Theme.accent.opacity(0.4), radius: 20, y: 10)
                            Text("\(greeting())\(app.firstName.isEmpty ? "" : ", \(app.firstName)")")
                                .font(.system(size: 28, weight: .heavy, design: .rounded))
                                .foregroundStyle(Theme.text)
                                .multilineTextAlignment(.center)
                            Text("What can your team of \(app.agents.count) AI agents get done today?")
                                .font(.subheadline).foregroundStyle(Theme.muted)
                                .multilineTextAlignment(.center).padding(.horizontal, 30)
                        }

                        InputBar(text: $text, sending: sending) { send() }
                            .padding(.horizontal, 16)

                        // Suggestions
                        VStack(spacing: 10) {
                            ForEach(SUGGESTIONS) { s in
                                Button {
                                    Haptic.light(); text = s.seed
                                } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: s.icon).foregroundStyle(s.tint).frame(width: 24)
                                        Text(s.label).foregroundStyle(Theme.text).fontWeight(.medium)
                                        Spacer()
                                        Image(systemName: "arrow.up.left").font(.caption).foregroundStyle(Theme.muted)
                                    }
                                    .padding(.horizontal, 16).padding(.vertical, 14)
                                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.stroke, lineWidth: 1))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 16)

                        if !app.threads.isEmpty {
                            VStack(alignment: .leading, spacing: 10) {
                                SectionHeader(title: "Recent chats")
                                ForEach(app.threads.prefix(3)) { t in
                                    Button { path.append(t.id) } label: { ThreadRowView(thread: t) }
                                        .buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal, 16)
                        }

                        Spacer(minLength: 110)
                    }
                }
            }
            .navigationTitle("")
            .navigationDestination(for: String.self) { tid in
                ChatView(threadId: tid).environmentObject(app)
            }
        }
    }

    private func send() {
        let t = text
        sending = true
        Task {
            if let tid = await app.send(t) {
                text = ""
                path.append(tid)
            }
            sending = false
        }
    }
}

struct ThreadRowView: View {
    @EnvironmentObject var app: AppState
    let thread: ThreadRow
    var body: some View {
        HStack(spacing: 12) {
            Avatar(name: app.agent(thread.primary_agent_id)?.name ?? "AskAI",
                   color: app.agent(thread.primary_agent_id)?.avatar_color,
                   size: 40, spark: thread.primary_agent_id == nil)
            VStack(alignment: .leading, spacing: 2) {
                Text(thread.title ?? "New chat").foregroundStyle(Theme.text)
                    .fontWeight(.semibold).lineLimit(1)
                Text(thread.summary ?? "").foregroundStyle(Theme.muted)
                    .font(.subheadline).lineLimit(1)
            }
            Spacer()
            Text(RelTime.ago(thread.last_activity_at)).font(.caption).foregroundStyle(Theme.muted)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.stroke, lineWidth: 1))
    }
}
