package gg.askai.android.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import gg.askai.android.agent.AgentRunner
import gg.askai.android.data.AppState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/**
 * Live voice-call mode: a continuous, hands-free conversation with Parable 6.
 * Listens with the on-device recognizer, sends the transcript through the same
 * agent engine, speaks the reply, then listens again — like a phone call.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VoiceCallScreen(app: AppState, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var phase by remember { mutableStateOf("idle") }        // idle|listening|thinking|speaking
    var caption by remember { mutableStateOf("Tap to start a live conversation") }
    var active by remember { mutableStateOf(false) }
    var granted by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED)
    }
    val session = remember { VoiceSession(ctx, scope, { phase = it }, { caption = it }) }
    DisposableEffect(Unit) { session.init(); onDispose { session.release() } }

    val permLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        granted = ok
        if (ok) { active = true; session.start() }
    }

    fun toggle() {
        if (!granted) { permLauncher.launch(Manifest.permission.RECORD_AUDIO); return }
        if (active) { active = false; session.stop() } else { active = true; session.start() }
    }

    Scaffold(
        containerColor = Ask.ink,
        topBar = {
            TopAppBar(
                title = { Text("Voice call", color = Ask.text, fontWeight = FontWeight.Bold) },
                navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "back", tint = Ask.text) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Ask.ink)
            )
        }
    ) { pad ->
        Column(
            Modifier.padding(pad).fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text("✦ Parable 6", color = Ask.muted, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            Spacer(Modifier.height(28.dp))
            VoiceOrb(phase)
            Spacer(Modifier.height(28.dp))
            Text(
                when (phase) {
                    "listening" -> "Listening…"; "thinking" -> "Thinking…"
                    "speaking" -> "Speaking…"; else -> if (active) "Connecting…" else "Ready"
                },
                color = Ask.text, fontSize = 20.sp, fontWeight = FontWeight.SemiBold
            )
            Spacer(Modifier.height(10.dp))
            Text(caption, color = Ask.muted, fontSize = 15.sp, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().heightIn(min = 60.dp))
            Spacer(Modifier.height(36.dp))
            Button(
                onClick = { toggle() },
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (active) MaterialTheme.colorScheme.error else Ask.accent,
                    contentColor = if (active) androidx.compose.ui.graphics.Color.White else Ask.onAccent
                ),
                modifier = Modifier.height(56.dp).fillMaxWidth(0.7f)
            ) {
                Icon(if (active) Icons.Default.CallEnd else Icons.Default.Call, "toggle")
                Spacer(Modifier.width(10.dp))
                Text(if (active) "End call" else "Start call", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            }
        }
    }
}

@Composable
private fun VoiceOrb(phase: String) {
    val transition = rememberInfiniteTransition(label = "orb")
    val pulse by transition.animateFloat(
        initialValue = 1f, targetValue = if (phase == "idle") 1f else 1.18f,
        animationSpec = infiniteRepeatable(tween(700, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "pulse"
    )
    Box(
        Modifier.size(160.dp).scale(pulse).clip(CircleShape)
            .background(if (phase == "speaking") Ask.blue else Ask.accent),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            when (phase) {
                "listening" -> Icons.Default.Mic; "thinking" -> Icons.Default.MoreHoriz
                "speaking" -> Icons.Default.GraphicEq; else -> Icons.Default.Call
            },
            "state", tint = Ask.onAccent, modifier = Modifier.size(56.dp)
        )
    }
}

/** Drives SpeechRecognizer ↔ AgentRunner ↔ TextToSpeech in a continuous loop. */
private class VoiceSession(
    private val ctx: Context,
    private val scope: CoroutineScope,
    private val onPhase: (String) -> Unit,
    private val onCaption: (String) -> Unit,
) {
    private val history = JSONArray()
    private var tts: TextToSpeech? = null
    private var sr: SpeechRecognizer? = null
    private var active = false
    private val main = Handler(Looper.getMainLooper())

    fun init() {
        tts = TextToSpeech(ctx) { status -> if (status == TextToSpeech.SUCCESS) tts?.language = Locale.US }
        if (SpeechRecognizer.isRecognitionAvailable(ctx)) {
            sr = SpeechRecognizer.createSpeechRecognizer(ctx).also { it.setRecognitionListener(listener) }
        }
    }

    fun start() { active = true; listen() }
    fun stop() { active = false; main.post { runCatching { sr?.cancel() } }; tts?.stop(); onPhase("idle"); onCaption("Tap to talk again") }
    fun release() { active = false; main.post { runCatching { sr?.destroy() } }; tts?.stop(); tts?.shutdown() }

    private fun listen() {
        onPhase("listening"); onCaption("Listening…")
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
        }
        main.post { runCatching { sr?.startListening(intent) } }
    }

    private val listener = object : RecognitionListener {
        override fun onResults(results: Bundle) {
            val text = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty().trim()
            if (text.isEmpty()) { if (active) main.postDelayed({ if (active) listen() }, 300); return }
            onCaption(text); onPhase("thinking")
            history.put(JSONObject().put("role", "user").put("content", text))
            scope.launch {
                val res = AgentRunner.run(clone()) { }
                history.put(JSONObject().put("role", "assistant").put("content", res.text))
                if (active) speak(res.text) else onPhase("idle")
            }
        }
        override fun onError(error: Int) { if (active) main.postDelayed({ if (active) listen() }, 500) }
        override fun onPartialResults(partial: Bundle) {
            partial.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                ?.let { if (it.isNotBlank()) onCaption(it) }
        }
        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rms: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    private fun speak(text: String) {
        onPhase("speaking"); onCaption(text)
        val t = tts ?: run { if (active) listen(); return }
        t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}
            override fun onDone(utteranceId: String?) { main.post { if (active) listen() } }
            @Deprecated("deprecated") override fun onError(utteranceId: String?) { main.post { if (active) listen() } }
        })
        t.speak(text.take(1200), TextToSpeech.QUEUE_FLUSH, null, "askai")
    }

    private fun clone(): JSONArray {
        val a = JSONArray(); for (i in 0 until history.length()) a.put(history.getJSONObject(i)); return a
    }
}
