import SwiftUI

// MARK: - Models

struct Job: Codable, Identifiable {
    let id: String
    var name: String
    var schedule: String?
    var prompt: String?
    var enabled: Bool?
    var agent_id: String?
    var last_run_at: String?
}

struct KnowledgeRow: Codable, Identifiable {
    let id: String
    var title: String?
    var content: String?
    var created_at: String?
}

struct IntegrationRow: Codable, Identifiable {
    let id: String
    var provider: String
    var status: String?
    var account_label: String?
}

struct Channel: Codable, Identifiable {
    let id: String
    var name: String
    var description: String?
}

private struct SheetChrome: ViewModifier {
    let title: String
    @Environment(\.dismiss) var dismiss
    func body(content: Content) -> some View {
        content
            .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
    }
}
private extension View { func sheetChrome(_ t: String) -> some View { modifier(SheetChrome(title: t)) } }

// MARK: - Jobs (scheduled agent runs)

struct JobsView: View {
    @EnvironmentObject var app: AppState
    @State private var jobs: [Job] = []
    @State private var loading = true
    @State private var showCreate = false

    var body: some View {
        NavigationStack {
            ZStack {
                AuroraBackground()
                if loading { ProgressView() }
                else if jobs.isEmpty { empty }
                else {
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(jobs) { j in row(j) }
                        }.padding(16)
                    }
                }
            }
            .sheetChrome("Jobs")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { showCreate = true } label: { Image(systemName: "plus").fontWeight(.semibold).foregroundStyle(Theme.text) }
                }
            }
            .sheet(isPresented: $showCreate, onDismiss: { Task { await load() } }) {
                CreateJobSheet().environmentObject(app)
            }
            .task { await load() }
        }
    }

    private func row(_ j: Job) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "clock.arrow.circlepath").foregroundStyle(Theme.text).frame(width: 30)
            VStack(alignment: .leading, spacing: 2) {
                Text(j.name).foregroundStyle(Theme.text).fontWeight(.semibold).lineLimit(1)
                Text("\(j.schedule ?? "manual") · \(app.agent(j.agent_id)?.name ?? "Agent")")
                    .font(.subheadline).foregroundStyle(Theme.muted).lineLimit(1)
            }
            Spacer()
            Toggle("", isOn: Binding(get: { j.enabled ?? true }, set: { v in Task { await toggle(j, v) } }))
                .labelsHidden().tint(Theme.accent)
        }
        .card(radius: 16, padding: 14)
    }

    private var empty: some View {
        VStack(spacing: 10) {
            Image(systemName: "clock.arrow.circlepath").font(.largeTitle).foregroundStyle(Theme.muted)
            Text("No scheduled jobs").foregroundStyle(Theme.text).font(.headline)
            Text("Schedule an agent to run hourly, daily, or weekly — it runs server-side even when the app is closed.")
                .font(.subheadline).foregroundStyle(Theme.muted).multilineTextAlignment(.center).padding(.horizontal, 36)
        }
    }

    private func load() async {
        guard let ws = app.workspace?.id else { return }
        jobs = (try? await Supa.shared.select("jobs?workspace_id=eq.\(ws)&select=id,name,schedule,prompt,enabled,agent_id,last_run_at&order=created_at.desc")) ?? []
        loading = false
    }
    private func toggle(_ j: Job, _ v: Bool) async {
        try? await Supa.shared.update("jobs?id=eq.\(j.id)", ["enabled": v])
        await load()
    }
}

struct CreateJobSheet: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) var dismiss
    @State private var name = ""
    @State private var prompt = ""
    @State private var schedule = "daily"
    @State private var agentId: String = ""
    @State private var busy = false

    var body: some View {
        NavigationStack {
            ZStack {
                AuroraBackground()
                ScrollView {
                    VStack(spacing: 14) {
                        field("Name", "e.g. Morning news roundup", $name)
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Schedule").font(.caption).foregroundStyle(Theme.muted)
                            Picker("Schedule", selection: $schedule) {
                                Text("Hourly").tag("hourly"); Text("Daily").tag("daily"); Text("Weekly").tag("weekly")
                            }.pickerStyle(.segmented)
                        }
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Agent").font(.caption).foregroundStyle(Theme.muted)
                            Picker("Agent", selection: $agentId) {
                                ForEach(app.agents) { a in Text(a.name).tag(a.id) }
                            }.pickerStyle(.menu).tint(Theme.text)
                        }
                        field("Task", "What should it do each run?", $prompt, lines: 3)
                        Button {
                            busy = true
                            Task { await create(); busy = false; dismiss() }
                        } label: {
                            HStack { if busy { ProgressView().tint(Theme.onAccent) }; Text("Create job").fontWeight(.bold) }
                                .frame(maxWidth: .infinity).padding(.vertical, 14)
                                .background(Theme.accent, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                                .foregroundStyle(Theme.onAccent)
                        }.disabled(name.isEmpty || prompt.isEmpty || busy)
                        Spacer()
                    }.padding(16)
                }
            }
            .sheetChrome("New job")
            .onAppear { if agentId.isEmpty { agentId = app.supervisor?.id ?? app.agents.first?.id ?? "" } }
        }
    }

    private func field(_ label: String, _ ph: String, _ text: Binding<String>, lines: Int = 1) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.caption).foregroundStyle(Theme.muted)
            TextField(ph, text: text, axis: .vertical).lineLimit(lines...(lines + 4))
                .foregroundStyle(Theme.text).tint(Theme.text)
                .padding(.horizontal, 12).padding(.vertical, 10)
                .background(Theme.ink3, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.stroke, lineWidth: 1))
        }
    }
    private func create() async {
        guard let ws = app.workspace?.id else { return }
        var row: [String: Any] = ["workspace_id": ws, "name": name, "schedule": schedule, "prompt": prompt, "enabled": true]
        if !agentId.isEmpty { row["agent_id"] = agentId }
        _ = try? await Supa.shared.insert("jobs", row, returning: false) as [Job]
    }
}

// MARK: - Knowledge base

struct KnowledgeView: View {
    @EnvironmentObject var app: AppState
    @State private var items: [KnowledgeRow] = []
    @State private var loading = true
    @State private var showAdd = false
    @State private var title = ""
    @State private var content = ""

    var body: some View {
        NavigationStack {
            ZStack {
                AuroraBackground()
                if loading { ProgressView() }
                else if items.isEmpty { empty }
                else {
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(items) { k in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(k.title ?? "Untitled").foregroundStyle(Theme.text).fontWeight(.semibold)
                                    Text(k.content ?? "").foregroundStyle(Theme.muted).font(.subheadline).lineLimit(4)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .card(radius: 16, padding: 14)
                                .contextMenu {
                                    Button(role: .destructive) { Task { await remove(k) } } label: { Label("Delete", systemImage: "trash") }
                                }
                            }
                        }.padding(16)
                    }
                }
            }
            .sheetChrome("Knowledge")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { showAdd = true } label: { Image(systemName: "plus").fontWeight(.semibold).foregroundStyle(Theme.text) }
                }
            }
            .alert("Add knowledge", isPresented: $showAdd) {
                TextField("Title", text: $title)
                TextField("Content", text: $content)
                Button("Cancel", role: .cancel) {}
                Button("Save") { Task { await add() } }
            } message: { Text("Shared context every agent can use.") }
            .task { await load() }
        }
    }
    private var empty: some View {
        VStack(spacing: 10) {
            Image(systemName: "book").font(.largeTitle).foregroundStyle(Theme.muted)
            Text("No knowledge yet").foregroundStyle(Theme.text).font(.headline)
            Text("Add facts, docs, or context here — every agent uses it automatically.")
                .font(.subheadline).foregroundStyle(Theme.muted).multilineTextAlignment(.center).padding(.horizontal, 36)
        }
    }
    private func load() async {
        guard let ws = app.workspace?.id else { return }
        items = (try? await Supa.shared.select("knowledge?workspace_id=eq.\(ws)&select=id,title,content,created_at&order=created_at.desc")) ?? []
        loading = false
    }
    private func add() async {
        guard let ws = app.workspace?.id, !title.isEmpty else { return }
        _ = try? await Supa.shared.insert("knowledge", ["workspace_id": ws, "title": title, "content": content], returning: false) as [KnowledgeRow]
        title = ""; content = ""; await load()
    }
    private func remove(_ k: KnowledgeRow) async {
        try? await Supa.shared.delete("knowledge?id=eq.\(k.id)"); await load()
    }
}

// MARK: - Integrations catalog

struct IntegrationsView: View {
    @EnvironmentObject var app: AppState
    @State private var connected: [String: String] = [:]   // provider -> status
    @State private var loading = true
    @State private var connectProvider: String?
    @State private var secret = ""

    private let catalog: [(String, String, String)] = [
        ("github", "GitHub", "chevron.left.forwardslash.chevron.right"),
        ("slack", "Slack", "number"),
        ("gmail", "Gmail", "envelope"),
        ("notion", "Notion", "doc.text"),
        ("google_calendar", "Google Calendar", "calendar"),
        ("google_drive", "Google Drive", "externaldrive"),
        ("sheets", "Google Sheets", "tablecells"),
    ]

    var body: some View {
        NavigationStack {
            ZStack {
                AuroraBackground()
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(catalog, id: \.0) { p in
                            let isOn = connected[p.0] == "connected"
                            HStack(spacing: 12) {
                                Image(systemName: p.2).foregroundStyle(Theme.text).frame(width: 30)
                                Text(p.1).foregroundStyle(Theme.text).fontWeight(.medium)
                                Spacer()
                                if isOn {
                                    Text("Connected").font(.caption).foregroundStyle(Theme.good)
                                    Button("Disconnect") { Task { await disconnect(p.0) } }
                                        .font(.caption).foregroundStyle(Theme.bad)
                                } else {
                                    Button("Connect") { connectProvider = p.0; secret = "" }
                                        .font(.caption.weight(.semibold)).foregroundStyle(Theme.accent)
                                }
                            }
                            .card(radius: 16, padding: 14)
                        }
                    }.padding(16)
                }
                if loading { ProgressView() }
            }
            .sheetChrome("Integrations")
            .alert("Connect", isPresented: Binding(get: { connectProvider != nil }, set: { if !$0 { connectProvider = nil } })) {
                TextField("API key / token / webhook", text: $secret)
                Button("Cancel", role: .cancel) { connectProvider = nil }
                Button("Connect") { if let p = connectProvider { Task { await connect(p) } } }
            } message: { Text("Stored in your workspace (RLS-protected).") }
            .task { await load() }
        }
    }
    private func load() async {
        guard let ws = app.workspace?.id else { return }
        let rows: [IntegrationRow] = (try? await Supa.shared.select("integrations?workspace_id=eq.\(ws)&select=id,provider,status,account_label")) ?? []
        connected = Dictionary(rows.map { ($0.provider, $0.status ?? "available") }, uniquingKeysWith: { a, _ in a })
        loading = false
    }
    private func connect(_ provider: String) async {
        guard let ws = app.workspace?.id else { return }
        let existing: [IntegrationRow] = (try? await Supa.shared.select("integrations?workspace_id=eq.\(ws)&provider=eq.\(provider)&select=id")) ?? []
        if let row = existing.first {
            try? await Supa.shared.update("integrations?id=eq.\(row.id)", ["status": "connected", "secret": secret])
        } else {
            _ = try? await Supa.shared.insert("integrations", ["workspace_id": ws, "provider": provider, "status": "connected", "secret": secret], returning: false) as [IntegrationRow]
        }
        connectProvider = nil; secret = ""; Haptic.success(); await load()
    }
    private func disconnect(_ provider: String) async {
        guard let ws = app.workspace?.id else { return }
        try? await Supa.shared.update("integrations?workspace_id=eq.\(ws)&provider=eq.\(provider)", ["status": "available", "secret": NSNull()])
        await load()
    }
}

// MARK: - Channels (team chat, read-only view)

struct ChannelsView: View {
    @EnvironmentObject var app: AppState
    @State private var channels: [Channel] = []
    @State private var loading = true

    var body: some View {
        NavigationStack {
            ZStack {
                AuroraBackground()
                if loading { ProgressView() }
                else if channels.isEmpty {
                    VStack(spacing: 10) {
                        Image(systemName: "number").font(.largeTitle).foregroundStyle(Theme.muted)
                        Text("No channels").foregroundStyle(Theme.text).font(.headline)
                    }
                } else {
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(channels) { c in
                                NavigationLink { ChannelChatView(channel: c).environmentObject(app) } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: "number").foregroundStyle(Theme.text).frame(width: 26)
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(c.name).foregroundStyle(Theme.text).fontWeight(.semibold).lineLimit(1)
                                            if let d = c.description, !d.isEmpty {
                                                Text(d).foregroundStyle(Theme.muted).font(.subheadline).lineLimit(1)
                                            }
                                        }
                                        Spacer()
                                        Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.muted)
                                    }
                                    .card(radius: 16, padding: 14)
                                }.buttonStyle(.plain)
                            }
                        }.padding(16)
                    }
                }
            }
            .sheetChrome("Channels")
            .task { await load() }
        }
    }
    private func load() async {
        guard let ws = app.workspace?.id else { return }
        channels = (try? await Supa.shared.select("channels?workspace_id=eq.\(ws)&select=id,name,description&order=created_at.desc")) ?? []
        loading = false
    }
}

struct ChannelChatView: View {
    @EnvironmentObject var app: AppState
    let channel: Channel
    @State private var messages: [Message] = []
    @State private var text = ""
    @State private var sending = false
    @State private var atts: [Attachment] = []

    var body: some View {
        ZStack(alignment: .bottom) {
            AuroraBackground()
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 16) {
                        ForEach(messages) { m in MessageBubble(message: m).id(m.id) }
                        Color.clear.frame(height: 1).id("end")
                    }.padding(16).padding(.bottom, 80)
                }
                .onChange(of: messages.count) { _ in withAnimation { proxy.scrollTo("end", anchor: .bottom) } }
            }
            InputBar(text: $text, attachments: $atts, sending: sending, uploading: false,
                     onSend: send, onPickPhoto: {}, onPickFile: {})
                .padding(.horizontal, 12).padding(.bottom, 8)
        }
        .navigationTitle("#\(channel.name)").navigationBarTitleDisplayMode(.inline)
        .task {
            while !Task.isCancelled {
                messages = (try? await Supa.shared.select("messages?channel_id=eq.\(channel.id)&thread_id=is.null&select=*&order=created_at.asc&limit=200")) ?? []
                try? await Task.sleep(nanoseconds: 2_500_000_000)
            }
        }
    }
    private func send() {
        let body = text; text = ""; sending = true
        Task {
            await app.sendToChannel(channelId: channel.id, text: body)
            messages = (try? await Supa.shared.select("messages?channel_id=eq.\(channel.id)&thread_id=is.null&select=*&order=created_at.asc&limit=200")) ?? []
            sending = false
        }
    }
}

// MARK: - Ranks

struct RanksView: View {
    @EnvironmentObject var app: AppState
    @State private var ranks: [RankRow] = []
    @State private var loading = true
    @State private var showAdd = false
    @State private var name = ""

    var body: some View {
        NavigationStack {
            ZStack {
                AuroraBackground()
                if loading { ProgressView() }
                else if ranks.isEmpty {
                    VStack(spacing: 10) {
                        Image(systemName: "rosette").font(.largeTitle).foregroundStyle(Theme.muted)
                        Text("No ranks yet").foregroundStyle(Theme.text).font(.headline)
                        Text("Create titled badges and assign them to your agents.")
                            .font(.subheadline).foregroundStyle(Theme.muted).multilineTextAlignment(.center).padding(.horizontal, 36)
                    }
                } else {
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(ranks) { r in
                                HStack(spacing: 12) {
                                    Image(systemName: "rosette").foregroundStyle(Color(hexString: r.color)).frame(width: 28)
                                    Text(r.name).foregroundStyle(Theme.text).fontWeight(.semibold)
                                    Spacer()
                                    Text(r.badge ?? "star").font(.caption).foregroundStyle(Theme.muted)
                                }
                                .card(radius: 16, padding: 14)
                                .contextMenu {
                                    Button(role: .destructive) { Task { try? await Supa.shared.delete("ranks?id=eq.\(r.id)"); await load() } } label: { Label("Delete", systemImage: "trash") }
                                }
                            }
                        }.padding(16)
                    }
                }
            }
            .sheetChrome("Ranks")
            .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button { showAdd = true } label: { Image(systemName: "plus").fontWeight(.semibold).foregroundStyle(Theme.text) } } }
            .alert("New rank", isPresented: $showAdd) {
                TextField("Rank name", text: $name)
                Button("Cancel", role: .cancel) {}
                Button("Create") { Task { await add() } }
            }
            .task { await load() }
        }
    }
    private func load() async {
        guard let ws = app.workspace?.id else { return }
        ranks = (try? await Supa.shared.select("ranks?workspace_id=eq.\(ws)&select=id,name,badge,color&order=position")) ?? []
        loading = false
    }
    private func add() async {
        guard let ws = app.workspace?.id, !name.isEmpty else { return }
        _ = try? await Supa.shared.insert("ranks", ["workspace_id": ws, "name": name, "badge": "star", "color": "#6e6e80", "position": 100], returning: false) as [RankRow]
        name = ""; await load()
    }
}
