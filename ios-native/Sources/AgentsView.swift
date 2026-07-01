import SwiftUI
import PhotosUI

struct AgentsView: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var showCreate = false
    @State private var showRanks = false
    @State private var ranks: [RankRow] = []
    @State private var path: [String] = []

    private let cols = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
    private func rank(_ id: String?) -> RankRow? { id == nil ? nil : ranks.first { $0.id == id } }

    var body: some View {
        NavigationStack(path: $path) {
            ZStack {
                Theme.backdrop.ignoresSafeArea()
                ScrollView {
                    // Ranks strip — manage ranks right here in the Agents page.
                    Button { Haptic.light(); showRanks = true } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "rosette").foregroundStyle(Theme.warn)
                            VStack(alignment: .leading, spacing: 1) {
                                Text("Ranks").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text)
                                Text(ranks.isEmpty ? "Create badges for your team" : ranks.prefix(4).map { $0.name }.joined(separator: " · "))
                                    .font(.caption2).foregroundStyle(Theme.muted).lineLimit(1)
                            }
                            Spacer()
                            Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.muted)
                        }
                        .glass(radius: 16, padding: 12)
                    }
                    .buttonStyle(.plain).padding(.horizontal, 16).padding(.top, 12)

                    LazyVGrid(columns: cols, spacing: 12) {
                        ForEach(app.agents) { a in
                            Button { Haptic.light(); path.append(a.id) } label: { AgentCard(agent: a, rank: rank(a.rank_id)) }
                                .pressable()
                        }
                    }
                    .padding(16)
                    .padding(.bottom, 100)
                }
                .refreshable { await app.loadAgents(); ranks = await app.loadRanks() }
            }
            .navigationTitle("Agents")
            .task { ranks = await app.loadRanks() }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .navigationBarTrailing) {
                    HStack(spacing: 16) {
                        Button { Haptic.light(); showRanks = true } label: {
                            Image(systemName: "rosette").foregroundStyle(Theme.text)
                        }
                        Button { Haptic.medium(); showCreate = true } label: {
                            Image(systemName: "plus").foregroundStyle(Theme.text).fontWeight(.semibold)
                        }
                    }
                }
            }
            .navigationDestination(for: String.self) { id in
                if let a = app.agent(id) { AgentDetailView(agent: a).environmentObject(app) }
            }
            .sheet(isPresented: $showCreate) { CreateAgentSheet().environmentObject(app) }
            .sheet(isPresented: $showRanks, onDismiss: { Task { ranks = await app.loadRanks() } }) {
                RanksView().environmentObject(app)
            }
        }
    }
}

struct AgentCard: View {
    let agent: Agent
    var rank: RankRow? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                AgentAvatar(name: agent.name, color: agent.avatar_color, size: 46, online: agent.status != "paused", spark: agent.is_supervisor == true, imageURL: agent.avatar_url)
                Spacer()
                if agent.is_supervisor == true {
                    Text("Chief").font(.caption2.bold()).foregroundStyle(Theme.warn)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Theme.warn.opacity(0.15), in: Capsule())
                }
            }
            Text(agent.name).font(.headline).foregroundStyle(Theme.text).lineLimit(1)
            Text(agent.role ?? "AI Agent").font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
            if let r = rank {
                Label(r.name, systemImage: "rosette").font(.caption2.weight(.semibold))
                    .foregroundStyle(Color(hexString: r.color))
                    .padding(.horizontal, 7).padding(.vertical, 2)
                    .background(Color(hexString: r.color).opacity(0.14), in: Capsule())
                    .lineLimit(1)
            }
            HStack(spacing: 5) {
                Circle().fill(agent.status == "paused" ? Theme.warn : Theme.good).frame(width: 7, height: 7)
                Text(agent.status == "paused" ? "Paused" : "Active").font(.caption2).foregroundStyle(Theme.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .glass(radius: 20, padding: 14)
    }
}

struct AgentDetailView: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss
    let agent: Agent
    @State private var coverThread: String?
    @State private var busy = false
    @State private var showEdit = false

    private var live: Agent { app.agent(agent.id) ?? agent }
    private var rankName: String? {
        guard let rid = live.rank_id else { return nil }
        return ranks.first(where: { $0.id == rid })?.name
    }
    @State private var ranks: [RankRow] = []

    var body: some View {
        ZStack {
            Theme.backdrop.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 18) {
                    AgentAvatar(name: live.name, color: live.avatar_color, size: 92, online: live.status != "paused", spark: live.is_supervisor == true, imageURL: live.avatar_url)
                    Text(live.name).font(.title.bold()).foregroundStyle(Theme.text)
                    Text(live.role ?? "AI Agent").font(.subheadline).foregroundStyle(Theme.accent)
                    if let rn = rankName {
                        Label(rn, systemImage: "rosette").font(.caption.bold()).foregroundStyle(Theme.warn)
                            .padding(.horizontal, 10).padding(.vertical, 4)
                            .background(Theme.warn.opacity(0.15), in: Capsule())
                    }
                    if let d = live.description, !d.isEmpty {
                        Text(d).font(.body).foregroundStyle(Theme.muted)
                            .multilineTextAlignment(.center).padding(.horizontal)
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        infoRow("Engine", "Hermes · full tool access")
                        infoRow("Skills", "Browser · Search · Code · Images · 20+ tools")
                        infoRow("Model", "Kimi K2.6")
                        infoRow("Last active", live.last_run_at != nil ? RelTime.ago(live.last_run_at) + " ago" : "—")
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .glass(radius: 18)

                    Button { startChat() } label: {
                        HStack {
                            if busy { ProgressView().tint(Theme.onAccent) }
                            Label("Message \(agent.name)", systemImage: "bubble.left.fill")
                        }
                        .fontWeight(.bold).frame(maxWidth: .infinity).padding(.vertical, 14)
                        .background(Theme.accent, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .foregroundStyle(Theme.onAccent)
                    }.pressable().disabled(busy)
                    Spacer(minLength: 80)
                }
                .padding(16)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task { ranks = await app.loadRanks() }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Menu {
                    Button { showEdit = true } label: { Label("Edit", systemImage: "pencil") }
                    if live.status == "paused" {
                        Button { Task { await app.setAgentStatus(agent.id, "active") } } label: { Label("Resume", systemImage: "play.fill") }
                    } else {
                        Button { Task { await app.setAgentStatus(agent.id, "paused") } } label: { Label("Pause", systemImage: "pause.fill") }
                    }
                    Button(role: .destructive) { Task { await app.setAgentStatus(agent.id, "archived"); dismiss() } } label: {
                        Label("Archive", systemImage: "archivebox")
                    }
                } label: { Image(systemName: "ellipsis.circle").foregroundStyle(Theme.text) }
            }
        }
        .sheet(isPresented: $showEdit) {
            EditAgentSheet(agent: live, ranks: ranks).environmentObject(app)
        }
        .fullScreenCover(isPresented: Binding(get: { coverThread != nil }, set: { if !$0 { coverThread = nil } })) {
            NavigationStack {
                ConversationView(threadId: Binding(get: { coverThread }, set: { coverThread = $0 }))
                    .environmentObject(app)
                    .navigationTitle(agent.name).navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button { coverThread = nil } label: { Image(systemName: "xmark") }
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
                coverThread = tid
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
                        HStack { if busy { ProgressView().tint(Theme.onAccent) }; Text("Create agent").fontWeight(.bold) }
                            .frame(maxWidth: .infinity).padding(.vertical, 14)
                            .background(Theme.accent, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .foregroundStyle(Theme.onAccent)
                    }.pressable().disabled(name.isEmpty || busy).opacity(name.isEmpty ? 0.6 : 1)
                    Spacer()
                }
                .padding(16)
            }
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }

    private func fieldBox(_ label: String, _ ph: String, _ text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.caption).foregroundStyle(Theme.muted)
            TextField(ph, text: text)
                .foregroundStyle(Theme.text).tint(Theme.accent)
                .padding(.horizontal, 14).padding(.vertical, 12)
                .background(Theme.ink3, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.stroke, lineWidth: 1))
        }
    }
}

/// Manually edit an agent: name, role, description, color, rank, and avatar image.
struct EditAgentSheet: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss
    let agent: Agent
    let ranks: [RankRow]

    @State private var name = ""
    @State private var role = ""
    @State private var desc = ""
    @State private var color = "#6e6e80"
    @State private var rankId: String? = nil
    @State private var photoItem: PhotosPickerItem?
    @State private var pickedImage: Data?
    @State private var busy = false

    private let palette = ["#6e6e80", "#0D0D0D", "#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"]

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.backdrop.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 16) {
                        PhotosPicker(selection: $photoItem, matching: .images) {
                            ZStack(alignment: .bottomTrailing) {
                                if let d = pickedImage, let ui = UIImage(data: d) {
                                    Image(uiImage: ui).resizable().scaledToFill()
                                        .frame(width: 90, height: 90).clipShape(Circle())
                                } else {
                                    Avatar(name: name.isEmpty ? agent.name : name, color: color, size: 90, imageURL: agent.avatar_url)
                                }
                                Image(systemName: "camera.fill").font(.caption).foregroundStyle(Theme.onAccent)
                                    .padding(7).background(Theme.accent, in: Circle())
                            }
                        }
                        .onChange(of: photoItem) { item in
                            Task { if let d = try? await item?.loadTransferable(type: Data.self) { pickedImage = d } }
                        }

                        fieldBox("Name", "Agent name", $name)
                        fieldBox("Role", "e.g. Researcher", $role)
                        fieldBox("Description", "What it does…", $desc)

                        VStack(alignment: .leading, spacing: 8) {
                            Text("Color").font(.caption).foregroundStyle(Theme.muted)
                            HStack(spacing: 10) {
                                ForEach(palette, id: \.self) { c in
                                    Circle().fill(Color(hexString: c)).frame(width: 30, height: 30)
                                        .overlay(Circle().stroke(Theme.text, lineWidth: color == c ? 2 : 0))
                                        .onTapGesture { color = c; Haptic.selection() }
                                }
                            }
                        }.frame(maxWidth: .infinity, alignment: .leading)

                        if !ranks.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Rank").font(.caption).foregroundStyle(Theme.muted)
                                Menu {
                                    Button("None") { rankId = nil }
                                    ForEach(ranks) { r in Button(r.name) { rankId = r.id } }
                                } label: {
                                    HStack {
                                        Text(ranks.first(where: { $0.id == rankId })?.name ?? "None").foregroundStyle(Theme.text)
                                        Spacer(); Image(systemName: "chevron.up.chevron.down").foregroundStyle(Theme.muted)
                                    }
                                    .padding(.horizontal, 14).padding(.vertical, 12)
                                    .background(Theme.ink3, in: RoundedRectangle(cornerRadius: 12))
                                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.stroke, lineWidth: 1))
                                }
                            }.frame(maxWidth: .infinity, alignment: .leading)
                        }

                        Button {
                            busy = true
                            Task {
                                await app.updateAgent(id: agent.id, name: name, role: role, description: desc,
                                                      emoji: nil, avatarColor: color, rankId: .some(rankId))
                                if let d = pickedImage { await app.setAgentAvatarImage(id: agent.id, data: d) }
                                Haptic.success(); busy = false; dismiss()
                            }
                        } label: {
                            HStack { if busy { ProgressView().tint(Theme.onAccent) }; Text("Save").fontWeight(.bold) }
                                .frame(maxWidth: .infinity).padding(.vertical, 14)
                                .background(Theme.accent, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                                .foregroundStyle(Theme.onAccent)
                        }.pressable().disabled(busy)
                        Spacer(minLength: 40)
                    }
                    .padding(16)
                }
            }
            .navigationTitle("Edit agent").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .onAppear {
                name = agent.name; role = agent.role ?? ""; desc = agent.description ?? ""
                color = agent.avatar_color ?? "#6e6e80"; rankId = agent.rank_id
            }
        }
    }

    private func fieldBox(_ label: String, _ ph: String, _ text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.caption).foregroundStyle(Theme.muted)
            TextField(ph, text: text)
                .foregroundStyle(Theme.text).tint(Theme.accent)
                .padding(.horizontal, 14).padding(.vertical, 12)
                .background(Theme.ink3, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.stroke, lineWidth: 1))
        }
    }
}
