package gg.askai.android.ui

import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import gg.askai.android.data.AppItem
import gg.askai.android.data.AppState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(app: AppState, onBack: () -> Unit) {
    var instr by remember { mutableStateOf(app.instructions) }
    Scaffold(
        containerColor = Ask.ink,
        topBar = {
            TopAppBar(
                title = { Text("Settings", color = Ask.text, fontWeight = FontWeight.Bold) },
                navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "back", tint = Ask.text) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Ask.ink)
            )
        }
    ) { pad ->
        Column(Modifier.padding(pad).padding(20.dp)) {
            Text("Account", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ask.muted)
            Spacer(Modifier.height(6.dp))
            Text(app.displayName, color = Ask.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            gg.askai.android.data.Supa.email?.let { Text(it, color = Ask.muted, fontSize = 13.sp) }

            Spacer(Modifier.height(24.dp))
            Text("Model", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ask.muted)
            Spacer(Modifier.height(8.dp))
            BrainOption("✦  Parable 6", "Flagship — deepest reasoning & research", app.brain == "parable") { app.setBrain("parable") }
            Spacer(Modifier.height(8.dp))
            BrainOption("⚡  Turbo", "Faster answers for everyday tasks", app.brain == "turbo") { app.setBrain("turbo") }

            Spacer(Modifier.height(24.dp))
            Text("Custom instructions", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ask.muted)
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                instr, { instr = it },
                placeholder = { Text("How should Parable 6 respond? (tone, style, what you're working on…)", color = Ask.muted) },
                modifier = Modifier.fillMaxWidth().heightIn(min = 110.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = Ask.text, unfocusedTextColor = Ask.text,
                    focusedBorderColor = Ask.stroke, unfocusedBorderColor = Ask.stroke
                )
            )
            Spacer(Modifier.height(10.dp))
            Button(
                onClick = { app.setInstructions(instr) },
                colors = ButtonDefaults.buttonColors(containerColor = Ask.accent, contentColor = Ask.onAccent),
                modifier = Modifier.fillMaxWidth().height(48.dp)
            ) { Text("Save", fontWeight = FontWeight.Bold) }

            Spacer(Modifier.height(28.dp))
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { app.signOut() }
                .background(Ask.ink2).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.AutoMirrored.Filled.Logout, "out", tint = Ask.muted)
                Spacer(Modifier.width(10.dp))
                Text("Sign out", color = Ask.text)
            }
            Spacer(Modifier.height(20.dp))
            Text("AskAI · Parable 6 · Ripo Team", color = Ask.muted, fontSize = 12.sp,
                modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
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
                title = { Text("Apps", color = Ask.text, fontWeight = FontWeight.Bold) },
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
                    Text("No apps yet", color = Ask.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Text("Ask Parable 6 to build a website or app.", color = Ask.muted, fontSize = 13.sp)
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
                            Text("Tap to open", color = Ask.muted, fontSize = 12.sp)
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
fun AppViewer(item: AppItem, onBack: () -> Unit) {
    Scaffold(
        containerColor = Ask.ink,
        topBar = {
            TopAppBar(
                title = { Text(item.name, color = Ask.text, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "back", tint = Ask.text) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Ask.ink)
            )
        }
    ) { pad ->
        AndroidView(
            modifier = Modifier.padding(pad).fillMaxSize(),
            factory = { ctx ->
                WebView(ctx).apply {
                    webViewClient = WebViewClient()
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    loadDataWithBaseURL(null, item.html, "text/html", "utf-8", null)
                }
            },
            update = { it.loadDataWithBaseURL(null, item.html, "text/html", "utf-8", null) }
        )
    }
}
