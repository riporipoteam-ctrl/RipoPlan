import Foundation

struct BGTaskRow: Codable, Identifiable {
    let id: String
    var result: String?
    var status: String?
    var updated_at: String?
    var thread_id: String?
}

/// Standalone enqueue + completion-check used by Siri intents and background
/// refresh (no @MainActor / UI dependency). Mirrors AppState.send.
enum TaskRunner {
    static func enqueue(prompt: String) async -> String? {
        guard let ws = UserDefaults.standard.string(forKey: "askai.ws"),
              let uid = Supa.shared.userId else { return nil }
        let supervisor = UserDefaults.standard.string(forKey: "askai.supervisor")
        let content = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else { return nil }
        do {
            let title = content.split(separator: " ").prefix(6).joined(separator: " ")
            var threadRow: [String: Any] = [
                "workspace_id": ws, "title": String(title.prefix(80)),
                "summary": "Working on it…", "created_by": uid,
                "last_activity_at": isoNow()
            ]
            if let supervisor { threadRow["primary_agent_id"] = supervisor }
            let rows: [ThreadRow] = try await Supa.shared.insert("threads", threadRow)
            guard let tid = rows.first?.id else { return nil }

            _ = try await Supa.shared.insert("messages", [
                "workspace_id": ws, "thread_id": tid, "sender_type": "user",
                "user_id": uid, "content": content, "status": "complete"
            ], returning: false) as [Message]

            var placeholderId: String?
            if let supervisor {
                let ph: [Message] = try await Supa.shared.insert("messages", [
                    "workspace_id": ws, "thread_id": tid, "sender_type": "agent",
                    "agent_id": supervisor, "content": "", "status": "thinking"
                ])
                placeholderId = ph.first?.id
            }
            var task: [String: Any] = ["workspace_id": ws, "thread_id": tid, "prompt": content, "created_by": uid]
            if let supervisor { task["agent_id"] = supervisor }
            if let placeholderId { task["message_id"] = placeholderId }
            _ = try? await Supa.shared.insert("background_tasks", task, returning: false) as [Message]
            return tid
        } catch {
            return nil
        }
    }

    /// Poll for tasks completed since the last check and fire local notifications.
    static func checkCompletedTasks() async {
        guard let ws = UserDefaults.standard.string(forKey: "askai.ws") else { return }
        let last = UserDefaults.standard.string(forKey: "askai.lastTaskCheck") ?? isoAgo(days: 1)
        let enc = last.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? last
        let path = "background_tasks?workspace_id=eq.\(ws)&status=eq.done&updated_at=gt.\(enc)&select=id,result,status,updated_at,thread_id&order=updated_at.desc&limit=10"
        if let rows: [BGTaskRow] = try? await Supa.shared.select(path), !rows.isEmpty {
            if rows.count == 1, let r = rows.first {
                NotifManager.shared.notify(title: "Task complete ✅", body: snippet(r.result))
            } else {
                NotifManager.shared.notify(title: "\(rows.count) tasks complete ✅", body: "Your agents finished while you were away.")
            }
        }
        UserDefaults.standard.set(isoNow(), forKey: "askai.lastTaskCheck")
    }

    private static func snippet(_ s: String?) -> String {
        let t = (s ?? "Your agent finished the task.").replacingOccurrences(of: "\n", with: " ")
        return String(t.prefix(140))
    }
    private static func isoNow() -> String {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]; return f.string(from: Date())
    }
    private static func isoAgo(days: Int) -> String {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]
        return f.string(from: Date().addingTimeInterval(TimeInterval(-days * 86400)))
    }
}
