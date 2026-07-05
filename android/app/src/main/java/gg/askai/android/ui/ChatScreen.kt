package gg.askai.android.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import gg.askai.android.data.AppState
import gg.askai.android.data.Attachment
import gg.askai.android.data.Msg
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(app: AppState) {
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    var brainMenu by remember { mutableStateOf(false) }

    ModalNavigationDrawer(
        drawerState = drawer,
        drawerContent = {
            ModalDrawerSheet(drawerContainerColor = Ask.ink, modifier = Modifier.fillMaxWidth(0.82f)) {
                Sidebar(app) { scope.launch { drawer.close() } }
            }
        }
    ) {
        Scaffold(
            containerColor = Ask.ink,
            topBar = {
                Row(
                    Modifier.fillMaxWidth().background(Ask.ink).padding(horizontal = 8.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton({ scope.launch { drawer.open() } }) {
                        Icon(Icons.Default.Menu, "menu", tint = Ask.text)
                    }
                    Spacer(Modifier.weight(1f))
                    Box {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.clip(RoundedCornerShape(10.dp)).clickable { brainMenu = true }
                                .padding(horizontal = 12.dp, vertical = 2.dp)
                        ) {
                            Text("AskAI", fontWeight = FontWeight.Bold, fontSize = 17.sp, color = Ask.text)
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(if (app.brain == "turbo") "⚡ Turbo" else "✦ Parable 6",
                                    fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = Ask.muted)
                                Icon(Icons.Default.ArrowDropDown, "switch", tint = Ask.muted, modifier = Modifier.size(14.dp))
                            }
                        }
                        DropdownMenu(brainMenu, { brainMenu = false }, modifier = Modifier.background(Ask.ink2)) {
                            DropdownMenuItem(
                                text = { BrainMenuLabel("✦ Parable 6", "Deepest reasoning", app.brain == "parable") },
                                onClick = { app.selectBrain("parable"); brainMenu = false })
                            DropdownMenuItem(
                                text = { BrainMenuLabel("⚡ Turbo", "Fast everyday answers", app.brain == "turbo") },
                                onClick = { app.selectBrain("turbo"); brainMenu = false })
                        }
                    }
                    Spacer(Modifier.weight(1f))
                    IconButton({ app.openThread(null) }) {
                        Icon(Icons.Default.Edit, "new", tint = Ask.text)
                    }
                }
            }
        ) { pad ->
            Column(Modifier.padding(pad).fillMaxSize()) {
                MessageList(app, Modifier.weight(1f))
                Composer(app)
            }
        }
    }
}

@Composable
private fun BrainMenuLabel(title: String, sub: String, on: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = Ask.text, fontWeight = FontWeight.SemiBold)
            Text(sub, color = Ask.muted, fontSize = 11.sp)
        }
        if (on) { Spacer(Modifier.width(10.dp)); Icon(Icons.Default.Check, "on", tint = Ask.text, modifier = Modifier.size(18.dp)) }
    }
}

@Composable
private fun MessageList(app: AppState, modifier: Modifier) {
    val listState = rememberLazyListState()
    LaunchedEffect(app.messages.size, app.messages.lastOrNull()?.content) {
        if (app.messages.isNotEmpty()) listState.animateScrollToItem(app.messages.size - 1)
    }
    if (app.messages.isEmpty()) {
        Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("✦", fontSize = 40.sp, color = Ask.text)
                Spacer(Modifier.height(8.dp))
                Text("What should Parable 6 get done?", color = Ask.muted, fontSize = 15.sp)
            }
        }
    } else {
        LazyColumn(modifier.fillMaxSize(), state = listState, contentPadding = PaddingValues(16.dp)) {
            items(app.messages, key = { it.id }) { m ->
                val isLast = m.id == app.messages.lastOrNull()?.id
                MessageRow(m, showRegen = isLast && m.sender == "agent" && m.status == "complete" && !app.sending) { app.regenerate() }
            }
        }
    }
}

@Composable
private fun MessageRow(m: Msg, showRegen: Boolean, onRegen: () -> Unit) {
    val isUser = m.sender == "user"
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start) {
        if (!isUser) {
            Box(Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(Ask.accent),
                contentAlignment = Alignment.Center) { Text("✦", color = Ask.onAccent, fontSize = 14.sp) }
            Spacer(Modifier.width(10.dp))
        }
        Column(horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
            modifier = Modifier.widthIn(max = 320.dp)) {
            if (!isUser) Text("AskAI", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Ask.muted)
            m.images.forEach { url ->
                AsyncImage(url, "image", modifier = Modifier.padding(vertical = 4.dp)
                    .widthIn(max = 300.dp).clip(RoundedCornerShape(16.dp)))
            }
            if (m.content.isEmpty() && m.status != "complete") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(Modifier.size(16.dp), color = Ask.muted, strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                    Text(if (m.status == "thinking") "Thinking…" else m.status, color = Ask.muted, fontSize = 14.sp)
                }
            } else if (m.content.isNotEmpty()) {
                if (isUser) {
                    Box(Modifier.clip(RoundedCornerShape(20.dp)).background(Ask.ink2).padding(horizontal = 15.dp, vertical = 10.dp)) {
                        Text(m.content, color = Ask.text, fontSize = 16.sp)
                    }
                } else {
                    Markdown(m.content)
                    if (showRegen) {
                        Spacer(Modifier.height(4.dp))
                        Row(Modifier.clip(RoundedCornerShape(8.dp)).clickable(onClick = onRegen).padding(4.dp),
                            verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Refresh, "regen", tint = Ask.muted, modifier = Modifier.size(15.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Regenerate", color = Ask.muted, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Composer(app: AppState) {
    var text by remember { mutableStateOf("") }
    val ctx = LocalContext.current
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            runCatching {
                val cr = ctx.contentResolver
                val bytes = cr.openInputStream(uri)?.use { it.readBytes() } ?: return@rememberLauncherForActivityResult
                val mime = cr.getType(uri) ?: "image/jpeg"
                val ext = when {
                    mime.contains("png") -> "png"; mime.contains("webp") -> "webp"; else -> "jpg"
                }
                app.uploadImage(bytes, ext, mime)
            }
        }
    }

    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
        if (app.pending.isNotEmpty() || app.uploading) {
            LazyRow(Modifier.fillMaxWidth().padding(bottom = 6.dp)) {
                items(app.pending, key = { it.url }) { a ->
                    Box(Modifier.padding(end = 8.dp)) {
                        AsyncImage(a.url, "attach", modifier = Modifier.size(56.dp).clip(RoundedCornerShape(12.dp)))
                        Box(Modifier.align(Alignment.TopEnd).size(18.dp).clip(CircleShape)
                            .background(Color.Black.copy(alpha = 0.6f)).clickable { app.removePending(a) },
                            contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.Close, "remove", tint = Color.White, modifier = Modifier.size(12.dp))
                        }
                    }
                }
                if (app.uploading) item {
                    Box(Modifier.size(56.dp).clip(RoundedCornerShape(12.dp)).background(Ask.ink2),
                        contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(Modifier.size(20.dp), color = Ask.muted, strokeWidth = 2.dp)
                    }
                }
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(bottom = 12.dp)
                .clip(RoundedCornerShape(28.dp)).background(Ask.ink2).padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.Bottom
        ) {
            IconButton({ picker.launch("image/*") }, modifier = Modifier.size(40.dp)) {
                Icon(Icons.Default.Add, "add", tint = Ask.text, modifier = Modifier.size(24.dp))
            }
            BasicComposerField(text, { text = it }, Modifier.weight(1f))
            val canSend = (text.isNotBlank() || app.pending.isNotEmpty()) && !app.sending
            IconButton(
                onClick = { if (canSend) { app.send(text); text = "" } },
                enabled = canSend,
                modifier = Modifier.size(38.dp).clip(CircleShape)
                    .background(if (canSend) Ask.accent else Ask.muted.copy(alpha = 0.3f))
            ) {
                if (app.sending) CircularProgressIndicator(Modifier.size(18.dp), color = Ask.onAccent, strokeWidth = 2.dp)
                else Icon(Icons.Default.ArrowUpward, "send", tint = Ask.onAccent, modifier = Modifier.size(18.dp))
            }
        }
    }
}

@Composable
private fun BasicComposerField(value: String, onChange: (String) -> Unit, modifier: Modifier) {
    androidx.compose.foundation.text.BasicTextField(
        value = value, onValueChange = onChange,
        modifier = modifier.padding(vertical = 10.dp, horizontal = 4.dp),
        textStyle = androidx.compose.ui.text.TextStyle(color = Ask.text, fontSize = 16.sp),
        cursorBrush = androidx.compose.ui.graphics.SolidColor(Ask.text),
        keyboardOptions = KeyboardOptions.Default,
        decorationBox = { inner ->
            if (value.isEmpty()) Text("Ask AskAI", color = Ask.muted, fontSize = 16.sp)
            inner()
        }
    )
}

@Composable
private fun Sidebar(app: AppState, close: () -> Unit) {
    Column(Modifier.fillMaxSize().background(Ask.ink).padding(top = 24.dp)) {
        Text("AskAI", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Ask.text,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))

        NavRow(Icons.Default.Add, "New chat") { app.openThread(null); close() }
        NavRow(Icons.Default.Apps, "Apps") { app.route = "apps"; close() }
        NavRow(Icons.Default.Settings, "Settings") { app.route = "settings"; close() }

        Text("Recents", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ask.muted,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp))
        LazyColumn(Modifier.weight(1f)) {
            items(app.threads, key = { it.id }) { t ->
                Text(t.title, color = Ask.text, fontSize = 17.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.fillMaxWidth()
                        .clickable { app.openThread(t.id); close() }
                        .background(if (app.currentThread == t.id) Ask.ink2 else Color.Transparent)
                        .padding(horizontal = 20.dp, vertical = 12.dp))
            }
        }
        Divider(color = Ask.stroke)
        Row(Modifier.fillMaxWidth().clickable { app.signOut() }.padding(20.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.AutoMirrored.Filled.Logout, "out", tint = Ask.muted)
            Spacer(Modifier.width(10.dp))
            Text("Sign out (${app.displayName})", color = Ask.muted)
        }
    }
}

@Composable
private fun NavRow(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 20.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, label, tint = Ask.text, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(14.dp))
        Text(label, color = Ask.text, fontSize = 16.sp)
    }
}
