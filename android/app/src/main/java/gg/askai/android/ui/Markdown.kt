package gg.askai.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.ClickableText
import androidx.compose.material3.Divider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Small, dependency-free Markdown renderer for chat replies: headers, bullets,
 * numbered lists, bold/italic/inline code, fenced code blocks, links, rules.
 */
@Composable
fun MarkdownText(text: String, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        val segments = text.split("```")
        segments.forEachIndexed { idx, seg ->
            if (idx % 2 == 1) CodeBlock(seg)
            else seg.trim('\n').lineSequence().forEach { line -> MarkdownLine(line) }
        }
    }
}

@Composable
private fun CodeBlock(raw: String) {
    // Drop the language tag from the opening fence line.
    val code = raw.trim('\n').lineSequence()
        .filterIndexed { i, l -> !(i == 0 && l.isNotEmpty() && !l.contains(" ") && l.length < 20) }
        .joinToString("\n").ifEmpty { raw.trim('\n') }
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Ask.ink2)
            .horizontalScroll(rememberScrollState()).padding(12.dp)
    ) {
        Text(code, color = Ask.text, fontFamily = FontFamily.Monospace, fontSize = 13.sp, lineHeight = 19.sp)
    }
}

@Composable
private fun MarkdownLine(line: String) {
    val trimmed = line.trim()
    when {
        trimmed.isEmpty() -> Spacer(Modifier.height(2.dp))
        trimmed == "---" || trimmed == "***" -> Divider(color = Ask.stroke)
        trimmed.startsWith("### ") -> Text(inline(trimmed.drop(4)), color = Ask.text,
            fontSize = 16.sp, fontWeight = FontWeight.Bold, lineHeight = 22.sp)
        trimmed.startsWith("## ") -> Text(inline(trimmed.drop(3)), color = Ask.text,
            fontSize = 17.sp, fontWeight = FontWeight.Bold, lineHeight = 23.sp)
        trimmed.startsWith("# ") -> Text(inline(trimmed.drop(2)), color = Ask.text,
            fontSize = 19.sp, fontWeight = FontWeight.Bold, lineHeight = 25.sp)
        trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ") ->
            BulletRow("•", trimmed.drop(2))
        Regex("^\\d{1,2}\\. ").containsMatchIn(trimmed) -> {
            val dot = trimmed.indexOf(". ")
            BulletRow(trimmed.take(dot + 1), trimmed.drop(dot + 2))
        }
        trimmed.startsWith("> ") -> Row {
            Box(Modifier.width(3.dp).height(20.dp).clip(RoundedCornerShape(2.dp)).background(Ask.muted))
            Spacer(Modifier.width(8.dp))
            LinkableText(inline(trimmed.drop(2)), 15.sp)
        }
        else -> LinkableText(inline(trimmed), 16.sp)
    }
}

@Composable
private fun BulletRow(marker: String, content: String) {
    Row {
        Text(marker, color = Ask.muted, fontSize = 16.sp, modifier = Modifier.padding(end = 8.dp))
        LinkableText(inline(content), 16.sp)
    }
}

@Composable
private fun LinkableText(text: AnnotatedString, size: androidx.compose.ui.unit.TextUnit) {
    val uriHandler = LocalUriHandler.current
    ClickableText(
        text = text,
        style = TextStyle(color = Ask.text, fontSize = size, lineHeight = size * 1.45),
        onClick = { offset ->
            text.getStringAnnotations("url", offset, offset).firstOrNull()?.let {
                runCatching { uriHandler.openUri(it.item) }
            }
        }
    )
}

/** Inline spans: **bold**, *italic*, `code`, [links](url). */
@Composable
private fun inline(text: String): AnnotatedString {
    val codeBg = Ask.ink3
    val linkColor = Ask.blue
    return buildAnnotatedString {
        val rx = Regex("(\\*\\*(.+?)\\*\\*)|(\\*([^*]+?)\\*)|(`([^`]+)`)|(\\[([^\\]]+)]\\(([^)\\s]+)\\))")
        var i = 0
        for (m in rx.findAll(text)) {
            append(text.substring(i, m.range.first))
            when {
                m.groups[2] != null -> withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(m.groups[2]!!.value) }
                m.groups[4] != null -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(m.groups[4]!!.value) }
                m.groups[6] != null -> withStyle(SpanStyle(fontFamily = FontFamily.Monospace,
                    background = codeBg, fontSize = 14.sp)) { append(m.groups[6]!!.value) }
                m.groups[8] != null -> {
                    pushStringAnnotation("url", m.groups[9]!!.value)
                    withStyle(SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline)) {
                        append(m.groups[8]!!.value)
                    }
                    pop()
                }
            }
            i = m.range.last + 1
        }
        append(text.substring(i))
    }
}
