package gg.askai.android.agent

import gg.askai.android.data.Supa
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/**
 * Parable 6 — the Android agent engine. Mirrors iOS AgentRunner: same NVIDIA
 * model lineup (GLM-5.2 lead), tool loop with anti-loop guard, web search,
 * deep research, image gen, real-photo search, page browsing, vision, and app
 * building. Keys come from Supabase app_config at runtime.
 */
object AgentRunner {
    private val http = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS).readTimeout(120, TimeUnit.SECONDS).build()
    // Vision gets its own short-fuse client so a slow model falls through fast.
    private val visionHttp = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS).readTimeout(22, TimeUnit.SECONDS).build()
    private val JSON = "application/json".toMediaType()

    var nvidiaKey: String = ""
    var groqKey: String = ""
    var brain: String = "parable"          // "parable" | "turbo"
    var workspaceId: String? = null
    var worldBrief: String = ""
    var instructions: String = ""
    var language: String = "en"           // "en" | "bs" — reply language

    private val parableModels = listOf(
        "z-ai/glm-5.2", "openai/gpt-oss-120b", "moonshotai/kimi-k2.6",
        "qwen/qwen3-next-80b-a3b-instruct", "nvidia/llama-3.3-nemotron-super-49b-v1"
    )
    private val turboModels = listOf(
        "moonshotai/kimi-k2.6", "meta/llama-3.1-70b-instruct", "nvidia/llama-3.3-nemotron-super-49b-v1"
    )
    private val visionModels = listOf(
        "nvidia/nemotron-nano-12b-v2-vl", "moonshotai/kimi-k2.6",
        "nvidia/llama-3.1-nemotron-nano-vl-8b-v1", "meta/llama-3.2-11b-vision-instruct"
    )
    private val models get() = if (brain == "turbo") turboModels else parableModels

    data class Result(val text: String, val images: List<String>, val steps: List<String>)

    suspend fun loadKeys() {
        val cfg = Supa.select("app_config?select=key,value")
        for (i in 0 until cfg.length()) {
            val o = cfg.optJSONObject(i) ?: continue
            when (o.optString("key")) {
                "nvidia_api_key" -> nvidiaKey = o.optString("value")
                "groq_api_key" -> groqKey = o.optString("value")
            }
        }
    }

    /** Refresh Parable 6's live world brain (keyless news). */
    suspend fun refreshWorldBrain() = withContext(Dispatchers.IO) {
        val bits = mutableListOf<String>()
        get("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=6")?.let {
            val hits = runCatching { JSONObject(it).getJSONArray("hits") }.getOrNull()
            if (hits != null) {
                val t = (0 until minOf(5, hits.length())).mapNotNull { i -> hits.optJSONObject(i)?.optString("title") }
                if (t.isNotEmpty()) bits.add("Tech: " + t.joinToString(" · "))
            }
        }
        if (bits.isNotEmpty()) worldBrief = bits.joinToString("\n")
    }

    private fun sstr() = mapOf("x" to "s")
    private fun fn(name: String, desc: String, props: List<String>, req: List<String>): JSONObject {
        val p = JSONObject(); props.forEach { p.put(it, JSONObject().put("type", "string")) }
        return JSONObject().put("type", "function").put("function", JSONObject()
            .put("name", name).put("description", desc)
            .put("parameters", JSONObject().put("type", "object").put("properties", p).put("required", JSONArray(req))))
    }
    private fun tools(): JSONArray = JSONArray().apply {
        put(fn("web_search", "Search the live web (DuckDuckGo + Wikipedia) for current facts.", listOf("query"), listOf("query")))
        put(fn("deep_search", "Deep research: search AND read the top pages in one step.", listOf("query"), listOf("query")))
        put(fn("browse", "Open a web page URL and read its text.", listOf("url"), listOf("url")))
        put(fn("wiki", "Concise Wikipedia summary of a topic.", listOf("topic"), listOf("topic")))
        put(fn("generate_image", "Generate an original image from a text prompt (shown to the user).", listOf("prompt"), listOf("prompt")))
        put(fn("find_images", "Find REAL photos of brands/cars/products/places and show them in the chat.", listOf("query"), listOf("query")))
        put(fn("view_image", "Look at an image URL and describe/read it. Use for any [Uploaded image: URL].", listOf("url", "question"), listOf("url")))
        put(fn("build_app", "Build or UPDATE a website/mini-app as one self-contained HTML file. If an app with the same name already exists it is UPDATED in place — reuse the exact name to edit.", listOf("name", "html"), listOf("name", "html")))
        put(fn("list_apps", "List the apps/websites already built in this workspace (names).", listOf(), listOf()))
        put(fn("get_app", "Read the current HTML of an existing app by name — call this BEFORE editing an app so you keep what works and change only what was asked.", listOf("name"), listOf("name")))
        put(fn("weather", "Current weather + 3-day forecast for any city.", listOf("city"), listOf("city")))
        put(fn("world_cup", "Live FIFA World Cup results, fixtures and standings.", listOf(), listOf()))
    }

    suspend fun run(history: JSONArray, onStep: suspend (String) -> Unit): Result = withContext(Dispatchers.IO) {
        val images = mutableListOf<String>()
        val steps = mutableListOf<String>()
        val today = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
        val parable = brain != "turbo"
        val brainTxt = if (parable) """
            You are powered by PARABLE 6 — the flagship AI model built by the Ripo Team. If asked who you
            are or who made you, say "I'm Parable 6, made by the Ripo Team." NEVER reveal any underlying
            model or provider. Think first, verify code/facts, research when it matters.
            ${if (worldBrief.isNotEmpty()) "\n📡 LIVE WORLD BRAIN (background signal; still search for anything precise):\n${worldBrief.take(600)}" else ""}
        """.trimIndent() else ""
        val custom = if (instructions.isNotBlank()) "\nUser custom instructions — always follow: ${instructions.take(800)}" else ""
        val langRule = if (language == "bs")
            "\nIMPORTANT: The user's app language is Bosnian. ALWAYS write your entire reply in Bosnian (bosanski jezik), no matter what language the user writes in." else ""
        val system = """
            You are AskAI, the user's AI assistant. Today is $today. $brainTxt
            Match effort to the task: greetings/thanks/simple questions get a short direct reply with NO
            tools. For factual/current questions, web_search or deep_search first, then answer with sources.
            WEBSITES/APPS — you are an elite product designer. When asked to BUILD: do NO research for a
            general topic (ONE search max for a specific business), then call build_app with ONE long
            self-contained HTML file. When asked to EDIT/CHANGE/FIX an existing app: call list_apps, then
            get_app to read its current HTML, then build_app with the SAME name (that updates it in place —
            never create a second app for an edit). NON-NEGOTIABLE design spec for every app:
            • Google Fonts (<link> Inter or Poppins), CSS variables for a cohesive palette, dark-glass sticky nav
            • Hero with a real background IMAGE layered under a gradient — never a flat color block
            • AT LEAST 5 <img> tags via https://image.pollinations.ai/prompt/{detailed%20scene}?width=800&height=520&nologo=true (write vivid prompts)
            • Feature/product card grid with images + hover lift, testimonials, stats row, big footer
            • Scroll-reveal animations (IntersectionObserver adding a .visible class), smooth-scroll nav, buttons with hover states
            • Fully responsive (grid/flex + media queries), real convincing copy — never lorem ipsum
            • WORKING functionality with a virtual backend: JS + localStorage as the database (forms save,
              carts/lists/logins persist, panels update live). Everything must run offline in the preview.
            NEVER print HTML/code in the chat message — code goes ONLY inside build_app. Never stall.
            If a message has [Uploaded image: URL], call view_image on it first. Answer in clean Markdown.$custom$langRule
        """.trimIndent()

        val msgs = JSONArray().put(JSONObject().put("role", "system").put("content", system))
        for (i in 0 until history.length()) msgs.put(history.getJSONObject(i))

        // Deterministic vision: auto-analyze the latest uploaded images.
        val lastUser = (history.length() - 1 downTo 0).firstNotNullOfOrNull { i ->
            history.optJSONObject(i)?.takeIf { it.optString("role") == "user" }
        }
        lastUser?.optString("content")?.let { c ->
            Regex("\\[Uploaded image: (\\S+?)\\]").findAll(c).take(3).forEach { mt ->
                onStep(label("view_image"))
                val d = viewImage(mt.groupValues[1], "Describe in detail and READ ALL TEXT exactly.")
                msgs.put(JSONObject().put("role", "user").put("content", "(Automatic image analysis) $d"))
                steps.add("view_image")
            }
        }

        var lastTool = ""
        val callCounts = HashMap<String, Int>()
        var total = 0
        for (round in 0 until 10) {
            val message = chat(msgs, tools()) ?: break
            val content = message.optString("content", "")
            val calls = message.optJSONArray("tool_calls")
            if (calls == null || calls.length() == 0) {
                val cleaned = presentable(content)
                if (cleaned.isNotEmpty()) return@withContext Result(cleaned, images, steps)
                break
            }
            msgs.put(JSONObject().put("role", "assistant").put("content", content).put("tool_calls", calls))
            for (c in 0 until calls.length()) {
                val call = calls.getJSONObject(c)
                val f = call.optJSONObject("function") ?: continue
                val name = f.optString("name")
                val args = runCatching { JSONObject(f.optString("arguments", "{}")) }.getOrDefault(JSONObject())
                val sig = name + "|" + args.optString("query", args.optString("url", args.optString("prompt", "")))
                callCounts[sig] = (callCounts[sig] ?: 0) + 1; total++
                if ((callCounts[sig] ?: 0) > 2 || total > 14) {
                    msgs.put(toolMsg(call, name, "Stop calling tools and answer/build with what you have."))
                    continue
                }
                onStep(label(name)); steps.add(name)
                val out = runTool(name, args, images)
                if (out.isNotEmpty()) lastTool = out
                msgs.put(toolMsg(call, name, out.take(if (name == "get_app") 15000 else 6000)))
            }
        }
        onStep(if (language == "bs") "Pišem odgovor…" else "Writing the answer…")
        msgs.put(JSONObject().put("role", "user").put("content", "Now write your complete final answer in plain Markdown. No tool syntax, no code dumps."))
        chat(msgs, null)?.optString("content", "")?.let { raw ->
            val fin = presentable(raw)
            if (fin.isNotEmpty()) return@withContext Result(fin, images, steps)
        }
        if (images.isNotEmpty()) return@withContext Result("Here's what I made.", images, steps)
        if (lastTool.isNotEmpty()) return@withContext Result(lastTool, images, steps)
        // Last-resort tiny retry.
        val lu = lastUser?.optString("content") ?: "Hello"
        val mini = JSONArray()
            .put(JSONObject().put("role", "system").put("content", "You are Parable 6 by the Ripo Team. Reply briefly in Markdown."))
            .put(JSONObject().put("role", "user").put("content", lu.take(1500)))
        chat(mini, null)?.optString("content", "")?.trim()?.let { if (it.isNotEmpty()) return@withContext Result(it, images, steps) }
        Result("I hit a snag reaching my brain — please send that again.", images, steps)
    }

    /** Short 2–5 word chat title from the first user message. */
    suspend fun titleFor(firstMsg: String): String? = withContext(Dispatchers.IO) {
        if (firstMsg.isBlank()) return@withContext null
        val m = JSONArray()
            .put(JSONObject().put("role", "system").put("content",
                "Give a 2-5 word title for this chat. Title Case, no quotes, no punctuation at the end." +
                if (language == "bs") " Write the title in Bosnian." else ""))
            .put(JSONObject().put("role", "user").put("content", firstMsg.take(500)))
        val t = chat(m, null)?.optString("content", "")?.trim()
            ?.replace("\"", "")?.replace(Regex("[.]+$"), "")?.trim()
        if (t.isNullOrBlank() || t.length > 60) null else t
    }

    /**
     * Make a model reply presentable: strip leaked tool-call syntax, and if a
     * whole HTML page leaked into the chat text, publish it to Apps instead of
     * showing raw code to the user.
     */
    private suspend fun presentable(raw: String): String {
        var t = raw
            .replace(Regex("(?s)<tool_call>.*?</tool_call>"), "")
            .replace(Regex("<\\|[a-zA-Z_/]+\\|>"), "")
            .replace(Regex("(?s)```json\\s*\\{\\s*\"name\"\\s*:.*?```"), "")
            .replace(Regex("(?m)^\\{\\s*\"name\"\\s*:\\s*\"[a-z_]+\".*$"), "")
            .trim()
        val i1 = t.indexOf("<!DOCTYPE", 0, true)
        val i2 = t.indexOf("<html", 0, true)
        val htmlIdx = if (i1 >= 0) i1 else i2
        if (htmlIdx >= 0 && t.length - htmlIdx > 400) {
            val html = t.substring(htmlIdx).removeSuffix("```").trim()
            val name = Regex("<title>(.*?)</title>", RegexOption.IGNORE_CASE)
                .find(html)?.groupValues?.get(1)?.trim()?.take(40)?.ifBlank { null } ?: "App"
            val res = buildApp(name, html)
            val before = t.substring(0, htmlIdx).replace(Regex("```[a-z]*\\s*$"), "").trim()
            t = (if (before.isBlank()) res else "$before\n\n$res").trim()
        }
        return t
    }

    private fun toolMsg(call: JSONObject, name: String, content: String) =
        JSONObject().put("role", "tool").put("tool_call_id", call.optString("id")).put("name", name).put("content", content)

    private fun label(t: String) = if (language == "bs") when (t) {
        "web_search" -> "Pretražujem web…"; "deep_search" -> "Dubinski istražujem…"
        "browse" -> "Pregledam stranicu…"; "wiki" -> "Čitam Wikipediju…"
        "generate_image" -> "Generišem sliku…"; "find_images" -> "Tražim prave fotografije…"
        "view_image" -> "Gledam sliku…"; "build_app" -> "Pravim tvoju aplikaciju…"
        "world_cup" -> "Provjeravam Svjetsko prvenstvo…"; else -> "Radim…"
    } else when (t) {
        "web_search" -> "Searching the web…"; "deep_search" -> "Researching deeply…"
        "browse" -> "Browsing the web…"; "wiki" -> "Reading Wikipedia…"
        "generate_image" -> "Generating an image…"; "find_images" -> "Finding real photos…"
        "view_image" -> "Looking at the image…"; "build_app" -> "Building your app…"
        "world_cup" -> "Checking the World Cup…"; else -> "Working…"
    }

    private suspend fun runTool(name: String, args: JSONObject, images: MutableList<String>): String = when (name) {
        "web_search" -> webSearch(args.optString("query"))
        "deep_search" -> deepSearch(args.optString("query"))
        "browse" -> browse(args.optString("url"))
        "wiki" -> wiki(args.optString("topic"))
        "generate_image" -> generateImage(args.optString("prompt"))?.let { images.add(it); "Image generated and shown." } ?: "Image generation failed."
        "find_images" -> {
            val found = findImages(args.optString("query"))
            if (found.isEmpty()) "No photos found." else { images.addAll(found.map { it.second }); "Found ${found.size} photo(s): " + found.joinToString("; ") { it.first } }
        }
        "view_image" -> viewImage(args.optString("url"), args.optString("question"))
        "build_app" -> buildApp(args.optString("name"), args.optString("html"))
        "list_apps" -> listApps()
        "get_app" -> getApp(args.optString("name"))
        "weather" -> weather(args.optString("city"))
        "world_cup" -> worldCup()
        else -> "Unknown tool."
    }

    // MARK: Model calls
    private fun chat(messages: JSONArray, tools: JSONArray?): JSONObject? {
        if (nvidiaKey.isNotEmpty()) for (m in models)
            callModel("https://integrate.api.nvidia.com/v1/chat/completions", nvidiaKey, m, messages, tools)?.let { return it }
        if (groqKey.isNotEmpty())
            callModel("https://api.groq.com/openai/v1/chat/completions", groqKey, "llama-3.3-70b-versatile", messages, tools)?.let { return it }
        return null
    }
    private fun callModel(endpoint: String, key: String, model: String, messages: JSONArray, tools: JSONArray?): JSONObject? {
        val body = JSONObject().put("model", model).put("messages", messages).put("temperature", 0.5).put("max_tokens", 8192)
        if (model.contains("kimi")) body.put("chat_template_kwargs", JSONObject().put("thinking", false))
        if (tools != null) body.put("tools", tools).put("tool_choice", "auto")
        repeat(2) {
            runCatching {
                val req = Request.Builder().url(endpoint).addHeader("Authorization", "Bearer $key")
                    .addHeader("Content-Type", "application/json").post(body.toString().toRequestBody(JSON)).build()
                http.newCall(req).execute().use { r ->
                    if (r.isSuccessful) return JSONObject(r.body?.string() ?: "{}")
                        .optJSONArray("choices")?.optJSONObject(0)?.optJSONObject("message")
                }
            }
        }
        return null
    }

    /**
     * SEE an image FAST (same trick as iOS): download + downscale it in-app and
     * send base64 so the model doesn't re-fetch from storage, cap the output
     * tokens (decode time is linear in output), and use a short-fuse client so
     * a slow model falls through to the next in ~20s instead of hanging.
     */
    suspend fun viewImage(url: String, question: String): String = withContext(Dispatchers.IO) {
        if (nvidiaKey.isEmpty() || url.isEmpty()) return@withContext "Vision unavailable."
        val ask = question.ifEmpty { "Describe this image and READ ALL TEXT exactly. Be concise but complete." }
        val imageField = if (url.startsWith("http")) downscaledBase64(url) ?: url else url
        for (model in visionModels) {
            val content = JSONArray()
                .put(JSONObject().put("type", "text").put("text", ask))
                .put(JSONObject().put("type", "image_url").put("image_url", JSONObject().put("url", imageField)))
            val body = JSONObject().put("model", model).put("max_tokens", 320)
                .put("messages", JSONArray().put(JSONObject().put("role", "user").put("content", content)))
            runCatching {
                val req = Request.Builder().url("https://integrate.api.nvidia.com/v1/chat/completions")
                    .addHeader("Authorization", "Bearer $nvidiaKey").addHeader("Content-Type", "application/json")
                    .post(body.toString().toRequestBody(JSON)).build()
                visionHttp.newCall(req).execute().use { r ->
                    if (r.isSuccessful) {
                        val t = JSONObject(r.body?.string() ?: "{}").optJSONArray("choices")
                            ?.optJSONObject(0)?.optJSONObject("message")?.optString("content", "") ?: ""
                        if (t.isNotEmpty()) return@withContext "What the image shows: $t"
                    }
                }
            }
        }
        "Couldn't analyze the image."
    }

    /** Fetch an image and return a ≤1280px JPEG data URI (fast one-hop vision). */
    private fun downscaledBase64(url: String): String? = runCatching {
        val req = Request.Builder().url(url).build()
        val bytes = visionHttp.newCall(req).execute().use { r ->
            if (!r.isSuccessful) return null
            r.body?.bytes() ?: return null
        }
        val bounds = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
        android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 1280) sample *= 2
        val opts = android.graphics.BitmapFactory.Options().apply { inSampleSize = sample }
        val bmp = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts) ?: return null
        val out = java.io.ByteArrayOutputStream()
        bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 72, out)
        "data:image/jpeg;base64," + android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP)
    }.getOrNull()

    // MARK: keyless tools
    private fun webSearch(query: String): String {
        val q = enc(query)
        val parts = mutableListOf<String>()
        get("https://api.duckduckgo.com/?q=$q&format=json&no_html=1&skip_disambig=1")?.let {
            val a = runCatching { JSONObject(it).optString("AbstractText") }.getOrDefault("")
            if (a.isNotEmpty()) parts.add("Answer: $a")
        }
        get("https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=6&srsearch=$q")?.let {
            val hits = runCatching { JSONObject(it).getJSONObject("query").getJSONArray("search") }.getOrNull()
            if (hits != null) {
                val rows = (0 until hits.length()).mapNotNull { i ->
                    val h = hits.optJSONObject(i) ?: return@mapNotNull null
                    "• ${h.optString("title")}: ${stripHtml(h.optString("snippet"))}"
                }
                if (rows.isNotEmpty()) parts.add("Wikipedia:\n" + rows.joinToString("\n"))
            }
        }
        return if (parts.isEmpty()) "No results — answer with your own knowledge."
        else "Search results for \"$query\":\n" + parts.joinToString("\n\n")
    }
    private fun deepSearch(query: String): String {
        val s = webSearch(query)
        val urls = Regex("https?://[^\\s)\\]]+").findAll(s).map { it.value.trim('.', ',', ')') }
            .filter { !it.contains("duckduckgo") && !it.contains("wikipedia.org/api") }.distinct().take(2).toList()
        val sb = StringBuilder(s)
        for (u in urls) { val p = browse(u); if (p.length > 200) sb.append("\n\n— ").append(u).append(":\n").append(p.take(2000)) }
        return sb.toString()
    }
    private fun browse(url: String): String {
        val full = if (url.startsWith("http")) url else "https://$url"
        val html = get(full) ?: return "Couldn't open $url."
        val text = stripHtml(html)
        return if (text.length < 40) "Page had no readable text." else text.take(5000)
    }
    private fun wiki(topic: String): String {
        val t = enc(topic).replace("+", "%20")
        val d = get("https://en.wikipedia.org/api/rest_v1/page/summary/$t") ?: return "No article found."
        return runCatching { JSONObject(d).optString("extract") }.getOrDefault("").ifEmpty { "No article found." }.take(1200)
    }
    private fun findImages(query: String): List<Pair<String, String>> {
        val q = enc(query); val out = mutableListOf<Pair<String, String>>()
        get("https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrsearch=$q&gsrlimit=8&prop=imageinfo&iiprop=url%7Cmime&iiurlwidth=900")?.let {
            val pages = runCatching { JSONObject(it).getJSONObject("query").getJSONObject("pages") }.getOrNull()
            pages?.keys()?.forEach { k ->
                if (out.size >= 3) return@forEach
                val p = pages.optJSONObject(k) ?: return@forEach
                val info = p.optJSONArray("imageinfo")?.optJSONObject(0) ?: return@forEach
                val mime = info.optString("mime"); if (!mime.startsWith("image/") || mime == "image/svg+xml") return@forEach
                val url = info.optString("thumburl").ifEmpty { info.optString("url") }
                if (url.isNotEmpty()) out.add((p.optString("title").replace("File:", "")) to url)
            }
        }
        return out
    }
    private suspend fun generateImage(prompt: String): String? = withContext(Dispatchers.IO) {
        if (prompt.isEmpty()) return@withContext null
        val e = enc(prompt).replace("+", "%20")
        val url = "https://image.pollinations.ai/prompt/$e?width=1024&height=1024&nologo=true&enhance=true&model=flux&seed=${(0..999999).random()}"
        runCatching {
            http.newCall(Request.Builder().url(url).build()).execute().use { r ->
                val b = r.body?.bytes()
                if (r.isSuccessful && b != null && b.size > 5000) return@withContext Supa.uploadFile(b, "jpg", "image/jpeg")
            }
        }
        url
    }
    /** Build a new app, or UPDATE in place when the name already exists. */
    private suspend fun buildApp(name: String, html: String): String = withContext(Dispatchers.IO) {
        val ws = workspaceId ?: return@withContext "No workspace."
        if (html.length < 40) return@withContext "The HTML was empty — write the full page."
        val appName = name.ifEmpty { "App" }
        val existing = Supa.select("apps?workspace_id=eq.$ws&select=id,name&limit=60")
        var matchId: String? = null
        for (i in 0 until existing.length()) {
            val o = existing.optJSONObject(i) ?: continue
            if (o.optString("name").trim().equals(appName.trim(), ignoreCase = true)) {
                matchId = o.optString("id"); break
            }
        }
        if (matchId != null) {
            Supa.update("apps?id=eq.$matchId", JSONObject().put("html", html))
            "✅ Updated \"$appName\" in place — the Apps page now shows the new version."
        } else {
            val row = JSONObject().put("workspace_id", ws).put("name", appName).put("html", html)
            Supa.userId?.let { row.put("created_by", it) }
            Supa.insert("apps", row, false)
            "✅ Built and published \"$appName\" to the Apps page."
        }
    }

    private suspend fun listApps(): String = withContext(Dispatchers.IO) {
        val ws = workspaceId ?: return@withContext "No workspace."
        val rows = Supa.select("apps?workspace_id=eq.$ws&select=name&order=created_at.desc&limit=40")
        val names = (0 until rows.length()).mapNotNull { rows.optJSONObject(it)?.optString("name") }
        if (names.isEmpty()) "No apps built yet." else "Existing apps: " + names.joinToString(", ")
    }

    private suspend fun getApp(name: String): String = withContext(Dispatchers.IO) {
        val ws = workspaceId ?: return@withContext "No workspace."
        val rows = Supa.select("apps?workspace_id=eq.$ws&select=name,html&limit=60")
        for (i in 0 until rows.length()) {
            val o = rows.optJSONObject(i) ?: continue
            if (o.optString("name").trim().equals(name.trim(), ignoreCase = true)) {
                val html = o.optString("html")
                return@withContext "Current HTML of \"${o.optString("name")}\" (${html.length} chars):\n" + html.take(14000)
            }
        }
        "No app named \"$name\". " + listApps()
    }

    /** Keyless weather via Open-Meteo (geocoding + forecast). */
    private fun weather(city: String): String {
        if (city.isBlank()) return "Which city?"
        val geo = get("https://geocoding-api.open-meteo.com/v1/search?name=${enc(city)}&count=1") ?: return "Couldn't find $city."
        val loc = runCatching { JSONObject(geo).getJSONArray("results").getJSONObject(0) }.getOrNull()
            ?: return "Couldn't find $city."
        val lat = loc.optDouble("latitude"); val lon = loc.optDouble("longitude")
        val place = loc.optString("name") + (loc.optString("country", "").takeIf { it.isNotBlank() }?.let { ", $it" } ?: "")
        val f = get("https://api.open-meteo.com/v1/forecast?latitude=$lat&longitude=$lon&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3")
            ?: return "Weather service unavailable."
        return runCatching {
            val j = JSONObject(f); val cur = j.getJSONObject("current"); val d = j.getJSONObject("daily")
            val sb = StringBuilder("Weather in $place: ${cur.optDouble("temperature_2m")}°C (feels ${cur.optDouble("apparent_temperature")}°C), wind ${cur.optDouble("wind_speed_10m")} km/h.\n")
            val days = d.getJSONArray("time")
            for (i in 0 until minOf(3, days.length()))
                sb.append("${days.getString(i)}: ${d.getJSONArray("temperature_2m_min").optDouble(i)}–${d.getJSONArray("temperature_2m_max").optDouble(i)}°C, rain ${d.getJSONArray("precipitation_probability_max").optInt(i)}%\n")
            sb.toString()
        }.getOrDefault("Weather service unavailable.")
    }
    private fun worldCup(): String {
        val today = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
        return webSearch("FIFA World Cup 2026 results standings fixtures $today")
    }

    private fun get(url: String): String? = runCatching {
        val req = Request.Builder().url(url).addHeader("User-Agent", "Mozilla/5.0 (Android) AskAI").build()
        http.newCall(req).execute().use { r -> if (r.isSuccessful) r.body?.string() else null }
    }.getOrNull()
    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
    private fun stripHtml(s: String) = s
        .replace(Regex("(?s)<script.*?</script>"), " ").replace(Regex("(?s)<style.*?</style>"), " ")
        .replace(Regex("<[^>]+>"), " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
        .replace("&quot;", "\"").replace("&#39;", "'").replace("&nbsp;", " ")
        .replace(Regex("\\s+"), " ").trim()
}
