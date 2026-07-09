package gg.askai.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import gg.askai.android.data.AppState
import gg.askai.android.data.Supa
import gg.askai.android.ui.AskAITheme
import gg.askai.android.ui.Ask
import gg.askai.android.ui.ActivityScreen
import gg.askai.android.ui.AgentsScreen
import gg.askai.android.ui.ChatScreen
import gg.askai.android.ui.KnowledgeScreen
import gg.askai.android.ui.SettingsScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Supa.init(applicationContext)
        setContent {
            val app: AppState = viewModel()
            val dark = when (app.themeMode) {
                "dark" -> true
                "light" -> false
                else -> androidx.compose.foundation.isSystemInDarkTheme()
            }
            AskAITheme(dark = dark) {
                Surface(color = Ask.ink) {
                    LaunchedEffect(Unit) { app.boot(applicationContext) }
                    when {
                        app.booting -> Splash()
                        !app.authed -> AuthScreen(app)
                        app.screen == "settings" -> SettingsScreen(app)
                        app.screen == "agents" -> AgentsScreen(app)
                        app.screen == "activity" -> ActivityScreen(app)
                        app.screen == "knowledge" -> KnowledgeScreen(app)
                        else -> ChatScreen(app)
                    }
                }
            }
        }
    }
}

@Composable
private fun Splash() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("✦", fontSize = 44.sp, color = Ask.text)
            Spacer(Modifier.height(12.dp))
            Text("AskAI", fontSize = 26.sp, fontWeight = FontWeight.Black, color = Ask.text)
            Spacer(Modifier.height(16.dp))
            CircularProgressIndicator(color = Ask.muted, strokeWidth = 2.dp)
        }
    }
}

@Composable
private fun AuthScreen(app: AppState) {
    var isSignUp by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().padding(24.dp).verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(Modifier.height(60.dp))
        Text("✦", fontSize = 48.sp, color = Ask.text)
        Spacer(Modifier.height(10.dp))
        Text("AskAI", fontSize = 32.sp, fontWeight = FontWeight.Black, color = Ask.text)
        Text("Your team of AI agents · Parable 6", fontSize = 13.sp, color = Ask.muted)
        Spacer(Modifier.height(28.dp))

        OutlinedTextField(email, { email = it }, label = { Text("Email") },
            singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(password, { password = it }, label = { Text("Password") },
            singleLine = true, visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth())

        error?.let { Spacer(Modifier.height(8.dp)); Text(it, color = MaterialTheme.colorScheme.error, fontSize = 13.sp) }
        Spacer(Modifier.height(16.dp))

        Button(
            onClick = {
                busy = true; error = null
                val cb: (String) -> Unit = { error = it; busy = false }
                if (isSignUp) app.signUp(email.trim(), password, cb) else app.signIn(email.trim(), password, cb)
            },
            enabled = !busy && email.isNotBlank() && password.length >= 6,
            colors = ButtonDefaults.buttonColors(containerColor = Ask.accent, contentColor = Ask.onAccent),
            modifier = Modifier.fillMaxWidth().height(52.dp)
        ) {
            if (busy) CircularProgressIndicator(color = Ask.onAccent, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
            else Text(if (isSignUp) "Create account" else "Sign in", fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(14.dp))
        TextButton({ isSignUp = !isSignUp }) {
            Text(if (isSignUp) "Have an account? Sign in" else "New here? Create an account", color = Ask.muted)
        }
    }
}
