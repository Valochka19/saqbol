package kz.saqbol.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.roundToInt

object Images {
    /**
     * Готовит скриншот к отправке: длинная сторона до 1400 px, JPEG, base64.
     * Запрос должен уложиться в 1 МБ, а текст на картинке — остаться читаемым.
     */
    suspend fun shrink(ctx: Context, uri: Uri, maxBase64: Int = 900_000): String = withContext(Dispatchers.IO) {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        ctx.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 1400) sample *= 2

        val source = ctx.contentResolver.openInputStream(uri).use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: throw Api.ApiError("failed")

        var side = 1400
        var quality = 78
        repeat(6) {
            val scale = minOf(1f, side.toFloat() / max(source.width, source.height))
            val scaled = if (scale < 1f) Bitmap.createScaledBitmap(source, (source.width * scale).roundToInt(), (source.height * scale).roundToInt(), true) else source
            val bytes = ByteArrayOutputStream().also { scaled.compress(Bitmap.CompressFormat.JPEG, quality, it) }.toByteArray()
            val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
            if (base64.length <= maxBase64) return@withContext base64
            side = (side * 0.8f).roundToInt()
            quality = max(50, quality - 8)
        }
        throw Api.ApiError("failed")
    }
}
