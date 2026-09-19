package kz.saqbol.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.res.ResourcesCompat
import android.telecom.Call
import android.telecom.CallScreeningService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Определитель мошенников. Android зовёт этот сервис при входящем звонке с номера, которого нет в контактах.
 * Звонок пропускаем сразу (мы никого не блокируем), а номер тем временем сверяем с базой SaqBol.
 * Если на него жаловались — поверх экрана звонка появляется предупреждение.
 */
class ScamCallScreeningService : CallScreeningService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onScreenCall(details: Call.Details) {
        respondToCall(details, CallResponse.Builder().build())
        if (details.callDirection != Call.Details.DIRECTION_INCOMING) return
        val number = details.handle?.schemeSpecificPart ?: return
        if (!CallGuard.enabled(this)) return

        val app = applicationContext
        scope.launch {
            val hit = runCatching { Api.lookup(number, timeoutMs = 8_000) }.getOrNull()?.firstOrNull { it.found } ?: return@launch
            CallGuard.alert(app, hit)
        }
    }
}

object CallGuard {
    private const val CHANNEL = "scam_calls"
    private const val PREFS = "saqbol"

    fun enabled(ctx: Context): Boolean = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("guard", true)
    fun setEnabled(ctx: Context, on: Boolean) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("guard", on).apply()

    fun hasRole(ctx: Context): Boolean = ctx.getSystemService(RoleManager::class.java).isRoleHeld(RoleManager.ROLE_CALL_SCREENING)
    fun roleIntent(ctx: Context): Intent = ctx.getSystemService(RoleManager::class.java).createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING)

    fun canOverlay(ctx: Context): Boolean = Settings.canDrawOverlays(ctx)
    fun overlayIntent(ctx: Context): Intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${ctx.packageName}"))

    /** Предупреждение: плашка поверх экрана звонка (если разрешено) и уведомление в шторке как запасной вариант. */
    fun alert(ctx: Context, hit: Api.Recipient) {
        notify(ctx, hit)
        if (canOverlay(ctx)) Handler(Looper.getMainLooper()).post { runCatching { overlay(ctx.applicationContext, hit) } }
    }

    private var shown: View? = null

    /**
     * Уведомление во время звонка не видно: единственное всплывающее окно занято самим звонком.
     * Поэтому рисуем свою плашку в центре экрана — она не закрывает кнопки ответа ни сверху, ни снизу.
     */
    private fun overlay(ctx: Context, hit: Api.Recipient) {
        val wm = ctx.getSystemService(WindowManager::class.java)
        shown?.let { runCatching { wm.removeView(it) } }

        fun dp(v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, ctx.resources.displayMetrics).toInt()
        fun text(value: String, size: Float, face: Typeface?, alpha: Float = 1f) = TextView(ctx).apply {
            text = value
            setTextColor(0xFFFFFFFF.toInt())
            this.alpha = alpha
            setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
            typeface = face
        }
        val serif = ResourcesCompat.getFont(ctx, R.font.pt_serif_bold)
        val sans = ResourcesCompat.getFont(ctx, R.font.plex_sans_regular)
        val mono = ResourcesCompat.getFont(ctx, R.font.plex_mono_bold)

        val card = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            val shadow = dp(6f)
            setPadding(dp(18f), dp(16f), dp(18f) + shadow, dp(16f) + shadow)
            // Жёсткая чёрная тень — второй слой того же фона, поэтому она всегда размером с плашку
            background = LayerDrawable(arrayOf(
                GradientDrawable().apply { setColor(0xFF141311.toInt()); cornerRadius = dp(14f).toFloat() },
                GradientDrawable().apply { setColor(0xFFC8321A.toInt()); cornerRadius = dp(14f).toFloat(); setStroke(dp(3f), 0xFF141311.toInt()) },
            )).apply {
                setLayerInset(0, shadow, shadow, 0, 0)
                setLayerInset(1, 0, 0, shadow, shadow)
            }
            addView(text("SAQBOL · ОСТОРОЖНО", 11f, mono, 0.9f).apply { letterSpacing = 0.14f })
            addView(text("Похоже, звонит мошенник", 24f, serif).apply { setPadding(0, dp(6f), 0, dp(6f)) })
            addView(text("На номер ${hit.value} ${if (hit.reporters == 1) "пожаловался" else "пожаловались"} ${Brand.people(hit.reporters)}. " +
                "Схема: ${Brand.category(hit.category).lowercase()}.", 16f, sans))
            addView(text("Не называйте коды из SMS и не переводите деньги.", 16f, ResourcesCompat.getFont(ctx, R.font.plex_sans_semibold)).apply { setPadding(0, dp(8f), 0, 0) })
            addView(text("Нажмите, чтобы закрыть", 12f, sans, 0.75f).apply { setPadding(0, dp(10f), 0, 0) })
        }
        val root = FrameLayout(ctx).apply {
            setPadding(dp(16f), 0, dp(10f), 0)
            addView(card, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT))
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            PixelFormat.TRANSLUCENT,
        ).apply { gravity = Gravity.CENTER }

        fun close() { if (shown === root) { runCatching { wm.removeView(root) }; shown = null } }
        root.setOnClickListener { close() }
        wm.addView(root, params)
        shown = root
        Handler(Looper.getMainLooper()).postDelayed({ close() }, 40_000)
    }

    private fun notify(ctx: Context, hit: Api.Recipient) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Предупреждения о мошенниках", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Показывается, когда звонит номер, на который жаловались"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 250, 120, 250, 120, 400)
            },
        )
        val open = PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val text = "На номер ${hit.value} ${if (hit.reporters == 1) "пожаловался" else "пожаловались"} ${Brand.people(hit.reporters)}. " +
            "Схема: ${Brand.category(hit.category).lowercase()}. Не называйте коды и не переводите деньги."
        val n = Notification.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_alert)
            .setColor(0xFFC8321A.toInt())
            .setColorized(true)
            .setContentTitle("Осторожно: похоже, звонит мошенник")
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setCategory(Notification.CATEGORY_CALL)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        nm.notify(hit.value.hashCode(), n)
    }
}
