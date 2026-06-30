import Foundation

// All ids are decoded as String (UUIDs) for simplicity; timestamps stay as ISO
// strings and are parsed only for display.

struct Profile: Codable, Identifiable {
    let id: String
    var email: String?
    var display_name: String?
    var avatar_color: String?
}

struct Workspace: Codable, Identifiable {
    let id: String
    var name: String
    var avatar_url: String?
}

struct WorkspaceMember: Codable {
    var workspace_id: String
    var user_id: String
    var role: String?
}

struct Agent: Codable, Identifiable, Hashable {
    let id: String
    var name: String
    var handle: String?
    var role: String?
    var description: String?
    var emoji: String?
    var avatar_color: String?
    var status: String?
    var is_supervisor: Bool?
    var model: String?
    var system_prompt: String?
    var last_run_at: String?

    static func == (l: Agent, r: Agent) -> Bool { l.id == r.id }
    func hash(into h: inout Hasher) { h.combine(id) }
}

struct ThreadRow: Codable, Identifiable {
    let id: String
    var title: String?
    var summary: String?
    var primary_agent_id: String?
    var last_activity_at: String?
    var created_at: String?
}

struct Activity: Codable, Hashable {
    var label: String?
    var status: String?
    var tool: String?
    var detail: String?
}

struct Message: Codable, Identifiable {
    let id: String
    var thread_id: String?
    var channel_id: String?
    var sender_type: String
    var user_id: String?
    var agent_id: String?
    var content: String?
    var activities: [Activity]?
    var attachments: [Attachment]?
    var status: String?
    var created_at: String?
}

struct Attachment: Codable, Identifiable, Hashable {
    var id = UUID()
    var type: String   // "image" | "file"
    var url: String
    var name: String
    var mime: String?
    enum CodingKeys: String, CodingKey { case type, url, name, mime }
}

struct ConfigRow: Codable { var key: String; var value: String? }

struct Notif: Codable, Identifiable {
    let id: String
    var type: String?
    var title: String?
    var body: String?
    var link: String?
    var read: Bool?
    var created_at: String?
}

// Lightweight session persisted between launches.
struct Session: Codable {
    var accessToken: String
    var refreshToken: String
    var userId: String
    var email: String?
}

enum RelTime {
    static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    static let isoPlain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func parse(_ s: String?) -> Date? {
        guard let s else { return nil }
        return iso.date(from: s) ?? isoPlain.date(from: s)
    }

    static func ago(_ s: String?) -> String {
        guard let d = parse(s) else { return "" }
        let secs = Date().timeIntervalSince(d)
        if secs < 60 { return "now" }
        if secs < 3600 { return "\(Int(secs / 60))m" }
        if secs < 86400 { return "\(Int(secs / 3600))h" }
        if secs < 7 * 86400 { return "\(Int(secs / 86400))d" }
        let f = DateFormatter(); f.dateFormat = "MMM d"
        return f.string(from: d)
    }
}
