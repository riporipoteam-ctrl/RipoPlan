package gg.askai.android.data

import android.content.Context
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

data class Thread(val id: String, var title: String, val lastActivity: String?, val agentId: String? = null)

/**
 * One chat message. [save] tracks cloud persistence: "" (from the server) ·
 * "saving" · "saved" · "failed" — the UI only surfaces failures.
 */
data class Msg(val id: String, val sender: String, var content: String, var status: String,
               val agentId: String?, val images: List<String> = emptyList(),
               val save: String = "")

data class Agent(val id: String, val name: String, val role: String, val description: String,
                 val color: String, val avatarUrl: String?, val isSupervisor: Boolean)

data class Notif(val id: String, val title: String, val body: String, val time: String, val read: Boolean)

/** One remembered item — from `knowledge` (titled notes) or `agent_memories`. */
data class MemoryItem(val id: String, val table: String, val title: String, val content: String, val time: String)

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
    val agents = mutableStateListOf<Agent>()
    val notifications = mutableStateListOf<Notif>()
    val memories = mutableStateListOf<MemoryItem>()
    var currentThread by mutableStateOf<String?>(null)

    /** The agent persona for the open chat (null = default Parable 6). */
    var chatAgent by mutableStateOf<Agent?>(null)

    var sending by mutableStateOf(false)
    var loadingThreads by mutableStateOf(false)
    var loadingMessages by mutableStateOf(false)
    var refreshing by mutableStateOf(false)

    /** One-shot user-facing notice (shown as a snackbar, then cleared). */
    var toast by mutableStateOf<String?>(null)

    /** Set when we couldn't reach the workspace at boot — shows a retry UI. */
    var loadError by mutableStateOf<String?>(null)

    /** Which screen is visible: chat · settings · agents · activity · knowledge. */
    var screen by mutableStateOf("chat")

    var themeMode by mutableStateOf(Supa.themeMode)
    var instructions by mutableStateOf(Supa.instructionsPref)

    /** Set when a newer APK is published to the android-latest release. */
    var updateVersion by mutableStateOf<String?>(null)
    var updateUrl by mutableStateOf<String?>(null)
    var updateBusy by mutableStateOf(false)

    /** Failed message rows kept for "tap to retry" (local id → row JSON). */
    private val pendingSaves = HashMap<String, JSONObject>()

    fun setTheme(mode: String) { themeMode = mode; Supa.themeMode = mode }
    fun saveInstructions(text: String) {
        instructions = text.trim(); Supa.instructionsPref = instructions
        toast = if (instructions.isEmpty()) "Custom instructions cleared." else "Custom instructions saved."
    }

    fun boot(ctx: Context? = null) {
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
        ctx?.let { checkForUpdate(it) }
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
        Supa.signOut(); authed = false; screen = "chat"
        threads.clear(); messages.clear(); agents.clear(); notifications.clear(); memories.clear()
        pendingSaves.clear(); currentThread = null; chatAgent = null; workspaceId = null
        displayName = "You"; userEmail = ""; avatarUrl = null; workspaceName = ""
    }

    /**
     * Load profile, workspace, team and threads. Retries the workspace lookup
     * (fresh sign-ups race the server-side bootstrap; flaky networks would
     * otherwise leave the app permanently unable to save chats).
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
        loadAgentsNow()
        loadMemoriesNow()
        loadNotificationsNow()
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
                    o.optString("last_activity_at", null),
                    o.optString("primary_agent_id").ifEmpty { null }))
            }
            threads.clear(); threads.addAll(list)
        }
        loadingThreads = false
    }

    // MARK: Team

    private suspend fun loadAgentsNow() {
        val ws = workspaceId ?: return
        val rows = Supa.selectOrNull("agents?workspace_id=eq.$ws&status=neq.archived&select=*&order=created_at") ?: return
        val list = mutableListOf<Agent>()
        for (i in 0 until rows.length()) {
            val o = rows.getJSONObject(i)
            list.add(Agent(o.optString("id"), o.optString("name"),
                o.optString("role").ifEmpty { "AI Agent" }, o.optString("description"),
                o.optString("avatar_color", "#6e6e80"), o.optString("avatar_url").ifEmpty { null },
                o.optBoolean("is_supervisor", false)))
        }
        agents.clear(); agents.addAll(list)
    }

    fun createAgent(name: String, role: String, description: String) {
        val n = name.trim()
        if (n.isEmpty()) return
        viewModelScope.launch {
            val ws = workspaceId ?: return@launch
            val uid = Supa.userId ?: return@launch
            val row = JSONObject().put("workspace_id", ws).put("name", n)
                .put("handle", n.lowercase().replace(" ", "-"))
                .put("role", role.trim().ifEmpty { "AI Agent" })
                .put("description", description.trim())
                .put("emoji", "robot").put("avatar_color", "#6e6e80")
                .put("system_prompt", "You are $n, ${role.trim().ifEmpty { "an AI agent" }}. ${description.trim()}")
                .put("created_by", uid)
            if (Supa.insert("agents", row, returning = false) != null) {
                toast = "$n joined your team."
                loadAgentsNow()
            } else toast = "Couldn't create the agent — try again."
        }
    }

    fun archiveAgent(id: String) {
        viewModelScope.launch {
            if (Supa.update("agents?id=eq.$id", JSONObject().put("status", "archived"))) {
                agents.removeAll { it.id == id }
            } else toast = "Couldn't remove the agent — try again."
        }
    }

    /** Start a fresh chat with a specific agent from the Agents page. */
    fun startAgentChat(agent: Agent?) {
        chatAgent = agent
        currentThread = null
        messages.clear()
        screen = "chat"
    }

    // MARK: Activity

    private suspend fun loadNotificationsNow() {
        val uid = Supa.userId ?: return
        val rows = Supa.selectOrNull("notifications?user_id=eq.$uid&select=*&order=created_at.desc&limit=40") ?: return
        val list = mutableListOf<Notif>()
        for (i in 0 until rows.length()) {
            val o = rows.getJSONObject(i)
            list.add(Notif(o.optString("id"), o.optString("title").ifEmpty { "Update" },
                o.optString("body"), o.optString("created_at"), o.optBoolean("read", false)))
        }
        notifications.clear(); notifications.addAll(list)
    }

    fun markAllRead() {
        viewModelScope.launch {
            val uid = Supa.userId ?: return@launch
            Supa.update("notifications?user_id=eq.$uid&read=eq.false", JSONObject().put("read", true))
            loadNotificationsNow()
        }
    }

    // MARK: Knowledge & memory

    private suspend fun loadMemoriesNow() {
        val ws = workspaceId ?: return
        val list = mutableListOf<MemoryItem>()
        Supa.selectOrNull("knowledge?workspace_id=eq.$ws&select=id,title,content,created_at&order=created_at.desc&limit=50")?.let { rows ->
            for (i in 0 until rows.length()) {
                val o = rows.getJSONObject(i)
                list.add(MemoryItem(o.optString("id"), "knowledge",
                    o.optString("title").ifEmpty { "Note" }, o.optString("content"), o.optString("created_at")))
            }
        }
        Supa.selectOrNull("agent_memories?workspace_id=eq.$ws&select=id,content,created_at&order=created_at.desc&limit=50")?.let { rows ->
            for (i in 0 until rows.length()) {
                val o = rows.getJSONObject(i)
                list.add(MemoryItem(o.optString("id"), "agent_memories",
                    "Memory", o.optString("content"), o.optString("created_at")))
            }
        }
        memories.clear(); memories.addAll(list.sortedByDescending { it.time })
    }

    fun addKnowledge(title: String, content: String) {
        val t = title.trim(); val c = content.trim()
        if (t.isEmpty() && c.isEmpty()) return
        viewModelScope.launch {
            val ws = workspaceId ?: return@launch
            val row = JSONObject().put("workspace_id", ws).put("title", t.ifEmpty { "Note" })
                .put("content", c).put("source", "user")
            Supa.userId?.let { row.put("created_by", it) }
            if (Supa.insert("knowledge", row, returning = false) != null) {
                toast = "Saved to knowledge."
                loadMemoriesNow()
            } else toast = "Couldn't save — try again."
        }
    }

    fun deleteMemory(item: MemoryItem) {
        viewModelScope.launch {
            if (Supa.delete("${item.table}?id=eq.${item.id}")) {
                memories.removeAll { it.id == item.id && it.table == item.table }
            } else toast = "Couldn't delete — try again."
        }
    }

    /** Compact context strings the model gets on every run (mirrors iOS). */
    private fun memoryContext(): List<String> =
        memories.filter { it.table == "knowledge" }.take(10).map { "${it.title}: ${it.content}" } +
        memories.filter { it.table == "agent_memories" }.take(16).map { it.content }

    // MARK: Profile / workspace edits

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

    // MARK: Threads / messages

    fun openThread(id: String?) {
        currentThread = id; messages.clear()
        chatAgent = if (id == null) chatAgent
            else threads.firstOrNull { it.id == id }?.agentId?.let { aid -> agents.firstOrNull { it.id == aid } }
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
        val agent = chatAgent

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
        var isNewThread = false
        if (tid == null) {
            isNewThread = true
            val title = (body.ifEmpty { "Image" }).split(" ").take(6).joinToString(" ").take(60)
            val row = JSONObject().put("workspace_id", ws).put("title", title)
                .put("created_by", uid).put("last_activity_at", isoNow())
            agent?.let { row.put("primary_agent_id", it.id) }
            tid = Supa.insert("threads", row)?.optJSONObject(0)?.optString("id")?.ifEmpty { null }
            if (tid == null) {
                toast = sendFailureNotice("Couldn't start the chat — nothing was saved.")
                return
            }
            currentThread = tid
            threads.add(0, Thread(tid, title, isoNow(), agent?.id))
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

        // Give the fresh chat a clean AI title in the background (in the
        // user's language — a hard guard rejects CJK titles for non-CJK chats).
        if (isNewThread && body.isNotEmpty()) generateTitle(tid, body)

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

        val persona = agent?.let { "${it.name}, ${it.role}. ${it.description}".trim() } ?: ""
        val mems = memoryContext()
        val res = AgentRunner.run(history, persona, mems, instructions) { _ ->
            updateById(phId) { it.copy(content = "", status = "thinking") }
        }

        // Show the reply (if the user is still here) and persist it regardless.
        updateById(phId) { it.copy(content = res.text, status = "complete", images = res.images, save = "saving") }
        val att = JSONArray()
        res.images.forEach { att.put(JSONObject().put("type", "image").put("url", it).put("name", "Generated image")) }
        val agentRow = JSONObject().put("workspace_id", ws).put("thread_id", tid)
            .put("sender_type", "agent").put("content", res.text).put("status", "complete")
        agent?.let { agentRow.put("agent_id", it.id) }
        if (att.length() > 0) agentRow.put("attachments", att)
        persistMessage(phId, agentRow)

        Supa.update("threads?id=eq.$tid", JSONObject().put("last_activity_at", isoNow()))
        loadThreadsNow()

        // Quietly learn durable facts from this exchange (like iOS).
        rememberInBackground(history, res.text)
    }

    /** Background AI title for a fresh chat; falls back to the word-based title. */
    private fun generateTitle(tid: String, firstMessage: String) {
        viewModelScope.launch {
            val title = AgentRunner.titleFor(firstMessage) ?: return@launch
            if (Supa.update("threads?id=eq.$tid", JSONObject().put("title", title))) {
                val i = threads.indexOfFirst { it.id == tid }
                if (i >= 0) threads[i] = threads[i].copy(title = title)
            }
        }
    }

    /** Extract at most 2 durable facts and save them to the knowledge base. */
    private fun rememberInBackground(history: JSONArray, answer: String) {
        val ws = workspaceId ?: return
        viewModelScope.launch {
            val facts = AgentRunner.extractMemories(history, answer, memoryContext())
            var saved = false
            for ((title, content) in facts) {
                val row = JSONObject().put("workspace_id", ws).put("title", title)
                    .put("content", content).put("source", "agent")
                Supa.userId?.let { row.put("created_by", it) }
                if (Supa.insert("knowledge", row, returning = false) != null) saved = true
            }
            if (saved) loadMemoriesNow()
        }
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

    // MARK: Updates

    fun checkForUpdate(ctx: Context) {
        viewModelScope.launch {
            val rel = UpdateManager.latest() ?: return@launch
            if (UpdateManager.isNewer(rel.version, UpdateManager.currentVersion(ctx))) {
                updateVersion = rel.version; updateUrl = rel.apkUrl
            } else {
                updateVersion = null; updateUrl = null
            }
        }
    }

    fun installUpdate(ctx: Context) {
        val url = updateUrl ?: return
        if (updateBusy) return
        updateBusy = true
        viewModelScope.launch {
            val err = UpdateManager.downloadAndInstall(ctx, url)
            if (err != null) toast = err
            updateBusy = false
        }
    }

    private fun isoNow(): String {
        val f = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US)
        f.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return f.format(java.util.Date())
    }
}
