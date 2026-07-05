package gg.askai.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Text

/**
 * Lightweight Markdown renderer for chat replies. Handles headings, bold,
 * italic, inline code, fenced code blocks, bullet/numbered lists and links
 * (tap to open). Good enough to make Parable 6's answers read cleanly without
 * pulling in a heavy library.
 */
@Composable
fun Markdown(text: String, modifier: Modifier = Modifier) {
    val blocks = splitBlocks(text)
    Column(modifier) {
        blocks.forEach { b ->
            when (b) {
                is Block.Code -> CodeBlock(b.code)
                is Block.Para -> InlineText(b.text)
            }
        }
    }
}

private sealed class Block {
    data class Para(val text: String) : Block()
    data class Code(val code: String) : Block()
}

private fun splitBlocks(text: String): List<Block> {
    val out = mutableListOf<Block>()
    val lines = text.replace("\r\n", "\n").split("\n")
    var i = 0
    val para = StringBuilder()
    fun flush() { if (para.isNotBlank()) out.add(Block.Para(para.toString().trimEnd())); para.setLength(0) }
    while (i < lines.size) {
        val line = lines[i]
        if (line.trimStart().startsWith("```")) {
            flush()
            val code = StringBuilder(); i++
            while (i < lines.size && !lines[i].trimStart().startsWith("```")) { code.append(lines[i]).append("\n"); i++ }
            out.add(Block.Code(code.toString().trimEnd())); i++
            continue
        }
        para.append(line).append("\n"); i++
    }
    flush()
    return out
}

@Composable
private fun CodeBlock(code: String) {
    Box(
        Modifier.fillMaxWidth().padding(vertical = 6.dp)
            .clip(RoundedCornerShape(12.dp)).background(Ask.ink3)
    ) {
        Text(
            code, modifier = Modifier.horizontalScroll(rememberScrollState()).padding(12.dp),
            fontFamily = FontFamily.Monospace, fontSize = 13.5.sp, color = Ask.text
        )
    }
}

@Composable
private fun InlineText(block: String) {
    val uri = LocalUriHandler.current
    // Render line-by-line so we keep headings / list bullets.
    Column(Modifier.padding(vertical = 2.dp)) {
        block.split("\n").forEach { raw ->
            if (raw.isBlank()) { Spacer(Modifier.height(6.dp)); return@forEach }
            var line = raw
            var size = 16.sp; var weight = FontWeight.Normal; var indent = 0.dp
            when {
                line.startsWith("### ") -> { size = 17.sp; weight = FontWeight.Bold; line = line.removePrefix("### ") }
                line.startsWith("## ") -> { size = 19.sp; weight = FontWeight.Bold; line = line.removePrefix("## ") }
                line.startsWith("# ") -> { size = 22.sp; weight = FontWeight.Bold; line = line.removePrefix("# ") }
                line.trimStart().startsWith("- ") || line.trimStart().startsWith("* ") -> {
                    indent = 6.dp; line = "•  " + line.trimStart().drop(2)
                }
                Regex("^\\s*\\d+\\.\\s").containsMatchIn(line) -> { indent = 6.dp }
                line.startsWith("> ") -> { indent = 8.dp; line = line.removePrefix("> ") }
            }
            val annotated = buildInline(line)
            Text(
                annotated, fontSize = size, fontWeight = weight, color = Ask.text,
                modifier = Modifier.padding(start = indent, top = 1.dp, bottom = 1.dp)
            )
        }
    }
}

private fun buildInline(s: String) = buildAnnotatedString {
    var i = 0
    fun link(url: String, label: String) {
        withLink(LinkAnnotation.Url(url, TextLinkStyles(SpanStyle(color = LinkBlue, textDecoration = TextDecoration.Underline)))) {
            append(label)
        }
    }
    while (i < s.length) {
        val rest = s.substring(i)
        // [label](url)
        val md = Regex("^\\[([^\\]]+)\\]\\((https?://[^)]+)\\)").find(rest)
        if (md != null) { link(md.groupValues[2], md.groupValues[1]); i += md.value.length; continue }
        // bare url
        val bare = Regex("^(https?://[^\\s)]+)").find(rest)
        if (bare != null) { link(bare.groupValues[1], bare.groupValues[1]); i += bare.value.length; continue }
        // **bold**
        val b = Regex("^\\*\\*([^*]+)\\*\\*").find(rest)
        if (b != null) { withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(b.groupValues[1]) }; i += b.value.length; continue }
        // *italic* or _italic_
        val it = Regex("^([*_])([^*_]+)\\1").find(rest)
        if (it != null && it.groupValues[2].isNotBlank()) { withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(it.groupValues[2]) }; i += it.value.length; continue }
        // `code`
        val c = Regex("^`([^`]+)`").find(rest)
        if (c != null) { withStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = CodeBg)) { append(c.groupValues[1]) }; i += c.value.length; continue }
        append(s[i]); i++
    }
}

private val LinkBlue = androidx.compose.ui.graphics.Color(0xFF0A84FF)
private val CodeBg = androidx.compose.ui.graphics.Color(0x22808080)
