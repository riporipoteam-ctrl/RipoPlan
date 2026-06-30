import Foundation
import JavaScriptCore

struct RunContext {
    let workspaceId: String
    let userId: String
    let threadId: String
    var onActivity: (String, String) async -> Void = { _, _ in }   // label, tool — live UI
    let onCreateAgent: (String, String, String) async -> String
    let onDelegate: (String, String) async -> String
    let onBuildApp: (String, String) async -> String
    let onCreateRank: (String, String, String) async -> String   // name, badge, color
    let onAssignRank: (String, String) async -> String           // agent, rank
    let onCreateTask: (String, String, String) async -> String   // name, prompt, agent handle
    let onEditAgent: (String, [String: String]) async -> String  // target, {name,role,description,emoji,color}
    var onCreateChannel: (String, String) async -> String = { _, _ in "Channels can't be created here." }
    var onSaveKnowledge: (String, String) async -> String = { _, _ in "Knowledge saved." }
}

struct RunResult { var text: String; var images: [String] = []; var steps: [String] = [] }

/// Native agent runner. Calls the LLM directly and runs a multi-round tool loop
/// covering the full website tool set + extra skills. Works with Groq (Llama) and
/// NVIDIA-hosted Kimi K2.6 (thinking disabled so it stays coherent after tools).
enum AgentRunner {
    static let groqModel = "llama-3.3-70b-versatile"
    static let kimiModel = "moonshotai/kimi-k2.6"
    static var groqKey: String { UserDefaults.standard.string(forKey: "askai.groqkey") ?? "" }
    static var nvidiaKey: String { UserDefaults.standard.string(forKey: "askai.nvkey") ?? "" }
    /// Kimi is the default. Fall back to Groq only if explicitly chosen or no NVIDIA key.
    static var useKimi: Bool {
        let pick = UserDefaults.standard.string(forKey: "askai.model") ?? "kimi"
        if pick == "groq" { return false }
        return !nvidiaKey.isEmpty
    }

    // Friendly progress labels shown live in the chat bubble.
    private static func activityLabel(_ tool: String) -> String {
        switch tool {
        case "web_search": return "Searching the web…"
        case "browse": return "Browsing the web…"
        case "code": return "Running code…"
        case "generate_image": return "Generating an image…"
        case "world_cup": return "Checking the World Cup…"
        case "weather": return "Checking the weather…"
        case "currency": return "Converting currency…"
        case "crypto_price": return "Checking crypto prices…"
        case "stock_price": return "Checking the markets…"
        case "dictionary": return "Looking up a word…"
        case "wiki": return "Reading Wikipedia…"
        case "translate": return "Translating…"
        case "datetime": return "Checking the time…"
        case "unit_convert": return "Converting units…"
        case "qr_code": return "Making a QR code…"
        case "calculate": return "Calculating…"
        case "build_app": return "Building your app…"
        case "create_agent": return "Creating an agent…"
        case "delegate": return "Delegating to a teammate…"
        case "create_rank": return "Creating a rank…"
        case "assign_rank": return "Assigning a rank…"
        case "create_task": return "Creating a task…"
        case "edit_agent": return "Updating a teammate…"
        default: return "Working…"
        }
    }

    private static func fn(_ name: String, _ desc: String, _ props: [String: Any], _ req: [String]) -> [String: Any] {
        ["type": "function", "function": ["name": name, "description": desc,
          "parameters": ["type": "object", "properties": props, "required": req]]]
    }
    private static var tools: [[String: Any]] {
        let S: [String: Any] = ["type": "string"]; let N: [String: Any] = ["type": "number"]
        return [
            fn("web_search", "Search the live web for current info and facts.", ["query": S], ["query"]),
            fn("browse", "Open a web page URL and read its text.", ["url": S], ["url"]),
            fn("code", "Run JavaScript to compute/transform. Use return or console.log.", ["source": S], ["source"]),
            fn("generate_image", "Generate an image from a text prompt (shown to the user).", ["prompt": S], ["prompt"]),
            fn("world_cup", "Live FIFA World Cup results, fixtures, standings.", [:], []),
            fn("weather", "Current weather + forecast for a place.", ["location": S], ["location"]),
            fn("calculate", "Evaluate a math expression.", ["expression": S], ["expression"]),
            fn("currency", "Convert money between currencies (live rates).", ["amount": N, "from": S, "to": S], ["from", "to"]),
            fn("crypto_price", "Current crypto price in USD.", ["coin": S], ["coin"]),
            fn("stock_price", "Latest stock/ETF price by ticker.", ["ticker": S], ["ticker"]),
            fn("dictionary", "Define a word + synonyms.", ["word": S], ["word"]),
            fn("wiki", "Concise Wikipedia summary of a topic.", ["topic": S], ["topic"]),
            fn("translate", "Translate text to another language.", ["text": S, "to": S], ["text", "to"]),
            fn("datetime", "Current date & time (optional IANA timezone).", ["timezone": S], []),
            fn("unit_convert", "Convert between units (length, mass, temp, volume, speed).", ["value": N, "from": S, "to": S], ["value", "from", "to"]),
            fn("qr_code", "Generate a QR code image for text/URL.", ["data": S], ["data"]),
            fn("build_app", "Build & publish a complete self-contained HTML web app to Mini Apps.", ["name": S, "html": S], ["name", "html"]),
            fn("create_agent", "Create a new AI agent/teammate on the team.", ["name": S, "role": S, "description": S], ["name", "role"]),
            fn("edit_agent", "Edit a teammate's name, role, description, emoji or color.", ["agent": S, "name": S, "role": S, "description": S, "emoji": S, "color": S], ["agent"]),
            fn("delegate", "Assign a task to a teammate by handle; they reply in this thread.", ["handle": S, "task": S], ["handle", "task"]),
            fn("create_task", "Create a task/job for the team (optionally for a specific agent).", ["name": S, "prompt": S, "agent": S], ["name", "prompt"]),
            fn("create_rank", "Create a rank/badge for agents.", ["name": S, "badge": S, "color": S], ["name"]),
            fn("assign_rank", "Assign a rank to an agent by name.", ["agent": S, "rank": S], ["agent", "rank"]),
            fn("create_channel", "Create a team chat channel.", ["name": S, "description": S], ["name"]),
            fn("save_knowledge", "Save a fact/note to the workspace knowledge base for later.", ["title": S, "content": S], ["title", "content"]),
            fn("news", "Latest news headlines on a topic (or top world news).", ["topic": S], []),
            fn("hacker_news", "Top Hacker News stories about a topic.", ["query": S], ["query"]),
            fn("reddit", "Top Reddit posts for a query or subreddit.", ["query": S], ["query"]),
            fn("github_search", "Search GitHub repositories.", ["query": S], ["query"]),
            fn("jokes", "Get a random joke.", [:], []),
            fn("quote", "Get an inspirational quote.", [:], []),
            fn("advice", "Get a random piece of advice.", [:], []),
            fn("random_fact", "Get a random interesting fact.", [:], []),
            fn("summarize_url", "Fetch a URL and return its key content to summarize.", ["url": S], ["url"]),
        ]
    }

    static func run(agent: Agent, history: [[String: Any]], roster: String, memories: [String] = [], ctx: RunContext) async -> RunResult {
        var images: [String] = []
        var steps: [String] = []
        let memText = memories.isEmpty ? "" : "\n\nWorkspace knowledge & memory you should use:\n- " + memories.prefix(20).joined(separator: "\n- ")
        let today = ISO8601DateFormatter().string(from: Date())
        let system = """
        You are \(agent.name), \(agent.role ?? "an AI agent") on the user's AskAI team, running on the \
        Hermes agent engine with full tool access. \
        \(agent.description ?? "") \(agent.system_prompt ?? "")
        Today is \(today). Teammates: \(roster).
        You can browse the web, search, run code, generate images, build & publish web apps, create and \
        edit agents, delegate tasks to teammates (who then reply here), create tasks, manage ranks, and use \
        skills (weather, currency, crypto, stocks, dictionary, wiki, translate, world cup, unit convert, QR, \
        datetime, calculate). Be proactive and autonomous: actually USE the tools to do real work and finish \
        the job — never claim you did something you didn't. When you delegate, the teammate replies on their \
        own — do NOT write their reply for them. Always end with a real, helpful answer in Markdown. \
        Speak only as \(agent.name).\(memText)
        """
        var msgs: [[String: Any]] = [["role": "system", "content": system]]
        msgs.append(contentsOf: history)

        var lastToolOutput = ""
        for round in 0..<6 {
            guard let message = await chat(msgs, tools: tools) else { break }
            let rawContent = (message["content"] as? String) ?? ""
            // Kimi sometimes emits tool calls as raw special-token text instead of
            // structured tool_calls; parse those too so we never display the tokens.
            var calls = normalizeCalls(message["tool_calls"] as? [[String: Any]] ?? [])
            if calls.isEmpty { calls = parseTextToolCalls(rawContent) }
            if calls.isEmpty {
                let cleaned = clean(rawContent)
                if !cleaned.isEmpty { return RunResult(text: cleaned, images: images, steps: steps) }
                break
            }
            // Strip any tool-token noise from the assistant content we echo back.
            msgs.append(["role": "assistant", "content": stripToolTokens(rawContent), "tool_calls": calls])
            for c in calls {
                let f = c["function"] as? [String: Any] ?? [:]
                let name = f["name"] as? String ?? ""
                let args = parseArgs(f["arguments"])
                await ctx.onActivity(activityLabel(name), name)
                steps.append(name)
                let out = await runTool(name, args, ctx, &images)
                if !out.isEmpty { lastToolOutput = out }
                msgs.append(["role": "tool", "tool_call_id": c["id"] as? String ?? "", "name": name, "content": String(out.prefix(6000))])
            }
        }
        await ctx.onActivity("Writing the answer…", "final")
        msgs.append(["role": "user", "content": "Now write your complete final answer for the user in plain English Markdown. Do NOT call any tools or output any tool/function syntax."])
        if let m = await chat(msgs, tools: nil) {
            let cleaned = clean((m["content"] as? String) ?? "")
            if !cleaned.isEmpty { return RunResult(text: cleaned, images: images, steps: steps) }
        }
        // Last resort: never show a blank/failure — summarize what the tools found.
        if !images.isEmpty { return RunResult(text: "Here's what I generated.", images: images, steps: steps) }
        if !lastToolOutput.isEmpty { return RunResult(text: clean(lastToolOutput), images: images, steps: steps) }
        return RunResult(text: "I couldn't complete that just now — please try again in a moment.", images: images, steps: steps)
    }

    /// Parse Kimi/K2-style tool calls emitted as plain text special tokens, e.g.
    /// `<|tool_call_begin|> functions.browse:4 <|tool_call_argument_begin|> {"url":"…"} <|tool_call_end|>`
    private static func parseTextToolCalls(_ text: String) -> [[String: Any]] {
        guard text.contains("tool_call") || text.contains("functions.") else { return [] }
        var out: [[String: Any]] = []
        let pattern = "functions\\.([a-zA-Z_]+):?\\d*\\s*<\\|tool_call_argument_begin\\|>\\s*(\\{.*?\\})\\s*<\\|tool_call_end\\|>"
        if let re = try? NSRegularExpression(pattern: pattern, options: [.dotMatchesLineSeparators]) {
            let ns = text as NSString
            for m in re.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
                let name = ns.substring(with: m.range(at: 1))
                let args = ns.substring(with: m.range(at: 2))
                out.append(["id": "call_\(Int.random(in: 1000...99999))", "type": "function",
                            "function": ["name": name, "arguments": args]])
            }
        }
        return out
    }
    /// Remove K2 special tool tokens (and any half-emitted tool syntax) from text.
    private static func stripToolTokens(_ s: String) -> String {
        var t = s
        t = t.replacingOccurrences(of: "(?s)<\\|tool_calls_section_begin\\|>.*?(<\\|tool_calls_section_end\\|>|$)", with: "", options: .regularExpression)
        for tok in ["<|tool_call_begin|>", "<|tool_call_end|>", "<|tool_call_argument_begin|>",
                    "<|tool_calls_section_begin|>", "<|tool_calls_section_end|>", "<|im_end|>", "<|im_start|>"] {
            t = t.replacingOccurrences(of: tok, with: "")
        }
        t = t.replacingOccurrences(of: "<\\|[^|]*\\|>", with: "", options: .regularExpression)
        return t.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Keep only the fields the API needs when echoing tool_calls back (some
    /// providers reject extra fields like `index`/`reasoning`).
    private static func normalizeCalls(_ calls: [[String: Any]]) -> [[String: Any]] {
        calls.compactMap { c in
            guard let f = c["function"] as? [String: Any] else { return nil }
            return ["id": c["id"] as? String ?? "call_\(Int.random(in: 1000...9999))",
                    "type": "function",
                    "function": ["name": f["name"] as? String ?? "", "arguments": f["arguments"] as? String ?? "{}"]]
        }
    }

    // MARK: Chat
    /// Try the chosen provider; if it fails or returns nothing usable, automatically
    /// fall back to the other provider so an agent always answers.
    private static func chat(_ messages: [[String: Any]], tools: [[String: Any]]?) async -> [String: Any]? {
        let primaryKimi = useKimi
        if let m = await callProvider(kimi: primaryKimi, messages: messages, tools: tools) { return m }
        // Fallback to the other provider (Kimi⇄Groq) if its key exists.
        if let m = await callProvider(kimi: !primaryKimi, messages: messages, tools: tools) { return m }
        return nil
    }
    private static func callProvider(kimi: Bool, messages: [[String: Any]], tools: [[String: Any]]?) async -> [String: Any]? {
        let endpoint = kimi ? "https://integrate.api.nvidia.com/v1/chat/completions" : "https://api.groq.com/openai/v1/chat/completions"
        let key = kimi ? nvidiaKey : groqKey
        let modelId = kimi ? kimiModel : groqModel
        if key.isEmpty { return nil }
        var body: [String: Any] = ["model": modelId, "messages": messages, "temperature": 0.5, "max_tokens": 2048]
        // Kimi K2.6 is a thinking model; after tool results the thinking template
        // makes it produce garbage. Disable thinking so it stays coherent.
        if kimi { body["chat_template_kwargs"] = ["thinking": false] }
        if let tools { body["tools"] = tools; body["tool_choice"] = "auto" }
        // Retry once on transient failure.
        for attempt in 0..<2 {
            if let msg = await once(endpoint, key, body) { return msg }
            if attempt == 0 { try? await Task.sleep(nanoseconds: 600_000_000) }
        }
        return nil
    }
    private static func once(_ endpoint: String, _ key: String, _ body: [String: Any]) async -> [String: Any]? {
        var req = URLRequest(url: URL(string: endpoint)!); req.httpMethod = "POST"
        req.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 90
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = json["choices"] as? [[String: Any]] else { return nil }
        return choices.first?["message"] as? [String: Any]
    }
    private static func parseArgs(_ raw: Any?) -> [String: Any] {
        if let s = raw as? String, let d = s.data(using: .utf8), let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any] { return o }
        return (raw as? [String: Any]) ?? [:]
    }
    private static func str(_ a: Any?) -> String { (a as? String) ?? (a.map { "\($0)" } ?? "") }
    private static func num(_ a: Any?) -> Double { (a as? Double) ?? Double(str(a)) ?? 0 }

    // MARK: Tool dispatch
    private static func runTool(_ name: String, _ args: [String: Any], _ ctx: RunContext, _ images: inout [String]) async -> String {
        switch name {
        case "web_search": return await webSearch(str(args["query"]))
        case "browse": return await browse(str(args["url"]))
        case "code": return runJS(str(args["source"]))
        case "generate_image":
            if let url = await generateImage(str(args["prompt"])) { images.append(url); return "Image generated and shown to the user." }
            return "Image generation failed."
        case "world_cup": return await worldCup()
        case "weather": return await weather(str(args["location"]))
        case "calculate": return calculate(str(args["expression"]))
        case "currency": return await currency(num(args["amount"]) == 0 ? 1 : num(args["amount"]), str(args["from"]), str(args["to"]))
        case "crypto_price": return await crypto(str(args["coin"]))
        case "stock_price": return await stock(str(args["ticker"]))
        case "dictionary": return await dictionary(str(args["word"]))
        case "wiki": return await wiki(str(args["topic"]))
        case "translate": return await translate(str(args["text"]), str(args["to"]))
        case "datetime": return datetime(str(args["timezone"]))
        case "unit_convert": return unitConvert(num(args["value"]), str(args["from"]), str(args["to"]))
        case "qr_code": return qrCode(str(args["data"]))
        case "build_app": return await ctx.onBuildApp(str(args["name"]), str(args["html"]))
        case "create_agent": return await ctx.onCreateAgent(str(args["name"]), str(args["role"]), str(args["description"]))
        case "edit_agent":
            var changes: [String: String] = [:]
            for k in ["name", "role", "description", "emoji", "color"] where !str(args[k]).isEmpty { changes[k] = str(args[k]) }
            return await ctx.onEditAgent(str(args["agent"]), changes)
        case "delegate": return await ctx.onDelegate(str(args["handle"]), str(args["task"]))
        case "create_task": return await ctx.onCreateTask(str(args["name"]), str(args["prompt"]), str(args["agent"]))
        case "create_rank": return await ctx.onCreateRank(str(args["name"]), str(args["badge"]), str(args["color"]))
        case "assign_rank": return await ctx.onAssignRank(str(args["agent"]), str(args["rank"]))
        case "create_channel": return await ctx.onCreateChannel(str(args["name"]), str(args["description"]))
        case "save_knowledge": return await ctx.onSaveKnowledge(str(args["title"]), str(args["content"]))
        case "news": return await news(str(args["topic"]))
        case "hacker_news": return await hackerNews(str(args["query"]))
        case "reddit": return await reddit(str(args["query"]))
        case "github_search": return await githubSearch(str(args["query"]))
        case "jokes": return await joke()
        case "quote": return await quote()
        case "advice": return await advice()
        case "random_fact": return await randomFact()
        case "summarize_url": return await browse(str(args["url"]))
        default: return "Unknown tool."
        }
    }

    // MARK: Skills
    private static func get(_ url: String) async -> Data? {
        guard let u = URL(string: url) else { return nil }
        var req = URLRequest(url: u); req.timeoutInterval = 20
        req.setValue("Mozilla/5.0 (iPhone) AskAI", forHTTPHeaderField: "User-Agent")
        return try? await URLSession.shared.data(for: req).0
    }
    /// Fetch raw HTML/text from a URL (direct — no third-party reader).
    private static func fetchText(_ url: String) async -> String {
        guard let u = URL(string: url) else { return "" }
        var req = URLRequest(url: u); req.timeoutInterval = 22
        req.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15", forHTTPHeaderField: "User-Agent")
        req.setValue("text/html,application/xhtml+xml", forHTTPHeaderField: "Accept")
        guard let (d, r) = try? await URLSession.shared.data(for: req), let h = r as? HTTPURLResponse,
              (200..<300).contains(h.statusCode) else { return "" }
        return String(data: d, encoding: .utf8) ?? String(decoding: d, as: UTF8.self)
    }
    /// Strip HTML tags/scripts and collapse whitespace into readable text.
    private static func stripHTML(_ html: String) -> String {
        var s = html
        for pat in ["(?s)<script.*?</script>", "(?s)<style.*?</style>", "(?s)<head.*?</head>", "(?s)<!--.*?-->", "<[^>]+>"] {
            s = s.replacingOccurrences(of: pat, with: " ", options: .regularExpression)
        }
        let ents = ["&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'", "&nbsp;": " ", "&rsquo;": "'", "&ldquo;": "\"", "&rdquo;": "\""]
        for (k, v) in ents { s = s.replacingOccurrences(of: k, with: v) }
        s = s.replacingOccurrences(of: "&#x27;", with: "'")
        s = s.replacingOccurrences(of: "[ \\t]+", with: " ", options: .regularExpression)
        s = s.replacingOccurrences(of: "(\\s*\\n\\s*){2,}", with: "\n", options: .regularExpression)
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    private static func webSearch(_ query: String) async -> String {
        let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        // DuckDuckGo HTML endpoints work directly and reliably.
        for endpoint in ["https://html.duckduckgo.com/html/?q=\(q)", "https://lite.duckduckgo.com/lite/?q=\(q)"] {
            let html = await fetchText(endpoint)
            if html.isEmpty { continue }
            var text = stripHTML(html)
            // decode the uddg= redirect links so URLs are readable
            if let re = try? NSRegularExpression(pattern: "uddg=([^&\\s]+)") {
                let ns = text as NSString
                for m in re.matches(in: text, range: NSRange(location: 0, length: ns.length)).reversed() {
                    if let dec = ns.substring(with: m.range(at: 1)).removingPercentEncoding {
                        text = (text as NSString).replacingCharacters(in: m.range, with: dec)
                    }
                }
            }
            if text.count > 120 { return "Search results for \"\(query)\":\n" + String(text.prefix(5500)) }
        }
        // Last resort: DuckDuckGo instant-answer JSON.
        if let d = await get("https://api.duckduckgo.com/?q=\(q)&format=json&no_html=1&skip_disambig=1"),
           let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] {
            let abstract = (j["AbstractText"] as? String) ?? (j["Answer"] as? String) ?? ""
            if !abstract.isEmpty { return abstract }
        }
        return "No live results found. Don't invent facts — say you couldn't find current info."
    }
    private static func browse(_ url: String) async -> String {
        let full = url.hasPrefix("http") ? url : "https://\(url)"
        let html = await fetchText(full)
        if html.isEmpty { return "Couldn't open \(url)." }
        let text = stripHTML(html)
        return text.isEmpty ? "No readable content at \(url)." : "Content of \(url):\n" + String(text.prefix(6000))
    }
    private static func generateImage(_ prompt: String) async -> String? {
        if prompt.isEmpty { return nil }
        // 1) NVIDIA FLUX (high quality) when a key is present.
        let key = nvidiaKey
        if !key.isEmpty {
            for model in ["black-forest-labs/flux.2-klein-4b", "black-forest-labs/flux.1-dev"] {
                let payload: [String: Any] = model.contains("klein")
                    ? ["prompt": prompt, "width": 1024, "height": 1024, "seed": Int.random(in: 0..<1_000_000), "steps": 4]
                    : ["prompt": prompt, "mode": "base", "width": 1024, "height": 1024, "steps": 30, "cfg_scale": 4.5, "samples": 1, "seed": Int.random(in: 0..<1_000_000)]
                var req = URLRequest(url: URL(string: "https://ai.api.nvidia.com/v1/genai/\(model)")!)
                req.httpMethod = "POST"; req.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
                req.setValue("application/json", forHTTPHeaderField: "Content-Type"); req.setValue("application/json", forHTTPHeaderField: "Accept")
                req.timeoutInterval = 120; req.httpBody = try? JSONSerialization.data(withJSONObject: payload)
                guard let (d, r) = try? await URLSession.shared.data(for: req), let h = r as? HTTPURLResponse, (200..<300).contains(h.statusCode),
                      let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { continue }
                var b64 = ""
                if let arts = j["artifacts"] as? [[String: Any]], let s = arts.first?["base64"] as? String { b64 = s }
                else if let arr = j["data"] as? [[String: Any]], let s = arr.first?["b64_json"] as? String { b64 = s }
                else if let s = j["image"] as? String { b64 = s.replacingOccurrences(of: "^data:image/\\w+;base64,", with: "", options: .regularExpression) }
                guard !b64.isEmpty, let data = Data(base64Encoded: b64), data.count > 5000 else { continue }
                if let url = try? await Supa.shared.uploadFile(data: data, ext: "jpg", contentType: "image/jpeg") { return url }
            }
        }
        // 2) Free fallback: Pollinations.ai (FLUX, no key) — always available.
        let enc = prompt.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? prompt
        let purl = "https://image.pollinations.ai/prompt/\(enc)?width=1024&height=1024&nologo=true&seed=\(Int.random(in: 0..<1_000_000))"
        if let u = URL(string: purl) {
            var req = URLRequest(url: u); req.timeoutInterval = 120
            if let (d, r) = try? await URLSession.shared.data(for: req), let h = r as? HTTPURLResponse,
               (200..<300).contains(h.statusCode), d.count > 5000,
               let url = try? await Supa.shared.uploadFile(data: d, ext: "jpg", contentType: "image/jpeg") { return url }
        }
        return nil
    }
    private static func worldCup() async -> String {
        let day = ISO8601DateFormatter(); day.formatOptions = [.withFullDate]
        let today = day.string(from: Date())
        if let d = await get("https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=\(today)&s=Soccer"),
           let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let ev = j["events"] as? [[String: Any]] {
            let wc = ev.filter { ("\($0["strLeague"] ?? "")").localizedCaseInsensitiveContains("world cup") }
            if !wc.isEmpty { return "FIFA World Cup (\(today)):\n" + wc.prefix(12).map { "- \($0["strHomeTeam"] ?? "?") vs \($0["strAwayTeam"] ?? "?") (\($0["dateEvent"] ?? ""))" }.joined(separator: "\n") }
        }
        return await webSearch("FIFA World Cup 2026 results fixtures standings today")
    }
    private static func weather(_ location: String) async -> String {
        let q = location.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? location
        guard let gd = await get("https://geocoding-api.open-meteo.com/v1/search?count=1&name=\(q)"),
              let gj = try? JSONSerialization.jsonObject(with: gd) as? [String: Any],
              let res = (gj["results"] as? [[String: Any]])?.first, let lat = res["latitude"] as? Double, let lon = res["longitude"] as? Double
        else { return "Couldn't find \(location)." }
        guard let wd = await get("https://api.open-meteo.com/v1/forecast?latitude=\(lat)&longitude=\(lon)&current=temperature_2m,wind_speed_10m,relative_humidity_2m"),
              let wj = try? JSONSerialization.jsonObject(with: wd) as? [String: Any], let cur = wj["current"] as? [String: Any] else { return "Weather unavailable." }
        return "Weather in \(res["name"] ?? location): \(cur["temperature_2m"] ?? "?")°C, humidity \(cur["relative_humidity_2m"] ?? "?")%, wind \(cur["wind_speed_10m"] ?? "?") km/h."
    }
    private static func currency(_ amount: Double, _ from: String, _ to: String) async -> String {
        guard let d = await get("https://api.frankfurter.app/latest?amount=\(amount)&from=\(from.uppercased())&to=\(to.uppercased())"),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let rates = j["rates"] as? [String: Any],
              let v = rates[to.uppercased()] else { return "Couldn't convert \(from)→\(to)." }
        return "\(amount) \(from.uppercased()) = \(v) \(to.uppercased())"
    }
    private static func crypto(_ coin: String) async -> String {
        let id = coin.lowercased().replacingOccurrences(of: " ", with: "-")
        guard let d = await get("https://api.coingecko.com/api/v3/simple/price?ids=\(id)&vs_currencies=usd&include_24hr_change=true"),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let c = j[id] as? [String: Any], let usd = c["usd"] else { return "Couldn't find \(coin)." }
        return "\(coin): $\(usd) (24h \((c["usd_24h_change"] as? Double).map { String(format: "%.2f", $0) } ?? "?")%)"
    }
    private static func stock(_ ticker: String) async -> String {
        let t = ticker.lowercased().trimmingCharacters(in: .whitespaces)
        let sym = t.contains(".") ? t : "\(t).us"
        guard let d = await get("https://stooq.com/q/l/?s=\(sym)&f=sd2t2ohlcv&h&e=csv"), let csv = String(data: d, encoding: .utf8) else { return "No data for \(ticker)." }
        let rows = csv.split(separator: "\n"); guard rows.count >= 2 else { return "No data for \(ticker)." }
        let cols = rows[0].split(separator: ",").map(String.init); let vals = rows[1].split(separator: ",").map(String.init)
        var rec: [String: String] = [:]; for (i, c) in cols.enumerated() where i < vals.count { rec[c.lowercased()] = vals[i] }
        guard let close = rec["close"], close != "N/D" else { return "No live price for \(ticker)." }
        return "\(ticker.uppercased()): $\(close) (open \(rec["open"] ?? "?"), high \(rec["high"] ?? "?"), low \(rec["low"] ?? "?"))"
    }
    private static func dictionary(_ word: String) async -> String {
        let w = word.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? word
        guard let d = await get("https://api.dictionaryapi.dev/api/v2/entries/en/\(w)"),
              let arr = try? JSONSerialization.jsonObject(with: d) as? [[String: Any]], let e = arr.first,
              let meanings = e["meanings"] as? [[String: Any]] else { return "No definition for \(word)." }
        let defs = meanings.prefix(3).compactMap { m -> String? in
            let pos = m["partOfSpeech"] as? String ?? ""
            let def = (m["definitions"] as? [[String: Any]])?.first?["definition"] as? String ?? ""
            return def.isEmpty ? nil : "(\(pos)) \(def)"
        }
        return "**\(e["word"] as? String ?? word)**\n" + defs.joined(separator: "\n")
    }
    private static func wiki(_ topic: String) async -> String {
        let t = topic.replacingOccurrences(of: " ", with: "_").addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? topic
        guard let d = await get("https://en.wikipedia.org/api/rest_v1/page/summary/\(t)"),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let extract = j["extract"] as? String, !extract.isEmpty
        else { return await webSearch("\(topic) wikipedia") }
        return "**\(j["title"] as? String ?? topic)**\n\(extract)"
    }
    private static func news(_ topic: String) async -> String {
        let t = topic.isEmpty ? "world" : topic
        let hn = await hackerNews(t)
        let rd = await reddit(topic.isEmpty ? "worldnews" : t)
        let combined = [hn, rd].filter { !$0.isEmpty && !$0.hasPrefix("No ") }.joined(separator: "\n\n")
        return combined.isEmpty ? await webSearch("\(t) latest news today") : "Latest on \(t):\n\(combined)"
    }
    private static func hackerNews(_ query: String) async -> String {
        let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        guard let d = await get("https://hn.algolia.com/api/v1/search?tags=story&query=\(q)&hitsPerPage=6"),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let hits = j["hits"] as? [[String: Any]], !hits.isEmpty
        else { return "No Hacker News stories for \(query)." }
        return "Hacker News — \(query):\n" + hits.prefix(6).compactMap { h in
            guard let title = h["title"] as? String else { return nil }
            return "- \(title) (\(h["points"] as? Int ?? 0) pts) \(h["url"] as? String ?? "")"
        }.joined(separator: "\n")
    }
    private static func reddit(_ query: String) async -> String {
        let isSub = !query.contains(" ") && !query.isEmpty
        let path = isSub ? "https://www.reddit.com/r/\(query)/top.json?limit=6&t=week"
                         : "https://www.reddit.com/search.json?q=\(query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query)&limit=6&sort=top"
        guard let d = await get(path), let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let data = j["data"] as? [String: Any], let children = data["children"] as? [[String: Any]], !children.isEmpty
        else { return "No Reddit posts for \(query)." }
        return "Reddit — \(query):\n" + children.prefix(6).compactMap { c in
            guard let p = c["data"] as? [String: Any], let title = p["title"] as? String else { return nil }
            return "- \(title) (r/\(p["subreddit"] as? String ?? "?"), \(p["ups"] as? Int ?? 0)↑)"
        }.joined(separator: "\n")
    }
    private static func githubSearch(_ query: String) async -> String {
        let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        guard let d = await get("https://api.github.com/search/repositories?q=\(q)&sort=stars&per_page=6"),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let items = j["items"] as? [[String: Any]], !items.isEmpty
        else { return "No GitHub repos for \(query)." }
        return "GitHub — \(query):\n" + items.prefix(6).compactMap { r in
            guard let name = r["full_name"] as? String else { return nil }
            return "- \(name) ⭐\(r["stargazers_count"] as? Int ?? 0) — \(r["description"] as? String ?? "")"
        }.joined(separator: "\n")
    }
    private static func joke() async -> String {
        if let d = await get("https://official-joke-api.appspot.com/random_joke"),
           let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
           let s = j["setup"] as? String, let p = j["punchline"] as? String { return "\(s)\n\(p)" }
        return "Why don't scientists trust atoms? Because they make up everything."
    }
    private static func quote() async -> String {
        if let d = await get("https://zenquotes.io/api/random"),
           let arr = try? JSONSerialization.jsonObject(with: d) as? [[String: Any]], let q = arr.first,
           let text = q["q"] as? String, let auth = q["a"] as? String { return "\"\(text)\" — \(auth)" }
        return "\"The best way to predict the future is to invent it.\" — Alan Kay"
    }
    private static func advice() async -> String {
        if let d = await get("https://api.adviceslip.com/advice"),
           let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
           let slip = j["slip"] as? [String: Any], let a = slip["advice"] as? String { return a }
        return "Take a deep breath and start with one small step."
    }
    private static func randomFact() async -> String {
        if let d = await get("https://uselessfacts.jsph.pl/api/v2/facts/random?language=en"),
           let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let t = j["text"] as? String { return t }
        return "Honey never spoils — edible honey has been found in ancient Egyptian tombs."
    }
    private static func translate(_ text: String, _ to: String) async -> String {
        let q = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? text
        guard let d = await get("https://api.mymemory.translated.net/get?q=\(q)&langpair=en|\(to.lowercased())"),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let rd = j["responseData"] as? [String: Any], let out = rd["translatedText"] as? String
        else { return "Couldn't translate." }
        return "Translation (\(to)): \(out)"
    }
    private static func datetime(_ tz: String) -> String {
        let f = DateFormatter(); f.dateStyle = .full; f.timeStyle = .long
        if !tz.isEmpty, let z = TimeZone(identifier: tz) { f.timeZone = z }
        return "Current date & time\(tz.isEmpty ? "" : " (\(tz))"): \(f.string(from: Date()))"
    }
    private static func unitConvert(_ value: Double, _ from: String, _ to: String) -> String {
        let f = from.lowercased(), t = to.lowercased()
        let length: [String: Double] = ["mm": 0.001, "cm": 0.01, "m": 1, "km": 1000, "in": 0.0254, "ft": 0.3048, "yd": 0.9144, "mi": 1609.344]
        let mass: [String: Double] = ["mg": 0.001, "g": 1, "kg": 1000, "oz": 28.3495, "lb": 453.592]
        let volume: [String: Double] = ["ml": 0.001, "l": 1, "gal": 3.78541, "qt": 0.946353, "cup": 0.236588]
        let speed: [String: Double] = ["mps": 1, "kph": 0.277778, "mph": 0.44704, "knot": 0.514444]
        for tbl in [length, mass, volume, speed] {
            if let a = tbl[f], let b = tbl[t] { return "\(value) \(from) = \(round(value * a / b * 1e6) / 1e6) \(to)" }
        }
        let temp: Set<String> = ["c", "celsius", "f", "fahrenheit", "k", "kelvin"]
        if temp.contains(f), temp.contains(t) {
            let c = f.first == "c" ? value : f.first == "f" ? (value - 32) * 5 / 9 : value - 273.15
            let out = t.first == "c" ? c : t.first == "f" ? c * 9 / 5 + 32 : c + 273.15
            return "\(value) \(from) = \(round(out * 100) / 100) \(to)"
        }
        return "Can't convert \(from)→\(to)."
    }
    private static func qrCode(_ data: String) -> String {
        let q = data.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? data
        return "QR code: ![QR](https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=\(q))"
    }
    private static func calculate(_ expr: String) -> String {
        let r = runJS("return (\(expr.replacingOccurrences(of: "^", with: "**")))")
        return "\(expr) = \(r.replacingOccurrences(of: "=> ", with: ""))"
    }
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
    private static func clean(_ s: String) -> String {
        var t = s.replacingOccurrences(of: "(?s)<think>.*?</think>", with: "", options: .regularExpression)
        t = stripToolTokens(t)
        return t.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
