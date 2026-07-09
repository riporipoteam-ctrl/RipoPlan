package gg.askai.android.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.style.TextOverflow
import coil.compose.AsyncImage
import gg.askai.android.data.AppState
import gg.askai.android.data.Msg
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.min

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(app: AppState) {
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(app.toast) {
        app.toast?.let { snackbar.showSnackbar(it); app.toast = null }
    }

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
            snackbarHost = { SnackbarHost(snackbar) },
            topBar = {
                Row(
                    Modifier.fillMaxWidth().background(Ask.ink).padding(horizontal = 8.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton({ scope.launch { drawer.open() } }) {
                        Icon(Icons.Default.Menu, "menu", tint = Ask.text)
                    }
                    Spacer(Modifier.weight(1f))
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(app.chatAgent?.name ?: "AskAI", fontWeight = FontWeight.Bold, fontSize = 17.sp, color = Ask.text)
                        Text(app.chatAgent?.role ?: "✦ Parable 6", fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = Ask.muted)
                    }
                    Spacer(Modifier.weight(1f))
                    IconButton({ app.startAgentChat(null) }) {
                        Icon(Icons.Default.Edit, "new", tint = Ask.text)
                    }
                }
            }
        ) { pad ->
            Column(Modifier.padding(pad).fillMaxSize()) {
                app.updateVersion?.let { v ->
                    val ctx = LocalContext.current
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)
                            .clip(RoundedCornerShape(12.dp)).background(Ask.ink2).padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.SystemUpdate, null, tint = Ask.text, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("AskAI v$v is out", color = Ask.text, fontSize = 13.sp, modifier = Modifier.weight(1f))
                        TextButton({ app.installUpdate(ctx) }, enabled = !app.updateBusy) {
                            if (app.updateBusy) CircularProgressIndicator(Modifier.size(14.dp), color = Ask.text, strokeWidth = 2.dp)
                            else Text("Update", color = Ask.text, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                app.loadError?.let { err ->
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)
                            .clip(RoundedCornerShape(12.dp)).background(Ask.ink2).padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.CloudOff, null, tint = Ask.muted, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(err, color = Ask.muted, fontSize = 12.sp, modifier = Modifier.weight(1f))
                        TextButton({ app.refreshData() }, enabled = !app.refreshing) {
                            Text(if (app.refreshing) "Retrying…" else "Retry", color = Ask.text, fontSize = 12.sp)
                        }
                    }
                }
                MessageList(app, Modifier.weight(1f))
                Composer(app)
            }
        }
    }
}

@Composable
private fun MessageList(app: AppState, modifier: Modifier) {
    val listState = rememberLazyListState()
    LaunchedEffect(app.messages.size) {
        if (app.messages.isNotEmpty()) listState.animateScrollToItem(app.messages.size - 1)
    }
    when {
        app.loadingMessages && app.messages.isEmpty() -> {
            Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Ask.muted, strokeWidth = 2.dp)
            }
        }
        app.messages.isEmpty() -> {
            Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(horizontal = 24.dp)) {
                    Text("✦", fontSize = 40.sp, color = Ask.text)
                    Spacer(Modifier.height(8.dp))
                    Text(
                        app.chatAgent?.let { "What should ${it.name} get done?" } ?: "What should Parable 6 get done?",
                        color = Ask.muted, fontSize = 15.sp
                    )
                    Spacer(Modifier.height(22.dp))
                    listOf(
                        "Plan my week and keep me on track",
                        "Research something and give me the facts",
                        "Draw an image from my imagination",
                        "Explain a tricky topic simply"
                    ).forEach { s ->
                        Text(s, color = Ask.text, fontSize = 14.sp,
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                                .clip(RoundedCornerShape(14.dp)).background(Ask.ink2)
                                .clickable { app.send(s) }
                                .padding(horizontal = 16.dp, vertical = 12.dp))
                    }
                }
            }
        }
        else -> {
            LazyColumn(modifier.fillMaxSize(), state = listState, contentPadding = PaddingValues(16.dp)) {
                items(app.messages, key = { it.id }) { m -> MessageRow(m) { app.retrySave(it) } }
            }
        }
    }
}

@Composable
private fun MessageRow(m: Msg, onRetry: (String) -> Unit) {
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
            if (m.status == "thinking" && m.content.isEmpty()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(Modifier.size(16.dp), color = Ask.muted, strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp)); Text("Thinking…", color = Ask.muted, fontSize = 14.sp)
                }
            } else if (m.content.isNotEmpty()) {
                if (isUser) {
                    Box(Modifier.clip(RoundedCornerShape(20.dp)).background(Ask.ink2).padding(horizontal = 15.dp, vertical = 10.dp)) {
                        Text(m.content, color = Ask.text, fontSize = 16.sp)
                    }
                } else {
                    MarkdownText(m.content)
                }
            }
            SaveBadge(m, onRetry)
        }
    }
}

/** Quiet unless something went wrong: failed saves get a red tap-to-retry. */
@Composable
private fun SaveBadge(m: Msg, onRetry: (String) -> Unit) {
    if (m.save == "failed") Text(
        "Not saved — tap to retry", fontSize = 11.sp, color = Color(0xFFEF6B6B),
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(top = 3.dp).clip(RoundedCornerShape(6.dp))
            .clickable { onRetry(m.id) }.padding(2.dp)
    )
}

@Composable
private fun Composer(app: AppState) {
    var text by remember { mutableStateOf("") }
    var photo by remember { mutableStateOf<Uri?>(null) }
    var attachMenu by remember { mutableStateOf(false) }
    var cameraTarget by remember { mutableStateOf<Uri?>(null) }
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) photo = uri
    }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        if (ok) photo = cameraTarget
    }

    Column(Modifier.fillMaxWidth().padding(12.dp)) {
        photo?.let { uri ->
            Box(Modifier.padding(bottom = 8.dp)) {
                AsyncImage(uri, "attached photo", contentScale = ContentScale.Crop,
                    modifier = Modifier.size(64.dp).clip(RoundedCornerShape(12.dp)))
                Box(
                    Modifier.align(Alignment.TopEnd).size(20.dp).clip(CircleShape)
                        .background(Ask.accent).clickable { photo = null },
                    contentAlignment = Alignment.Center
                ) { Icon(Icons.Default.Close, "remove photo", tint = Ask.onAccent, modifier = Modifier.size(13.dp)) }
            }
        }
        Row(
            Modifier.fillMaxWidth()
                .clip(RoundedCornerShape(28.dp)).background(Ask.ink2).padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.Bottom
        ) {
            Box {
                IconButton(onClick = { attachMenu = true }, modifier = Modifier.size(40.dp)) {
                    Icon(Icons.Default.Add, "attach", tint = Ask.text, modifier = Modifier.size(24.dp))
                }
                DropdownMenu(
                    expanded = attachMenu, onDismissRequest = { attachMenu = false },
                    containerColor = Ask.ink2
                ) {
                    DropdownMenuItem(
                        leadingIcon = { Icon(Icons.Default.PhotoCamera, null, tint = Ask.text, modifier = Modifier.size(20.dp)) },
                        text = { Text("Take photo", color = Ask.text) },
                        onClick = {
                            attachMenu = false
                            runCatching {
                                val dir = java.io.File(ctx.cacheDir, "camera").apply { mkdirs() }
                                val file = java.io.File(dir, "cap_${System.currentTimeMillis()}.jpg")
                                val uri = androidx.core.content.FileProvider.getUriForFile(
                                    ctx, "gg.askai.android.fileprovider", file)
                                cameraTarget = uri
                                camera.launch(uri)
                            }.onFailure { app.toast = "Couldn't open the camera." }
                        }
                    )
                    DropdownMenuItem(
                        leadingIcon = { Icon(Icons.Default.Image, null, tint = Ask.text, modifier = Modifier.size(20.dp)) },
                        text = { Text("Photo library", color = Ask.text) },
                        onClick = {
                            attachMenu = false
                            picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                        }
                    )
                }
            }
            BasicComposerField(text, { text = it }, Modifier.weight(1f))
            val canSend = (text.isNotBlank() || photo != null) && !app.sending
            IconButton(
                onClick = {
                    if (!canSend) return@IconButton
                    val body = text; val uri = photo
                    text = ""; photo = null
                    if (uri == null) app.send(body)
                    else scope.launch {
                        val bytes = withContext(Dispatchers.IO) { readImage(ctx, uri) }
                        if (bytes == null) app.toast = "Couldn't read that photo — sending the text only."
                        app.send(body, bytes)
                    }
                },
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

/** Decode + downscale a picked photo to a reasonable JPEG for upload. */
private fun readImage(ctx: Context, uri: Uri): ByteArray? = runCatching {
    val src = ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
    val bmp = BitmapFactory.decodeByteArray(src, 0, src.size) ?: return null
    val maxDim = 1600f
    val scale = min(1f, maxDim / max(bmp.width, bmp.height))
    val out = if (scale < 1f)
        Bitmap.createScaledBitmap(bmp, (bmp.width * scale).toInt(), (bmp.height * scale).toInt(), true)
    else bmp
    val bos = ByteArrayOutputStream()
    out.compress(Bitmap.CompressFormat.JPEG, 85, bos)
    bos.toByteArray()
}.getOrNull()

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
private fun NavRow(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 20.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, null, tint = Ask.text, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(12.dp))
        Text(label, color = Ask.text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Sidebar(app: AppState, close: () -> Unit) {
    var pendingDelete by remember { mutableStateOf<gg.askai.android.data.Thread?>(null) }

    Column(Modifier.fillMaxSize().background(Ask.ink).padding(top = 24.dp)) {
        Text("AskAI", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Ask.text,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
        NavRow(Icons.Default.Groups, "Agents") { app.screen = "agents"; close() }
        NavRow(Icons.Default.NotificationsNone, "Activity") { app.screen = "activity"; close() }
        NavRow(Icons.Default.Psychology, "Knowledge & memory") { app.screen = "knowledge"; close() }
        Divider(color = Ask.stroke, modifier = Modifier.padding(vertical = 6.dp))
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Recents", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ask.muted)
            Spacer(Modifier.weight(1f))
            if (app.loadingThreads)
                CircularProgressIndicator(Modifier.size(12.dp), color = Ask.muted, strokeWidth = 1.5.dp)
        }
        LazyColumn(Modifier.weight(1f)) {
            items(app.threads, key = { it.id }) { t ->
                Text(t.title, color = Ask.text, fontSize = 17.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.fillMaxWidth()
                        .combinedClickable(
                            onClick = { app.openThread(t.id); close() },
                            onLongClick = { pendingDelete = t }
                        )
                        .background(if (app.currentThread == t.id) Ask.ink2 else Color.Transparent)
                        .padding(horizontal = 20.dp, vertical = 12.dp))
            }
            if (app.threads.isEmpty() && !app.loadingThreads) {
                item {
                    Text("No chats yet — start one!", color = Ask.muted, fontSize = 14.sp,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp))
                }
            }
        }
        Divider(color = Ask.stroke)
        Row(
            Modifier.fillMaxWidth()
                .clickable { app.screen = "settings"; close() }
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ProfileAvatar(app.displayName, app.avatarUrl, 34.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(app.displayName, color = Ask.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (app.userEmail.isNotEmpty())
                    Text(app.userEmail, color = Ask.muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Icon(Icons.Default.Settings, "settings", tint = Ask.muted, modifier = Modifier.size(20.dp))
        }
    }

    pendingDelete?.let { t ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            containerColor = Ask.ink2,
            title = { Text("Delete this chat?", color = Ask.text) },
            text = { Text("\"${t.title}\" and its messages will be removed everywhere.", color = Ask.muted) },
            confirmButton = {
                TextButton({ app.deleteThread(t.id); pendingDelete = null }) {
                    Text("Delete", color = Color(0xFFEF6B6B), fontWeight = FontWeight.SemiBold)
                }
            },
            dismissButton = { TextButton({ pendingDelete = null }) { Text("Cancel", color = Ask.muted) } }
        )
    }
}
