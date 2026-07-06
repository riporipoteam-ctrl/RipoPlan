package gg.askai.android.ui

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.speech.RecognizerIntent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import gg.askai.android.data.AppState
import gg.askai.android.data.Msg
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream

/** Gemini-style rainbow spark colors for the AskAI star. */
private val SparkColors = listOf(
    Color(0xFF4285F4), Color(0xFF9B72CB), Color(0xFFD96570), Color(0xFFF2A60C)
)
private val CallBlue = Color(0xFFD3E3FD)

@Composable
private fun homeGradient(): Brush {
    val light = Ask.ink.luminance() > 0.5f
    return if (light)
        Brush.verticalGradient(0f to Color(0xFFFCFCFD), 0.55f to Color(0xFFF4F7FC), 1f to Color(0xFFBFD9F2))
    else
        Brush.verticalGradient(0f to Color(0xFF0D0D0D), 0.6f to Color(0xFF0D0F14), 1f to Color(0xFF101C2E))
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(app: AppState) {
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    var brainMenu by remember { mutableStateOf(false) }

    ModalNavigationDrawer(
        drawerState = drawer,
        drawerContent = {
            ModalDrawerSheet(drawerContainerColor = Ask.ink, modifier = Modifier.fillMaxWidth(0.88f)) {
                Sidebar(app) { scope.launch { drawer.close() } }
            }
        }
    ) {
        Box(Modifier.fillMaxSize().background(homeGradient())) {
            Column(Modifier.fillMaxSize()) {
                // Gemini-style floating top bar: round buttons + centered model title.
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    CircleButton(Icons.Default.Menu) { scope.launch { drawer.open() } }
                    Spacer(Modifier.weight(1f))
                    Box {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.clip(RoundedCornerShape(22.dp))
                                .clickable { brainMenu = true }.padding(horizontal = 10.dp, vertical = 6.dp)
                        ) {
                            if (app.brain == "turbo") {
                                Text("Turbo", fontWeight = FontWeight.Bold, fontSize = 20.sp, color = Ask.text)
                                Text(" ⚡", fontSize = 20.sp, color = Ask.muted)
                            } else {
                                Text("Parable", fontWeight = FontWeight.Bold, fontSize = 20.sp, color = Ask.text)
                                Text(" 6", fontSize = 20.sp, color = Ask.muted)
                            }
                            Spacer(Modifier.width(2.dp))
                            Icon(Icons.Default.KeyboardArrowDown, "switch", tint = Ask.muted, modifier = Modifier.size(22.dp))
                        }
                        DropdownMenu(brainMenu, { brainMenu = false }, modifier = Modifier.background(Ask.ink2)) {
                            DropdownMenuItem(
                                text = { BrainMenuLabel("✦ Parable 6", t("parable_menu_sub"), app.brain == "parable") },
                                onClick = { app.selectBrain("parable"); brainMenu = false })
                            DropdownMenuItem(
                                text = { BrainMenuLabel("⚡ Turbo", t("turbo_menu_sub"), app.brain == "turbo") },
                                onClick = { app.selectBrain("turbo"); brainMenu = false })
                        }
                    }
                    Spacer(Modifier.weight(1f))
                    CircleButton(Icons.Default.Edit) { app.openThread(null) }
                }
                UpdateBanner(app)
                MessageList(app, Modifier.weight(1f))
                Composer(app)
            }
        }
    }
}

@Composable
private fun CircleButton(icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    Box(
        Modifier.size(46.dp).shadow(2.dp, CircleShape, spotColor = Color(0x22000000))
            .clip(CircleShape).background(Ask.ink)
            .border(1.dp, Ask.stroke, CircleShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) { Icon(icon, null, tint = Ask.text, modifier = Modifier.size(21.dp)) }
}

@Composable
private fun UpdateBanner(app: AppState) {
    val u = app.update ?: return
    val ctx = LocalContext.current
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 4.dp)
            .shadow(4.dp, RoundedCornerShape(18.dp), spotColor = Color(0x22000000))
            .clip(RoundedCornerShape(18.dp)).background(Ask.ink)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Default.SystemUpdate, "update", tint = Ask.text, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(t("update_available").replace("%s", u.version), color = Ask.text, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp)
            val p = app.updateProgress
            Text(
                if (p != null) t("downloading").replace("%s", "${(p * 100).toInt()}")
                else t("you_have").replace("%s", app.currentVersion),
                color = Ask.muted, fontSize = 12.sp
            )
        }
        if (app.updateProgress == null) {
            TextButton({ app.dismissUpdate() }) { Text(t("later"), color = Ask.muted, fontSize = 13.sp) }
            Button(
                onClick = { app.installUpdate(ctx) },
                colors = ButtonDefaults.buttonColors(containerColor = Ask.accent, contentColor = Ask.onAccent),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 4.dp)
            ) { Text(t("update"), fontWeight = FontWeight.Bold, fontSize = 13.sp) }
        } else {
            CircularProgressIndicator(Modifier.size(20.dp), color = Ask.muted, strokeWidth = 2.dp)
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
        // Gemini-style home: rainbow spark + personal greeting, animated in.
        var shown by remember { mutableStateOf(false) }
        LaunchedEffect(Unit) { shown = true }
        val fade by animateFloatAsState(if (shown) 1f else 0f, tween(600), label = "fade")
        val breath = rememberInfiniteTransition(label = "breath")
        val sparkScale by breath.animateFloat(1f, 1.08f,
            infiniteRepeatable(tween(1600, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "s")
        Column(
            modifier.fillMaxSize().padding(horizontal = 32.dp).alpha(fade),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text("✦", style = TextStyle(fontSize = 52.sp, brush = Brush.linearGradient(SparkColors)),
                modifier = Modifier.scale(sparkScale))
            Spacer(Modifier.height(18.dp))
            val name = app.displayName.trim().ifBlank { "you" }.split(" ").first()
            Text(
                t("greeting").replace("%s", name),
                color = Ask.text, fontSize = 30.sp, fontWeight = FontWeight.Medium,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )
        }
    } else {
        LazyColumn(modifier.fillMaxSize(), state = listState, contentPadding = PaddingValues(16.dp)) {
            items(app.messages, key = { it.id }) { m ->
                val isLast = m.id == app.messages.lastOrNull()?.id
                Box(Modifier.animateItem()) {
                    MessageRow(m, showRegen = isLast && m.sender == "agent" && m.status == "complete" && !app.sending) { app.regenerate() }
                }
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
            Text("✦", style = TextStyle(fontSize = 20.sp, brush = Brush.linearGradient(SparkColors)),
                modifier = Modifier.padding(top = 2.dp))
            Spacer(Modifier.width(10.dp))
        }
        Column(horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
            modifier = Modifier.widthIn(max = 320.dp)) {
            m.images.forEach { url ->
                AsyncImage(url, "image", modifier = Modifier.padding(vertical = 4.dp)
                    .widthIn(max = 300.dp).clip(RoundedCornerShape(16.dp)))
            }
            if (m.content.isEmpty() && m.status != "complete") {
                ThinkingStatus(m)
            } else if (m.content.isNotEmpty()) {
                if (isUser) {
                    Box(Modifier.shadow(2.dp, RoundedCornerShape(20.dp), spotColor = Color(0x14000000))
                        .clip(RoundedCornerShape(20.dp)).background(Ask.ink)
                        .padding(horizontal = 15.dp, vertical = 10.dp)) {
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
                            Text(t("regenerate"), color = Ask.muted, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Live status row while the agent works: pulsing spinner + step label + a
 * ticking elapsed-seconds counter so you always see how long it's taking.
 */
@Composable
private fun ThinkingStatus(m: Msg) {
    var secs by remember(m.id) { mutableStateOf(0) }
    LaunchedEffect(m.id) {
        while (true) { kotlinx.coroutines.delay(1000); secs++ }
    }
    val pulse = rememberInfiniteTransition(label = "think")
    val a by pulse.animateFloat(0.5f, 1f,
        infiniteRepeatable(tween(650, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "a")
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.alpha(a)) {
        CircularProgressIndicator(Modifier.size(16.dp), color = Ask.muted, strokeWidth = 2.dp)
        Spacer(Modifier.width(8.dp))
        Text(if (m.status == "thinking") t("thinking") else m.status, color = Ask.muted, fontSize = 14.sp)
        Spacer(Modifier.width(7.dp))
        Text("· ${secs}s", color = Ask.muted.copy(alpha = 0.75f), fontSize = 12.5.sp,
            fontWeight = FontWeight.Medium)
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
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bmp ->
        if (bmp != null) runCatching {
            val bos = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.JPEG, 92, bos)
            app.uploadImage(bos.toByteArray(), "jpg", "image/jpeg")
        }
    }
    val voice = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        if (res.resultCode == Activity.RESULT_OK) {
            val spoken = res.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
            if (!spoken.isNullOrBlank()) text = if (text.isBlank()) spoken else "$text $spoken"
        }
    }
    fun startVoice() {
        runCatching {
            voice.launch(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            })
        }
    }

    Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp)) {
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
        // Gemini-style floating pill composer.
        Row(
            Modifier.fillMaxWidth().padding(bottom = 14.dp)
                .shadow(10.dp, RoundedCornerShape(32.dp), spotColor = Color(0x33000000))
                .clip(RoundedCornerShape(32.dp)).background(Ask.ink)
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton({ picker.launch("image/*") }, modifier = Modifier.size(40.dp)) {
                Icon(Icons.Default.Add, "photo", tint = Ask.text, modifier = Modifier.size(24.dp))
            }
            IconButton({ camera.launch(null) }, modifier = Modifier.size(36.dp)) {
                Icon(Icons.Default.PhotoCamera, "camera", tint = Ask.muted, modifier = Modifier.size(20.dp))
            }
            BasicComposerField(text, { text = it }, Modifier.weight(1f))
            val canSend = (text.isNotBlank() || app.pending.isNotEmpty()) && !app.sending
            IconButton({ startVoice() }, modifier = Modifier.size(38.dp)) {
                Icon(Icons.Default.Mic, "dictate", tint = Ask.text, modifier = Modifier.size(22.dp))
            }
            Spacer(Modifier.width(2.dp))
            if (app.sending) {
                Box(Modifier.size(42.dp).clip(CircleShape).background(CallBlue), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(Modifier.size(18.dp), color = Color(0xFF1A1C1E), strokeWidth = 2.dp)
                }
            } else if (canSend) {
                Box(Modifier.size(42.dp).clip(CircleShape).background(Ask.accent)
                    .clickable { app.send(text); text = "" }, contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.ArrowUpward, "send", tint = Ask.onAccent, modifier = Modifier.size(20.dp))
                }
            } else {
                Box(Modifier.size(42.dp).clip(CircleShape).background(CallBlue)
                    .clickable { app.route = "call" }, contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.GraphicEq, "voice mode", tint = Color(0xFF1A1C1E), modifier = Modifier.size(20.dp))
                }
            }
        }
    }
}

@Composable
private fun BasicComposerField(value: String, onChange: (String) -> Unit, modifier: Modifier) {
    androidx.compose.foundation.text.BasicTextField(
        value = value, onValueChange = onChange,
        modifier = modifier.padding(vertical = 10.dp, horizontal = 6.dp),
        textStyle = TextStyle(color = Ask.text, fontSize = 16.5.sp),
        cursorBrush = androidx.compose.ui.graphics.SolidColor(Ask.text),
        keyboardOptions = KeyboardOptions.Default,
        decorationBox = { inner ->
            if (value.isEmpty()) Text(t("ask"), color = Ask.muted, fontSize = 16.5.sp)
            inner()
        }
    )
}

@Composable
private fun Sidebar(app: AppState, close: () -> Unit) {
    var query by remember { mutableStateOf("") }
    var searching by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().background(Ask.ink).padding(top = 18.dp)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Text("AskAI", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Ask.text)
            Spacer(Modifier.weight(1f))
            Box(Modifier.size(40.dp).clip(CircleShape).background(Ask.ink2).clickable(onClick = close),
                contentAlignment = Alignment.Center) {
                Icon(Icons.Default.Close, "close", tint = Ask.text, modifier = Modifier.size(19.dp))
            }
        }
        Spacer(Modifier.height(8.dp))
        // Highlighted "New chat" pill, Gemini-style.
        Row(Modifier.padding(horizontal = 14.dp).fillMaxWidth()
            .clip(RoundedCornerShape(26.dp)).background(Ask.ink2)
            .clickable { app.openThread(null); close() }.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Edit, null, tint = Ask.text, modifier = Modifier.size(19.dp))
            Spacer(Modifier.width(12.dp))
            Text(t("new_chat"), color = Ask.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(4.dp))
        if (searching) {
            OutlinedTextField(
                query, { query = it }, singleLine = true,
                placeholder = { Text(t("search_chats"), color = Ask.muted, fontSize = 15.sp) },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 4.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = Ask.text, unfocusedTextColor = Ask.text,
                    focusedBorderColor = Ask.stroke, unfocusedBorderColor = Ask.stroke
                )
            )
        } else {
            NavRow(Icons.Default.Search, t("search_chats")) { searching = true }
        }
        NavRow(Icons.Default.GraphicEq, t("voice_call")) { app.route = "call"; close() }
        NavRow(Icons.Default.SmartToy, t("agents")) { app.route = "agents"; close() }
        NavRow(Icons.Default.Apps, t("apps")) { app.route = "apps"; close() }
        Text(t("workspace"), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ask.muted,
            modifier = Modifier.padding(horizontal = 22.dp).padding(top = 12.dp, bottom = 2.dp))
        NavRow(Icons.Default.Tag, t("channels")) { app.route = "channels"; close() }
        NavRow(Icons.Default.WorkOutline, t("jobs")) { app.route = "jobs"; close() }
        NavRow(Icons.Default.MenuBook, t("knowledge")) { app.route = "knowledge"; close() }
        Text(t("recent"), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ask.muted,
            modifier = Modifier.padding(horizontal = 22.dp).padding(top = 12.dp, bottom = 2.dp))
        val shown = if (query.isBlank()) app.threads else app.threads.filter { it.title.contains(query, ignoreCase = true) }
        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 10.dp)) {
            items(shown, key = { it.id }) { th ->
                Text(th.title, color = Ask.text, fontSize = 16.sp, fontWeight = FontWeight.Medium,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.fillMaxWidth().padding(vertical = 1.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (app.currentThread == th.id) Ask.ink2 else Color.Transparent)
                        .clickable { app.openThread(th.id); close() }
                        .padding(horizontal = 12.dp, vertical = 12.dp))
            }
        }
        // Bottom bar: avatar + name + settings gear, like Gemini.
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(36.dp).clip(CircleShape).background(Ask.ink3), contentAlignment = Alignment.Center) {
                Text(app.displayName.trim().take(1).uppercase().ifBlank { "U" },
                    color = Ask.text, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            }
            Spacer(Modifier.width(10.dp))
            Text(app.displayName, color = Ask.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            IconButton({ app.route = "settings"; close() }) {
                Icon(Icons.Default.Settings, t("settings"), tint = Ask.text, modifier = Modifier.size(22.dp))
            }
        }
    }
}

@Composable
private fun NavRow(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 22.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, label, tint = Ask.text, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(14.dp))
        Text(label, color = Ask.text, fontSize = 16.sp)
    }
}
