import Foundation

struct SupaError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

/// Minimal Supabase client (Auth + PostgREST) built on URLSession — no SPM deps,
/// so the app builds on a bare CI runner. The anon/publishable key is public by
/// design (same as the website).
final class Supa {
    static let shared = Supa()

    // Public project config (matches the website's baked-in fallbacks).
    let baseURL = URL(string: "https://xbwhvkzgbnyqsjplbyox.supabase.co")!
    let anonKey = "sb_publishable_Jcs8IXK6YnOwWe-qYAFecg_Tb6M-ohu"

    private(set) var session: Session?
    private let sessionKey = "askai.session"

    private init() { loadSession() }

    // MARK: - Session persistence

    private func loadSession() {
        if let data = UserDefaults.standard.data(forKey: sessionKey),
           let s = try? JSONDecoder().decode(Session.self, from: data) {
            session = s
        }
    }
    private func saveSession(_ s: Session?) {
        session = s
        if let s, let data = try? JSONEncoder().encode(s) {
            UserDefaults.standard.set(data, forKey: sessionKey)
        } else {
            UserDefaults.standard.removeObject(forKey: sessionKey)
        }
    }

    var isAuthed: Bool { session != nil }
    var token: String { session?.accessToken ?? anonKey }
    var userId: String? { session?.userId }

    // MARK: - Auth

    func signIn(email: String, password: String) async throws -> Session {
        let s = try await authToken(grant: "password", body: ["email": email, "password": password])
        saveSession(s); return s
    }

    func signUp(email: String, password: String) async throws -> Session {
        // Auto-confirm is enabled, so signup usually returns a session directly.
        let url = baseURL.appendingPathComponent("auth/v1/signup")
        let data = try await send(url: url, method: "POST", auth: false,
                                  body: ["email": email, "password": password])
        if let s = try? parseSession(data, fallbackEmail: email) {
            saveSession(s); return s
        }
        // Confirmation required → try to sign in (may fail until confirmed).
        return try await signIn(email: email, password: password)
    }

    func refreshIfPossible() async {
        guard let rt = session?.refreshToken else { return }
        if let s = try? await authToken(grant: "refresh_token", body: ["refresh_token": rt]) {
            saveSession(s)
        }
    }

    func signOut() { saveSession(nil) }

    private func authToken(grant: String, body: [String: Any]) async throws -> Session {
        var comps = URLComponents(url: baseURL.appendingPathComponent("auth/v1/token"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "grant_type", value: grant)]
        let data = try await send(url: comps.url!, method: "POST", auth: false, body: body)
        return try parseSession(data, fallbackEmail: body["email"] as? String)
    }

    private func parseSession(_ data: Data, fallbackEmail: String?) throws -> Session {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw SupaError(message: "Unexpected response")
        }
        if let msg = obj["error_description"] as? String ?? obj["msg"] as? String, obj["access_token"] == nil {
            throw SupaError(message: msg)
        }
        guard let at = obj["access_token"] as? String,
              let rt = obj["refresh_token"] as? String else {
            throw SupaError(message: "Could not start a session")
        }
        let user = obj["user"] as? [String: Any]
        let uid = (user?["id"] as? String) ?? ""
        let mail = (user?["email"] as? String) ?? fallbackEmail
        return Session(accessToken: at, refreshToken: rt, userId: uid, email: mail)
    }

    // MARK: - PostgREST

    /// GET rows. `path` is like "agents?workspace_id=eq.123&select=*&order=created_at".
    func select<T: Decodable>(_ path: String, as type: T.Type = T.self) async throws -> [T] {
        guard let full = URL(string: baseURL.absoluteString + "/rest/v1/" + path) else {
            throw SupaError(message: "Bad path")
        }
        let data = try await send(url: full, method: "GET", auth: true, body: nil)
        return try decodeArray(data)
    }

    @discardableResult
    func insert<T: Decodable>(_ table: String, _ row: [String: Any], returning: Bool = true, as type: T.Type = T.self) async throws -> [T] {
        let full = URL(string: baseURL.absoluteString + "/rest/v1/" + table)!
        let data = try await send(url: full, method: "POST", auth: true, body: row,
                                  prefer: returning ? "return=representation" : "return=minimal")
        if !returning { return [] }
        return try decodeArray(data)
    }

    func update(_ pathWithFilter: String, _ patch: [String: Any]) async throws {
        let full = URL(string: baseURL.absoluteString + "/rest/v1/" + pathWithFilter)!
        _ = try await send(url: full, method: "PATCH", auth: true, body: patch, prefer: "return=minimal")
    }

    func delete(_ pathWithFilter: String) async throws {
        let full = URL(string: baseURL.absoluteString + "/rest/v1/" + pathWithFilter)!
        _ = try await send(url: full, method: "DELETE", auth: true, body: nil, prefer: "return=minimal")
    }

    private func decodeArray<T: Decodable>(_ data: Data) throws -> [T] {
        if data.isEmpty { return [] }
        do { return try JSONDecoder().decode([T].self, from: data) }
        catch {
            // Surface PostgREST error bodies clearly.
            if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let msg = obj["message"] as? String {
                throw SupaError(message: msg)
            }
            throw error
        }
    }

    // MARK: - Core request

    private func send(url: URL, method: String, auth: Bool, body: [String: Any]?, prefer: String? = nil) async throws -> Data {
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(auth ? token : anonKey)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let prefer { req.setValue(prefer, forHTTPHeaderField: "Prefer") }
        if let body { req.httpBody = try JSONSerialization.data(withJSONObject: body) }
        req.timeoutInterval = 30

        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw SupaError(message: "No response") }
        if http.statusCode == 401 && auth {
            // Token may have expired — refresh once and retry.
            await refreshIfPossible()
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            let (d2, r2) = try await URLSession.shared.data(for: req)
            if let h2 = r2 as? HTTPURLResponse, (200..<300).contains(h2.statusCode) { return d2 }
        }
        guard (200..<300).contains(http.statusCode) else {
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["message"] as? String
                ?? String(data: data, encoding: .utf8) ?? "Request failed (\(http.statusCode))"
            throw SupaError(message: msg)
        }
        return data
    }
}
