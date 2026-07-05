package gg.askai.android.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

/**
 * A short branded World Cup 2026 intro that plays once per launch: a soccer ball
 * spins in with an overshoot, the AskAI wordmark reveals, then it fades to the
 * app. Tap to skip. Mirrors the iOS launch animation.
 */
@Composable
fun WorldCupIntro(onDone: () -> Unit) {
    val ballScale = remember { Animatable(0f) }
    val ballSpin = remember { Animatable(-120f) }
    var reveal by remember { mutableStateOf(false) }
    var leaving by remember { mutableStateOf(false) }
    val fade by androidx.compose.animation.core.animateFloatAsState(
        targetValue = if (leaving) 0f else 1f, animationSpec = tween(420), label = "fade"
    )

    LaunchedEffect(Unit) {
        ballScale.animateTo(1f, spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessLow))
        ballSpin.animateTo(0f, tween(600, easing = FastOutSlowInEasing))
    }
    LaunchedEffect(Unit) { delay(320); reveal = true }
    LaunchedEffect(Unit) { delay(2500); leaving = true; delay(430); onDone() }

    val titleAlpha by androidx.compose.animation.core.animateFloatAsState(
        targetValue = if (reveal) 1f else 0f, animationSpec = tween(560), label = "title"
    )
    val glow = rememberInfiniteTransition(label = "glow")
    val glowScale by glow.animateFloat(
        1f, 1.12f, infiniteRepeatable(tween(900, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "g"
    )

    Box(
        Modifier.fillMaxSize()
            .background(Brush.verticalGradient(listOf(Color(0xFF0B0B0C), Color(0xFF14110A), Color(0xFF0B0B0C))))
            .alpha(fade)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {
                leaving = true
            },
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(contentAlignment = Alignment.Center) {
                Box(Modifier.size(150.dp).scale(glowScale)
                    .background(Brush.radialGradient(listOf(Color(0x33FFD34E), Color(0x00000000)))))
                Text("⚽", fontSize = 88.sp,
                    modifier = Modifier.scale(ballScale.value).rotate(ballSpin.value))
            }
            Spacer(Modifier.height(24.dp))
            Text("AskAI", color = Color.White, fontSize = 40.sp, fontWeight = FontWeight.Black,
                modifier = Modifier.alpha(titleAlpha))
            Spacer(Modifier.height(6.dp))
            Text("🏆  World Cup 2026", color = Color(0xFFFFD34E), fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.alpha(titleAlpha))
            Spacer(Modifier.height(2.dp))
            Text("Powered by Parable 6", color = Color(0xFF9A9AA0), fontSize = 12.sp,
                modifier = Modifier.alpha(titleAlpha))
        }
    }
}
