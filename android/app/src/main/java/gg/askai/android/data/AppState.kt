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

class AppState : ViewModel() {
    var authed by mutableStateOf(Supa.isAuthed)
    var booting by mutableStateOf(true)
    var workspaceId: String? = null
    var displayName by mutableStateOf("You")

    val threads = mutableStateListOf<Thread>()
    val messages = mutableStateListOf<Msg>()
    var currentThread by mutableStateOf<String?>(null)
    var sending by mutableStateOf(false)

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
    fun signOut() { Supa.signOut(); authed = false; threads.clear(); messages.clear() }

    private suspend fun loadAll() {
        AgentRunner.loadKeys()
        val uid = Supa.userId ?: return
        val profs = Supa.select("profiles?id=eq.$uid&select=*&limit=1")
        profs.optJSONObject(0)?.let { displayName = it.optString("display_name", "You") }
        val mems = Supa.select("workspace_members?user_id=eq.$uid&select=workspace_id&limit=1")
        workspaceId = mems.optJSONObject(0)?.optString("workspace_id")
        loadThreads()
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

    fun openThread(id: String?) {
        currentThread = id; messages.clear()
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

    fun send(text: String) {
        val body = text.trim()
        if (body.isEmpty() || sending) return
        sending = true
        viewModelScope.launch {
            val ws = workspaceId ?: run { sending = false; return@launch }
            val uid = Supa.userId ?: run { sending = false; return@launch }
            var tid = currentThread
            // Create thread if new
            if (tid == null) {
                val row = JSONObject().put("workspace_id", ws)
                    .put("title", body.split(" ").take(6).joinToString(" ").take(60))
                    .put("created_by", uid).put("last_activity_at", isoNow())
                val res = Supa.insert("threads", row)
                tid = res.optJSONObject(0)?.optString("id") ?: run { sending = false; return@launch }
                currentThread = tid
            } else {
                Supa.update("threads?id=eq.$tid", JSONObject().put("last_activity_at", isoNow()))
            }
            // user message
            Supa.insert("messages", JSONObject().put("workspace_id", ws).put("thread_id", tid)
                .put("sender_type", "user").put("user_id", uid).put("content", body).put("status", "complete"), false)
            messages.add(Msg("u${System.currentTimeMillis()}", "user", body, "complete", null))
            // agent placeholder
            val ph = Msg("p${System.currentTimeMillis()}", "agent", "", "thinking", null)
            messages.add(ph)
            val phIdx = messages.size - 1

            // Build history for the model
            val history = JSONArray()
            for (m in messages) {
                if (m.status == "thinking" || m.content.isEmpty()) continue
                history.put(JSONObject().put("role", if (m.sender == "user") "user" else "assistant").put("content", m.content))
            }
            val res = AgentRunner.run(history) { step ->
                if (phIdx < messages.size) messages[phIdx] = messages[phIdx].copy(content = "", status = "thinking")
            }
            messages[phIdx] = messages[phIdx].copy(content = res.text, status = "complete", images = res.images)
            // persist agent reply
            val att = JSONArray()
            res.images.forEach { att.put(JSONObject().put("type", "image").put("url", it).put("name", "Generated image")) }
            val patch = JSONObject().put("workspace_id", ws).put("thread_id", tid)
                .put("sender_type", "agent").put("content", res.text).put("status", "complete")
            if (att.length() > 0) patch.put("attachments", att)
            Supa.insert("messages", patch, false)
            Supa.update("threads?id=eq.$tid", JSONObject().put("last_activity_at", isoNow()))
            loadThreads()
            sending = false
        }
    }

    private fun isoNow(): String {
        val f = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US)
        f.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return f.format(java.util.Date())
    }
}
