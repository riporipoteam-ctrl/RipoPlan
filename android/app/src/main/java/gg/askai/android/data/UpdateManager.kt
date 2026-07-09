package gg.askai.android.data

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Self-updater for the sideloaded APK. Checks the rolling `android-latest`
 * GitHub release, downloads the new AskAI.apk and hands it to the system
 * package installer. Works because every release is signed with the same
 * committed key — Android then updates in place, keeping all app data.
 */
object UpdateManager {
    private const val RELEASE_API =
        "https://api.github.com/repos/riporipoteam-ctrl/RipoPlan/releases/tags/android-latest"

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()

    data class Release(val version: String, val apkUrl: String)

    /** Latest published version + APK url, or null if the check failed. */
    suspend fun latest(): Release? = withContext(Dispatchers.IO) {
        runCatching {
            val req = Request.Builder().url(RELEASE_API)
                .addHeader("Accept", "application/vnd.github+json")
                .addHeader("User-Agent", "AskAI-Android").build()
            http.newCall(req).execute().use { r ->
                if (!r.isSuccessful) return@withContext null
                val j = JSONObject(r.body?.string() ?: "{}")
                val ver = Regex("v(\\d+\\.\\d+\\.\\d+)").find(j.optString("body", ""))
                    ?.groupValues?.get(1) ?: return@withContext null
                val assets = j.optJSONArray("assets") ?: return@withContext null
                for (i in 0 until assets.length()) {
                    val a = assets.optJSONObject(i) ?: continue
                    if (a.optString("name").endsWith(".apk"))
                        return@withContext Release(ver, a.optString("browser_download_url"))
                }
                null
            }
        }.getOrNull()
    }

    fun currentVersion(ctx: Context): String =
        runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }
            .getOrNull() ?: "1.0.0"

    /** True when [remote] is strictly newer than the installed version. */
    fun isNewer(remote: String, local: String): Boolean {
        val r = remote.split(".").mapNotNull { it.toIntOrNull() }
        val l = local.split(".").mapNotNull { it.toIntOrNull() }
        for (i in 0 until maxOf(r.size, l.size)) {
            val a = r.getOrElse(i) { 0 }; val b = l.getOrElse(i) { 0 }
            if (a != b) return a > b
        }
        return false
    }

    /**
     * Download the APK and open the system installer. Returns null on success,
     * otherwise an error message. Android shows its own install/update UI.
     */
    suspend fun downloadAndInstall(ctx: Context, apkUrl: String): String? {
        val file = withContext(Dispatchers.IO) {
            runCatching {
                val dir = File(ctx.cacheDir, "updates").apply { mkdirs() }
                val out = File(dir, "AskAI-update.apk")
                val req = Request.Builder().url(apkUrl)
                    .addHeader("User-Agent", "AskAI-Android").build()
                http.newCall(req).execute().use { r ->
                    if (!r.isSuccessful) return@runCatching null
                    out.outputStream().use { o -> r.body?.byteStream()?.copyTo(o) }
                }
                if (out.length() > 1_000_000) out else null
            }.getOrNull()
        } ?: return "Download failed — check your connection and try again."

        return runCatching {
            val uri = FileProvider.getUriForFile(ctx, "gg.askai.android.fileprovider", file)
            ctx.startActivity(Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            })
            null
        }.getOrElse { "Couldn't open the installer: ${it.message}" }
    }
}
