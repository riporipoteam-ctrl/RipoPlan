import Foundation
import SwiftUI

@MainActor
final class AppState: ObservableObject {
    @Published var authed = false
    @Published var booting = true
    @Published var bootError: String?

    @Published var profile: Profile?
    @Published var workspace: Workspace?
    @Published var agents: [Agent] = []
    @Published var threads: [ThreadRow] = []
    @Published var notifications: [Notif] = []

    var firstName: String {
        (profile?.display_name ?? "").split(separator: " ").first.map(String.init) ?? ""
    }
    var unread: Int { notifications.filter { !($0.read ?? false) }.count }
    var supervisor: Agent? { agents.first { $0.is_supervisor == true } ?? agents.first }

    private func enc(_ s: String) -> String {
        s.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? s
    }

    // MARK: - Boot / auth

    func boot() async {
        booting = true; bootError = nil
        authed = Supa.shared.isAuthed
        if authed {
            await Supa.shared.refreshIfPossible()
            await loadAll()
            await resumeStuckMessages()
            await maybeDailyBriefing()
        }
        booting = false
    }

    /// Re-run any agent messages left stuck on "thinking" (e.g. from Siri, the
    /// daily briefing, or a previous session) so they finally get a reply.
    func resumeStuckMessages() async {
        guard let ws = workspace?.id else { return }
        let stuck: [Message] = (try? await Supa.shared.select(
            "messages?workspace_id=eq.\(ws)&status=eq.thinking&sender_type=eq.agent&thread_id=not.is.null&select=*&order=created_at.desc&limit=12")) ?? []
        for m in stuck {
            guard let aid = m.agent_id, let a = agent(aid), let tid = m.thread_id else { continue }
            runResponder(agent: a, threadId: tid, placeholderId: m.id)
        }
    }

    /// If the daily briefing is enabled, enqueue one (server-side) at most once a
    /// day so there's real "what you & your agents did" content waiting.
    func maybeDailyBriefing() async {
        guard UserDefaults.standard.bool(forKey: "askai.brief") else { return }
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        let today = f.string(from: Date())
        if UserDefaults.standard.string(forKey: "askai.briefDate") == today { return }
        UserDefaults.standard.set(today, forKey: "askai.briefDate")
        _ = await send("Daily briefing: in a short, skimmable summary, tell me what I worked on recently and what each agent has completed or is still working on, plus anything that needs my attention.")
    }

    func signIn(email: String, password: String) async throws {
        _ = try await Supa.shared.signIn(email: email, password: password)
        authed = true
        await loadAll()
    }
    func signUp(email: String, password: String) async throws {
        _ = try await Supa.shared.signUp(email: email, password: password)
        authed = true
        await loadAll()
    }
    func signOut() {
        Supa.shared.signOut()
        authed = false
        profile = nil; workspace = nil; agents = []; threads = []; notifications = []
    }

    func loadAll() async {
        do {
            guard let uid = Supa.shared.userId else { return }
            // profile
            let profs: [Profile] = try await Supa.shared.select("profiles?id=eq.\(uid)&select=*&limit=1")
            profile = profs.first
            // workspace via membership
            let mems: [WorkspaceMember] = try await Supa.shared.select("workspace_members?user_id=eq.\(uid)&select=workspace_id,user_id,role&limit=1")
            if let wsId = mems.first?.workspace_id {
                let wss: [Workspace] = try await Supa.shared.select("workspaces?id=eq.\(wsId)&select=id,name,avatar_url&limit=1")
                workspace = wss.first
            }
            await loadAgents()
            await loadThreads()
            await loadNotifications()
            // Load LLM keys from server-side config (Supabase) so the app works
            // out of the box without any secret in the repo. A key the user typed
            // in Settings takes precedence.
            if let cfg: [ConfigRow] = try? await Supa.shared.select("app_config?select=key,value") {
                let map = Dictionary(cfg.compactMap { c in c.value.map { (c.key, $0) } }, uniquingKeysWith: { a, _ in a })
                if let g = map["groq_api_key"], !g.isEmpty { UserDefaults.standard.set(g, forKey: "askai.groqkey") }
                if let n = map["nvidia_api_key"], !n.isEmpty,
                   (UserDefaults.standard.string(forKey: "askai.nvkey") ?? "").isEmpty {
                    UserDefaults.standard.set(n, forKey: "askai.nvkey")
                }
            }
            // Persist ids so background tasks + Siri intents work outside the UI.
            UserDefaults.standard.set(workspace?.id, forKey: "askai.ws")
            UserDefaults.standard.set(supervisor?.id, forKey: "askai.supervisor")
        } catch {
            bootError = error.localizedDescription
        }
    }

    func loadAgents() async {
        guard let ws = workspace?.id else { return }
        if let a: [Agent] = try? await Supa.shared.select("agents?workspace_id=eq.\(ws)&status=neq.archived&select=*&order=created_at") {
            agents = a
        }
    }

    func loadThreads() async {
        guard let ws = workspace?.id else { return }
        if let t: [ThreadRow] = try? await Supa.shared.select("threads?workspace_id=eq.\(ws)&select=*&order=last_activity_at.desc&limit=60") {
            threads = t
        }
    }

    func loadNotifications() async {
        guard let uid = Supa.shared.userId else { return }
        if let n: [Notif] = try? await Supa.shared.select("notifications?user_id=eq.\(uid)&select=*&order=created_at.desc&limit=50") {
            notifications = n
        }
    }

    func markNotificationsRead() async {
        guard let uid = Supa.shared.userId, unread > 0 else { return }
        try? await Supa.shared.update("notifications?user_id=eq.\(uid)&read=eq.false", ["read": true])
        await loadNotifications()
    }

    func agent(_ id: String?) -> Agent? { agents.first { $0.id == id } }

    func setAgentStatus(_ id: String, _ status: String) async {
        try? await Supa.shared.update("agents?id=eq.\(id)", ["status": status])
        await loadAgents()
    }

    // MARK: - Messages

    func messages(thread: String) async -> [Message] {
        (try? await Supa.shared.select("messages?thread_id=eq.\(thread)&select=*&order=created_at.asc&limit=200")) ?? []
    }

    /// Send a message. Creates the thread if needed, posts the user message, adds a
    /// "thinking" agent placeholder, and enqueues a server-side background task so
    /// the agent runs even if the app is closed. Returns the thread id.
    /// Upload a picked image/file and return its attachment (or nil on failure).
    func upload(data: Data, ext: String, contentType: String, name: String) async -> Attachment? {
        do {
            let url = try await Supa.shared.uploadFile(data: data, ext: ext, contentType: contentType)
            let type = contentType.hasPrefix("image/") ? "image" : "file"
            return Attachment(type: type, url: url, name: name, mime: contentType)
        } catch {
            bootError = error.localizedDescription
            return nil
        }
    }

    @discardableResult
    func send(_ text: String, threadId: String? = nil, forcedAgentId: String? = nil, attachments: [Attachment] = []) async -> String? {
        guard let ws = workspace?.id, let uid = Supa.shared.userId else { return nil }
        let content = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty || !attachments.isEmpty else { return nil }

        var tid = threadId
        var agentId = forcedAgentId

        do {
            let promptText = content.isEmpty ? "(the user sent an attachment — describe/use it)" : content
            let attachJSON: [[String: Any]] = attachments.map { ["type": $0.type, "url": $0.url, "name": $0.name, "mime": $0.mime ?? ""] }
            if tid == nil {
                if agentId == nil { agentId = supervisor?.id }
                let base = content.isEmpty ? (attachments.first?.name ?? "New chat") : content
                let title = base.split(separator: " ").prefix(6).joined(separator: " ")
                var row: [String: Any] = [
                    "workspace_id": ws,
                    "title": String(title.prefix(80)),
                    "summary": "Working on it…",
                    "created_by": uid,
                    "last_activity_at": isoNow()
                ]
                if let agentId { row["primary_agent_id"] = agentId }
                let rows: [ThreadRow] = try await Supa.shared.insert("threads", row)
                tid = rows.first?.id
            } else {
                try? await Supa.shared.update("threads?id=eq.\(tid!)", ["last_activity_at": isoNow()])
                if agentId == nil {
                    let t: [ThreadRow] = (try? await Supa.shared.select("threads?id=eq.\(tid!)&select=*&limit=1")) ?? []
                    agentId = t.first?.primary_agent_id ?? supervisor?.id
                }
            }
            guard let threadIdReal = tid else { return nil }

            // user message (with any attachments)
            var userMsg: [String: Any] = [
                "workspace_id": ws, "thread_id": threadIdReal,
                "sender_type": "user", "user_id": uid,
                "content": content, "status": "complete"
            ]
            if !attachJSON.isEmpty { userMsg["attachments"] = attachJSON }
            _ = try await Supa.shared.insert("messages", userMsg, returning: false) as [Message]

            // Decide which agent(s) respond, then run each natively (concurrently).
            let responders = resolveResponders(content: content, forcedAgentId: forcedAgentId, threadPrimaryId: agentId)
            for r in responders {
                let ph: [Message] = try await Supa.shared.insert("messages", [
                    "workspace_id": ws, "thread_id": threadIdReal,
                    "sender_type": "agent", "agent_id": r.id,
                    "content": "", "status": "thinking",
                    "activities": [["label": "Thinking…", "status": "running"]]
                ])
                if let pid = ph.first?.id {
                    runResponder(agent: r, threadId: threadIdReal, placeholderId: pid)
                }
            }
            _ = promptText  // (kept for clarity; history is rebuilt per responder)
            await loadThreads()
            return threadIdReal
        } catch {
            bootError = error.localizedDescription
            return nil
        }
    }

    /// Which agents should reply: a forced agent, any @mentioned/"all" agents,
    /// else the thread's primary agent, else the supervisor.
    private func resolveResponders(content: String, forcedAgentId: String?, threadPrimaryId: String?) -> [Agent] {
        if let f = forcedAgentId, let a = agent(f) { return [a] }
        let lc = content.lowercased()
        if lc.contains("all agents") || lc.contains("every agent") || lc.contains("everyone") {
            let all = agents.filter { $0.status != "archived" }
            if !all.isEmpty { return all }
        }
        let tokens = Set(matches(of: "@([a-z0-9_-]+)", in: lc).map { $0.replacingOccurrences(of: "@", with: "") })
        if !tokens.isEmpty {
            let matched = agents.filter { a in
                tokens.contains((a.handle ?? "").lowercased()) ||
                tokens.contains(a.name.lowercased().replacingOccurrences(of: " ", with: "-"))
            }
            if !matched.isEmpty { return matched }
        }
        if let p = threadPrimaryId, let a = agent(p) { return [a] }
        if let s = supervisor { return [s] }
        return []
    }

    private func matches(of pattern: String, in text: String) -> [String] {
        guard let re = try? NSRegularExpression(pattern: pattern) else { return [] }
        let ns = text as NSString
        return re.matches(in: text, range: NSRange(location: 0, length: ns.length)).map { ns.substring(with: $0.range) }
    }

    /// Build the thread history from this agent's perspective (its own turns are
    /// "assistant"; everyone else is an incoming "user" turn labelled by name).
    private func buildHistory(threadId: String, selfAgentId: String) async -> [[String: Any]] {
        let msgs = await messages(thread: threadId)
        let nameOf = Dictionary(agents.map { ($0.id, $0.name) }, uniquingKeysWith: { a, _ in a })
        var out: [[String: Any]] = []
        for m in msgs {
            let body = m.content ?? ""
            if m.status == "thinking" || body.isEmpty { continue }
            let isSelf = m.sender_type == "agent" && m.agent_id == selfAgentId
            if isSelf {
                out.append(["role": "assistant", "content": body])
            } else {
                let who = m.sender_type == "user" ? (profile?.display_name ?? "User") : (nameOf[m.agent_id ?? ""] ?? "Teammate")
                out.append(["role": "user", "content": "\(who): \(body)"])
            }
        }
        return out
    }

    private func rosterString() -> String {
        agents.map { "\($0.name) (\($0.role ?? "agent"))" }.joined(separator: ", ")
    }

    /// Fire-and-forget: run the agent natively (with full tools) and fill in its
    /// placeholder message. `extra` injects a delegated-task instruction.
    private func runResponder(agent: Agent, threadId: String, placeholderId: String, extra: String? = nil) {
        guard let ws = workspace?.id, let uid = Supa.shared.userId else { return }
        let roster = rosterString()
        Task {
            var history = await buildHistory(threadId: threadId, selfAgentId: agent.id)
            if let extra { history.append(["role": "user", "content": extra]) }
            let ctx = RunContext(
                workspaceId: ws, userId: uid, threadId: threadId,
                onCreateAgent: { name, role, desc in await self.toolCreateAgent(name, role, desc) },
                onDelegate: { handle, task in await self.toolDelegate(threadId: threadId, handle: handle, task: task) },
                onBuildApp: { name, html in await self.toolBuildApp(name, html) }
            )
            let reply = await AgentRunner.run(agent: agent, history: history, roster: roster, ctx: ctx)
            try? await Supa.shared.update("messages?id=eq.\(placeholderId)",
                                          ["content": reply, "status": "complete", "activities": []])
            await self.loadThreads()
        }
    }

    // MARK: - Agent tool actions (DB writes)

    private func toolCreateAgent(_ name: String, _ role: String, _ desc: String) async -> String {
        guard let ws = workspace?.id else { return "No workspace." }
        let clean = name.trimmingCharacters(in: .whitespaces)
        if clean.isEmpty { return "Need a name for the agent." }
        if agents.contains(where: { $0.name.lowercased() == clean.lowercased() }) { return "An agent named \(clean) already exists." }
        let handle = clean.lowercased().replacingOccurrences(of: " ", with: "-")
        let r = role.isEmpty ? "AI Agent" : role
        var row: [String: Any] = [
            "workspace_id": ws, "name": clean, "handle": handle, "role": r,
            "description": desc.isEmpty ? "\(clean) — a \(r)." : desc,
            "emoji": "robot", "avatar_color": "#6e6e80",
            "tools": ["web_search", "browse", "code"],
            "system_prompt": "You are \(clean), \(r). \(desc) Use your tools to do real work. Speak only as yourself."
        ]
        if let uid = Supa.shared.userId { row["created_by"] = uid }
        _ = try? await Supa.shared.insert("agents", row, returning: false) as [Agent]
        await loadAgents()
        return "✅ Created **\(clean)** (\(r)) and added them to the team. Delegate tasks to @\(handle)."
    }

    private func toolDelegate(threadId: String, handle: String, task: String) async -> String {
        let h = handle.lowercased().replacingOccurrences(of: "@", with: "")
        guard let target = agents.first(where: {
            ($0.handle ?? "").lowercased() == h || $0.name.lowercased() == h || $0.name.lowercased().replacingOccurrences(of: " ", with: "-") == h
        }) else { return "No teammate with handle @\(handle). Create one first with create_agent." }
        guard let ws = workspace?.id else { return "No workspace." }
        let ph: [Message] = (try? await Supa.shared.insert("messages", [
            "workspace_id": ws, "thread_id": threadId, "sender_type": "agent", "agent_id": target.id,
            "content": "", "status": "thinking", "activities": [["label": "Working on a delegated task", "status": "running"]]
        ])) ?? []
        if let pid = ph.first?.id {
            runResponder(agent: target, threadId: threadId, placeholderId: pid, extra: "You've been delegated this task by a teammate: \(task)\nComplete it and reply with the result.")
        }
        return "✅ Delegated to **\(target.name)** (@\(target.handle ?? h)): \(task). They're on it."
    }

    private func toolBuildApp(_ name: String, _ html: String) async -> String {
        guard let ws = workspace?.id else { return "No workspace." }
        let nm = name.isEmpty ? "Web App" : name
        var row: [String: Any] = ["workspace_id": ws, "name": nm, "html": html, "status": "ready"]
        if let uid = Supa.shared.userId { row["created_by"] = uid }
        _ = try? await Supa.shared.insert("mini_apps", row, returning: false) as [Message]
        return "✅ Published **\(nm)** to Mini Apps — open the Apps page to preview it."
    }

    func renameThread(_ id: String, to title: String) async {
        try? await Supa.shared.update("threads?id=eq.\(id)", ["title": title])
        await loadThreads()
    }
    func deleteThread(_ id: String) async {
        try? await Supa.shared.delete("threads?id=eq.\(id)")
        threads.removeAll { $0.id == id }
    }

    func createAgent(name: String, role: String, description: String) async {
        guard let ws = workspace?.id, let uid = Supa.shared.userId else { return }
        let handle = name.lowercased().replacingOccurrences(of: " ", with: "-")
        _ = try? await Supa.shared.insert("agents", [
            "workspace_id": ws, "name": name, "handle": handle, "role": role,
            "description": description,
            "emoji": "robot", "avatar_color": "#a855f7",
            "tools": ["web_search", "browse", "code"],
            "system_prompt": "You are \(name), \(role). \(description) Use your tools to do real work. Speak only as yourself.",
            "created_by": uid
        ], returning: false) as [Agent]
        await loadAgents()
    }

    private func isoNow() -> String {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]
        return f.string(from: Date())
    }
}
