import Foundation
import JavaScriptCore

/// Context the runner needs to take real actions (DB writes happen on the app side).
struct RunContext {
    let workspaceId: String
    let userId: String
    let threadId: String
    let onCreateAgent: (String, String, String) async -> String   // name, role, desc -> result text
    let onDelegate: (String, String) async -> String              // handle, task -> result text
    let onBuildApp: (String, String) async -> String              // name, html -> result text
}

/// Runs an agent natively by calling the LLM directly. Supports a multi-round
/// tool loop: live web search, page browse, code, create_agent, delegate (assign
/// tasks to teammates), build_app, and quick skills (world cup, weather, math).
enum AgentRunner {
    static let groqModel = "llama-3.3-70b-versatile"
    static let kimiModel = "moonshotai/kimi-k2.6"

    // Keys live in Supabase `app_config`, loaded into UserDefaults at boot.
    static var groqKey: String { UserDefaults.standard.string(forKey: "askai.groqkey") ?? "" }
    static var nvidiaKey: String { UserDefaults.standard.string(forKey: "askai.nvkey") ?? "" }
    static var useKimi: Bool {
        (UserDefaults.standard.string(forKey: "askai.model") ?? "groq") == "kimi" && !nvidiaKey.isEmpty
    }

    private static func toolSchemas(isSupervisor: Bool) -> [[String: Any]] {
        func fn(_ name: String, _ desc: String, _ props: [String: Any], _ required: [String]) -> [String: Any] {
            ["type": "function", "function": ["name": name, "description": desc,
              "parameters": ["type": "object", "properties": props, "required": required]]]
        }
        var t: [[String: Any]] = [
            fn("web_search", "Search the live web for current info (news, prices, scores, facts).",
               ["query": ["type": "string"]], ["query"]),
            fn("browse", "Fetch a web page URL and return its readable text.",
               ["url": ["type": "string"]], ["url"]),
            fn("code", "Run JavaScript to compute/transform data or do math. Use return or console.log.",
               ["source": ["type": "string"]], ["source"]),
            fn("world_cup", "Live FIFA World Cup results, fixtures, and standings.", [:], []),
            fn("weather", "Current weather + short forecast for a place.",
               ["location": ["type": "string"]], ["location"]),
            fn("calculate", "Evaluate a math expression.",
               ["expression": ["type": "string"]], ["expression"]),
            fn("build_app", "Build & publish a complete self-contained HTML web app/site to Mini Apps.",
               ["name": ["type": "string"], "html": ["type": "string"]], ["name", "html"]),
        ]
        // Team-management tools — most useful for the supervisor but available to all.
        t.append(fn("create_agent", "Create a brand-new AI agent on the team.",
                    ["name": ["type": "string"], "role": ["type": "string"], "description": ["type": "string"]],
                    ["name", "role"]))
        t.append(fn("delegate", "Assign a task to a teammate agent by handle; they reply in this thread.",
                    ["handle": ["type": "string"], "task": ["type": "string"]], ["handle", "task"]))
        return t
    }

    static func run(agent: Agent, history: [[String: Any]], roster: String, ctx: RunContext) async -> String {
        let system = """
        You are \(agent.name), \(agent.role ?? "an AI agent") on the user's AskAI team. \
        \(agent.description ?? "") \(agent.system_prompt ?? "")
        Teammates: \(roster).
        Capabilities: a real web browser (browse), live web_search, a code sandbox (code), \
        quick skills (world_cup, weather, calculate), and you can build & publish web apps (build_app), \
        create new agents (create_agent), and delegate tasks to teammates (delegate) who will then reply here. \
        Be proactive and autonomous: break a goal into steps, use tools and delegate to teammates to get real \
        work done, and don't just say you will — actually call the tools. Answer in Markdown. Speak only as \(agent.name).
        """
        var msgs: [[String: Any]] = [["role": "system", "content": system]]
        msgs.append(contentsOf: history)
        let tools = toolSchemas(isSupervisor: agent.is_supervisor == true)

        for round in 0..<5 {
            guard let message = await chat(msgs, tools: round < 4 ? tools : nil) else { break }
            let calls = message["tool_calls"] as? [[String: Any]] ?? []
            if calls.isEmpty {
                let content = (message["content"] as? String) ?? ""
                if !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return clean(content) }
                break
            }
            msgs.append(["role": "assistant", "content": message["content"] as? String ?? "", "tool_calls": calls])
            for c in calls {
                let fn = c["function"] as? [String: Any] ?? [:]
                let name = fn["name"] as? String ?? ""
                let args = parseArgs(fn["arguments"])
                let out = await runTool(name, args, ctx)
                msgs.append(["role": "tool", "tool_call_id": c["id"] as? String ?? "", "name": name, "content": String(out.prefix(6000))])
            }
        }
        msgs.append(["role": "user", "content": "Give your final answer now in plain Markdown. Do not call tools."])
        if let m = await chat(msgs, tools: nil), let content = m["content"] as? String, !content.isEmpty {
            return clean(content)
        }
        return "Done."
    }

    // MARK: Chat call
    private static func chat(_ messages: [[String: Any]], tools: [[String: Any]]?) async -> [String: Any]? {
        let kimi = useKimi
        let endpoint = kimi ? "https://integrate.api.nvidia.com/v1/chat/completions"
                            : "https://api.groq.com/openai/v1/chat/completions"
        let key = kimi ? nvidiaKey : groqKey
        let modelId = kimi ? kimiModel : groqModel
        if key.isEmpty { return nil }
        var body: [String: Any] = ["model": modelId, "messages": messages,
                                    "temperature": kimi ? 0.8 : 0.6, "max_tokens": kimi ? 4096 : 2000]
        if let tools { body["tools"] = tools; body["tool_choice"] = "auto" }
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
    private static func runTool(_ name: String, _ args: [String: Any], _ ctx: RunContext) async -> String {
        switch name {
        case "web_search": return await webSearch(str(args["query"]))
        case "browse": return await browse(str(args["url"]))
        case "code": return runJS(str(args["source"]))
        case "world_cup": return await worldCup()
        case "weather": return await weather(str(args["location"]))
        case "calculate": return calculate(str(args["expression"]))
        case "create_agent": return await ctx.onCreateAgent(str(args["name"]), str(args["role"]), str(args["description"]))
        case "delegate": return await ctx.onDelegate(str(args["handle"]), str(args["task"]))
        case "build_app": return await ctx.onBuildApp(str(args["name"]), str(args["html"]))
        default: return "Unknown tool."
        }
    }
    private static func str(_ a: Any?) -> String { (a as? String) ?? (a.map { "\($0)" } ?? "") }

    private static func runJS(_ source: String) -> String {
        guard let ctx = JSContext() else { return "No JS engine." }
        var logs: [String] = []
        let log: @convention(block) (String) -> Void = { logs.append($0) }
        ctx.setObject(log, forKeyedSubscript: "__log" as NSString)
        ctx.evaluateScript("var console={log:function(){var a=[];for(var i=0;i<arguments.length;i++)a.push(String(arguments[i]));__log(a.join(' '))}};")
        let val = ctx.evaluateScript("(function(){\(source)})()")
        if let ex = ctx.exception { return "Error: \(ex.toString() ?? "JS error")" }
        var out = logs.joined(separator: "\n")
        if let v = val, !v.isUndefined, !v.isNull { out += (out.isEmpty ? "" : "\n") + "=> \(v.toString() ?? "")" }
        return out.isEmpty ? "(no output)" : out
    }

    private static func reader(_ url: String) async -> String {
        guard let u = URL(string: "https://r.jina.ai/\(url)") else { return "" }
        var req = URLRequest(url: u); req.setValue("markdown", forHTTPHeaderField: "X-Return-Format"); req.timeoutInterval = 30
        if let (d, r) = try? await URLSession.shared.data(for: req),
           let h = r as? HTTPURLResponse, (200..<300).contains(h.statusCode),
           let s = String(data: d, encoding: .utf8) { return s }
        return ""
    }
    private static func webSearch(_ query: String) async -> String {
        let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        var out = await reader("https://lite.duckduckgo.com/lite/?q=\(q)")
        if let re = try? NSRegularExpression(pattern: "uddg=([^&)\\s]+)") {
            let ns = out as NSString
            for m in re.matches(in: out, range: NSRange(location: 0, length: ns.length)).reversed() {
                if let dec = ns.substring(with: m.range(at: 1)).removingPercentEncoding {
                    out = (out as NSString).replacingCharacters(in: m.range, with: dec)
                }
            }
        }
        out = out.trimmingCharacters(in: .whitespacesAndNewlines)
        return out.count > 100 ? String(out.prefix(6000)) : "No live results. Don't invent facts."
    }
    private static func browse(_ url: String) async -> String {
        let u = url.hasPrefix("http") ? url : "https://\(url)"
        let t = await reader(u); return t.isEmpty ? "Couldn't fetch \(url)." : String(t.prefix(6000))
    }
    private static func worldCup() async -> String {
        let day = ISO8601DateFormatter(); day.formatOptions = [.withFullDate]
        let today = day.string(from: Date())
        if let (d, _) = try? await URLSession.shared.data(from: URL(string: "https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=\(today)&s=Soccer")!),
           let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
           let events = j["events"] as? [[String: Any]] {
            let wc = events.filter { ("\($0["strLeague"] ?? "")").localizedCaseInsensitiveContains("world cup") }
            if !wc.isEmpty {
                let lines = wc.prefix(12).map { e in "- \(e["strHomeTeam"] ?? "?") vs \(e["strAwayTeam"] ?? "?") (\(e["dateEvent"] ?? ""))" }
                return "FIFA World Cup (\(today)):\n" + lines.joined(separator: "\n")
            }
        }
        return await webSearch("FIFA World Cup 2026 latest results fixtures standings")
    }
    private static func weather(_ location: String) async -> String {
        let q = location.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? location
        guard let (gd, _) = try? await URLSession.shared.data(from: URL(string: "https://geocoding-api.open-meteo.com/v1/search?count=1&name=\(q)")!),
              let gj = try? JSONSerialization.jsonObject(with: gd) as? [String: Any],
              let res = (gj["results"] as? [[String: Any]])?.first,
              let lat = res["latitude"] as? Double, let lon = res["longitude"] as? Double else { return "Couldn't find \(location)." }
        guard let (wd, _) = try? await URLSession.shared.data(from: URL(string: "https://api.open-meteo.com/v1/forecast?latitude=\(lat)&longitude=\(lon)&current=temperature_2m,wind_speed_10m,relative_humidity_2m")!),
              let wj = try? JSONSerialization.jsonObject(with: wd) as? [String: Any],
              let cur = wj["current"] as? [String: Any] else { return "Weather unavailable." }
        return "Weather in \(res["name"] ?? location): \(cur["temperature_2m"] ?? "?")°C, humidity \(cur["relative_humidity_2m"] ?? "?")%, wind \(cur["wind_speed_10m"] ?? "?") km/h."
    }
    private static func calculate(_ expr: String) -> String {
        let e = expr.replacingOccurrences(of: "^", with: "**")
        let r = runJS("return (\(e))")
        return "\(expr) = \(r.replacingOccurrences(of: "=> ", with: ""))"
    }

    private static func clean(_ s: String) -> String {
        s.replacingOccurrences(of: "(?s)<think>.*?</think>", with: "", options: .regularExpression)
         .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
