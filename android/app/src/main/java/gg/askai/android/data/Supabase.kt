package gg.askai.android.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Minimal Supabase client (Auth + PostgREST) built on OkHttp — same public
 * project as the iOS app and website. The anon key is public by design.
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

    private lateinit var prefs: android.content.SharedPreferences

    fun init(ctx: Context) {
        prefs = ctx.getSharedPreferences("askai", Context.MODE_PRIVATE)
        accessToken = prefs.getString("access", null)
        refreshToken = prefs.getString("refresh", null)
        userId = prefs.getString("uid", null)
        email = prefs.getString("email", null)
    }

    val isAuthed get() = accessToken != null && userId != null

    private fun persist() {
        prefs.edit()
            .putString("access", accessToken).putString("refresh", refreshToken)
            .putString("uid", userId).putString("email", email).apply()
    }

    fun signOut() {
        accessToken = null; refreshToken = null; userId = null; email = null; persist()
    }

    private fun authHeader() = "Bearer " + (accessToken ?: anonKey)

    // MARK: Auth
    suspend fun signIn(email: String, password: String) = auth("token?grant_type=password", email, password)
    suspend fun signUp(email: String, password: String) = auth("signup", email, password)

    private suspend fun auth(path: String, email: String, password: String): Boolean = withContext(Dispatchers.IO) {
        val body = JSONObject().put("email", email).put("password", password).toString()
        val req = Request.Builder()
            .url("$baseURL/auth/v1/$path")
            .addHeader("apikey", anonKey)
            .addHeader("Content-Type", "application/json")
            .post(body.toRequestBody(JSON)).build()
        http.newCall(req).execute().use { resp ->
            val txt = resp.body?.string() ?: return@withContext false
            if (!resp.isSuccessful) return@withContext false
            val j = JSONObject(txt)
            val at = j.optString("access_token", "")
            if (at.isEmpty()) return@withContext false
            accessToken = at
            refreshToken = j.optString("refresh_token", null)
            val user = j.optJSONObject("user")
            userId = user?.optString("id")
            this@Supa.email = user?.optString("email") ?: email
            persist(); true
        }
    }

    suspend fun refreshIfPossible() = withContext(Dispatchers.IO) {
        val rt = refreshToken ?: return@withContext
        val body = JSONObject().put("refresh_token", rt).toString()
        val req = Request.Builder().url("$baseURL/auth/v1/token?grant_type=refresh_token")
            .addHeader("apikey", anonKey).addHeader("Content-Type", "application/json")
            .post(body.toRequestBody(JSON)).build()
        runCatching {
            http.newCall(req).execute().use { r ->
                val j = JSONObject(r.body?.string() ?: "{}")
                val at = j.optString("access_token", "")
                if (at.isNotEmpty()) { accessToken = at; refreshToken = j.optString("refresh_token", rt); persist() }
            }
        }
    }

    // MARK: PostgREST
    suspend fun select(path: String): JSONArray = withContext(Dispatchers.IO) {
        val req = Request.Builder().url("$baseURL/rest/v1/$path")
            .addHeader("apikey", anonKey).addHeader("Authorization", authHeader()).get().build()
        http.newCall(req).execute().use { r ->
            val txt = r.body?.string() ?: "[]"
            if (!r.isSuccessful) JSONArray() else runCatching { JSONArray(txt) }.getOrDefault(JSONArray())
        }
    }

    suspend fun insert(table: String, row: JSONObject, returning: Boolean = true): JSONArray = withContext(Dispatchers.IO) {
        val req = Request.Builder().url("$baseURL/rest/v1/$table")
            .addHeader("apikey", anonKey).addHeader("Authorization", authHeader())
            .addHeader("Content-Type", "application/json")
            .addHeader("Prefer", if (returning) "return=representation" else "return=minimal")
            .post(row.toString().toRequestBody(JSON)).build()
        http.newCall(req).execute().use { r ->
            val txt = r.body?.string() ?: "[]"
            runCatching { JSONArray(txt) }.getOrDefault(JSONArray())
        }
    }

    suspend fun update(path: String, patch: JSONObject) = withContext(Dispatchers.IO) {
        val req = Request.Builder().url("$baseURL/rest/v1/$path")
            .addHeader("apikey", anonKey).addHeader("Authorization", authHeader())
            .addHeader("Content-Type", "application/json").addHeader("Prefer", "return=minimal")
            .patch(patch.toString().toRequestBody(JSON)).build()
        runCatching { http.newCall(req).execute().close() }
        Unit
    }

    suspend fun delete(path: String) = withContext(Dispatchers.IO) {
        val req = Request.Builder().url("$baseURL/rest/v1/$path")
            .addHeader("apikey", anonKey).addHeader("Authorization", authHeader())
            .delete().build()
        runCatching { http.newCall(req).execute().close() }
        Unit
    }

    /** Upload bytes to Storage 'uploads' bucket, return public URL. */
    suspend fun uploadFile(bytes: ByteArray, ext: String, contentType: String): String? = withContext(Dispatchers.IO) {
        val name = "and_${System.currentTimeMillis()}_${(0..99999).random()}.$ext"
        val req = Request.Builder().url("$baseURL/storage/v1/object/uploads/$name")
            .addHeader("apikey", anonKey).addHeader("Authorization", authHeader())
            .addHeader("Content-Type", contentType)
            .post(bytes.toRequestBody(contentType.toMediaType())).build()
        http.newCall(req).execute().use { r ->
            if (!r.isSuccessful) return@withContext null
            "$baseURL/storage/v1/object/public/uploads/$name"
        }
    }
}
