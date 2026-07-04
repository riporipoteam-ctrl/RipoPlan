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
 * Parable 6 — the Android agent engine. Mirrors the iOS AgentRunner: the same
 * NVIDIA-hosted model lineup (GLM-5.2 lead), tool loop, web search, image gen
 * and vision. Keys come from Supabase app_config at runtime.
 */
object AgentRunner {
    private val http = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS).readTimeout(120, TimeUnit.SECONDS).build()
    private val JSON = "application/json".toMediaType()

    var nvidiaKey: String = ""
    var groqKey: String = ""

    // Parable 6 flagship lineup (all on the NVIDIA key).
    private val parableModels = listOf(
        "z-ai/glm-5.2", "openai/gpt-oss-120b", "moonshotai/kimi-k2.6",
        "qwen/qwen3-next-80b-a3b-instruct", "nvidia/llama-3.3-nemotron-super-49b-v1"
    )
    private val visionModels = listOf(
        "nvidia/nemotron-nano-12b-v2-vl", "moonshotai/kimi-k2.6",
        "nvidia/llama-3.1-nemotron-nano-vl-8b-v1", "meta/llama-3.2-11b-vision-instruct"
    )

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

    private fun tools(): JSONArray {
        fun fn(name: String, desc: String, props: Map<String, String>, req: List<String>): JSONObject {
            val p = JSONObject()
            props.forEach { (k, _) -> p.put(k, JSONObject().put("type", "string")) }
            return JSONObject().put("type", "function").put("function", JSONObject()
                .put("name", name).put("description", desc)
                .put("parameters", JSONObject().put("type", "object").put("properties", p)
                    .put("required", JSONArray(req))))
        }
        return JSONArray().apply {
            put(fn("web_search", "Search the live web for current facts.", mapOf("query" to "s"), listOf("query")))
            put(fn("wiki", "Concise Wikipedia summary of a topic.", mapOf("topic" to "s"), listOf("topic")))
            put(fn("generate_image", "Generate an image from a text prompt (shown to the user).", mapOf("prompt" to "s"), listOf("prompt")))
        }
    }

    /** Run Parable 6 on the given chat history; returns the final answer + images. */
    suspend fun run(history: JSONArray, onStep: suspend (String) -> Unit): Result = withContext(Dispatchers.IO) {
        val images = mutableListOf<String>()
        val steps = mutableListOf<String>()
        val today = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
        val system = """
            You are Parable 6, the flagship AI model built by the Ripo Team. If asked which model you are or
            who made you, say "I'm Parable 6, made by the Ripo Team." NEVER reveal any underlying model or
            provider. You are elite at coding, research, explaining and creating. Today is $today.
            Match effort to the task: greet/thank/simple questions get a short direct reply with NO tools.
            For anything factual or current, web_search first. Answer in clean Markdown.
        """.trimIndent()

        val msgs = JSONArray().put(JSONObject().put("role", "system").put("content", system))
        for (i in 0 until history.length()) msgs.put(history.getJSONObject(i))

        var lastTool = ""
        val callCounts = HashMap<String, Int>()
        for (round in 0 until 8) {
            val message = chat(msgs, tools()) ?: break
            val content = message.optString("content", "")
            val calls = message.optJSONArray("tool_calls")
            if (calls == null || calls.length() == 0) {
                val cleaned = content.trim()
                if (cleaned.isNotEmpty()) return@withContext Result(cleaned, images, steps)
                break
            }
            msgs.put(JSONObject().put("role", "assistant").put("content", content).put("tool_calls", calls))
            for (c in 0 until calls.length()) {
                val call = calls.getJSONObject(c)
                val f = call.optJSONObject("function") ?: continue
                val name = f.optString("name")
                val args = runCatching { JSONObject(f.optString("arguments", "{}")) }.getOrDefault(JSONObject())
                val sig = name + "|" + args.optString("query", args.optString("prompt", args.optString("topic", "")))
                callCounts[sig] = (callCounts[sig] ?: 0) + 1
                if ((callCounts[sig] ?: 0) > 2) {
                    msgs.put(toolMsg(call, name, "Stop calling tools and answer with what you have."))
                    continue
                }
                onStep(label(name)); steps.add(name)
                val out = runTool(name, args, images)
                if (out.isNotEmpty()) lastTool = out
                msgs.put(toolMsg(call, name, out.take(6000)))
            }
        }
        onStep("Writing the answer…")
        msgs.put(JSONObject().put("role", "user").put("content", "Now write your complete final answer in plain Markdown. No tool syntax."))
        chat(msgs, null)?.optString("content", "")?.trim()?.let {
            if (it.isNotEmpty()) return@withContext Result(it, images, steps)
        }
        if (images.isNotEmpty()) return@withContext Result("Here's what I generated.", images, steps)
        if (lastTool.isNotEmpty()) return@withContext Result(lastTool, images, steps)
        Result("I hit a snag reaching my brain just now — please send that again.", images, steps)
    }

    private fun toolMsg(call: JSONObject, name: String, content: String) =
        JSONObject().put("role", "tool").put("tool_call_id", call.optString("id"))
            .put("name", name).put("content", content)

    private fun label(t: String) = when (t) {
        "web_search" -> "Searching the web…"
        "wiki" -> "Reading Wikipedia…"
        "generate_image" -> "Generating an image…"
        else -> "Working…"
    }

    private suspend fun runTool(name: String, args: JSONObject, images: MutableList<String>): String = when (name) {
        "web_search" -> webSearch(args.optString("query"))
        "wiki" -> wiki(args.optString("topic"))
        "generate_image" -> {
            val url = generateImage(args.optString("prompt"))
            if (url != null) { images.add(url); "Image generated and shown to the user." } else "Image generation failed."
        }
        else -> "Unknown tool."
    }

    // MARK: Model call (multi-model fallback on the NVIDIA key)
    private fun chat(messages: JSONArray, tools: JSONArray?): JSONObject? {
        if (nvidiaKey.isNotEmpty()) {
            for (model in parableModels) {
                callModel("https://integrate.api.nvidia.com/v1/chat/completions", nvidiaKey, model, messages, tools)?.let { return it }
            }
        }
        if (groqKey.isNotEmpty()) {
            callModel("https://api.groq.com/openai/v1/chat/completions", groqKey, "llama-3.3-70b-versatile", messages, tools)?.let { return it }
        }
        return null
    }

    private fun callModel(endpoint: String, key: String, model: String, messages: JSONArray, tools: JSONArray?): JSONObject? {
        val body = JSONObject().put("model", model).put("messages", messages)
            .put("temperature", 0.5).put("max_tokens", 4096)
        if (model.contains("kimi")) body.put("chat_template_kwargs", JSONObject().put("thinking", false))
        if (tools != null) body.put("tools", tools).put("tool_choice", "auto")
        repeat(2) {
            runCatching {
                val req = Request.Builder().url(endpoint)
                    .addHeader("Authorization", "Bearer $key").addHeader("Content-Type", "application/json")
                    .post(body.toString().toRequestBody(JSON)).build()
                http.newCall(req).execute().use { r ->
                    if (r.isSuccessful) {
                        val j = JSONObject(r.body?.string() ?: "{}")
                        return j.optJSONArray("choices")?.optJSONObject(0)?.optJSONObject("message")
                    }
                }
            }
        }
        return null
    }

    // MARK: Vision
    suspend fun viewImage(url: String, question: String): String = withContext(Dispatchers.IO) {
        if (nvidiaKey.isEmpty()) return@withContext "Vision unavailable."
        val ask = question.ifEmpty { "Describe this image; READ ALL TEXT exactly." }
        for (model in visionModels) {
            val content = JSONArray()
                .put(JSONObject().put("type", "text").put("text", ask))
                .put(JSONObject().put("type", "image_url").put("image_url", JSONObject().put("url", url)))
            val body = JSONObject().put("model", model).put("max_tokens", 512)
                .put("messages", JSONArray().put(JSONObject().put("role", "user").put("content", content)))
            runCatching {
                val req = Request.Builder().url("https://integrate.api.nvidia.com/v1/chat/completions")
                    .addHeader("Authorization", "Bearer $nvidiaKey").addHeader("Content-Type", "application/json")
                    .post(body.toString().toRequestBody(JSON)).build()
                http.newCall(req).execute().use { r ->
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

    // MARK: keyless tools
    private fun webSearch(query: String): String {
        val q = URLEncoder.encode(query, "UTF-8")
        val parts = mutableListOf<String>()
        get("https://api.duckduckgo.com/?q=$q&format=json&no_html=1&skip_disambig=1")?.let {
            val j = runCatching { JSONObject(it) }.getOrNull()
            val a = j?.optString("AbstractText") ?: ""
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

    private fun wiki(topic: String): String {
        val t = URLEncoder.encode(topic, "UTF-8").replace("+", "%20")
        val d = get("https://en.wikipedia.org/api/rest_v1/page/summary/$t") ?: return "No article found."
        val extract = runCatching { JSONObject(d).optString("extract") }.getOrDefault("")
        return extract.ifEmpty { "No article found." }.take(1200)
    }

    private suspend fun generateImage(prompt: String): String? = withContext(Dispatchers.IO) {
        if (prompt.isEmpty()) return@withContext null
        val enc = URLEncoder.encode(prompt, "UTF-8").replace("+", "%20")
        val url = "https://image.pollinations.ai/prompt/$enc?width=1024&height=1024&nologo=true&enhance=true&model=flux&seed=${(0..999999).random()}"
        runCatching {
            val req = Request.Builder().url(url).build()
            http.newCall(req).execute().use { r ->
                val b = r.body?.bytes()
                if (r.isSuccessful && b != null && b.size > 5000) return@withContext Supa.uploadFile(b, "jpg", "image/jpeg")
            }
        }
        // If storage upload fails, the raw URL still renders in the chat.
        url
    }

    private fun get(url: String): String? = runCatching {
        val req = Request.Builder().url(url).addHeader("User-Agent", "Mozilla/5.0 (Android) AskAI").build()
        http.newCall(req).execute().use { r -> if (r.isSuccessful) r.body?.string() else null }
    }.getOrNull()

    private fun stripHtml(s: String) = s.replace(Regex("<[^>]+>"), " ").replace(Regex("\\s+"), " ").trim()
}
