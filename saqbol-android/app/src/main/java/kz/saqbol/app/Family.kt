package kz.saqbol.app

import android.graphics.Bitmap
import android.graphics.Color
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter

/** «Защита близких»: ссылка и QR-код, по которым родственник привязывается к телефону мамы. */
object Family {
    /** Ссылка открывает нашего бота в Telegram, код уходит сам после нажатия «Старт». */
    fun link(code: String) = "https://t.me/saqbolai_bot?start=family_$code"

    /** Код из ссылки, QR-кода или просто 6 цифр — что бы ни ввёл или ни отсканировал родственник. */
    fun codeFrom(text: String): String? =
        Regex("family_(\\d{6})").find(text)?.groupValues?.get(1)
            ?: text.filter(Char::isDigit).takeIf { it.length == 6 }

    fun qr(content: String, size: Int = 600): Bitmap {
        val m = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, size, size, mapOf(EncodeHintType.MARGIN to 1))
        val px = IntArray(size * size) { i -> if (m[i % size, i / size]) Color.rgb(0x14, 0x13, 0x11) else Color.rgb(0xF3, 0xEF, 0xE6) }
        return Bitmap.createBitmap(px, size, size, Bitmap.Config.ARGB_8888)
    }
}
