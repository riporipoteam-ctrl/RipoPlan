package gg.askai.android.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import gg.askai.android.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Self-update for the sideloaded APK. Checks the rolling GitHub "android-latest"
 * pre-release for a newer AskAI.apk, downloads it, and hands it to the system
 * package installer. This is the Android equivalent of the iOS SideStore flow —
 * no Play Store needed. The user allows "install unknown apps" once.
 */
object Updater {
    private const val RELEASE_API =
        "https://api.github.com/repos/riporipoteam-ctrl/RipoPlan/releases/tags/android-latest"

    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS).readTimeout(120, TimeUnit.SECONDS).build()

    data class Update(val version: String, val url: String)

    val currentVersion: String get() = BuildConfig.VERSION_NAME

    /** Returns an Update if the release is newer than what's installed, else null. */
    suspend fun check(): Update? = withContext(Dispatchers.IO) {
        val json = get(RELEASE_API) ?: return@withContext null
        val obj = runCatching { JSONObject(json) }.getOrNull() ?: return@withContext null
        val body = obj.optString("body", "") + " " + obj.optString("name", "")
        val version = Regex("v?(\\d+\\.\\d+\\.\\d+)").find(body)?.groupValues?.get(1)
            ?: return@withContext null
        val assets = obj.optJSONArray("assets") ?: return@withContext null
        var apk: String? = null
        for (i in 0 until assets.length()) {
            val a = assets.optJSONObject(i) ?: continue
            if (a.optString("name").endsWith(".apk")) { apk = a.optString("browser_download_url"); break }
        }
        val url = apk ?: return@withContext null
        if (isNewer(version, currentVersion)) Update(version, url) else null
    }

    /** Download the APK to cache and launch the installer. Returns false on failure. */
    suspend fun downloadAndInstall(ctx: Context, url: String, onProgress: (Float) -> Unit): Boolean =
        withContext(Dispatchers.IO) {
            val out = File(ctx.cacheDir, "AskAI-update.apk")
            val ok = runCatching {
                val req = Request.Builder().url(url).header("User-Agent", "AskAI-Android").build()
                http.newCall(req).execute().use { r ->
                    if (!r.isSuccessful) return@runCatching false
                    val body = r.body ?: return@runCatching false
                    val total = body.contentLength().coerceAtLeast(1)
                    out.outputStream().use { fos ->
                        body.byteStream().use { ins ->
                            val buf = ByteArray(64 * 1024); var read = 0L; var n: Int
                            while (ins.read(buf).also { n = it } != -1) {
                                fos.write(buf, 0, n); read += n
                                onProgress((read.toFloat() / total).coerceIn(0f, 1f))
                            }
                        }
                    }
                    true
                }
            }.getOrDefault(false)
            if (!ok || out.length() < 100_000) return@withContext false
            launchInstaller(ctx, out)
            true
        }

    private fun launchInstaller(ctx: Context, apk: File) {
        val uri: Uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", apk)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        ctx.startActivity(intent)
    }

    private fun isNewer(remote: String, local: String): Boolean {
        val a = remote.split(".").mapNotNull { it.toIntOrNull() }
        val b = local.split(".").mapNotNull { it.toIntOrNull() }
        for (i in 0 until maxOf(a.size, b.size)) {
            val x = a.getOrElse(i) { 0 }; val y = b.getOrElse(i) { 0 }
            if (x != y) return x > y
        }
        return false
    }

    private fun get(url: String): String? = runCatching {
        val req = Request.Builder().url(url)
            .header("User-Agent", "AskAI-Android").header("Accept", "application/vnd.github+json").build()
        http.newCall(req).execute().use { r -> if (r.isSuccessful) r.body?.string() else null }
    }.getOrNull()
}
