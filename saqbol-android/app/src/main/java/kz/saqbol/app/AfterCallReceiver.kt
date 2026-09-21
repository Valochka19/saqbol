package kz.saqbol.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/** Нажатие в уведомлении «Кто звонил?»: жалоба уходит в общую базу, уведомление превращается в ответ. */
class AfterCallReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val number = intent.getStringExtra("number") ?: return
        if (intent.action != CallGuard.ACTION_SCAM) {
            CallGuard.dismissAsk(ctx, number)
            return
        }
        val app = ctx.applicationContext
        val pending = goAsync()
        CallGuard.afterCallResult(app, number, "Отправляем…", "Сообщаем в SaqBol о номере $number.")
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val r = Api.report(number, CallGuard.deviceId(app))
                val others = r.reporters - 1
                val text = if (others > 0) "На ${r.value} теперь ${if (r.reporters == 1) "пожаловался" else "пожаловались"} ${Brand.people(r.reporters)}. Следующего SaqBol предупредит во время звонка."
                else "Вы первый сообщили о ${r.value}. Если подтвердят другие — SaqBol начнёт предупреждать о нём."
                CallGuard.afterCallResult(app, number, "Спасибо, номер в базе", text)
            } catch (e: Api.ApiError) {
                CallGuard.afterCallResult(app, number, "Не получилось отправить", Api.errorText(e.code))
            } finally {
                pending.finish()
            }
        }
    }
}
