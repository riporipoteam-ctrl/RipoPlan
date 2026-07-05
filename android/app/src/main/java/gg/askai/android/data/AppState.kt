package gg.askai.android.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import gg.askai.android.agent.AgentRunner
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

data class Thread(val id: String, var title: String, val lastActivity: String?)
data class Msg(val id: String, val sender: String, var content: String, var status: String,
               val agentId: String?, val images: List<String> = emptyList())
data class Attachment(val url: String, val type: String, val name: String)
data class AppItem(val id: String, val name: String, val html: String)

class AppState : ViewModel() {
    var authed by mutableStateOf(Supa.isAuthed)
    var booting by mutableStateOf(true)
    var workspaceId: String? = null
    var displayName by mutableStateOf("You")

    // In-app navigation: "chat" | "settings" | "apps"
    var route by mutableStateOf("chat")

    // Model brain: "parable" (Parable 6) | "turbo" (fast)
    var brain by mutableStateOf(Supa.getPref("brain", "parable"))
    var instructions by mutableStateOf(Supa.getPref("instructions", ""))

    val threads = mutableStateListOf<Thread>()
    val messages = mutableStateListOf<Msg>()
    val pending = mutableStateListOf<Attachment>()   // staged uploads for next send
    val apps = mutableStateListOf<AppItem>()
    var currentThread by mutableStateOf<String?>(null)
    var sending by mutableStateOf(false)
    var uploading by mutableStateOf(false)

    fun boot() {
        viewModelScope.launch {
            authed = Supa.isAuthed
            if (authed) { Supa.refreshIfPossible(); loadAll() }
            booting = false
        }
    }

    fun signIn(email: String, password: String, onErr: (String) -> Unit) {
        viewModelScope.launch {
            if (Supa.signIn(email, password)) { authed = true; loadAll() }
            else onErr("Wrong email or password.")
        }
    }
    fun signUp(email: String, password: String, onErr: (String) -> Unit) {
        viewModelScope.launch {
            if (Supa.signUp(email, password)) { authed = true; loadAll() }
            else onErr("Couldn't create the account.")
        }
    }
    fun signOut() { Supa.signOut(); authed = false; route = "chat"; threads.clear(); messages.clear(); apps.clear() }

    fun selectBrain(b: String) { brain = b; Supa.setPref("brain", b); AgentRunner.brain = b }
    fun saveInstructions(v: String) { instructions = v; Supa.setPref("instructions", v); AgentRunner.instructions = v }

    private suspend fun loadAll() {
        AgentRunner.loadKeys()
        AgentRunner.brain = brain
        AgentRunner.instructions = instructions
        val uid = Supa.userId ?: return
        val profs = Supa.select("profiles?id=eq.$uid&select=*&limit=1")
        profs.optJSONObject(0)?.let { displayName = it.optString("display_name", "You") }
        val mems = Supa.select("workspace_members?user_id=eq.$uid&select=workspace_id&limit=1")
        workspaceId = mems.optJSONObject(0)?.optString("workspace_id")
        AgentRunner.workspaceId = workspaceId
        loadThreads()
        viewModelScope.launch { runCatching { AgentRunner.refreshWorldBrain() } }
    }

    fun loadThreads() {
        viewModelScope.launch {
            val ws = workspaceId ?: return@launch
            val rows = Supa.select("threads?workspace_id=eq.$ws&select=*&order=last_activity_at.desc&limit=60")
            threads.clear()
            for (i in 0 until rows.length()) {
                val o = rows.getJSONObject(i)
                threads.add(Thread(o.optString("id"),
                    o.optString("title", "New chat").ifEmpty { "New chat" },
                    o.optString("last_activity_at", null)))
            }
        }
    }

    fun loadApps() {
        viewModelScope.launch {
            val ws = workspaceId ?: return@launch
            val rows = Supa.select("apps?workspace_id=eq.$ws&select=id,name,html&order=created_at.desc&limit=60")
            apps.clear()
            for (i in 0 until rows.length()) {
                val o = rows.getJSONObject(i)
                apps.add(AppItem(o.optString("id"), o.optString("name", "App"), o.optString("html", "")))
            }
        }
    }

    fun openThread(id: String?) {
        currentThread = id; messages.clear(); pending.clear(); route = "chat"
        if (id != null) viewModelScope.launch { loadMessages(id) }
    }

    private suspend fun loadMessages(tid: String) {
        val rows = Supa.select("messages?thread_id=eq.$tid&select=*&order=created_at.asc&limit=200")
        val list = mutableListOf<Msg>()
        for (i in 0 until rows.length()) {
            val o = rows.getJSONObject(i)
            val imgs = mutableListOf<String>()
            o.optJSONArray("attachments")?.let { a ->
                for (j in 0 until a.length()) {
                    val at = a.optJSONObject(j) ?: continue
                    if (at.optString("type") == "image") imgs.add(at.optString("url"))
                }
            }
            list.add(Msg(o.optString("id"), o.optString("sender_type"), o.optString("content", ""),
                o.optString("status", "complete"), o.optString("agent_id", null), imgs))
        }
        messages.clear(); messages.addAll(list)
    }

    /** Upload picked bytes to Storage and stage them for the next message. */
    fun uploadImage(bytes: ByteArray, ext: String, contentType: String) {
        uploading = true
        viewModelScope.launch {
            val url = Supa.uploadFile(bytes, ext, contentType)
            if (url != null) pending.add(Attachment(url, "image", "Image"))
            uploading = false
        }
    }
    fun removePending(a: Attachment) { pending.remove(a) }

    fun send(text: String) {
        val body = text.trim()
        val atts = pending.toList()
        if ((body.isEmpty() && atts.isEmpty()) || sending) return
        sending = true
        pending.clear()
        viewModelScope.launch {
            val ws = workspaceId ?: run { sending = false; return@launch }
            val uid = Supa.userId ?: run { sending = false; return@launch }
            var tid = currentThread
            val titleSeed = body.ifBlank { "Image" }
            if (tid == null) {
                val row = JSONObject().put("workspace_id", ws)
                    .put("title", titleSeed.split(" ").take(6).joinToString(" ").take(60))
                    .put("created_by", uid).put("last_activity_at", isoNow())
                val res = Supa.insert("threads", row)
                tid = res.optJSONObject(0)?.optString("id") ?: run { sending = false; return@launch }
                currentThread = tid
            } else {
                Supa.update("threads?id=eq.$tid", JSONObject().put("last_activity_at", isoNow()))
            }
            // user message — persist attachments, and give the model image markers
            val userAtt = JSONArray()
            atts.forEach { userAtt.put(JSONObject().put("type", it.type).put("url", it.url).put("name", it.name)) }
            val userRow = JSONObject().put("workspace_id", ws).put("thread_id", tid)
                .put("sender_type", "user").put("user_id", uid).put("content", body).put("status", "complete")
            if (userAtt.length() > 0) userRow.put("attachments", userAtt)
            Supa.insert("messages", userRow, false)
            messages.add(Msg("u${System.currentTimeMillis()}", "user", body, "complete", null, atts.map { it.url }))

            val ph = Msg("p${System.currentTimeMillis()}", "agent", "", "thinking", null)
            messages.add(ph)
            val phIdx = messages.size - 1

            // Build history — append image markers to the last user turn.
            val history = JSONArray()
            for (m in messages) {
                if (m.status == "thinking") continue
                val role = if (m.sender == "user") "user" else "assistant"
                var c = m.content
                if (m.sender == "user" && m.images.isNotEmpty())
                    c += m.images.joinToString("") { "\n[Uploaded image: $it]" }
                if (c.isBlank()) continue
                history.put(JSONObject().put("role", role).put("content", c))
            }
            val res = AgentRunner.run(history) { step ->
                if (phIdx < messages.size) messages[phIdx] = messages[phIdx].copy(content = "", status = step)
            }
            messages[phIdx] = messages[phIdx].copy(content = res.text, status = "complete", images = res.images)

            val att = JSONArray()
            res.images.forEach { att.put(JSONObject().put("type", "image").put("url", it).put("name", "Generated image")) }
            val patch = JSONObject().put("workspace_id", ws).put("thread_id", tid)
                .put("sender_type", "agent").put("content", res.text).put("status", "complete")
            if (att.length() > 0) patch.put("attachments", att)
            Supa.insert("messages", patch, false)
            Supa.update("threads?id=eq.$tid", JSONObject().put("last_activity_at", isoNow()))
            maybeTitle(tid, body)
            loadThreads()
            sending = false
        }
    }

    /** Regenerate the last assistant reply. */
    fun regenerate() {
        if (sending || messages.isEmpty()) return
        val lastUser = messages.lastOrNull { it.sender == "user" } ?: return
        // Drop the trailing assistant message from view, then re-send.
        while (messages.isNotEmpty() && messages.last().sender != "user") messages.removeAt(messages.size - 1)
        val text = lastUser.content
        // Re-stage its images so send() re-attaches markers.
        pending.clear()
        lastUser.images.forEach { pending.add(Attachment(it, "image", "Image")) }
        messages.removeAt(messages.indexOfFirst { it.id == lastUser.id }.coerceAtLeast(0))
        send(text)
    }

    /** Ask the model for a short chat title after the first exchange. */
    private fun maybeTitle(tid: String, firstMsg: String) {
        val thread = threads.firstOrNull { it.id == tid }
        val looksAuto = thread == null || thread.title.isBlank() ||
            thread.title == firstMsg.split(" ").take(6).joinToString(" ").take(60)
        if (!looksAuto) return
        viewModelScope.launch {
            val t = AgentRunner.titleFor(firstMsg) ?: return@launch
            Supa.update("threads?id=eq.$tid", JSONObject().put("title", t))
            val idx = threads.indexOfFirst { it.id == tid }
            if (idx >= 0) threads[idx] = threads[idx].copy(title = t)
        }
    }

    private fun isoNow(): String {
        val f = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US)
        f.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return f.format(java.util.Date())
    }
}
