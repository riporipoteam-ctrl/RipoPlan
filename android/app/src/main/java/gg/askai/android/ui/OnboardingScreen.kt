package gg.askai.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import gg.askai.android.data.AppState

/** First-run welcome after sign-up: intro → your name → workspace name. */
@Composable
fun OnboardingScreen(app: AppState) {
    var step by remember { mutableStateOf(0) }
    var name by remember { mutableStateOf("") }
    var workspace by remember { mutableStateOf("") }

    Column(
        Modifier.fillMaxSize().background(Ask.ink).verticalScroll(rememberScrollState())
            .padding(horizontal = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(Modifier.height(80.dp))
        Text("✦", fontSize = 52.sp, color = Ask.text)
        Spacer(Modifier.height(12.dp))

        when (step) {
            0 -> {
                Text("Welcome to AskAI", fontSize = 28.sp, fontWeight = FontWeight.Black, color = Ask.text)
                Spacer(Modifier.height(6.dp))
                Text("Your team of AI agents, powered by Parable 6.", color = Ask.muted, fontSize = 15.sp)
                Spacer(Modifier.height(28.dp))
                OnboardRow(Icons.Default.Forum, "Chat with your team",
                    "Every chat is saved to your account — pick it up on the web or iOS.")
                OnboardRow(Icons.Default.TravelExplore, "Live answers",
                    "Parable 6 searches the web, reads images and generates pictures.")
                OnboardRow(Icons.Default.Psychology, "It remembers",
                    "Durable facts about you are saved to memory and used everywhere.")
                Spacer(Modifier.height(32.dp))
                OnboardButton("Continue") { step = 1 }
            }
            1 -> {
                Text("What's your name?", fontSize = 26.sp, fontWeight = FontWeight.Black, color = Ask.text)
                Spacer(Modifier.height(6.dp))
                Text("Your agents use it to talk to you.", color = Ask.muted, fontSize = 15.sp)
                Spacer(Modifier.height(24.dp))
                OutlinedTextField(
                    name, { name = it }, singleLine = true,
                    placeholder = { Text("Your name", color = Ask.muted) },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Ask.text, unfocusedTextColor = Ask.text,
                        cursorColor = Ask.text,
                        focusedBorderColor = Ask.muted, unfocusedBorderColor = Ask.stroke),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(24.dp))
                OnboardButton("Continue") { step = 2 }
            }
            else -> {
                Text("Name your workspace", fontSize = 26.sp, fontWeight = FontWeight.Black, color = Ask.text)
                Spacer(Modifier.height(6.dp))
                Text("Where you and your agents get things done.", color = Ask.muted, fontSize = 15.sp)
                Spacer(Modifier.height(24.dp))
                OutlinedTextField(
                    workspace, { workspace = it }, singleLine = true,
                    placeholder = { Text(if (name.isBlank()) "My Workspace" else "${name.trim()}'s Workspace", color = Ask.muted) },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Ask.text, unfocusedTextColor = Ask.text,
                        cursorColor = Ask.text,
                        focusedBorderColor = Ask.muted, unfocusedBorderColor = Ask.stroke),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(24.dp))
                OnboardButton("Let's go") { app.finishOnboarding(name, workspace) }
            }
        }

        Spacer(Modifier.height(14.dp))
        TextButton({ app.finishOnboarding(name, workspace) }) {
            Text("Skip", color = Ask.muted)
        }
        Spacer(Modifier.height(40.dp))
    }
}

@Composable
private fun OnboardRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, body: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp)) {
        Box(
            Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(Ask.ink2),
            contentAlignment = Alignment.Center
        ) { Icon(icon, null, tint = Ask.text, modifier = Modifier.size(20.dp)) }
        Spacer(Modifier.width(14.dp))
        Column {
            Text(title, color = Ask.text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            Text(body, color = Ask.muted, fontSize = 13.sp, lineHeight = 18.sp)
        }
    }
}

@Composable
private fun OnboardButton(label: String, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(containerColor = Ask.accent, contentColor = Ask.onAccent),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth().height(52.dp)
    ) { Text(label, fontWeight = FontWeight.Bold, fontSize = 16.sp) }
}
