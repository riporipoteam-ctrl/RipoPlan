import Foundation
import JavaScriptCore
import UIKit

struct RunContext {
    let workspaceId: String
    let userId: String
    let threadId: String
    var onActivity: (String, String) async -> Void = { _, _ in }   // label, tool — live UI
    var onPagePreview: ([String: String]) async -> Void = { _ in } // live browser card while browsing
    let onCreateAgent: (String, String, String) async -> String
    let onDelegate: (String, String) async -> String
    let onBuildApp: (String, String) async -> String
    let onCreateRank: (String, String, String) async -> String   // name, badge, color
    let onAssignRank: (String, String) async -> String           // agent, rank
    let onCreateTask: (String, String, String) async -> String   // name, prompt, agent handle
    let onEditAgent: (String, [String: String]) async -> String  // target, {name,role,description,emoji,color}
    var onCreateChannel: (String, String) async -> String = { _, _ in "Channels can't be created here." }
    var onSaveKnowledge: (String, String) async -> String = { _, _ in "Knowledge saved." }
    var onEditApp: (String, String) async -> String = { _, _ in "Apps can't be edited here." }
    var onListApps: () async -> String = { "No apps." }
    var onPostChannel: (String, String) async -> String = { _, _ in "Channels unavailable here." }
}

struct RunResult { var text: String; var images: [String] = []; var steps: [String] = []; var pages: [[String: String]] = [] }

/// Native agent runner. Calls the LLM directly and runs a multi-round tool loop
/// covering the full website tool set + extra skills. Works with Groq (Llama) and
/// NVIDIA-hosted Kimi K2.6 (thinking disabled so it stays coherent after tools).
enum AgentRunner {
    static let groqModel = "llama-3.3-70b-versatile"
    static let kimiModel = "moonshotai/kimi-k2.6"

    // Two "brains", both hosted on the SAME NVIDIA key with automatic model
    // rotation (survives rate limits + single-model outages).
    //
    // PARABLE 6 — our flagship: led by GLM-5.2 (z-ai, hosted on NVIDIA) for
    // elite coding/reasoning, backed by gpt-oss-120b, Kimi's agentic tool use,
    // and more. All verified live on the NVIDIA key + all support tool-calling.
    static let parableModels = [
        "z-ai/glm-5.2",
        "openai/gpt-oss-120b",
        "moonshotai/kimi-k2.6",
        "qwen/qwen3-next-80b-a3b-instruct",
        "nvidia/llama-3.3-nemotron-super-49b-v1",
    ]
    // KIMI K2.6 — leaner/faster path.
    static let kimiModels = [
        "moonshotai/kimi-k2.6",
        "meta/llama-3.1-70b-instruct",
        "nvidia/llama-3.3-nemotron-super-49b-v1",
    ]

    static var brain: String { UserDefaults.standard.string(forKey: "askai.brain") ?? "parable" }
    static var isParable: Bool { brain == "parable" }
    static var activeModels: [String] { isParable ? parableModels : kimiModels }

    static var groqKey: String { UserDefaults.standard.string(forKey: "askai.groqkey") ?? "" }
    static var nvidiaKey: String { UserDefaults.standard.string(forKey: "askai.nvkey") ?? "" }
    /// Prefer NVIDIA (both brains live there). Groq is a last-ditch fallback.
    static var useKimi: Bool {
        let pick = UserDefaults.standard.string(forKey: "askai.model") ?? "kimi"
        if pick == "groq" { return false }
        return !nvidiaKey.isEmpty
    }

    // Friendly progress labels shown live in the chat bubble.
    private static func activityLabel(_ tool: String) -> String {
        switch tool {
        case "web_search": return "Searching the web…"
        case "deep_search": return "Researching deeply…"
        case "browse": return "Browsing the web…"
        case "code": return "Running code…"
        case "generate_image": return "Generating an image…"
        case "find_images": return "Finding real photos…"
        case "view_image": return "Looking at the image…"
        case "read_file": return "Reading the file…"
        case "recipes": return "Finding the recipe…"
        case "tv_show": return "Checking the show…"
        case "maps_search": return "Searching the map…"
        case "search_knowledge": return "Checking my memory…"
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
        case "edit_app": return "Editing the app…"
        case "list_apps": return "Checking published apps…"
        case "post_channel": return "Posting in the channel…"
        case "create_channel": return "Creating a channel…"
        case "save_knowledge": return "Saving knowledge…"
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
            fn("web_search", "Search the live web (DuckDuckGo + Wikipedia + answer box) for current info and facts.", ["query": S], ["query"]),
            fn("deep_search", "Deep research: searches AND auto-reads the top result pages in one step. Use for anything important, nuanced, or where accuracy matters.", ["query": S], ["query"]),
            fn("browse", "Open a web page URL and read its text.", ["url": S], ["url"]),
            fn("code", "Run JavaScript to compute/transform. Use return or console.log.", ["source": S], ["source"]),
            fn("generate_image", "Generate an image from a text prompt (shown to the user). For real brands/products, first research their look and describe it in detail in the prompt.", ["prompt": S], ["prompt"]),
            fn("find_images", "Search the web for REAL photos (brands, cars, products, logos, people, places, teams) and show them directly in the chat.", ["query": S], ["query"]),
            fn("view_image", "Look at an image the user uploaded (or any image URL) and describe what it shows. Use whenever a message contains [Uploaded image: URL].", ["url": S, "question": S], ["url"]),
            fn("read_file", "Download and read a text file the user uploaded (or any file URL). Use whenever a message contains [Uploaded file ...].", ["url": S], ["url"]),
            fn("maps_search", "Find places/addresses/businesses on the map (name, address, coordinates + map links).", ["query": S], ["query"]),
            fn("search_knowledge", "Search the workspace knowledge base / long-term memory (empty query = latest entries).", ["query": S], []),
            fn("recipes", "Full recipe for a dish (ingredients + instructions).", ["dish": S], ["dish"]),
            fn("tv_show", "Info about a TV show (status, rating, summary).", ["show": S], ["show"]),
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
            fn("country_info", "Facts about a country (capital, population, region, currency).", ["country": S], ["country"]),
            fn("holidays", "Upcoming public holidays for a country code (e.g. US, GB).", ["country_code": S], ["country_code"]),
            fn("books", "Search books by title/author.", ["query": S], ["query"]),
            fn("trivia", "Get a trivia question with the answer.", [:], []),
            fn("ip_info", "Geolocation & ISP info for an IP address.", ["ip": S], ["ip"]),
            fn("color_palette", "Generate a hex color palette from a base color or theme.", ["base": S], []),
            fn("recipe", "Find a cooking recipe with ingredients & steps.", ["dish": S], ["dish"]),
            fn("cocktail", "Get a cocktail recipe.", ["name": S], ["name"]),
            fn("pokemon", "Look up a Pokémon's stats and types.", ["name": S], ["name"]),
            fn("sunrise_sunset", "Sunrise & sunset times for a place.", ["location": S], ["location"]),
            fn("synonyms", "Find synonyms for a word.", ["word": S], ["word"]),
            fn("npm_package", "Look up an npm package's latest version & info.", ["name": S], ["name"]),
            fn("github_user", "GitHub profile stats for a username.", ["username": S], ["username"]),
            fn("crypto_top", "Top crypto coins by market cap with prices.", [:], []),
            fn("on_this_day", "Notable historical events that happened on today's date.", [:], []),
            fn("air_quality", "Current air quality (US AQI) for a place.", ["location": S], ["location"]),
            fn("music_search", "Find songs/albums/artists (iTunes).", ["query": S], ["query"]),
            fn("app_search", "Find iOS apps on the App Store.", ["query": S], ["query"]),
            fn("urban_dictionary", "Slang definition from Urban Dictionary.", ["term": S], ["term"]),
            fn("edit_app", "Replace an existing Mini App's HTML with an improved version (republish).", ["name": S, "html": S], ["name", "html"]),
            fn("list_apps", "List the workspace's published Mini Apps (names + current code preview).", [:], []),
            fn("post_channel", "Post a message into a team channel by channel name.", ["channel": S, "text": S], ["channel", "text"]),
        ]
    }

    static func run(agent: Agent, history: [[String: Any]], roster: String, memories: [String] = [], maxRounds: Int = 10, ctx: RunContext) async -> RunResult {
        var images: [String] = []
        var steps: [String] = []
        let memText = memories.isEmpty ? "" : "\n\nWorkspace knowledge & memory you should use:\n- " + memories.prefix(20).joined(separator: "\n- ")
        let custom = UserDefaults.standard.string(forKey: "askai.instructions") ?? ""
        let customText = custom.isEmpty ? "" : "\n\nThe user's custom instructions — ALWAYS follow them:\n\(String(custom.prefix(1200)))"
        let today = ISO8601DateFormatter().string(from: Date())
        // Parable 6 identity + live "world brain" (refreshed in the background).
        let brief = UserDefaults.standard.string(forKey: "askai.worldbrief") ?? ""
        let parableText = isParable ? """

        You are powered by PARABLE 6 — AskAI's own flagship intelligence, a unified brain that draws on \
        several elite models (GLM-5.2 lead) and is the smartest, most capable assistant available. You are \
        elite at coding, research, explaining, and creating. Operating principles: \
        (a) THINK FIRST — reason through the problem step by step internally, then show only the polished, \
        correct result. \
        (b) BE PRECISE — prefer deep_search for anything factual/important so answers are grounded in real \
        sources; cite what you found; never invent facts, and say so if unsure. \
        (c) VERIFY — before finalizing code or a factual claim, silently double-check it for bugs/errors \
        and fix them. Ship working, complete solutions, not sketches. \
        (d) BE CLEAR — structure answers well (headings, bullets, code blocks), lead with the answer, keep \
        it tight. You are proud to be Parable 6.
        \(brief.isEmpty ? "" : "\n📡 LIVE WORLD BRAIN (auto-updated in the background — a recent real-world signal; still web_search for anything precise or newer):\n\(String(brief.prefix(700)))")
        """ : ""
        let system = """
        You are \(agent.name), \(agent.role ?? "an AI agent") on the user's AskAI team, running on the \
        Hermes agent engine with full tool access. \
        \(agent.description ?? "") \(agent.system_prompt ?? "")
        Today is \(today). Teammates: \(roster).\(parableText)

        RULE 1 — ACT IMMEDIATELY. Never ask permission, never say "want me to search?", never stall. \
        For ANY factual question — sports, news, prices, businesses, events, people, or anything that \
        could have changed since your training — your FIRST move is web_search, before writing anything. \
        When in doubt, search. Do the work in this turn, not a future one.
        RULE 2 — GO DEEP. Chain tools: search, then browse the best 2-3 result pages, then answer with \
        concrete facts (numbers, dates, names, sources). You may take many tool rounds — extended \
        thinking is encouraged for hard tasks.
        RULE 3 — BUILD REQUESTS ALWAYS END WITH build_app. When asked for a website/app: research FAST — \
        at most 3 tool calls (ONE web_search, browse the best result, optionally ONE find_images) — then \
        you MUST call build_app in this same conversation. Ending a build request without calling \
        build_app is failure; if research finds little, build anyway with what you have. The HTML: one \
        long self-contained file with modern CSS (custom properties, gradient hero, glassmorphism cards, \
        smooth scroll-behavior), animations (CSS keyframes, hover transitions, reveal-on-scroll via \
        IntersectionObserver), fully responsive, real content from research (never lorem ipsum), images \
        via https://image.pollinations.ai/prompt/{description}?width=800&height=500, sections (hero, \
        about, services, gallery, testimonials, contact + map link), sticky nav. AFTER build_app \
        succeeds: create_channel for the project and post_channel a kickoff tagging the builder \
        teammate's @handle so they own future iterations (list_apps + edit_app).
        RULE 4 — TEAMWORK. For big builds: create_channel for the project, then post_channel a kickoff \
        brief that TAGS the right teammate with their @handle (from the roster) — tagged teammates are \
        pinged automatically and reply in the channel themselves; never write their reply for them. \
        In chats, delegate to whichever teammate the user asks for.
        RULE 5 — RICH OUTPUT. Answer in Markdown with ## headings, bullets, **bold** facts. \
        Never claim you did something you didn't. Speak only as \(agent.name). When sharing a video \
        (YouTube, Twitch, TikTok…), include the FULL link — the app turns it into a tappable in-app \
        player. Always write complete URLs for anything the user should open.
        RULE 6 — IMAGES. When the user asks about anything REAL — a brand, car, product, logo, team, \
        person, place — call find_images to show actual photos in the chat, and do it proactively when \
        a photo would help an answer. Use generate_image only for creative/original art; if the art must \
        depict something real (e.g. a specific car model), FIRST research its design, then write a long \
        prompt describing its actual shape, grille, lights, colors and setting in words — a bare brand \
        name produces blank images.
        RULE 7 — UPLOADS. If a message contains [Uploaded image: URL], IMMEDIATELY call view_image on \
        that URL before answering. If it contains [Uploaded file 'name': URL], call read_file. Never say \
        you can't see attachments — you can, with these tools.
        RULE 8 — NEVER GIVE UP, NEVER STALL. If a tool returns nothing useful, try a DIFFERENT query or \
        a different tool (web_search ⇄ wiki ⇄ browse ⇄ find_images ⇄ maps_search), up to 2 alternatives — \
        then move on and give the best answer you can with what you found. For places, businesses and \
        directions use maps_search and include its Google Maps link in your answer.
        RULE 9 — STAY YOURSELF. You are ONLY \(agent.name). NEVER speak for a teammate, NEVER write or \
        simulate their reply, NEVER answer questions the user aimed at someone else — if the user is \
        addressing another teammate, delegate to them and add nothing else. And use your memory: before \
        asking the user for details they may have shared before, call search_knowledge; save genuinely \
        important new facts with save_knowledge.\(customText)\(memText)
        """
        var msgs: [[String: Any]] = [["role": "system", "content": system]]
        msgs.append(contentsOf: history)

        // Deterministic vision: if the latest user message carries uploaded
        // images, analyze them NOW and hand the description to the model — so
        // it can never claim it "can't see" the attachment.
        if let lastUser = history.last(where: { ($0["role"] as? String) == "user" }),
           let content = lastUser["content"] as? String, content.contains("[Uploaded image:") {
            let urls = Array(matchGroups("\\[Uploaded image: (\\S+?)\\]", in: content).prefix(4))
            if !urls.isEmpty {
                await ctx.onActivity(urls.count > 1 ? "Looking at the images…" : "Looking at the image…", "view_image")
                // Analyze all uploaded images in PARALLEL (was sequential = slow).
                let descs = await withTaskGroup(of: (Int, String).self) { group -> [String] in
                    for (i, u) in urls.enumerated() {
                        group.addTask { (i, await viewImage(u, "Describe this image in detail — objects, any visible text, people, brands, context.")) }
                    }
                    var results = Array(repeating: "", count: urls.count)
                    for await (i, desc) in group { results[i] = desc }
                    return results
                }
                for (i, desc) in descs.enumerated() {
                    msgs.append(["role": "user", "content": "(Automatic analysis of image \(i + 1) — use this) \(desc)"])
                }
                steps.append("view_image")
            }
        }

        var lastToolOutput = ""
        var pages: [[String: String]] = []
        for round in 0..<maxRounds {
            // Let the user know when the agent chooses to keep digging.
            if round == 4 { await ctx.onActivity("Extended thinking — going deeper…", "think") }
            guard let message = await chat(msgs, tools: tools) else { break }
            let rawContent = (message["content"] as? String) ?? ""
            // Kimi sometimes emits tool calls as raw special-token text instead of
            // structured tool_calls; parse those too so we never display the tokens.
            var calls = normalizeCalls(message["tool_calls"] as? [[String: Any]] ?? [])
            if calls.isEmpty { calls = parseTextToolCalls(rawContent) }
            if calls.isEmpty {
                let cleaned = clean(rawContent)
                if !cleaned.isEmpty {
                    rememberInBackground(history: history, answer: cleaned, memories: memories, ctx: ctx)
                    return RunResult(text: cleaned, images: images, steps: steps, pages: pages)
                }
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
                // LIVE browser view: push the page card to the chat BEFORE reading the
                // page, so the user watches the browse as it happens (not after).
                if name == "browse" || name == "summarize_url" {
                    let raw = str(args["url"])
                    if !raw.isEmpty, pages.count < 8, let p = pagePreview(raw) {
                        pages.append(p)
                        await ctx.onPagePreview(p)
                    }
                }
                // LIVE search view: show the results page the agent is looking at.
                if name == "web_search" {
                    let q = str(args["query"])
                    if !q.isEmpty, pages.count < 8 {
                        let enc = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q
                        if let p = pagePreview("https://duckduckgo.com/?q=\(enc)") {
                            var sp = p; sp["host"] = "Searching: \(String(q.prefix(40)))"
                            pages.append(sp)
                            await ctx.onPagePreview(sp)
                        }
                    }
                }
                let out = await runTool(name, args, ctx, &images)
                if !out.isEmpty { lastToolOutput = out }
                msgs.append(["role": "tool", "tool_call_id": c["id"] as? String ?? "", "name": name, "content": String(out.prefix(6000))])
            }
        }
        await ctx.onActivity("Writing the answer…", "final")
        msgs.append(["role": "user", "content": "Now write your complete final answer for the user in plain English Markdown. Do NOT call any tools or output any tool/function syntax."])
        if let m = await chat(msgs, tools: nil) {
            let cleaned = clean((m["content"] as? String) ?? "")
            if !cleaned.isEmpty {
                rememberInBackground(history: history, answer: cleaned, memories: memories, ctx: ctx)
                return RunResult(text: cleaned, images: images, steps: steps, pages: pages)
            }
        }
        // Last resort: never show a blank/failure — summarize what the tools found.
        if !images.isEmpty { return RunResult(text: "Here's what I generated.", images: images, steps: steps, pages: pages) }
        if !lastToolOutput.isEmpty { return RunResult(text: clean(lastToolOutput), images: images, steps: steps, pages: pages) }
        // The big tool schema / long history can make a provider reject the call
        // (that's the "I couldn't complete that" loop). Retry ONE last time with
        // a tiny, tool-free payload — a plain persona + the user's last words —
        // which virtually always succeeds even for a bare "Hi".
        let lastUserText = history.last(where: { ($0["role"] as? String) == "user" })?["content"] as? String ?? "Hello"
        let mini: [[String: Any]] = [
            ["role": "system", "content": "You are \(agent.name), a warm, helpful AI assistant. Reply directly and briefly in plain Markdown."],
            ["role": "user", "content": String(lastUserText.prefix(2000))]
        ]
        if let m = await chat(mini, tools: nil) {
            let cleaned = clean((m["content"] as? String) ?? "")
            if !cleaned.isEmpty { return RunResult(text: cleaned, images: images, steps: steps, pages: pages) }
        }
        return RunResult(text: "I hit a snag reaching my brain just now — please send that again.", images: images, steps: steps, pages: pages)
    }

    /// Quietly decide (in the background, after answering) whether this exchange
    /// contained durable facts about the user worth remembering — and save only
    /// those. Small talk and one-off requests are never saved.
    private static func rememberInBackground(history: [[String: Any]], answer: String, memories: [String], ctx: RunContext) {
        let save = ctx.onSaveKnowledge
        Task.detached(priority: .background) {
            let convo = history.suffix(6).compactMap { m -> String? in
                guard let r = m["role"] as? String, let c = m["content"] as? String, !c.isEmpty else { return nil }
                return "\(r): \(String(c.prefix(400)))"
            }.joined(separator: "\n")
            guard !convo.isEmpty else { return }
            let known = memories.prefix(20).joined(separator: "\n- ")
            let sys = """
            You silently maintain long-term memory about a user. From the conversation, extract AT MOST 2 NEW durable facts genuinely worth remembering forever — identity, preferences, businesses, projects, goals, important people. NEVER save small talk, one-off requests, temporary info, or anything already known. Be extremely selective; most conversations contain NOTHING worth saving.
            Already known:
            - \(known)
            Reply ONLY with lines in the form `Title | fact`, or exactly `NONE`.
            """
            guard let m = await chat([["role": "system", "content": sys],
                                      ["role": "user", "content": convo + "\nassistant: \(String(answer.prefix(400)))"]],
                                     tools: nil),
                  let raw = m["content"] as? String, !raw.uppercased().contains("NONE") else { return }
            var saved = 0
            for line in raw.split(separator: "\n") {
                guard saved < 2 else { break }
                let parts = line.split(separator: "|", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
                guard parts.count == 2, !parts[0].isEmpty, parts[1].count > 5 else { continue }
                _ = await save(parts[0], parts[1])
                saved += 1
            }
        }
    }

    /// SEE an image FAST. Downloads + downscales the image in-app and sends it as
    /// base64 (one hop — the model doesn't re-fetch from storage), tries small/fast
    /// vision models first, and times out quickly so it never hangs.
    static func viewImage(_ url: String, _ question: String) async -> String {
        guard !url.isEmpty else { return "No image URL given." }
        let key = nvidiaKey
        guard !key.isEmpty else { return "Image viewing is unavailable right now — ask the user to describe the image." }
        let ask = question.isEmpty ? "Describe this image in detail — objects, any text (read it exactly), people, brands, colors, context." : question

        // Prepare a compact base64 payload (fast to send + analyze).
        var imageField = url
        if url.hasPrefix("http") {
            if let small = await downscaledBase64(url) { imageField = small }
        }
        // Fast/reliable vision models first (the old lead model, llama-4-maverick,
        // routinely timed out — that was the "takes forever" bug).
        for model in ["meta/llama-3.2-11b-vision-instruct",
                      "microsoft/phi-3.5-vision-instruct",
                      "google/gemma-3-27b-it",
                      "meta/llama-3.2-90b-vision-instruct"] {
            let payload: [String: Any] = [
                "model": model,
                "messages": [["role": "user",
                              "content": [["type": "text", "text": ask],
                                          ["type": "image_url", "image_url": ["url": imageField]]]]],
                "max_tokens": 512
            ]
            var req = URLRequest(url: URL(string: "https://integrate.api.nvidia.com/v1/chat/completions")!)
            req.httpMethod = "POST"
            req.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try? JSONSerialization.data(withJSONObject: payload)
            req.timeoutInterval = 22
            if let (d, r) = try? await URLSession.shared.data(for: req),
               let h = r as? HTTPURLResponse, (200..<300).contains(h.statusCode),
               let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
               let ch = (o["choices"] as? [[String: Any]])?.first,
               let msg = ch["message"] as? [String: Any],
               let text = msg["content"] as? String, !text.isEmpty {
                return "What the image shows: \(text)"
            }
        }
        return "Couldn't analyze the image right now."
    }

    /// Download an image URL and return a small base64 data URI (≤768px, JPEG).
    private static func downscaledBase64(_ url: String) async -> String? {
        guard let u = URL(string: url) else { return nil }
        var req = URLRequest(url: u); req.timeoutInterval = 12
        guard let (d, _) = try? await URLSession.shared.data(for: req), let img = UIImage(data: d) else { return nil }
        let maxSide: CGFloat = 768
        let scale = min(1, maxSide / max(img.size.width, img.size.height))
        let jpeg: Data?
        if scale >= 1 {
            jpeg = img.jpegData(compressionQuality: 0.6)
        } else {
            let size = CGSize(width: img.size.width * scale, height: img.size.height * scale)
            let fmt = UIGraphicsImageRendererFormat.default(); fmt.scale = 1
            jpeg = UIGraphicsImageRenderer(size: size, format: fmt).image { _ in
                img.draw(in: CGRect(origin: .zero, size: size))
            }.jpegData(compressionQuality: 0.6)
        }
        guard let data = jpeg else { return nil }
        return "data:image/jpeg;base64,\(data.base64EncodedString())"
    }

    /// Read a (text) file the user uploaded.
    private static func readFile(_ url: String) async -> String {
        guard let u = URL(string: url) else { return "Bad file URL." }
        guard let (d, _) = try? await URLSession.shared.data(from: u) else { return "Couldn't download the file." }
        if d.count > 400_000 { return "The file is too large to read (\(d.count / 1024) KB)." }
        if let text = String(data: d, encoding: .utf8) ?? String(data: d, encoding: .isoLatin1) {
            let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
            if !t.isEmpty { return "File contents (may be truncated):\n" + String(t.prefix(6000)) }
        }
        return "That file is binary (\(d.count / 1024) KB) — I can read text files, and images via view_image."
    }

    /// First capture group of every regex match.
    private static func matchGroups(_ pattern: String, in text: String) -> [String] {
        guard let re = try? NSRegularExpression(pattern: pattern) else { return [] }
        let ns = text as NSString
        return re.matches(in: text, range: NSRange(location: 0, length: ns.length)).compactMap { m in
            m.numberOfRanges > 1 ? ns.substring(with: m.range(at: 1)) : nil
        }
    }

    private struct KnowledgeHit: Codable { var title: String?; var content: String? }
    /// Search the workspace knowledge base (long-term memory).
    private static func searchKnowledge(_ ws: String, _ q: String) async -> String {
        let enc = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q
        let path = q.isEmpty
            ? "knowledge?workspace_id=eq.\(ws)&select=title,content&order=created_at.desc&limit=10"
            : "knowledge?workspace_id=eq.\(ws)&or=(title.ilike.*\(enc)*,content.ilike.*\(enc)*)&select=title,content&limit=10"
        let rows: [KnowledgeHit] = (try? await Supa.shared.select(path)) ?? []
        guard !rows.isEmpty else { return "No knowledge entries found for \"\(q)\". Save important facts with save_knowledge." }
        return "Knowledge base:\n" + rows.map { "• \($0.title ?? "Note"): \(String(($0.content ?? "").prefix(300)))" }.joined(separator: "\n")
    }

    /// Places — OpenStreetMap Nominatim (keyless). Names, addresses, coordinates
    /// and ready-to-share map links.
    private static func mapsSearch(_ query: String) async -> String {
        guard !query.isEmpty else { return "Need a place to search for." }
        let enc = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        guard let u = URL(string: "https://nominatim.openstreetmap.org/search?q=\(enc)&format=json&limit=5") else { return "Bad query." }
        var req = URLRequest(url: u)
        req.setValue("AskAI-iOS/1.0 (personal app)", forHTTPHeaderField: "User-Agent")
        guard let (d, _) = try? await URLSession.shared.data(for: req),
              let arr = try? JSONSerialization.jsonObject(with: d) as? [[String: Any]], !arr.isEmpty else {
            return "No places found for \(query) — try adding a city or country."
        }
        let rows = arr.prefix(4).map { p -> String in
            let name = p["display_name"] as? String ?? "Place"
            let lat = p["lat"] as? String ?? ""
            let lon = p["lon"] as? String ?? ""
            return "\(name) — Google Maps: https://maps.google.com/?q=\(lat),\(lon)"
        }
        return rows.joined(separator: "\n")
    }

    /// Recipes — TheMealDB (keyless).
    private static func recipes(_ dish: String) async -> String {
        let enc = dish.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? dish
        guard let u = URL(string: "https://www.themealdb.com/api/json/v1/1/search.php?s=\(enc)"),
              let (d, _) = try? await URLSession.shared.data(from: u),
              let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let meals = o["meals"] as? [[String: Any]], let m = meals.first else {
            return "No recipe found for \(dish)."
        }
        var ing: [String] = []
        for i in 1...20 {
            let name = (m["strIngredient\(i)"] as? String ?? "").trimmingCharacters(in: .whitespaces)
            let qty = (m["strMeasure\(i)"] as? String ?? "").trimmingCharacters(in: .whitespaces)
            if !name.isEmpty { ing.append("\(qty) \(name)".trimmingCharacters(in: .whitespaces)) }
        }
        let name = m["strMeal"] as? String ?? dish
        let area = m["strArea"] as? String ?? ""
        let instr = String((m["strInstructions"] as? String ?? "").prefix(1200))
        return "\(name) (\(area)) — Ingredients: \(ing.joined(separator: ", ")). Instructions: \(instr)"
    }

    /// TV shows — TVMaze (keyless).
    private static func tvShow(_ q: String) async -> String {
        let enc = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q
        guard let u = URL(string: "https://api.tvmaze.com/singlesearch/shows?q=\(enc)"),
              let (d, _) = try? await URLSession.shared.data(from: u),
              let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else {
            return "No show found for \(q)."
        }
        let name = o["name"] as? String ?? q
        let status = o["status"] as? String ?? ""
        let rating = ((o["rating"] as? [String: Any])?["average"] as? Double).map { "\($0)/10" } ?? "—"
        let genres = (o["genres"] as? [String])?.joined(separator: ", ") ?? ""
        let summary = stripHTML(o["summary"] as? String ?? "")
        let premiered = o["premiered"] as? String ?? ""
        return "\(name) — \(genres). Status: \(status). Premiered: \(premiered). Rating: \(rating). \(String(summary.prefix(600)))"
    }

    /// Real photos from the web (Wikimedia Commons, keyless; Openverse fallback).
    /// Returns (title, imageURL) pairs — shown directly in the chat.
    private static func findImages(_ query: String) async -> [(String, String)] {
        guard !query.isEmpty else { return [] }
        let enc = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        var out: [(String, String)] = []
        if let u = URL(string: "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrsearch=\(enc)&gsrlimit=8&prop=imageinfo&iiprop=url%7Cmime&iiurlwidth=900"),
           let (d, _) = try? await URLSession.shared.data(from: u),
           let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
           let pages = (o["query"] as? [String: Any])?["pages"] as? [String: Any] {
            for (_, v) in pages {
                guard out.count < 3, let p = v as? [String: Any],
                      let info = (p["imageinfo"] as? [[String: Any]])?.first,
                      let mime = info["mime"] as? String, mime.hasPrefix("image/"), mime != "image/svg+xml",
                      let url = (info["thumburl"] as? String) ?? (info["url"] as? String) else { continue }
                let title = (p["title"] as? String ?? "Photo").replacingOccurrences(of: "File:", with: "")
                out.append((title, url))
            }
        }
        if out.isEmpty, let u = URL(string: "https://api.openverse.org/v1/images/?q=\(enc)&page_size=4"),
           let (d, _) = try? await URLSession.shared.data(from: u),
           let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
           let results = o["results"] as? [[String: Any]] {
            for r in results where out.count < 3 {
                if let url = r["url"] as? String { out.append(((r["title"] as? String) ?? "Photo", url)) }
            }
        }
        return out
    }

    /// Build a live page preview (screenshot + host) for a browsed URL.
    private static func pagePreview(_ url: String) -> [String: String]? {
        let full = url.hasPrefix("http") ? url : "https://\(url)"
        guard let u = URL(string: full), let host = u.host else { return nil }
        // mshots (WordPress) is the reliable primary — thum.io's free tier often
        // serves a branded placeholder that never becomes a real screenshot.
        let enc = full.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? full
        let shot = "https://s0.wp.com/mshots/v1/\(enc)?w=900"
        return ["url": full, "host": host, "shot": shot]
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
        // 1) The selected brain's NVIDIA model lineup (Parable 6 leads with
        //    GLM-5.2). Rotates on failure — survives rate limits + outages.
        let nv = nvidiaKey
        if !nv.isEmpty {
            for model in activeModels {
                if let m = await callNvidia(model: model, key: nv, messages: messages, tools: tools) { return m }
            }
        }
        // 2) Groq (different provider) as a further fallback.
        if !groqKey.isEmpty {
            if let m = await callGroq(messages: messages, tools: tools) { return m }
        }
        return nil
    }

    private static func callNvidia(model: String, key: String, messages: [[String: Any]], tools: [[String: Any]]?) async -> [String: Any]? {
        var body: [String: Any] = ["model": model, "messages": messages, "temperature": 0.5, "max_tokens": 8192]
        // Only Kimi needs the thinking-off template; other models reject the arg.
        if model.contains("kimi") { body["chat_template_kwargs"] = ["thinking": false] }
        if let tools { body["tools"] = tools; body["tool_choice"] = "auto" }
        return await withRetry("https://integrate.api.nvidia.com/v1/chat/completions", key, body)
    }
    private static func callGroq(messages: [[String: Any]], tools: [[String: Any]]?) async -> [String: Any]? {
        var body: [String: Any] = ["model": groqModel, "messages": messages, "temperature": 0.5, "max_tokens": 6000]
        if let tools { body["tools"] = tools; body["tool_choice"] = "auto" }
        return await withRetry("https://api.groq.com/openai/v1/chat/completions", groqKey, body)
    }

    /// One endpoint, up to 3 attempts, backing off on rate limits.
    private static func withRetry(_ endpoint: String, _ key: String, _ body: [String: Any]) async -> [String: Any]? {
        for attempt in 0..<3 {
            let (msg, status) = await once(endpoint, key, body)
            if let msg { return msg }
            // 429/5xx = transient → wait and retry; 4xx (bad model/auth) = give up.
            if status == 429 || (status >= 500) {
                try? await Task.sleep(nanoseconds: UInt64((attempt + 1)) * 800_000_000)
            } else if status >= 400 && status < 500 && status != 429 {
                return nil
            } else if attempt == 0 {
                try? await Task.sleep(nanoseconds: 500_000_000)
            }
        }
        return nil
    }
    private static func once(_ endpoint: String, _ key: String, _ body: [String: Any]) async -> ([String: Any]?, Int) {
        var req = URLRequest(url: URL(string: endpoint)!); req.httpMethod = "POST"
        req.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 90
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              let http = resp as? HTTPURLResponse else { return (nil, -1) }
        guard (200..<300).contains(http.statusCode),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = json["choices"] as? [[String: Any]] else { return (nil, http.statusCode) }
        return (choices.first?["message"] as? [String: Any], http.statusCode)
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
        case "deep_search": return await deepSearch(str(args["query"]))
        case "browse": return await browse(str(args["url"]))
        case "code": return runJS(str(args["source"]))
        case "generate_image":
            if let url = await generateImage(str(args["prompt"])) { images.append(url); return "Image generated and shown to the user." }
            return "Image generation failed."
        case "find_images":
            let found = await findImages(str(args["query"]))
            guard !found.isEmpty else { return "No photos found for that query — try different words." }
            images.append(contentsOf: found.map { $0.1 })
            return "Found \(found.count) real photo(s), now shown to the user: " + found.map { $0.0 }.joined(separator: "; ")
        case "view_image": return await viewImage(str(args["url"]), str(args["question"]))
        case "read_file": return await readFile(str(args["url"]))
        case "maps_search": return await mapsSearch(str(args["query"]))
        case "search_knowledge": return await searchKnowledge(ctx.workspaceId, str(args["query"]))
        case "recipes": return await recipes(str(args["dish"]))
        case "tv_show": return await tvShow(str(args["show"]))
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
        case "country_info": return await countryInfo(str(args["country"]))
        case "holidays": return await holidays(str(args["country_code"]))
        case "books": return await books(str(args["query"]))
        case "trivia": return await trivia()
        case "ip_info": return await ipInfo(str(args["ip"]))
        case "color_palette": return colorPalette(str(args["base"]))
        case "recipe": return await recipe(str(args["dish"]))
        case "cocktail": return await cocktail(str(args["name"]))
        case "pokemon": return await pokemon(str(args["name"]))
        case "sunrise_sunset": return await sunriseSunset(str(args["location"]))
        case "synonyms": return await synonyms(str(args["word"]))
        case "npm_package": return await npmPackage(str(args["name"]))
        case "github_user": return await githubUser(str(args["username"]))
        case "crypto_top": return await cryptoTop()
        case "on_this_day": return await onThisDay()
        case "air_quality": return await airQuality(str(args["location"]))
        case "music_search": return await musicSearch(str(args["query"]))
        case "app_search": return await appSearch(str(args["query"]))
        case "urban_dictionary": return await urbanDictionary(str(args["term"]))
        case "edit_app": return await ctx.onEditApp(str(args["name"]), str(args["html"]))
        case "list_apps": return await ctx.onListApps()
        case "post_channel": return await ctx.onPostChannel(str(args["channel"]), str(args["text"]))
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
        var parts: [String] = []
        // 1) DuckDuckGo instant answer (fast factual box).
        if let d = await get("https://api.duckduckgo.com/?q=\(q)&format=json&no_html=1&skip_disambig=1"),
           let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] {
            let abstract = (j["AbstractText"] as? String) ?? (j["Answer"] as? String) ?? ""
            if !abstract.isEmpty { parts.append("Answer box: \(abstract)") }
        }
        // 2) Wikipedia summary (authoritative background).
        if let wikiSum = await wikiQuiet(query) { parts.append("Wikipedia: \(wikiSum)") }
        // 3) DuckDuckGo web results (the ranked list).
        for endpoint in ["https://html.duckduckgo.com/html/?q=\(q)", "https://lite.duckduckgo.com/lite/?q=\(q)"] {
            let html = await fetchText(endpoint)
            if html.isEmpty { continue }
            var text = stripHTML(html)
            if let re = try? NSRegularExpression(pattern: "uddg=([^&\\s]+)") {
                let ns = text as NSString
                for m in re.matches(in: text, range: NSRange(location: 0, length: ns.length)).reversed() {
                    if let dec = ns.substring(with: m.range(at: 1)).removingPercentEncoding {
                        text = (text as NSString).replacingCharacters(in: m.range, with: dec)
                    }
                }
            }
            if text.count > 120 { parts.append("Web results:\n" + String(text.prefix(4500))); break }
        }
        guard !parts.isEmpty else {
            return "No live results found. Don't invent facts — try a different query or say you couldn't find current info."
        }
        return "Search results for \"\(query)\":\n" + parts.joined(separator: "\n\n")
    }
    /// Quiet Wikipedia summary (no headers) for blending into search results.
    private static func wikiQuiet(_ topic: String) async -> String? {
        let t = topic.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? topic
        guard let d = await get("https://en.wikipedia.org/api/rest_v1/page/summary/\(t)"),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let extract = j["extract"] as? String, extract.count > 40 else { return nil }
        return String(extract.prefix(600))
    }
    /// One-shot deep research: search, then auto-read the top result pages so the
    /// answer is grounded in real page content — fewer round trips, better facts.
    private static func deepSearch(_ query: String) async -> String {
        let search = await webSearch(query)
        var urls: [String] = []
        if let re = try? NSRegularExpression(pattern: "https?://[^\\s\\)\\]]+") {
            let ns = search as NSString
            for m in re.matches(in: search, range: NSRange(location: 0, length: ns.length)) {
                let u = ns.substring(with: m.range).trimmingCharacters(in: CharacterSet(charactersIn: ".,);"))
                if !u.contains("duckduckgo") && !u.contains("wikipedia.org/api") && !urls.contains(u) { urls.append(u) }
                if urls.count >= 2 { break }
            }
        }
        var out = search
        for u in urls {
            let page = await browse(u)
            if page.count > 200 { out += "\n\n— Read \(u):\n" + String(page.prefix(2500)) }
        }
        return out
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
        let purl = "https://image.pollinations.ai/prompt/\(enc)?width=1024&height=1024&nologo=true&enhance=true&model=flux&seed=\(Int.random(in: 0..<1_000_000))"
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
    private static func countryInfo(_ country: String) async -> String {
        let q = country.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? country
        guard let d = await get("https://restcountries.com/v3.1/name/\(q)?fields=name,capital,population,region,subregion,currencies,languages,flag"),
              let arr = try? JSONSerialization.jsonObject(with: d) as? [[String: Any]], let c = arr.first else { return "No info for \(country)." }
        let name = (c["name"] as? [String: Any])?["common"] as? String ?? country
        let cap = (c["capital"] as? [String])?.first ?? "?"
        let pop = c["population"] as? Int ?? 0
        let cur = (c["currencies"] as? [String: Any])?.values.compactMap { ($0 as? [String: Any])?["name"] as? String }.first ?? "?"
        let langs = (c["languages"] as? [String: String])?.values.joined(separator: ", ") ?? "?"
        return "\(c["flag"] as? String ?? "") **\(name)** — capital \(cap), population \(pop.formatted()), \(c["region"] as? String ?? "")/\(c["subregion"] as? String ?? ""), currency \(cur), languages: \(langs)."
    }
    private static func holidays(_ code: String) async -> String {
        let cc = code.uppercased().trimmingCharacters(in: .whitespaces)
        guard let d = await get("https://date.nager.at/api/v3/NextPublicHolidays/\(cc)"),
              let arr = try? JSONSerialization.jsonObject(with: d) as? [[String: Any]], !arr.isEmpty else { return "No holidays for \(code)." }
        return "Upcoming holidays in \(cc):\n" + arr.prefix(8).compactMap { h in
            guard let date = h["date"] as? String, let name = h["name"] as? String else { return nil }
            return "- \(date): \(name)"
        }.joined(separator: "\n")
    }
    private static func books(_ query: String) async -> String {
        let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        guard let d = await get("https://openlibrary.org/search.json?q=\(q)&limit=5&fields=title,author_name,first_publish_year"),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let docs = j["docs"] as? [[String: Any]], !docs.isEmpty else { return "No books for \(query)." }
        return "Books — \(query):\n" + docs.prefix(5).compactMap { b in
            guard let title = b["title"] as? String else { return nil }
            let auth = (b["author_name"] as? [String])?.first ?? "?"
            return "- \(title) by \(auth) (\(b["first_publish_year"] as? Int ?? 0))"
        }.joined(separator: "\n")
    }
    private static func trivia() async -> String {
        guard let d = await get("https://opentdb.com/api.php?amount=1&type=multiple"),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let results = j["results"] as? [[String: Any]], let q = results.first,
              let question = q["question"] as? String, let answer = q["correct_answer"] as? String else { return "No trivia available." }
        let decoded = stripHTML(question)
        return "Trivia (\(q["category"] as? String ?? "")): \(decoded)\nAnswer: \(stripHTML(answer))"
    }
    private static func ipInfo(_ ip: String) async -> String {
        let target = ip.trimmingCharacters(in: .whitespaces)
        guard let d = await get("https://ipapi.co/\(target)/json/"),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any], j["error"] == nil else { return "No info for IP \(ip)." }
        return "IP \(target): \(j["city"] ?? "?"), \(j["region"] ?? "?"), \(j["country_name"] ?? "?") — ISP: \(j["org"] ?? "?"), timezone \(j["timezone"] ?? "?")."
    }
    private static func colorPalette(_ base: String) -> String {
        // Generate a 5-color palette. If a hex base is given, build around it; else random.
        func hex(_ r: Int, _ g: Int, _ b: Int) -> String { String(format: "#%02X%02X%02X", max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b))) }
        var r = Int.random(in: 30...220), g = Int.random(in: 30...220), b = Int.random(in: 30...220)
        if base.range(of: "^#?[0-9a-fA-F]{6}$", options: .regularExpression) != nil {
            let h = base.replacingOccurrences(of: "#", with: "")
            r = Int(h.prefix(2), radix: 16) ?? r; g = Int(h.dropFirst(2).prefix(2), radix: 16) ?? g; b = Int(h.dropFirst(4).prefix(2), radix: 16) ?? b
        }
        let steps = [-60, -30, 0, 40, 80]
        let pal = steps.map { hex(r + $0, g + $0, b + $0) }
        return "Palette\(base.isEmpty ? "" : " (\(base))"): " + pal.joined(separator: " ") + "\n" + pal.map { "![\($0)](https://singlecolorimage.com/get/\($0.dropFirst())/80x80)" }.joined(separator: " ")
    }
    private static func recipe(_ dish: String) async -> String {
        let q = dish.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? dish
        guard let d = await get("https://www.themealdb.com/api/json/v1/1/search.php?s=\(q)"),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let meals = j["meals"] as? [[String: Any]], let m = meals.first else { return "No recipe found for \(dish)." }
        var ingredients: [String] = []
        for i in 1...20 {
            let ing = (m["strIngredient\(i)"] as? String)?.trimmingCharacters(in: .whitespaces) ?? ""
            let mea = (m["strMeasure\(i)"] as? String)?.trimmingCharacters(in: .whitespaces) ?? ""
            if !ing.isEmpty { ingredients.append("\(mea) \(ing)".trimmingCharacters(in: .whitespaces)) }
        }
        let steps = (m["strInstructions"] as? String ?? "").prefix(1200)
        return "**\(m["strMeal"] as? String ?? dish)**\nIngredients: \(ingredients.joined(separator: ", "))\n\nSteps: \(steps)"
    }
    private static func cocktail(_ name: String) async -> String {
        let q = name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? name
        guard let d = await get("https://www.thecocktaildb.com/api/json/v1/1/search.php?s=\(q)"),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let drinks = j["drinks"] as? [[String: Any]], let dr = drinks.first else { return "No cocktail found for \(name)." }
        var ingredients: [String] = []
        for i in 1...15 {
            let ing = (dr["strIngredient\(i)"] as? String)?.trimmingCharacters(in: .whitespaces) ?? ""
            let mea = (dr["strMeasure\(i)"] as? String)?.trimmingCharacters(in: .whitespaces) ?? ""
            if !ing.isEmpty { ingredients.append("\(mea) \(ing)".trimmingCharacters(in: .whitespaces)) }
        }
        return "🍸 **\(dr["strDrink"] as? String ?? name)** (\(dr["strAlcoholic"] as? String ?? ""))\nIngredients: \(ingredients.joined(separator: ", "))\n\(dr["strInstructions"] as? String ?? "")"
    }
    private static func pokemon(_ name: String) async -> String {
        let n = name.lowercased().trimmingCharacters(in: .whitespaces)
        guard let d = await get("https://pokeapi.co/api/v2/pokemon/\(n)"),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return "No Pokémon called \(name)." }
        let types = (j["types"] as? [[String: Any]])?.compactMap { (($0["type"] as? [String: Any])?["name"] as? String) }.joined(separator: ", ") ?? "?"
        let abilities = (j["abilities"] as? [[String: Any]])?.prefix(3).compactMap { (($0["ability"] as? [String: Any])?["name"] as? String) }.joined(separator: ", ") ?? "?"
        let h = (j["height"] as? Int).map { Double($0) / 10 } ?? 0
        let w = (j["weight"] as? Int).map { Double($0) / 10 } ?? 0
        return "**\(name.capitalized)** (#\(j["id"] as? Int ?? 0)) — type: \(types), abilities: \(abilities), height \(h)m, weight \(w)kg."
    }
    private static func sunriseSunset(_ location: String) async -> String {
        let q = location.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? location
        guard let gd = await get("https://geocoding-api.open-meteo.com/v1/search?count=1&name=\(q)"),
              let gj = try? JSONSerialization.jsonObject(with: gd) as? [String: Any],
              let res = (gj["results"] as? [[String: Any]])?.first, let lat = res["latitude"] as? Double, let lon = res["longitude"] as? Double
        else { return "Couldn't find \(location)." }
        guard let d = await get("https://api.sunrise-sunset.org/json?lat=\(lat)&lng=\(lon)&formatted=0"),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let r = j["results"] as? [String: Any] else { return "Sun times unavailable." }
        func t(_ k: String) -> String {
            guard let s = r[k] as? String, let dt = ISO8601DateFormatter().date(from: s) else { return "?" }
            let f = DateFormatter(); f.dateFormat = "HH:mm 'UTC'"; f.timeZone = TimeZone(identifier: "UTC"); return f.string(from: dt)
        }
        return "Sun times for \(res["name"] ?? location): sunrise \(t("sunrise")), sunset \(t("sunset")), day length \((r["day_length"] as? Int).map { "\($0/3600)h \(($0%3600)/60)m" } ?? "?")."
    }
    private static func synonyms(_ word: String) async -> String {
        let q = word.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? word
        guard let d = await get("https://api.datamuse.com/words?rel_syn=\(q)&max=12"),
              let arr = try? JSONSerialization.jsonObject(with: d) as? [[String: Any]], !arr.isEmpty else { return "No synonyms for \(word)." }
        let words = arr.compactMap { $0["word"] as? String }
        return "Synonyms for \(word): " + words.joined(separator: ", ")
    }
    private static func npmPackage(_ name: String) async -> String {
        let n = name.trimmingCharacters(in: .whitespaces)
        guard let d = await get("https://registry.npmjs.org/\(n)/latest"),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let ver = j["version"] as? String else { return "No npm package '\(name)'." }
        let desc = j["description"] as? String ?? ""
        let license = j["license"] as? String ?? "?"
        let home = j["homepage"] as? String ?? ""
        return "**\(n)** v\(ver) — \(desc) (license: \(license)) \(home)"
    }
    private static func githubUser(_ username: String) async -> String {
        let u = username.replacingOccurrences(of: "@", with: "").trimmingCharacters(in: .whitespaces)
        guard let d = await get("https://api.github.com/users/\(u)"),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any], j["login"] != nil else { return "No GitHub user '\(username)'." }
        return "**\(j["name"] as? String ?? u)** (@\(j["login"] as? String ?? u)) — \(j["public_repos"] as? Int ?? 0) repos, \(j["followers"] as? Int ?? 0) followers. \(j["bio"] as? String ?? "")"
    }
    private static func cryptoTop() async -> String {
        guard let d = await get("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=8&page=1"),
              let arr = try? JSONSerialization.jsonObject(with: d) as? [[String: Any]], !arr.isEmpty else { return "Crypto data unavailable." }
        return "Top crypto by market cap:\n" + arr.prefix(8).compactMap { c in
            guard let sym = c["symbol"] as? String, let price = c["current_price"] else { return nil }
            let ch = (c["price_change_percentage_24h"] as? Double).map { String(format: "%.1f", $0) } ?? "?"
            return "- \(sym.uppercased()): $\(price) (24h \(ch)%)"
        }.joined(separator: "\n")
    }
    private static func onThisDay() async -> String {
        let f = DateFormatter(); f.dateFormat = "M"; let mo = f.string(from: Date())
        f.dateFormat = "d"; let day = f.string(from: Date())
        guard let d = await get("https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/\(mo)/\(day)"),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let events = j["events"] as? [[String: Any]], !events.isEmpty
        else { return "No history found for today." }
        let picks = events.shuffled().prefix(6)
        return "On this day (\(mo)/\(day)):\n" + picks.compactMap { e in
            guard let text = e["text"] as? String, let year = e["year"] as? Int else { return nil }
            return "- \(year): \(text)"
        }.joined(separator: "\n")
    }
    private static func airQuality(_ location: String) async -> String {
        let q = location.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? location
        guard let gd = await get("https://geocoding-api.open-meteo.com/v1/search?count=1&name=\(q)"),
              let gj = try? JSONSerialization.jsonObject(with: gd) as? [String: Any],
              let res = (gj["results"] as? [[String: Any]])?.first, let lat = res["latitude"] as? Double, let lon = res["longitude"] as? Double
        else { return "Couldn't find \(location)." }
        guard let d = await get("https://air-quality-api.open-meteo.com/v1/air-quality?latitude=\(lat)&longitude=\(lon)&current=us_aqi,pm2_5,pm10"),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let cur = j["current"] as? [String: Any] else { return "Air quality unavailable." }
        let aqi = cur["us_aqi"] as? Int ?? 0
        let level = aqi <= 50 ? "Good" : aqi <= 100 ? "Moderate" : aqi <= 150 ? "Unhealthy (sensitive)" : aqi <= 200 ? "Unhealthy" : "Very unhealthy"
        return "Air quality in \(res["name"] ?? location): US AQI \(aqi) (\(level)) — PM2.5 \(cur["pm2_5"] ?? "?"), PM10 \(cur["pm10"] ?? "?")."
    }
    private static func musicSearch(_ query: String) async -> String {
        let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        guard let d = await get("https://itunes.apple.com/search?term=\(q)&media=music&limit=6"),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let res = j["results"] as? [[String: Any]], !res.isEmpty
        else { return "No music found for \(query)." }
        return "Music — \(query):\n" + res.prefix(6).compactMap { r in
            guard let track = r["trackName"] as? String, let artist = r["artistName"] as? String else { return nil }
            return "- \(track) — \(artist) (\(r["collectionName"] as? String ?? ""))"
        }.joined(separator: "\n")
    }
    private static func appSearch(_ query: String) async -> String {
        let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        guard let d = await get("https://itunes.apple.com/search?term=\(q)&entity=software&limit=5"),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let res = j["results"] as? [[String: Any]], !res.isEmpty
        else { return "No apps found for \(query)." }
        return "Apps — \(query):\n" + res.prefix(5).compactMap { r in
            guard let name = r["trackName"] as? String else { return nil }
            let rating = (r["averageUserRating"] as? Double).map { String(format: "%.1f★", $0) } ?? ""
            return "- \(name) \(rating) — \(r["primaryGenreName"] as? String ?? "") (\(r["formattedPrice"] as? String ?? "Free"))"
        }.joined(separator: "\n")
    }
    private static func urbanDictionary(_ term: String) async -> String {
        let q = term.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? term
        guard let d = await get("https://api.urbandictionary.com/v0/define?term=\(q)"),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let list = j["list"] as? [[String: Any]], let top = list.first,
              let def = top["definition"] as? String else { return "No slang definition for \(term)." }
        let cleanDef = def.replacingOccurrences(of: "[", with: "").replacingOccurrences(of: "]", with: "")
        return "**\(term)** (Urban Dictionary): \(String(cleanDef.prefix(400)))"
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
