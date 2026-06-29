import SwiftUI

struct AgentsView: View {
    @EnvironmentObject var app: AppState
    @State private var showCreate = false
    @State private var path: [String] = []

    private let cols = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        NavigationStack(path: $path) {
            ZStack {
                Theme.backdrop.ignoresSafeArea()
                ScrollView {
                    LazyVGrid(columns: cols, spacing: 12) {
                        ForEach(app.agents) { a in
                            Button { Haptic.light(); path.append(a.id) } label: { AgentCard(agent: a) }
                                .buttonStyle(.plain)
                        }
                    }
                    .padding(16)
                    .padding(.bottom, 100)
                }
                .refreshable { await app.loadAgents() }
            }
            .navigationTitle("Agents")
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { Haptic.medium(); showCreate = true } label: {
                        Image(systemName: "plus.circle.fill").foregroundStyle(Theme.accentGradient)
                    }
                }
            }
            .navigationDestination(for: String.self) { id in
                if let a = app.agent(id) { AgentDetailView(agent: a).environmentObject(app) }
            }
            .sheet(isPresented: $showCreate) { CreateAgentSheet().environmentObject(app) }
        }
    }
}

struct AgentCard: View {
    let agent: Agent
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Avatar(name: agent.name, color: agent.avatar_color, size: 42, spark: agent.is_supervisor == true)
                Spacer()
                if agent.is_supervisor == true {
                    Text("Chief").font(.caption2.bold()).foregroundStyle(Theme.warn)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Theme.warn.opacity(0.15), in: Capsule())
                }
            }
            Text(agent.name).font(.headline).foregroundStyle(Theme.text).lineLimit(1)
            Text(agent.role ?? "AI Agent").font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
            HStack(spacing: 5) {
                Circle().fill(agent.status == "paused" ? Theme.warn : Theme.good).frame(width: 7, height: 7)
                Text(agent.status == "paused" ? "Paused" : "Active").font(.caption2).foregroundStyle(Theme.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .glass(radius: 20, padding: 14)
    }
}

struct ChatRef: Identifiable { let id: String }

struct AgentDetailView: View {
    @EnvironmentObject var app: AppState
    let agent: Agent
    @State private var chat: ChatRef?
    @State private var busy = false

    var body: some View {
        ZStack {
            Theme.backdrop.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 18) {
                    Avatar(name: agent.name, color: agent.avatar_color, size: 84, spark: agent.is_supervisor == true)
                        .shadow(color: Color(hexString: agent.avatar_color).opacity(0.5), radius: 20, y: 10)
                    Text(agent.name).font(.title.bold()).foregroundStyle(Theme.text)
                    Text(agent.role ?? "AI Agent").font(.subheadline).foregroundStyle(Theme.accent)
                    if let d = agent.description, !d.isEmpty {
                        Text(d).font(.body).foregroundStyle(Theme.muted)
                            .multilineTextAlignment(.center).padding(.horizontal)
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        infoRow("Skills", "Web browser · Live search · Code sandbox")
                        infoRow("Model", agent.model ?? "auto")
                        infoRow("Last active", agent.last_run_at != nil ? RelTime.ago(agent.last_run_at) + " ago" : "—")
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .glass(radius: 18)

                    Button { startChat() } label: {
                        HStack {
                            if busy { ProgressView().tint(.white) }
                            Label("Message \(agent.name)", systemImage: "bubble.left.fill")
                        }
                        .fontWeight(.bold).frame(maxWidth: .infinity).padding(.vertical, 14)
                        .background(Theme.accentGradient, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .foregroundStyle(.white)
                    }.pressable().disabled(busy)
                    Spacer(minLength: 80)
                }
                .padding(16)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .fullScreenCover(item: $chat) { ref in
            NavigationStack {
                ChatView(threadId: ref.id)
                    .environmentObject(app)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button { chat = nil } label: { Image(systemName: "xmark") }
                        }
                    }
            }
            .tint(Theme.accent)
        }
    }

    private func infoRow(_ k: String, _ v: String) -> some View {
        HStack { Text(k).foregroundStyle(Theme.muted); Spacer(); Text(v).foregroundStyle(Theme.text).fontWeight(.medium) }
            .font(.subheadline)
    }

    private func startChat() {
        Haptic.medium(); busy = true
        Task {
            if let tid = await app.send("Hey \(agent.name) 👋", forcedAgentId: agent.id) {
                chat = ChatRef(id: tid)
            }
            busy = false
        }
    }
}

struct CreateAgentSheet: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var role = ""
    @State private var desc = ""
    @State private var busy = false

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.backdrop.ignoresSafeArea()
                VStack(spacing: 14) {
                    SparkMark(size: 44).padding(.top, 8)
                    Text("New agent").font(.title2.bold()).foregroundStyle(Theme.text)
                    fieldBox("Name", "e.g. Bob", $name)
                    fieldBox("Role", "e.g. Software Engineer", $role)
                    fieldBox("What it does", "One sentence…", $desc)
                    Button {
                        busy = true
                        Task {
                            await app.createAgent(name: name, role: role.isEmpty ? "AI Agent" : role, description: desc)
                            Haptic.success(); busy = false; dismiss()
                        }
                    } label: {
                        HStack { if busy { ProgressView().tint(.white) }; Text("Create agent").fontWeight(.bold) }
                            .frame(maxWidth: .infinity).padding(.vertical, 14)
                            .background(Theme.accentGradient, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .foregroundStyle(.white)
                    }.pressable().disabled(name.isEmpty || busy).opacity(name.isEmpty ? 0.6 : 1)
                    Spacer()
                }
                .padding(16)
            }
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
    }

    private func fieldBox(_ label: String, _ ph: String, _ text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.caption).foregroundStyle(Theme.muted)
            TextField(ph, text: text)
                .foregroundStyle(Theme.text).tint(Theme.accent)
                .padding(.horizontal, 14).padding(.vertical, 12)
                .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.stroke, lineWidth: 1))
        }
    }
}
