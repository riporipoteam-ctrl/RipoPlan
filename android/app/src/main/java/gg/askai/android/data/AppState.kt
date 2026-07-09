package gg.askai.android.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import gg.askai.android.agent.AgentRunner
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

data class Thread(val id: String, var title: String, val lastActivity: String?)

/**
 * One chat message. [save] tracks cloud persistence so the UI can show it:
 * "" (loaded from the server) · "saving" · "saved" · "failed".
 */
data class Msg(val id: String, val sender: String, var content: String, var status: String,
               val agentId: String?, val images: List<String> = emptyList(),
               val save: String = "")

class AppState : ViewModel() {
    var authed by mutableStateOf(Supa.isAuthed)
    var booting by mutableStateOf(true)
    var workspaceId: String? = null
    var displayName by mutableStateOf("You")
    var userEmail by mutableStateOf(Supa.email ?: "")
    var avatarUrl by mutableStateOf<String?>(null)
    var workspaceName by mutableStateOf("")

    val threads = mutableStateListOf<Thread>()
    val messages = mutableStateListOf<Msg>()
    var currentThread by mutableStateOf<String?>(null)
    var sending by mutableStateOf(false)
    var loadingThreads by mutableStateOf(false)
    var loadingMessages by mutableStateOf(false)
    var refreshing by mutableStateOf(false)

    /** One-shot user-facing notice (shown as a snackbar, then cleared). */
    var toast by mutableStateOf<String?>(null)

    /** Set when we couldn't reach the workspace at boot — shows a retry UI. */
    var loadError by mutableStateOf<String?>(null)

    var showSettings by mutableStateOf(false)
    var themeMode by mutableStateOf(Supa.themeMode)

    /** Failed message rows kept for "tap to retry" (local id → row JSON). */
    private val pendingSaves = HashMap<String, JSONObject>()

    fun setTheme(mode: String) { themeMode = mode; Supa.themeMode = mode }

    fun boot() {
        viewModelScope.launch {
            authed = Supa.isAuthed
            if (authed) {
                Supa.refreshIfPossible()
                if (Supa.sessionExpired) {
                    signOut(); toast = "Your session expired — please sign in again."
                } else loadAll()
            }
            booting = false
        }
    }

    fun signIn(email: String, password: String, onErr: (String) -> Unit) {
        viewModelScope.launch {
            val err = Supa.signIn(email, password)
            if (err == null) { authed = true; loadAll() } else onErr(err)
        }
    }

    fun signUp(email: String, password: String, onErr: (String) -> Unit) {
        viewModelScope.launch {
            val err = Supa.signUp(email, password)
            if (err == null) { authed = true; loadAll() } else onErr(err)
        }
    }

    fun signOut() {
        Supa.signOut(); authed = false; showSettings = false
        threads.clear(); messages.clear(); pendingSaves.clear()
        currentThread = null; workspaceId = null
        displayName = "You"; userEmail = ""; avatarUrl = null; workspaceName = ""
    }

    /**
     * Load profile, workspace and threads. Retries the workspace lookup a few
     * times (fresh sign-ups race the server-side bootstrap; flaky networks
     * would otherwise leave the app permanently unable to save chats).
     */
    private suspend fun loadAll() {
        loadError = null
        AgentRunner.loadKeys()
        val uid = Supa.userId ?: return
        userEmail = Supa.email ?: ""
        Supa.selectOrNull("profiles?id=eq.$uid&select=*&limit=1")?.optJSONObject(0)?.let {
            displayName = it.optString("display_name").ifEmpty { "You" }
            avatarUrl = it.optString("avatar_url").ifEmpty { null }
            if (userEmail.isEmpty()) userEmail = it.optString("email")
        }
        for (attempt in 0 until 4) {
            val mems = Supa.selectOrNull("workspace_members?user_id=eq.$uid&select=workspace_id&limit=1")
            workspaceId = mems?.optJSONObject(0)?.optString("workspace_id")?.ifEmpty { null }
            if (workspaceId != null) break
            delay(700L * (attempt + 1))
        }
        val ws = workspaceId
        if (ws == null) {
            loadError = "Couldn't reach your workspace. Check your connection and pull to retry."
            return
        }
        Supa.selectOrNull("workspaces?id=eq.$ws&select=name&limit=1")?.optJSONObject(0)?.let {
            workspaceName = it.optString("name")
        }
        loadThreadsNow()
    }

    fun loadThreads() { viewModelScope.launch { loadThreadsNow() } }

    private suspend fun loadThreadsNow() {
        val ws = workspaceId ?: return
        loadingThreads = true
        val rows = Supa.selectOrNull("threads?workspace_id=eq.$ws&select=*&order=last_activity_at.desc&limit=60")
        if (rows != null) {
            val list = mutableListOf<Thread>()
            for (i in 0 until rows.length()) {
                val o = rows.getJSONObject(i)
                list.add(Thread(o.optString("id"),
                    o.optString("title", "New chat").ifEmpty { "New chat" },
                    o.optString("last_activity_at", null)))
            }
            threads.clear(); threads.addAll(list)
        }
        loadingThreads = false
    }

    fun openThread(id: String?) {
        currentThread = id; messages.clear()
        if (id != null) viewModelScope.launch { loadMessages(id) }
    }

    private suspend fun loadMessages(tid: String) {
        loadingMessages = true
        val rows = Supa.selectOrNull("messages?thread_id=eq.$tid&select=*&order=created_at.asc&limit=200")
        if (rows == null) {
            if (currentThread == tid) toast = "Couldn't load this chat — check your connection."
            loadingMessages = false
            return
        }
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
        // Only apply if the user is still looking at this thread.
        if (currentThread == tid) { messages.clear(); messages.addAll(list) }
        loadingMessages = false
    }

    fun deleteThread(id: String) {
        viewModelScope.launch {
            val ok = Supa.delete("threads?id=eq.$id")
            if (ok) {
                threads.removeAll { it.id == id }
                if (currentThread == id) { currentThread = null; messages.clear() }
            } else toast = "Couldn't delete the chat — try again."
        }
    }

    fun updateDisplayName(name: String) {
        val n = name.trim()
        if (n.isEmpty()) return
        viewModelScope.launch {
            val uid = Supa.userId ?: return@launch
            if (Supa.update("profiles?id=eq.$uid", JSONObject().put("display_name", n))) {
                displayName = n; toast = "Name updated."
            } else toast = "Couldn't save your name — try again."
        }
    }

    fun renameWorkspace(name: String) {
        val n = name.trim()
        if (n.isEmpty()) return
        viewModelScope.launch {
            val ws = workspaceId ?: return@launch
            if (Supa.update("workspaces?id=eq.$ws", JSONObject().put("name", n))) {
                workspaceName = n; toast = "Workspace renamed."
            } else toast = "Couldn't rename the workspace — try again."
        }
    }

    /** Settings → Refresh: re-pull everything from Supabase. */
    fun refreshData() {
        if (refreshing) return
        refreshing = true
        viewModelScope.launch {
            Supa.refreshIfPossible()
            if (Supa.sessionExpired) {
                signOut(); toast = "Your session expired — please sign in again."
            } else {
                loadAll()
                currentThread?.let { loadMessages(it) }
                toast = if (loadError == null) "Everything is up to date." else "Refresh failed — check your connection."
            }
            refreshing = false
        }
    }

    // MARK: Sending

    fun send(text: String, imageBytes: ByteArray? = null) {
        val body = text.trim()
        if ((body.isEmpty() && imageBytes == null) || sending) return
        sending = true
        viewModelScope.launch {
            try { doSend(body, imageBytes) } finally { sending = false }
        }
    }

    private suspend fun doSend(body: String, imageBytes: ByteArray?) {
        // Make sure we have a workspace — recover if boot failed earlier.
        if (workspaceId == null) loadAll()
        val ws = workspaceId
        if (ws == null) {
            toast = "Not connected to your workspace yet — message not sent. Check your internet and try again."
            return
        }
        val uid = Supa.userId ?: run {
            toast = "You're signed out — please sign in again."
            signOut(); return
        }

        // Snapshot the visible history NOW — the user may switch threads while
        // the network calls below are in flight.
        val prior = messages.toList()

        // Upload the attached photo first so the message row can reference it.
        var imageUrl: String? = null
        if (imageBytes != null) {
            imageUrl = Supa.uploadFile(imageBytes, "jpg", "image/jpeg")
            if (imageUrl == null) toast = "Couldn't upload the photo — sending the text without it."
        }

        // Create the thread on first message.
        var tid = currentThread
        if (tid == null) {
            val title = (body.ifEmpty { "Image" }).split(" ").take(6).joinToString(" ").take(60)
            val row = JSONObject().put("workspace_id", ws).put("title", title)
                .put("created_by", uid).put("last_activity_at", isoNow())
            tid = Supa.insert("threads", row)?.optJSONObject(0)?.optString("id")?.ifEmpty { null }
            if (tid == null) {
                toast = sendFailureNotice("Couldn't start the chat — nothing was saved.")
                return
            }
            currentThread = tid
            threads.add(0, Thread(tid, title, isoNow()))
        } else {
            Supa.update("threads?id=eq.$tid", JSONObject().put("last_activity_at", isoNow()))
        }

        // Show + persist the user message.
        val userLocalId = "u${System.currentTimeMillis()}"
        val userImgs = if (imageUrl != null) listOf(imageUrl) else emptyList()
        if (currentThread == tid) messages.add(Msg(userLocalId, "user", body, "complete", null, userImgs, save = "saving"))
        val userRow = JSONObject().put("workspace_id", ws).put("thread_id", tid)
            .put("sender_type", "user").put("user_id", uid).put("content", body).put("status", "complete")
        if (imageUrl != null) {
            userRow.put("attachments", JSONArray().put(
                JSONObject().put("type", "image").put("url", imageUrl).put("name", "Photo")))
        }
        persistMessage(userLocalId, userRow)

        // Agent placeholder while Parable works.
        val phId = "p${System.currentTimeMillis()}"
        if (currentThread == tid) messages.add(Msg(phId, "agent", "", "thinking", null))

        // Build model history from the snapshot (skip placeholders/empties),
        // then append this turn — with a vision read of the photo if attached.
        val history = JSONArray()
        for (m in prior) {
            if (m.status == "thinking" || m.content.isEmpty()) continue
            history.put(JSONObject().put("role", if (m.sender == "user") "user" else "assistant").put("content", m.content))
        }
        var turn = body
        if (imageUrl != null) {
            val seen = AgentRunner.viewImage(imageUrl, body)
            turn = (body.ifEmpty { "I attached an image." }) + "\n\n[$seen]"
        }
        history.put(JSONObject().put("role", "user").put("content", turn))

        val res = AgentRunner.run(history) { _ ->
            updateById(phId) { it.copy(content = "", status = "thinking") }
        }

        // Show the reply (if the user is still here) and persist it regardless.
        updateById(phId) { it.copy(content = res.text, status = "complete", images = res.images, save = "saving") }
        val att = JSONArray()
        res.images.forEach { att.put(JSONObject().put("type", "image").put("url", it).put("name", "Generated image")) }
        val agentRow = JSONObject().put("workspace_id", ws).put("thread_id", tid)
            .put("sender_type", "agent").put("content", res.text).put("status", "complete")
        if (att.length() > 0) agentRow.put("attachments", att)
        persistMessage(phId, agentRow)

        Supa.update("threads?id=eq.$tid", JSONObject().put("last_activity_at", isoNow()))
        loadThreadsNow()
    }

    /** Insert one message row; mark the local bubble saved/failed accordingly. */
    private suspend fun persistMessage(localId: String, row: JSONObject) {
        val ok = Supa.insert("messages", row, returning = false) != null
        if (ok) {
            pendingSaves.remove(localId)
            updateById(localId) { it.copy(save = "saved") }
        } else {
            pendingSaves[localId] = row
            updateById(localId) { it.copy(save = "failed") }
            toast = sendFailureNotice("A message couldn't be saved to the cloud — tap \"Retry\" under it.")
        }
    }

    /** Re-try persisting a message whose save failed (tap on the red label). */
    fun retrySave(localId: String) {
        val row = pendingSaves[localId] ?: return
        viewModelScope.launch {
            updateById(localId) { it.copy(save = "saving") }
            persistMessage(localId, row)
        }
    }

    private fun sendFailureNotice(base: String): String {
        if (Supa.sessionExpired) { signOut(); return "Your session expired — please sign in again." }
        return base
    }

    /** Safely rewrite a message by id — immune to thread switches mid-flight. */
    private fun updateById(id: String, transform: (Msg) -> Msg) {
        val i = messages.indexOfFirst { it.id == id }
        if (i >= 0) messages[i] = transform(messages[i])
    }

    private fun isoNow(): String {
        val f = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US)
        f.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return f.format(java.util.Date())
    }
}
