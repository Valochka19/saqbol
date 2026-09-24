package kz.saqbol.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * «Защита близких» на телефоне родственника: push от Google будит приложение, даже если оно закрыто.
 * Когда приложение в фоне, уведомление показывает сама система; когда открыто — показываем сами.
 */
class PushService : FirebaseMessagingService() {
    override fun onMessageReceived(msg: RemoteMessage) {
        val title = msg.data["title"] ?: msg.notification?.title ?: return
        Push.show(this, title, msg.data["body"] ?: msg.notification?.body ?: "")
    }

    override fun onNewToken(token: String) {} // адрес устройства берём заново при каждой привязке
}

object Push {
    const val CHANNEL = "family_alerts"

    fun channel(ctx: Context) {
        ctx.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, "Звонки мошенников близким", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Когда вашему близкому звонит номер, на который жаловались"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 400, 150, 400, 150, 600)
            },
        )
    }

    fun show(ctx: Context, title: String, body: String) {
        channel(ctx)
        val open = PendingIntent.getActivity(ctx, 1, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_alert)
            .setColor(0xFFC8321A.toInt())
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setCategory(Notification.CATEGORY_MESSAGE)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        ctx.getSystemService(NotificationManager::class.java).notify(("family" + title + body).hashCode(), n)
    }

    /** Адрес этого телефона для push-уведомлений. */
    suspend fun token(): String = suspendCancellableCoroutine { cont ->
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { cont.resume(it) }
            .addOnFailureListener { cont.resumeWithException(it) }
    }
}
