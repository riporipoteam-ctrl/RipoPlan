package gg.askai.android.ui

import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import gg.askai.android.data.AgentItem
import gg.askai.android.data.AppItem
import gg.askai.android.data.AppState
import gg.askai.android.data.ListRow

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(app: AppState, onBack: () -> Unit) {
    var instr by remember { mutableStateOf(app.instructions) }
    Scaffold(
        containerColor = Ask.ink,
        topBar = {
            TopAppBar(
                title = { Text(t("settings"), color = Ask.text, fontWeight = FontWeight.Bold) },
                navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "back", tint = Ask.text) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Ask.ink)
            )
        }
    ) { pad ->
        Column(Modifier.padding(pad).padding(20.dp).verticalScroll(rememberScrollState())) {
            Text(t("account"), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ask.muted)
            Spacer(Modifier.height(6.dp))
            Text(app.displayName, color = Ask.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            gg.askai.android.data.Supa.email?.let { Text(it, color = Ask.muted, fontSize = 13.sp) }

            Spacer(Modifier.height(24.dp))
            Text(t("model"), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ask.muted)
            Spacer(Modifier.height(8.dp))
            BrainOption("✦  Parable 6", t("parable_sub"), app.brain == "parable") { app.selectBrain("parable") }
            Spacer(Modifier.height(8.dp))
            BrainOption("⚡  Turbo", t("turbo_sub"), app.brain == "turbo") { app.selectBrain("turbo") }

            Spacer(Modifier.height(24.dp))
            Text(t("appearance"), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ask.muted)
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Ask.ink2).padding(4.dp)) {
                ThemeChip(t("light"), app.theme == "light", Modifier.weight(1f)) { app.selectTheme("light") }
                ThemeChip(t("dark"), app.theme == "dark", Modifier.weight(1f)) { app.selectTheme("dark") }
                ThemeChip(t("auto"), app.theme == "system", Modifier.weight(1f)) { app.selectTheme("system") }
            }

            Spacer(Modifier.height(24.dp))
            Text(t("language"), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ask.muted)
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Ask.ink2).padding(4.dp)) {
                ThemeChip("🇬🇧 English", app.language == "en", Modifier.weight(1f)) { app.selectLanguage("en") }
                ThemeChip("🇧🇦 Bosanski", app.language == "bs", Modifier.weight(1f)) { app.selectLanguage("bs") }
            }

            Spacer(Modifier.height(24.dp))
            Text(t("custom_instructions"), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ask.muted)
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                instr, { instr = it },
                placeholder = { Text(t("instructions_hint"), color = Ask.muted) },
                modifier = Modifier.fillMaxWidth().heightIn(min = 110.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = Ask.text, unfocusedTextColor = Ask.text,
                    focusedBorderColor = Ask.stroke, unfocusedBorderColor = Ask.stroke
                )
            )
            Spacer(Modifier.height(10.dp))
            Button(
                onClick = { app.saveInstructions(instr) },
                colors = ButtonDefaults.buttonColors(containerColor = Ask.accent, contentColor = Ask.onAccent),
                modifier = Modifier.fillMaxWidth().height(48.dp)
            ) { Text(t("save"), fontWeight = FontWeight.Bold) }

            Spacer(Modifier.height(24.dp))
            Text(t("app_section"), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ask.muted)
            Spacer(Modifier.height(8.dp))
            val ctx = LocalContext.current
            val up = app.update
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                .clickable(enabled = !app.checkingUpdate) {
                    if (up != null) app.installUpdate(ctx) else app.checkForUpdate(manual = true)
                }
                .background(Ask.ink2).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.SystemUpdate, "update", tint = Ask.text)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(if (up != null) t("install_update").replace("%s", up.version) else t("check_updates"),
                        color = Ask.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Text(
                        when {
                            app.updateProgress != null -> t("downloading").replace("%s", "${((app.updateProgress ?: 0f) * 100).toInt()}")
                            up != null -> t("newer_ready")
                            app.checkingUpdate -> t("checking")
                            app.updateChecked -> t("on_latest").replace("%s", app.currentVersion)
                            else -> t("current_ver").replace("%s", app.currentVersion)
                        },
                        color = Ask.muted, fontSize = 12.sp
                    )
                }
                if (app.checkingUpdate || app.updateProgress != null)
                    CircularProgressIndicator(Modifier.size(20.dp), color = Ask.muted, strokeWidth = 2.dp)
            }

            Spacer(Modifier.height(24.dp))
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { app.signOut() }
                .background(Ask.ink2).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.AutoMirrored.Filled.Logout, "out", tint = Ask.muted)
                Spacer(Modifier.width(10.dp))
                Text(t("sign_out"), color = Ask.text)
            }
            Spacer(Modifier.height(20.dp))
            Text("AskAI · Parable 6 · Ripo Team", color = Ask.muted, fontSize = 12.sp,
                modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
    }
}

@Composable
private fun ThemeChip(label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Box(
        modifier.clip(RoundedCornerShape(11.dp))
            .background(if (selected) Ask.ink else androidx.compose.ui.graphics.Color.Transparent)
            .clickable(onClick = onClick).padding(vertical = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(label, fontSize = 14.sp, color = if (selected) Ask.text else Ask.muted,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal)
    }
}

@Composable
private fun BrainOption(title: String, sub: String, selected: Boolean, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
        .background(if (selected) Ask.ink3 else Ask.ink2).clickable(onClick = onClick).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = Ask.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            Text(sub, color = Ask.muted, fontSize = 12.sp)
        }
        if (selected) Icon(Icons.Default.CheckCircle, "on", tint = Ask.text)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppsScreen(app: AppState, onBack: () -> Unit) {
    var open by remember { mutableStateOf<AppItem?>(null) }
    LaunchedEffect(Unit) { app.loadApps() }
    val current = open
    if (current != null) { AppViewer(current) { open = null }; return }

    Scaffold(
        containerColor = Ask.ink,
        topBar = {
            TopAppBar(
                title = { Text(t("apps"), color = Ask.text, fontWeight = FontWeight.Bold) },
                navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "back", tint = Ask.text) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Ask.ink)
            )
        }
    ) { pad ->
        if (app.apps.isEmpty()) {
            Box(Modifier.padding(pad).fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("🛠️", fontSize = 40.sp)
                    Spacer(Modifier.height(8.dp))
                    Text(t("no_apps"), color = Ask.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Text(t("apps_line"), color = Ask.muted, fontSize = 13.sp)
                }
            }
        } else {
            LazyColumn(Modifier.padding(pad).fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
                items(app.apps, key = { it.id }) { a ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp).clip(RoundedCornerShape(14.dp))
                        .background(Ask.ink2).clickable { open = a }.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(Ask.accent),
                            contentAlignment = Alignment.Center) { Text("🌐", fontSize = 18.sp) }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(a.name, color = Ask.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold,
                                maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(t("tap_open"), color = Ask.muted, fontSize = 12.sp)
                        }
                        Icon(Icons.AutoMirrored.Filled.ArrowForward, "open", tint = Ask.muted)
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AgentsScreen(app: AppState, onBack: () -> Unit) {
    LaunchedEffect(Unit) { app.loadAgents() }
    Scaffold(
        containerColor = Ask.ink,
        topBar = {
            TopAppBar(
                title = { Text(t("agents"), color = Ask.text, fontWeight = FontWeight.Bold) },
                navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "back", tint = Ask.text) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Ask.ink)
            )
        }
    ) { pad ->
        if (app.agents.isEmpty()) {
            Box(Modifier.padding(pad).fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("🤖", fontSize = 40.sp)
                    Spacer(Modifier.height(8.dp))
                    Text(t("no_agents"), color = Ask.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Text(t("agents_line"), color = Ask.muted, fontSize = 13.sp)
                }
            }
        } else {
            LazyColumn(Modifier.padding(pad).fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
                items(app.agents, key = { it.id }) { a ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp).clip(RoundedCornerShape(14.dp))
                        .background(Ask.ink2).clickable { app.route = "chat"; app.openThread(null) }.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)).background(Ask.ink3),
                            contentAlignment = Alignment.Center) { Text(a.emoji, fontSize = 20.sp) }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(a.name, color = Ask.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold,
                                maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(a.subtitle, color = Ask.muted, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
    }
}

/** Generic read-only list page reused for Channels, Jobs and Knowledge. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListScreen(title: String, emptyEmoji: String, emptyLine: String, items: List<ListRow>,
               load: () -> Unit, onBack: () -> Unit) {
    LaunchedEffect(Unit) { load() }
    Scaffold(
        containerColor = Ask.ink,
        topBar = {
            TopAppBar(
                title = { Text(title, color = Ask.text, fontWeight = FontWeight.Bold) },
                navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "back", tint = Ask.text) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Ask.ink)
            )
        }
    ) { pad ->
        if (items.isEmpty()) {
            Box(Modifier.padding(pad).fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(emptyEmoji, fontSize = 40.sp)
                    Spacer(Modifier.height(8.dp))
                    Text(t("nothing_yet"), color = Ask.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Text(emptyLine, color = Ask.muted, fontSize = 13.sp)
                }
            }
        } else {
            LazyColumn(Modifier.padding(pad).fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
                items(items, key = { it.id }) { r ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp).clip(RoundedCornerShape(14.dp))
                        .background(Ask.ink2).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)).background(Ask.ink3),
                            contentAlignment = Alignment.Center) { Text(r.emoji, fontSize = 20.sp) }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(r.title, color = Ask.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold,
                                maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (r.subtitle.isNotBlank())
                                Text(r.subtitle, color = Ask.muted, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppViewer(item: AppItem, onBack: () -> Unit) {
    // Command/console panel: captures console.log/warn/error from the app so
    // you can see its virtual backend working right inside the preview.
    val logs = remember { mutableStateListOf<String>() }
    var showConsole by remember { mutableStateOf(false) }
    Scaffold(
        containerColor = Ask.ink,
        topBar = {
            TopAppBar(
                title = { Text(item.name, color = Ask.text, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "back", tint = Ask.text) } },
                actions = {
                    IconButton({ showConsole = !showConsole }) {
                        Icon(Icons.Default.Terminal, "console",
                            tint = if (showConsole) Ask.text else Ask.muted)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Ask.ink)
            )
        }
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            AndroidView(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                factory = { ctx ->
                    WebView(ctx).apply {
                        webViewClient = WebViewClient()
                        webChromeClient = object : android.webkit.WebChromeClient() {
                            override fun onConsoleMessage(msg: android.webkit.ConsoleMessage): Boolean {
                                val tag = when (msg.messageLevel()) {
                                    android.webkit.ConsoleMessage.MessageLevel.ERROR -> "✖"
                                    android.webkit.ConsoleMessage.MessageLevel.WARNING -> "⚠"
                                    else -> "›"
                                }
                                logs.add("$tag ${msg.message()}")
                                if (logs.size > 200) logs.removeAt(0)
                                return true
                            }
                        }
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        loadDataWithBaseURL(null, item.html, "text/html", "utf-8", null)
                    }
                },
                update = { }
            )
            if (showConsole) {
                Column(
                    Modifier.fillMaxWidth().heightIn(max = 220.dp)
                        .background(androidx.compose.ui.graphics.Color(0xFF111214))
                        .padding(10.dp)
                ) {
                    Text("Console", color = androidx.compose.ui.graphics.Color(0xFF8AE234),
                        fontSize = 11.sp, fontWeight = FontWeight.Bold,
                        fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace)
                    LazyColumn(Modifier.fillMaxWidth()) {
                        items(logs.size) { i ->
                            Text(logs[i], color = androidx.compose.ui.graphics.Color(0xFFD6D8DB),
                                fontSize = 11.5.sp,
                                fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace)
                        }
                        if (logs.isEmpty()) item {
                            Text("— no output yet —", color = androidx.compose.ui.graphics.Color(0xFF6E7076),
                                fontSize = 11.5.sp, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace)
                        }
                    }
                }
            }
        }
    }
}
