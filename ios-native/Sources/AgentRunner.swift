import Foundation

/// Runs an agent natively by calling Groq directly (the key is public by design,
/// shipped in the web bundle). No backend required — fixes agents getting stuck.
/// Supports a small tool loop (live web search + page browse).
enum AgentRunner {
    static let groqModel = "llama-3.3-70b-versatile"
    static let kimiModel = "moonshotai/kimi-k2.6"

    // Keys live in Supabase `app_config` and are loaded into UserDefaults at boot
    // (never committed to the repo). A key typed in Settings overrides config.
    static var groqKey: String { UserDefaults.standard.string(forKey: "askai.groqkey") ?? "" }
    static var nvidiaKey: String { UserDefaults.standard.string(forKey: "askai.nvkey") ?? "" }

    /// Use Kimi only when selected AND an NVIDIA key is present on the device.
    static var useKimi: Bool {
        (UserDefaults.standard.string(forKey: "askai.model") ?? "groq") == "kimi" && !nvidiaKey.isEmpty
    }

    private static let tools: [[String: Any]] = [
        ["type": "function", "function": [
            "name": "web_search",
            "description": "Search the live web for current info (news, prices, scores, facts). Returns top results.",
            "parameters": ["type": "object", "properties": ["query": ["type": "string"]], "required": ["query"]]
        ]],
        ["type": "function", "function": [
            "name": "browse",
            "description": "Fetch a web page URL and return its readable text.",
            "parameters": ["type": "object", "properties": ["url": ["type": "string"]], "required": ["url"]]
        ]],
    ]

    /// Generate a reply. `history` is OpenAI-style [{role, content}].
    static func run(agent: Agent, history: [[String: Any]], roster: String) async -> String {
        let system = """
        You are \(agent.name), \(agent.role ?? "an AI agent") on the user's AskAI team. \
        \(agent.description ?? "") \(agent.system_prompt ?? "")
        Team: \(roster).
        You have a real web browser (browse) and live web search (web_search) — use them when current info helps, then answer with specifics and links. Be helpful, concise, and finish the task. Answer in Markdown. Speak only as \(agent.name).
        """
        var msgs: [[String: Any]] = [["role": "system", "content": system]]
        msgs.append(contentsOf: history)

        for round in 0..<3 {
            guard let message = await chat(msgs, withTools: round < 2) else { break }
            let calls = message["tool_calls"] as? [[String: Any]] ?? []
            if calls.isEmpty {
                let content = (message["content"] as? String) ?? ""
                if !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return clean(content) }
                break
            }
            // Echo the assistant tool-call turn, then run each tool.
            msgs.append(["role": "assistant", "content": message["content"] as? String ?? "", "tool_calls": calls])
            for c in calls {
                let fn = c["function"] as? [String: Any] ?? [:]
                let name = fn["name"] as? String ?? ""
                let args = parseArgs(fn["arguments"])
                let out = await runTool(name, args)
                msgs.append(["role": "tool", "tool_call_id": c["id"] as? String ?? "", "name": name, "content": String(out.prefix(6000))])
            }
        }
        // Force a final plain answer.
        msgs.append(["role": "user", "content": "Give your final answer now in plain Markdown. Do not call any tools."])
        if let m = await chat(msgs, withTools: false), let content = m["content"] as? String, !content.isEmpty {
            return clean(content)
        }
        return "Sorry — I couldn't complete that just now. Please try again."
    }

    // MARK: Chat call — routes to NVIDIA (Kimi K2.6) or Groq (Llama) per selection.
    private static func chat(_ messages: [[String: Any]], withTools: Bool) async -> [String: Any]? {
        let kimi = useKimi
        let endpoint = kimi ? "https://integrate.api.nvidia.com/v1/chat/completions"
                            : "https://api.groq.com/openai/v1/chat/completions"
        let key = kimi ? nvidiaKey : groqKey
        let modelId = kimi ? kimiModel : groqModel
        var body: [String: Any] = ["model": modelId, "messages": messages,
                                    "temperature": kimi ? 0.8 : 0.6, "max_tokens": kimi ? 4096 : 1600]
        if withTools { body["tools"] = tools; body["tool_choice"] = "auto" }
        var req = URLRequest(url: URL(string: endpoint)!)
        req.httpMethod = "POST"
        req.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 90
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { return nil }
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            let choices = json?["choices"] as? [[String: Any]]
            return choices?.first?["message"] as? [String: Any]
        } catch { return nil }
    }

    private static func parseArgs(_ raw: Any?) -> [String: Any] {
        if let s = raw as? String, let d = s.data(using: .utf8),
           let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any] { return o }
        if let o = raw as? [String: Any] { return o }
        return [:]
    }

    // MARK: Tools
    private static func runTool(_ name: String, _ args: [String: Any]) async -> String {
        switch name {
        case "web_search": return await webSearch((args["query"] as? String) ?? "")
        case "browse": return await browse((args["url"] as? String) ?? "")
        default: return "Unknown tool."
        }
    }

    private static func reader(_ url: String) async -> String {
        var req = URLRequest(url: URL(string: "https://r.jina.ai/\(url)")!)
        req.setValue("markdown", forHTTPHeaderField: "X-Return-Format")
        req.timeoutInterval = 30
        if let (data, resp) = try? await URLSession.shared.data(for: req),
           let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode),
           let s = String(data: data, encoding: .utf8) { return s }
        return ""
    }

    private static func webSearch(_ query: String) async -> String {
        let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        var out = await reader("https://lite.duckduckgo.com/lite/?q=\(q)")
        // decode uddg redirects → real URLs
        if let re = try? NSRegularExpression(pattern: "uddg=([^&)\\s]+)") {
            let ns = out as NSString
            let matches = re.matches(in: out, range: NSRange(location: 0, length: ns.length)).reversed()
            for m in matches {
                let enc = ns.substring(with: m.range(at: 1))
                if let dec = enc.removingPercentEncoding {
                    out = (out as NSString).replacingCharacters(in: m.range, with: dec)
                }
            }
        }
        out = out.trimmingCharacters(in: .whitespacesAndNewlines)
        if out.count > 120 { return String(out.prefix(6000)) }
        // fallback: wikipedia summary
        let wiki = await reader("https://en.wikipedia.org/wiki/Special:Search?search=\(q)")
        return wiki.isEmpty ? "No live results found. Tell the user you couldn't fetch results and don't invent facts." : String(wiki.prefix(4000))
    }

    private static func browse(_ url: String) async -> String {
        let u = url.hasPrefix("http") ? url : "https://\(url)"
        let text = await reader(u)
        return text.isEmpty ? "Couldn't fetch \(url)." : String(text.prefix(6000))
    }

    private static func clean(_ s: String) -> String {
        var t = s
        // strip any leaked <think> blocks
        t = t.replacingOccurrences(of: "(?s)<think>.*?</think>", with: "", options: .regularExpression)
        return t.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
