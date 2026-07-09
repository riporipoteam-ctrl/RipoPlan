package gg.askai.android.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Minimal Supabase client (Auth + PostgREST + Storage) built on OkHttp — same
 * public project as the iOS app and website. The anon key is public by design.
 *
 * Reliability: the access token is refreshed proactively before it expires and
 * every REST call retries once after a forced refresh on 401, so writes no
 * longer fail silently when the session goes stale mid-use.
 */
object Supa {
    const val baseURL = "https://xbwhvkzgbnyqsjplbyox.supabase.co"
    const val anonKey = "sb_publishable_Jcs8IXK6YnOwWe-qYAFecg_Tb6M-ohu"

    private val http = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()
    private val JSON = "application/json".toMediaType()

    var accessToken: String? = null
    var refreshToken: String? = null
    var userId: String? = null
    var email: String? = null

    /** Epoch seconds when the access token expires (0 = unknown). */
    private var expiresAt: Long = 0L

    /** Set when the server rejects our refresh token — the user must sign in again. */
    @Volatile var sessionExpired = false
        private set

    private val refreshLock = Mutex()
    private lateinit var prefs: android.content.SharedPreferences

    fun init(ctx: Context) {
        prefs = ctx.getSharedPreferences("askai", Context.MODE_PRIVATE)
        accessToken = prefs.getString("access", null)
        refreshToken = prefs.getString("refresh", null)
        userId = prefs.getString("uid", null)
        email = prefs.getString("email", null)
        expiresAt = prefs.getLong("expires", 0L)
    }

    val isAuthed get() = accessToken != null && userId != null

    // Small app preferences that ride on the same store (theme etc.).
    var themeMode: String
        get() = prefs.getString("theme", "system") ?: "system"
        set(v) { prefs.edit().putString("theme", v).apply() }

    private fun persist() {
        prefs.edit()
            .putString("access", accessToken).putString("refresh", refreshToken)
            .putString("uid", userId).putString("email", email)
            .putLong("expires", expiresAt).apply()
    }

    fun signOut() {
        accessToken = null; refreshToken = null; userId = null; email = null
        expiresAt = 0L; sessionExpired = false; persist()
    }

    private fun authHeader() = "Bearer " + (accessToken ?: anonKey)

    // MARK: Auth

    /** Returns null on success, otherwise a human-readable error message. */
    suspend fun signIn(email: String, password: String) = auth("token?grant_type=password", email, password)
    suspend fun signUp(email: String, password: String) = auth("signup", email, password)

    private suspend fun auth(path: String, email: String, password: String): String? = withContext(Dispatchers.IO) {
        val body = JSONObject().put("email", email).put("password", password).toString()
        val req = Request.Builder()
            .url("$baseURL/auth/v1/$path")
            .addHeader("apikey", anonKey)
            .addHeader("Content-Type", "application/json")
            .post(body.toRequestBody(JSON)).build()
        try {
            http.newCall(req).execute().use { resp ->
                val txt = resp.body?.string() ?: return@withContext "Empty response from the server."
                val j = runCatching { JSONObject(txt) }.getOrDefault(JSONObject())
                if (!resp.isSuccessful) return@withContext authErrorMessage(j, resp.code)
                val at = j.optString("access_token", "")
                if (at.isEmpty()) return@withContext "Sign-in didn't return a session — try again."
                applySession(j)
                val user = j.optJSONObject("user")
                userId = user?.optString("id")
                this@Supa.email = user?.optString("email") ?: email
                sessionExpired = false
                persist(); null
            }
        } catch (e: IOException) {
            "Couldn't reach the server — check your internet connection."
        }
    }

    private fun authErrorMessage(j: JSONObject, code: Int): String {
        val msg = j.optString("error_description",
            j.optString("msg", j.optString("message", "")))
        return when {
            msg.contains("Invalid login", true) -> "Wrong email or password."
            msg.contains("already registered", true) -> "That email already has an account — sign in instead."
            msg.isNotEmpty() -> msg
            code == 429 -> "Too many attempts — wait a minute and try again."
            else -> "Something went wrong (HTTP $code)."
        }
    }

    private fun applySession(j: JSONObject) {
        accessToken = j.optString("access_token", accessToken ?: "")
        val rt = j.optString("refresh_token", "")
        if (rt.isNotEmpty()) refreshToken = rt
        expiresAt = j.optLong("expires_at",
            System.currentTimeMillis() / 1000 + j.optLong("expires_in", 3600))
    }

    /**
     * Refresh the session if we have a refresh token. If the server explicitly
     * rejects it (revoked/expired), the session is cleared and [sessionExpired]
     * is set so the UI can bounce back to sign-in. Network errors leave the
     * current session untouched.
     */
    suspend fun refreshIfPossible(): Unit = withContext(Dispatchers.IO) {
        val rt = refreshToken ?: return@withContext
        refreshLock.withLock {
            // Another caller may have refreshed while we waited on the lock.
            if (rt != refreshToken) return@withLock
            val body = JSONObject().put("refresh_token", rt).toString()
            val req = Request.Builder().url("$baseURL/auth/v1/token?grant_type=refresh_token")
                .addHeader("apikey", anonKey).addHeader("Content-Type", "application/json")
                .post(body.toRequestBody(JSON)).build()
            try {
                http.newCall(req).execute().use { r ->
                    val txt = r.body?.string() ?: "{}"
                    val j = runCatching { JSONObject(txt) }.getOrDefault(JSONObject())
                    if (r.isSuccessful && j.optString("access_token", "").isNotEmpty()) {
                        applySession(j); persist()
                    } else if (r.code in 400..403) {
                        // Refresh token rejected — this session can't recover.
                        accessToken = null; refreshToken = null; expiresAt = 0L
                        sessionExpired = true; persist()
                    }
                }
            } catch (_: IOException) { /* offline — keep the session and retry later */ }
        }
    }

    /** Refresh proactively when the token is expired or about to expire. */
    private suspend fun ensureFresh() {
        if (accessToken == null || refreshToken == null) return
        if (expiresAt == 0L || System.currentTimeMillis() / 1000 < expiresAt - 120) return
        refreshIfPossible()
    }

    /**
     * Execute a REST/Storage request with a fresh token; on 401 refresh and
     * retry once; on network failure retry once. Returns (statusCode, body)
     * or null when the network is unreachable.
     */
    private suspend fun execute(build: () -> Request): Pair<Int, String>? = withContext(Dispatchers.IO) {
        ensureFresh()
        var networkRetried = false
        var authRetried = false
        while (true) {
            try {
                http.newCall(build()).execute().use { r ->
                    val txt = r.body?.string() ?: ""
                    if (r.code == 401 && !authRetried && refreshToken != null) {
                        authRetried = true
                        refreshIfPossible()
                        if (sessionExpired) return@withContext 401 to txt
                    } else {
                        return@withContext r.code to txt
                    }
                }
            } catch (e: IOException) {
                if (networkRetried) return@withContext null
                networkRetried = true
            }
        }
        @Suppress("UNREACHABLE_CODE") null
    }

    // MARK: PostgREST

    /** Back-compat select: empty array on any failure. */
    suspend fun select(path: String): JSONArray = selectOrNull(path) ?: JSONArray()

    /** Select that distinguishes failure (null) from genuinely empty results. */
    suspend fun selectOrNull(path: String): JSONArray? {
        val res = execute {
            Request.Builder().url("$baseURL/rest/v1/$path")
                .addHeader("apikey", anonKey).addHeader("Authorization", authHeader()).get().build()
        } ?: return null
        if (res.first !in 200..299) return null
        return runCatching { JSONArray(res.second) }.getOrNull()
    }

    /**
     * Insert a row. Returns the representation array on success (empty when
     * returning=false), or null when the write did NOT reach the database.
     */
    suspend fun insert(table: String, row: JSONObject, returning: Boolean = true): JSONArray? {
        val res = execute {
            Request.Builder().url("$baseURL/rest/v1/$table")
                .addHeader("apikey", anonKey).addHeader("Authorization", authHeader())
                .addHeader("Content-Type", "application/json")
                .addHeader("Prefer", if (returning) "return=representation" else "return=minimal")
                .post(row.toString().toRequestBody(JSON)).build()
        } ?: return null
        if (res.first !in 200..299) return null
        return runCatching { JSONArray(res.second) }.getOrDefault(JSONArray())
    }

    /** Patch rows; true only if the database accepted the update. */
    suspend fun update(path: String, patch: JSONObject): Boolean {
        val res = execute {
            Request.Builder().url("$baseURL/rest/v1/$path")
                .addHeader("apikey", anonKey).addHeader("Authorization", authHeader())
                .addHeader("Content-Type", "application/json").addHeader("Prefer", "return=minimal")
                .patch(patch.toString().toRequestBody(JSON)).build()
        } ?: return false
        return res.first in 200..299
    }

    /** Delete rows; true only if the database accepted the delete. */
    suspend fun delete(path: String): Boolean {
        val res = execute {
            Request.Builder().url("$baseURL/rest/v1/$path")
                .addHeader("apikey", anonKey).addHeader("Authorization", authHeader())
                .delete().build()
        } ?: return false
        return res.first in 200..299
    }

    /** Upload bytes to Storage 'uploads' bucket, return public URL. */
    suspend fun uploadFile(bytes: ByteArray, ext: String, contentType: String): String? {
        val name = "and_${System.currentTimeMillis()}_${(0..99999).random()}.$ext"
        val res = execute {
            Request.Builder().url("$baseURL/storage/v1/object/uploads/$name")
                .addHeader("apikey", anonKey).addHeader("Authorization", authHeader())
                .addHeader("Content-Type", contentType)
                .post(bytes.toRequestBody(contentType.toMediaType())).build()
        } ?: return null
        if (res.first !in 200..299) return null
        return "$baseURL/storage/v1/object/public/uploads/$name"
    }
}
