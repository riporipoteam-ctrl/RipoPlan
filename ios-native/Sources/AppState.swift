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

    let backendKey = "askai.backend"
    var backendURL: String {
        get { UserDefaults.standard.string(forKey: backendKey) ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: backendKey) }
    }

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
            await maybeDailyBriefing()
        }
        booting = false
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

            // thinking placeholder for the responding agent
            let resolvedAgent = agentId ?? supervisor?.id
            var placeholderId: String?
            if let resolvedAgent {
                let ph: [Message] = try await Supa.shared.insert("messages", [
                    "workspace_id": ws, "thread_id": threadIdReal,
                    "sender_type": "agent", "agent_id": resolvedAgent,
                    "content": "", "status": "thinking"
                ])
                placeholderId = ph.first?.id
            }

            // enqueue server-side run (runs even if the app is closed)
            var task: [String: Any] = [
                "workspace_id": ws,
                "thread_id": threadIdReal,
                "prompt": promptText,
                "created_by": uid
            ]
            if let resolvedAgent { task["agent_id"] = resolvedAgent }
            if let placeholderId { task["message_id"] = placeholderId }
            _ = try? await Supa.shared.insert("background_tasks", task, returning: false) as [Message]

            kickQueue()
            await loadThreads()
            return threadIdReal
        } catch {
            bootError = error.localizedDescription
            return nil
        }
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

    // MARK: - Backend kick (optional, speeds up replies vs. cron)

    func kickQueue() {
        let base = backendURL.trimmingCharacters(in: .whitespaces)
        guard !base.isEmpty, var comps = URLComponents(string: base) else { return }
        if comps.scheme == nil { comps.scheme = "https" }
        guard let root = comps.url else { return }
        var req = URLRequest(url: root.appendingPathComponent("tasks/run"))
        req.httpMethod = "POST"
        URLSession.shared.dataTask(with: req).resume()
    }

    private func isoNow() -> String {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]
        return f.string(from: Date())
    }
}
