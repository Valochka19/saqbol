package kz.saqbol.app

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

/**
 * Связь с SaqBol. Приложение ходит на тот же сервер, что и сайт: кладёт запрос в очередь
 * Firestore и ждёт ответ под тем же id. Обычный HTTPS, без тяжёлых библиотек.
 */
object Api {
    private const val KEY = "AIzaSyAOehRD2kakGKTeb12Jk9mUxlOYmN4t5nI" // публичный веб-ключ, доступ ограничен правилами базы
    private const val DOCS = "projects/saqbol-ai-kz/databases/(default)/documents"
    private const val BASE = "https://firestore.googleapis.com/v1/$DOCS"

    class ApiError(val code: String) : Exception(code)

    data class Verdict(
        val verdict: String, val confidence: Int, val scheme: String, val category: String,
        val flags: List<String>, val advice: String, val known: List<Known>,
    )
    data class Known(val value: String, val reporters: Int)
    data class Recipient(val value: String, val found: Boolean, val reporters: Int, val risk: Int, val category: String)
    data class Summary(val checks: Int, val flagged: Int, val indicators: Int, val topCategory: String?, val topShare: Int, val feed: List<FeedRow>)
    data class FeedRow(val verdict: String, val category: String, val atMillis: Long)

    suspend fun check(text: String): Verdict {
        return verdict(ask("text", text.take(2000), timeoutMs = 40_000))
    }

    private fun verdict(r: JSONObject): Verdict {
        return Verdict(
            verdict = r.optString("verdict", "safe"), confidence = r.optInt("confidence"),
            scheme = r.optString("scheme"), category = r.optString("category", "other"),
            flags = r.optJSONArray("flags").strings(), advice = r.optString("advice"),
            known = r.optJSONArray("known").objects().map { Known(it.optString("value"), it.optInt("reporters")) },
        )
    }

    /** Скриншот: уменьшенный JPEG в base64. Текст с картинки читает сервер. */
    suspend fun checkImage(jpegBase64: String): Verdict = verdict(ask("image", jpegBase64, timeoutMs = 60_000))

    suspend fun lookup(value: String, timeoutMs: Long = 15_000): List<Recipient> {
        val r = ask("lookup", value.take(120), timeoutMs)
        return r.optJSONArray("items").objects().map {
            Recipient(it.optString("value"), it.optBoolean("found"), it.optInt("reporters"), it.optInt("risk"), it.optString("category", "other"))
        }
    }

    suspend fun summary(): Summary = withContext(Dispatchers.IO) {
        val s = plain(http("GET", "$BASE/public/summary?key=$KEY").getJSONObject("fields"))
        val totals = s.optJSONObject("totals") ?: JSONObject()
        val cats = s.optJSONObject("categories") ?: JSONObject()
        val named = cats.keys().asSequence().filter { it != "other" && it != "none" }.map { it to cats.optInt(it) }.sortedByDescending { it.second }.toList()
        val all = cats.keys().asSequence().filter { it != "none" }.sumOf { cats.optInt(it) }.coerceAtLeast(1)
        Summary(
            checks = totals.optInt("checks"), flagged = totals.optInt("flagged"), indicators = totals.optInt("indicators"),
            topCategory = named.firstOrNull()?.first, topShare = named.firstOrNull()?.let { it.second * 100 / all } ?: 0,
            feed = s.optJSONArray("feed").objects().map { FeedRow(it.optString("verdict"), it.optString("category"), it.optLong("at")) },
        )
    }

    /** Кладём запрос в очередь и опрашиваем ответ. */
    private suspend fun ask(field: String, value: String, timeoutMs: Long): JSONObject = withContext(Dispatchers.IO) {
        val id = UUID.randomUUID().toString().replace("-", "").take(20)
        val write = JSONObject()
            .put("update", JSONObject().put("name", "$DOCS/web_requests/$id")
                .put("fields", JSONObject().put(field, JSONObject().put("stringValue", value))))
            .put("updateTransforms", JSONArray().put(JSONObject().put("fieldPath", "created_at").put("setToServerValue", "REQUEST_TIME")))
            .put("currentDocument", JSONObject().put("exists", false))
        http("POST", "$BASE:commit?key=$KEY", JSONObject().put("writes", JSONArray().put(write)))

        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            delay(300)
            val doc = try { http("GET", "$BASE/web_results/$id?key=$KEY") } catch (e: ApiError) { if (e.code == "404") null else throw e }
            if (doc != null) {
                val result = plain(doc.getJSONObject("fields"))
                result.optString("error").takeIf { it.isNotEmpty() }?.let { throw ApiError(it) }
                return@withContext result
            }
        }
        throw ApiError("timeout")
    }

    private fun http(method: String, url: String, body: JSONObject? = null): JSONObject {
        val c = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 8_000
            readTimeout = 12_000
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                outputStream.use { it.write(body.toString().toByteArray()) }
            }
        }
        try {
            val code = c.responseCode
            if (code !in 200..299) throw ApiError(code.toString())
            return JSONObject(c.inputStream.bufferedReader().readText())
        } catch (e: ApiError) {
            throw e
        } catch (e: Exception) {
            throw ApiError("network")
        } finally {
            c.disconnect()
        }
    }

    /** Firestore отдаёт значения в обёртках ({"stringValue": ...}). Разворачиваем в обычный JSON. */
    private fun plain(fields: JSONObject): JSONObject = JSONObject().also { out ->
        fields.keys().forEach { k -> out.put(k, unwrap(fields.getJSONObject(k))) }
    }

    private fun unwrap(v: JSONObject): Any? = when {
        v.has("stringValue") -> v.getString("stringValue")
        v.has("integerValue") -> v.getString("integerValue").toLong()
        v.has("doubleValue") -> v.getDouble("doubleValue")
        v.has("booleanValue") -> v.getBoolean("booleanValue")
        v.has("timestampValue") -> runCatching { java.time.Instant.parse(v.getString("timestampValue")).toEpochMilli() }.getOrDefault(0L)
        v.has("mapValue") -> plain(v.getJSONObject("mapValue").optJSONObject("fields") ?: JSONObject())
        v.has("arrayValue") -> JSONArray().also { arr ->
            val values = v.getJSONObject("arrayValue").optJSONArray("values") ?: JSONArray()
            for (i in 0 until values.length()) arr.put(unwrap(values.getJSONObject(i)))
        }
        else -> JSONObject.NULL
    }

    private fun JSONArray?.strings(): List<String> = if (this == null) emptyList() else (0 until length()).map { optString(it) }
    private fun JSONArray?.objects(): List<JSONObject> = if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }

    fun errorText(code: String): String = when (code) {
        "timeout" -> "Сервис не ответил. Проверьте интернет и попробуйте ещё раз."
        "busy" -> "Слишком много запросов. Повторите через минуту."
        "unrecognized" -> "Не вижу здесь номера телефона, карты или ссылки."
        "not_a_message" -> "Не вижу на картинке сообщения. Выберите скриншот переписки, SMS или чека."
        "network" -> "Нет связи с интернетом."
        else -> "Не получилось. Попробуйте ещё раз."
    }
}
