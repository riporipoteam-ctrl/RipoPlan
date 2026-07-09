package gg.askai.android.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import coil.compose.AsyncImage
import gg.askai.android.data.AppState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

private const val WEB_APP_URL = "https://riporipoteam-ctrl.github.io/RipoPlan/"
private const val RELEASES_URL = "https://github.com/riporipoteam-ctrl/RipoPlan/releases/tag/android-latest"

@Composable
fun SettingsScreen(app: AppState) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    var confirmSignOut by remember { mutableStateOf(false) }
    var editName by remember { mutableStateOf(false) }
    var editWorkspace by remember { mutableStateOf(false) }
    var checkingUpdate by remember { mutableStateOf(false) }
    val version = remember {
        runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }
            .getOrNull() ?: "1.0.0"
    }

    BackHandler { app.showSettings = false }

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
                IconButton({ app.showSettings = false }) {
                    Icon(Icons.Default.ArrowBack, "back", tint = Ask.text)
                }
                Text("Settings", fontWeight = FontWeight.Bold, fontSize = 17.sp, color = Ask.text)
            }
        }
    ) { pad ->
        Column(
            Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Profile
            SettingsCard {
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    ProfileAvatar(app.displayName, app.avatarUrl, 76.dp)
                    Spacer(Modifier.height(10.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable { editName = true }.padding(4.dp)
                    ) {
                        Text(app.displayName, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Ask.text)
                        Spacer(Modifier.width(6.dp))
                        Icon(Icons.Default.Edit, "edit name", tint = Ask.muted, modifier = Modifier.size(14.dp))
                    }
                    if (app.userEmail.isNotEmpty())
                        Text(app.userEmail, fontSize = 13.sp, color = Ask.muted)
                }
            }

            // Appearance
            SettingsCard {
                SectionTitle("Appearance")
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ThemeChip("System", "system", app, Modifier.weight(1f))
                    ThemeChip("Light", "light", app, Modifier.weight(1f))
                    ThemeChip("Dark", "dark", app, Modifier.weight(1f))
                }
                Caption("Match your phone, or pick a look. AskAI's signature dark theme is one tap away.")
            }

            // Workspace
            SettingsCard {
                SectionTitle("Workspace")
                SettingsRow(Icons.Default.Business, app.workspaceName.ifEmpty { "My Workspace" },
                    trailing = "Rename") { editWorkspace = true }
                Divider(color = Ask.stroke)
                Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Forum, null, tint = Ask.text, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(12.dp))
                    Text("Chats", color = Ask.text, fontSize = 15.sp)
                    Spacer(Modifier.weight(1f))
                    Text("${app.threads.size}", color = Ask.muted, fontSize = 14.sp)
                }
                Caption("Everything here is shared with the web app and iOS — same account, same workspace.")
            }

            // Data & sync
            SettingsCard {
                SectionTitle("Data & sync")
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                        .clickable(enabled = !app.refreshing) { app.refreshData() }
                        .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (app.refreshing)
                        CircularProgressIndicator(Modifier.size(20.dp), color = Ask.muted, strokeWidth = 2.dp)
                    else Icon(Icons.Default.Refresh, null, tint = Ask.text, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(12.dp))
                    Text(if (app.refreshing) "Refreshing…" else "Refresh data", color = Ask.text, fontSize = 15.sp)
                }
                Caption("Chats are saved to your AskAI account in the cloud as you go. If something looks out of date, pull everything fresh here.")
            }

            // Web app
            SettingsCard {
                SectionTitle("AskAI everywhere")
                SettingsRow(Icons.Default.Language, "Open AskAI on the web", chevron = true) {
                    ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(WEB_APP_URL)))
                }
                Caption("The full workspace — agents, channels and mini-apps — in your browser.")
            }

            // Updates + about
            SettingsCard {
                SectionTitle("About")
                Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Android, null, tint = Ask.text, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(12.dp))
                    Text("Version", color = Ask.text, fontSize = 15.sp)
                    Spacer(Modifier.weight(1f))
                    Text("v$version", color = Ask.muted, fontSize = 14.sp)
                }
                Divider(color = Ask.stroke)
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                        .clickable(enabled = !checkingUpdate) {
                            checkingUpdate = true
                            scope.launch {
                                val latest = fetchLatestVersion()
                                checkingUpdate = false
                                when {
                                    latest == null -> app.toast = "Couldn't check for updates — try again later."
                                    latest == version -> app.toast = "You're on the latest version."
                                    else -> ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(RELEASES_URL)))
                                }
                            }
                        }
                        .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (checkingUpdate)
                        CircularProgressIndicator(Modifier.size(20.dp), color = Ask.muted, strokeWidth = 2.dp)
                    else Icon(Icons.Default.SystemUpdate, null, tint = Ask.text, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(12.dp))
                    Text("Check for updates", color = Ask.text, fontSize = 15.sp)
                    Spacer(Modifier.weight(1f))
                    Icon(Icons.Default.ChevronRight, null, tint = Ask.muted, modifier = Modifier.size(18.dp))
                }
                Caption("Powered by Parable 6 — the flagship model by the Ripo Team. New APKs land on the android-latest release.")
            }

            // Sign out
            Button(
                onClick = { confirmSignOut = true },
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0x22EF4444), contentColor = Color(0xFFEF6B6B)),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth().height(52.dp)
            ) {
                Icon(Icons.Default.Logout, null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Sign out", fontWeight = FontWeight.SemiBold)
            }

            Text("AskAI • native Android", fontSize = 11.sp, color = Ask.muted,
                modifier = Modifier.align(Alignment.CenterHorizontally).padding(bottom = 24.dp))
        }
    }

    if (editName) EditTextDialog(
        title = "Edit name", initial = app.displayName,
        onDismiss = { editName = false },
        onSave = { app.updateDisplayName(it); editName = false })

    if (editWorkspace) EditTextDialog(
        title = "Rename workspace", initial = app.workspaceName,
        onDismiss = { editWorkspace = false },
        onSave = { app.renameWorkspace(it); editWorkspace = false })

    if (confirmSignOut) AlertDialog(
        onDismissRequest = { confirmSignOut = false },
        containerColor = Ask.ink2,
        title = { Text("Sign out of AskAI?", color = Ask.text) },
        text = { Text("Your chats stay safe in the cloud — sign back in anytime.", color = Ask.muted) },
        confirmButton = {
            TextButton({ confirmSignOut = false; app.signOut() }) {
                Text("Sign out", color = Color(0xFFEF6B6B), fontWeight = FontWeight.SemiBold)
            }
        },
        dismissButton = { TextButton({ confirmSignOut = false }) { Text("Cancel", color = Ask.muted) } }
    )
}

@Composable
fun ProfileAvatar(name: String, url: String?, size: androidx.compose.ui.unit.Dp) {
    Box(
        Modifier.size(size).clip(CircleShape).background(Ask.ink3),
        contentAlignment = Alignment.Center
    ) {
        if (!url.isNullOrEmpty()) {
            AsyncImage(url, "avatar", contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize())
        } else {
            Text(name.trim().take(1).uppercase().ifEmpty { "Y" },
                fontSize = (size.value / 2.4f).sp, fontWeight = FontWeight.Bold, color = Ask.text)
        }
    }
}

@Composable
private fun SettingsCard(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Ask.ink2)
            .padding(horizontal = 14.dp, vertical = 14.dp),
        content = content
    )
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ask.muted,
        modifier = Modifier.padding(bottom = 6.dp))
}

@Composable
private fun Caption(text: String) {
    Text(text, fontSize = 12.sp, color = Ask.muted, lineHeight = 16.sp,
        modifier = Modifier.padding(top = 6.dp))
}

@Composable
private fun SettingsRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    trailing: String? = null,
    chevron: Boolean = false,
    onClick: () -> Unit
) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, null, tint = Ask.text, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(12.dp))
        Text(label, color = Ask.text, fontSize = 15.sp, modifier = Modifier.weight(1f))
        trailing?.let { Text(it, color = Ask.muted, fontSize = 14.sp) }
        if (chevron) Icon(Icons.Default.ChevronRight, null, tint = Ask.muted, modifier = Modifier.size(18.dp))
    }
}

@Composable
private fun ThemeChip(label: String, mode: String, app: AppState, modifier: Modifier) {
    val selected = app.themeMode == mode
    Box(
        modifier.clip(RoundedCornerShape(12.dp))
            .background(if (selected) Ask.accent else Ask.ink3)
            .clickable { app.setTheme(mode) }
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(label, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
            color = if (selected) Ask.onAccent else Ask.text)
    }
}

@Composable
private fun EditTextDialog(title: String, initial: String, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    var draft by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Ask.ink2,
        title = { Text(title, color = Ask.text) },
        text = {
            OutlinedTextField(
                draft, { draft = it }, singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = Ask.text, unfocusedTextColor = Ask.text,
                    cursorColor = Ask.text,
                    focusedBorderColor = Ask.muted, unfocusedBorderColor = Ask.stroke),
                modifier = Modifier.fillMaxWidth()
            )
        },
        confirmButton = {
            TextButton({ onSave(draft) }, enabled = draft.trim().isNotEmpty()) {
                Text("Save", color = Ask.text, fontWeight = FontWeight.SemiBold)
            }
        },
        dismissButton = { TextButton(onDismiss) { Text("Cancel", color = Ask.muted) } }
    )
}

/** Latest published Android version from the rolling GitHub release ("1.0.57"), or null. */
private suspend fun fetchLatestVersion(): String? = withContext(Dispatchers.IO) {
    runCatching {
        val conn = java.net.URL("https://api.github.com/repos/riporipoteam-ctrl/RipoPlan/releases/tags/android-latest")
            .openConnection() as java.net.HttpURLConnection
        conn.connectTimeout = 10000; conn.readTimeout = 10000
        conn.setRequestProperty("Accept", "application/vnd.github+json")
        conn.setRequestProperty("User-Agent", "AskAI-Android")
        val body = conn.inputStream.bufferedReader().use { it.readText() }
        conn.disconnect()
        Regex("v(\\d+\\.\\d+\\.\\d+)").find(JSONObject(body).optString("body", ""))?.groupValues?.get(1)
    }.getOrNull()
}
