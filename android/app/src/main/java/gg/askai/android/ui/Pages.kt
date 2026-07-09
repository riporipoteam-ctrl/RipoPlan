package gg.askai.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import gg.askai.android.data.Agent
import gg.askai.android.data.AppState
import gg.askai.android.data.MemoryItem

/** Shared scaffold for the secondary pages: back button, title, snackbar. */
@Composable
fun PageScaffold(
    app: AppState,
    title: String,
    actions: @Composable RowScope.() -> Unit = {},
    content: @Composable (PaddingValues) -> Unit
) {
    val snackbar = remember { SnackbarHostState() }
    BackHandler { app.screen = "chat" }
    LaunchedEffect(app.toast) {
        app.toast?.let { snackbar.showSnackbar(it); app.toast = null }
    }
    Scaffold(
        containerColor = Ask.ink,
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            Row(
                Modifier.fillMaxWidth().background(Ask.ink).padding(horizontal = 8.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton({ app.screen = "chat" }) { Icon(Icons.Default.ArrowBack, "back", tint = Ask.text) }
                Text(title, fontWeight = FontWeight.Bold, fontSize = 17.sp, color = Ask.text)
                Spacer(Modifier.weight(1f))
                actions()
            }
        },
        content = content
    )
}

private fun agentColor(hex: String): Color =
    runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrDefault(Color(0xFF6E6E80))

@Composable
fun AgentAvatar(agent: Agent, size: androidx.compose.ui.unit.Dp) {
    Box(
        Modifier.size(size).clip(CircleShape).background(agentColor(agent.color)),
        contentAlignment = Alignment.Center
    ) {
        if (!agent.avatarUrl.isNullOrEmpty()) {
            AsyncImage(agent.avatarUrl, agent.name, contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize())
        } else {
            Text(agent.name.take(1).uppercase(), fontSize = (size.value / 2.4f).sp,
                fontWeight = FontWeight.Bold, color = Color.White)
        }
    }
}

// ============================ AGENTS ============================

@Composable
fun AgentsScreen(app: AppState) {
    var showCreate by remember { mutableStateOf(false) }
    var pendingArchive by remember { mutableStateOf<Agent?>(null) }

    PageScaffold(app, "Agents", actions = {
        IconButton({ showCreate = true }) { Icon(Icons.Default.Add, "new agent", tint = Ask.text) }
    }) { pad ->
        if (app.agents.isEmpty()) {
            Box(Modifier.padding(pad).fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No agents yet — tap + to build your team.", color = Ask.muted, fontSize = 14.sp)
            }
        } else {
            LazyColumn(Modifier.padding(pad).fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
                item {
                    Text("Tap an agent to start a chat with them. The − button archives an agent.",
                        color = Ask.muted, fontSize = 12.sp, modifier = Modifier.padding(bottom = 12.dp))
                }
                items(app.agents, key = { it.id }) { a ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 4.dp)
                            .clip(RoundedCornerShape(16.dp)).background(Ask.ink2)
                            .clickable { app.startAgentChat(a) }
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        AgentAvatar(a, 44.dp)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(a.name, color = Ask.text, fontWeight = FontWeight.SemiBold, fontSize = 16.sp,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis)
                                if (a.isSupervisor) {
                                    Spacer(Modifier.width(6.dp))
                                    Text("Chief", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Ask.text,
                                        modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(Ask.ink3)
                                            .padding(horizontal = 6.dp, vertical = 2.dp))
                                }
                            }
                            Text(a.role, color = Ask.muted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (a.description.isNotEmpty())
                                Text(a.description, color = Ask.muted, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                        IconButton({ pendingArchive = a }) {
                            Icon(Icons.Default.PersonRemove, "archive", tint = Ask.muted, modifier = Modifier.size(18.dp))
                        }
                    }
                }
            }
        }
    }

    if (showCreate) CreateAgentDialog(
        onDismiss = { showCreate = false },
        onCreate = { n, r, d -> app.createAgent(n, r, d); showCreate = false })

    pendingArchive?.let { a ->
        AlertDialog(
            onDismissRequest = { pendingArchive = null },
            containerColor = Ask.ink2,
            title = { Text("Remove ${a.name}?", color = Ask.text) },
            text = { Text("The agent is archived — chats stay intact.", color = Ask.muted) },
            confirmButton = {
                TextButton({ app.archiveAgent(a.id); pendingArchive = null }) {
                    Text("Remove", color = Color(0xFFEF6B6B), fontWeight = FontWeight.SemiBold)
                }
            },
            dismissButton = { TextButton({ pendingArchive = null }) { Text("Cancel", color = Ask.muted) } }
        )
    }
}

@Composable
private fun CreateAgentDialog(onDismiss: () -> Unit, onCreate: (String, String, String) -> Unit) {
    var name by remember { mutableStateOf("") }
    var role by remember { mutableStateOf("") }
    var desc by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Ask.ink2,
        title = { Text("New agent", color = Ask.text) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                PageField(name, { name = it }, "Name (e.g. Coach)")
                PageField(role, { role = it }, "Role (e.g. Fitness Coach)")
                PageField(desc, { desc = it }, "What are they great at?")
            }
        },
        confirmButton = {
            TextButton({ onCreate(name, role, desc) }, enabled = name.trim().isNotEmpty()) {
                Text("Create", color = Ask.text, fontWeight = FontWeight.SemiBold)
            }
        },
        dismissButton = { TextButton(onDismiss) { Text("Cancel", color = Ask.muted) } }
    )
}

@Composable
fun PageField(value: String, onChange: (String) -> Unit, placeholder: String, singleLine: Boolean = true) {
    OutlinedTextField(
        value, onChange, singleLine = singleLine,
        placeholder = { Text(placeholder, color = Ask.muted, fontSize = 14.sp) },
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = Ask.text, unfocusedTextColor = Ask.text,
            cursorColor = Ask.text,
            focusedBorderColor = Ask.muted, unfocusedBorderColor = Ask.stroke),
        modifier = Modifier.fillMaxWidth()
    )
}

// ============================ ACTIVITY ============================

@Composable
fun ActivityScreen(app: AppState) {
    PageScaffold(app, "Activity", actions = {
        if (app.notifications.any { !it.read }) {
            TextButton({ app.markAllRead() }) { Text("Mark all read", color = Ask.muted, fontSize = 13.sp) }
        }
    }) { pad ->
        if (app.notifications.isEmpty()) {
            Box(Modifier.padding(pad).fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.NotificationsNone, null, tint = Ask.muted, modifier = Modifier.size(36.dp))
                    Spacer(Modifier.height(8.dp))
                    Text("All caught up", color = Ask.text, fontWeight = FontWeight.SemiBold)
                    Text("Task updates from your agents land here.", color = Ask.muted, fontSize = 13.sp)
                }
            }
        } else {
            LazyColumn(Modifier.padding(pad).fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
                items(app.notifications, key = { it.id }) { n ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 4.dp)
                            .clip(RoundedCornerShape(14.dp)).background(Ask.ink2).padding(13.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        Box(Modifier.padding(top = 6.dp).size(8.dp).clip(CircleShape)
                            .background(if (n.read) Ask.ink3 else Ask.blue))
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Text(n.title, color = Ask.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                            if (n.body.isNotEmpty())
                                Text(n.body, color = Ask.muted, fontSize = 13.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
                            Text(n.time.take(16).replace("T", " · "), color = Ask.muted, fontSize = 11.sp,
                                modifier = Modifier.padding(top = 3.dp))
                        }
                    }
                }
            }
        }
    }
}

// ============================ KNOWLEDGE & MEMORY ============================

@Composable
fun KnowledgeScreen(app: AppState) {
    var showAdd by remember { mutableStateOf(false) }
    var pendingDelete by remember { mutableStateOf<MemoryItem?>(null) }

    PageScaffold(app, "Knowledge & memory", actions = {
        IconButton({ showAdd = true }) { Icon(Icons.Default.Add, "add note", tint = Ask.text) }
    }) { pad ->
        LazyColumn(Modifier.padding(pad).fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
            item {
                Text("AskAI quietly remembers durable facts from your chats — your projects, preferences and goals — and uses them everywhere. Add notes yourself with +.",
                    color = Ask.muted, fontSize = 12.sp, lineHeight = 17.sp,
                    modifier = Modifier.padding(bottom = 12.dp))
            }
            if (app.memories.isEmpty()) {
                item {
                    Box(Modifier.fillMaxWidth().padding(top = 60.dp), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Default.Psychology, null, tint = Ask.muted, modifier = Modifier.size(36.dp))
                            Spacer(Modifier.height(8.dp))
                            Text("Nothing remembered yet", color = Ask.text, fontWeight = FontWeight.SemiBold)
                            Text("Chat away — important facts get saved automatically.", color = Ask.muted, fontSize = 13.sp)
                        }
                    }
                }
            }
            items(app.memories, key = { it.table + it.id }) { m ->
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 4.dp)
                        .clip(RoundedCornerShape(14.dp)).background(Ask.ink2).padding(13.dp),
                    verticalAlignment = Alignment.Top
                ) {
                    Icon(if (m.table == "knowledge") Icons.Default.MenuBook else Icons.Default.Psychology,
                        null, tint = Ask.muted, modifier = Modifier.padding(top = 2.dp).size(18.dp))
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(m.title, color = Ask.text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                        if (m.content.isNotEmpty())
                            Text(m.content, color = Ask.muted, fontSize = 13.sp, maxLines = 4, overflow = TextOverflow.Ellipsis)
                    }
                    IconButton({ pendingDelete = m }, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Default.DeleteOutline, "delete", tint = Ask.muted, modifier = Modifier.size(17.dp))
                    }
                }
            }
        }
    }

    if (showAdd) {
        var title by remember { mutableStateOf("") }
        var content by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showAdd = false },
            containerColor = Ask.ink2,
            title = { Text("Add to knowledge", color = Ask.text) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    PageField(title, { title = it }, "Title")
                    PageField(content, { content = it }, "What should AskAI know?", singleLine = false)
                }
            },
            confirmButton = {
                TextButton({ app.addKnowledge(title, content); showAdd = false },
                    enabled = title.trim().isNotEmpty() || content.trim().isNotEmpty()) {
                    Text("Save", color = Ask.text, fontWeight = FontWeight.SemiBold)
                }
            },
            dismissButton = { TextButton({ showAdd = false }) { Text("Cancel", color = Ask.muted) } }
        )
    }

    pendingDelete?.let { m ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            containerColor = Ask.ink2,
            title = { Text("Forget this?", color = Ask.text) },
            text = { Text(m.content.take(140).ifEmpty { m.title }, color = Ask.muted) },
            confirmButton = {
                TextButton({ app.deleteMemory(m); pendingDelete = null }) {
                    Text("Forget", color = Color(0xFFEF6B6B), fontWeight = FontWeight.SemiBold)
                }
            },
            dismissButton = { TextButton({ pendingDelete = null }) { Text("Cancel", color = Ask.muted) } }
        )
    }
}
