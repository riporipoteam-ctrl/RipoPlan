package gg.askai.android.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color

/** ChatGPT-style monochrome palette (mirrors the iOS Theme). */
data class AskColors(
    val ink: Color, val ink2: Color, val ink3: Color,
    val text: Color, val muted: Color, val stroke: Color,
    val accent: Color, val onAccent: Color, val blue: Color, val good: Color
)

val LightColors = AskColors(
    ink = Color(0xFFFFFFFF), ink2 = Color(0xFFF4F4F5), ink3 = Color(0xFFECECEE),
    text = Color(0xFF0D0D0D), muted = Color(0xFF6E6E80), stroke = Color(0x14000000),
    accent = Color(0xFF0D0D0D), onAccent = Color(0xFFFFFFFF), blue = Color(0xFF0A84FF), good = Color(0xFF16A34A)
)
val DarkColors = AskColors(
    ink = Color(0xFF0D0D0D), ink2 = Color(0xFF1C1C1E), ink3 = Color(0xFF262628),
    text = Color(0xFFECECEC), muted = Color(0xFF9A9AA0), stroke = Color(0x1AFFFFFF),
    accent = Color(0xFFFFFFFF), onAccent = Color(0xFF0D0D0D), blue = Color(0xFF0A84FF), good = Color(0xFF16A34A)
)

val LocalAsk = compositionLocalOf { LightColors }
val Ask: AskColors @Composable get() = LocalAsk.current

/**
 * App theme. mode: "light" (default), "dark", or "system".
 * Light is the product default — dark only when the user picks it
 * (or picks System on a dark phone).
 */
@Composable
fun AskAITheme(mode: String = "light", content: @Composable () -> Unit) {
    val dark = when (mode) {
        "dark" -> true
        "system" -> isSystemInDarkTheme()
        else -> false
    }
    val ask = if (dark) DarkColors else LightColors
    val scheme = if (dark)
        darkColorScheme(background = ask.ink, surface = ask.ink, primary = ask.accent, onPrimary = ask.onAccent)
    else
        lightColorScheme(background = ask.ink, surface = ask.ink, primary = ask.accent, onPrimary = ask.onAccent)
    androidx.compose.runtime.CompositionLocalProvider(LocalAsk provides ask) {
        MaterialTheme(colorScheme = scheme, typography = Typography(), content = content)
    }
}
