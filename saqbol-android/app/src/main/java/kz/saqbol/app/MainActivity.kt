package kz.saqbol.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleResumeEffect
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : ComponentActivity() {
    private var shared by mutableStateOf<String?>(null)
    private var sharedImage by mutableStateOf<Uri?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        take(intent)
        setContent { App(shared, sharedImage) { shared = null; sharedImage = null } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        take(intent)
    }

    private fun take(i: Intent?) {
        shared = sharedText(i)
        sharedImage = sharedPicture(i)
    }

    /** Скриншот, пришедший через «Поделиться → SaqBol». */
    @Suppress("DEPRECATION")
    private fun sharedPicture(i: Intent?): Uri? =
        if (i?.action == Intent.ACTION_SEND && i.type?.startsWith("image/") == true) {
            if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else i.getParcelableExtra(Intent.EXTRA_STREAM)
        } else null

    /** Текст, пришедший через «Поделиться → SaqBol». */
    private fun sharedText(i: Intent?): String? =
        if (i?.action == Intent.ACTION_SEND && i.type == "text/plain") i.getStringExtra(Intent.EXTRA_TEXT)?.trim()?.takeIf { it.isNotEmpty() } else null
}

private val TABS = listOf("Проверка", "Защита", "Сводка")

@Composable
fun App(shared: String?, sharedImage: Uri?, onSharedUsed: () -> Unit) {
    var tab by remember { mutableIntStateOf(0) }
    LaunchedEffect(shared, sharedImage) { if (shared != null || sharedImage != null) tab = 0 }

    Column(Modifier.fillMaxSize().background(Brand.Paper).systemBarsPadding().imePadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp), verticalAlignment = Alignment.Bottom) {
            Text("SaqBol", style = Brand.Title.copy(fontSize = 34.sp))
            Spacer(Modifier.weight(1f))
            Text("сақ бол — будь осторожен", style = Brand.Small.copy(fontFamily = Brand.Serif, fontStyle = androidx.compose.ui.text.font.FontStyle.Italic))
        }
        Box(Modifier.fillMaxWidth().height(3.dp).background(Brand.Ink))

        Box(Modifier.weight(1f)) {
            when (tab) {
                0 -> CheckScreen(shared, sharedImage, onSharedUsed)
                1 -> GuardScreen()
                else -> SummaryScreen()
            }
        }

        Box(Modifier.fillMaxWidth().height(2.dp).background(Brand.Ink))
        Row(Modifier.fillMaxWidth()) {
            TABS.forEachIndexed { i, title ->
                Box(
                    Modifier.weight(1f).background(if (tab == i) Brand.Ink else Brand.Paper).clickable { tab = i }.padding(vertical = 16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(title.uppercase(), style = Brand.Label.copy(color = if (tab == i) Brand.Paper else Brand.Ink, fontSize = 12.sp))
                }
            }
        }
    }
}

// ───────────────────────────── Проверка ─────────────────────────────

private sealed interface CheckResult {
    data class Message(val v: Api.Verdict) : CheckResult
    data class Number(val items: List<Api.Recipient>) : CheckResult
    data class Failed(val text: String) : CheckResult
}

@Composable
private fun CheckScreen(shared: String?, sharedImage: Uri?, onSharedUsed: () -> Unit) {
    var mode by remember { mutableIntStateOf(0) } // 0 — сообщение, 1 — номер
    var text by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<CheckResult?>(null) }
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    var reading by remember { mutableStateOf(false) } // идёт проверка скриншота

    fun runImage(uri: Uri) {
        if (busy) return
        busy = true
        reading = true
        result = null
        scope.launch {
            result = try {
                CheckResult.Message(Api.checkImage(Images.shrink(ctx, uri)))
            } catch (e: Api.ApiError) {
                CheckResult.Failed(Api.errorText(e.code))
            } catch (e: Exception) {
                CheckResult.Failed("Не получилось прочитать картинку. Попробуйте другой скриншот.")
            }
            busy = false
            reading = false
        }
    }
    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri -> if (uri != null) runImage(uri) }

    fun run() {
        val input = text.trim()
        if (input.isEmpty() || busy) return
        busy = true
        result = null
        scope.launch {
            result = try {
                if (mode == 0) CheckResult.Message(Api.check(input)) else CheckResult.Number(Api.lookup(input))
            } catch (e: Api.ApiError) {
                CheckResult.Failed(Api.errorText(e.code))
            }
            busy = false
        }
    }

    // Пришли через «Поделиться»: сразу подставляем текст и запускаем проверку
    LaunchedEffect(shared, sharedImage) {
        if (shared != null) {
            mode = 0
            text = shared
            onSharedUsed()
            run()
        } else if (sharedImage != null) {
            mode = 0
            text = ""
            onSharedUsed()
            runImage(sharedImage)
        }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(if (mode == 0) "Пришло странное сообщение?" else "Переводите незнакомцу?", style = Brand.Title)

        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).border(2.dp, Brand.Ink, RoundedCornerShape(10.dp))) {
            listOf("Сообщение", "Номер или ссылка").forEachIndexed { i, label ->
                Box(Modifier.weight(1f).background(if (mode == i) Brand.Ink else Color.Transparent).clickable { mode = i; result = null; text = "" }.padding(vertical = 12.dp), contentAlignment = Alignment.Center) {
                    Text(label.uppercase(), style = Brand.Label.copy(color = if (mode == i) Brand.Paper else Brand.Ink))
                }
            }
        }

        Cutout {
            Text(if (mode == 0) "ТЕКСТ СООБЩЕНИЯ" else "НОМЕР, КАРТА, ССЫЛКА ИЛИ @АККАУНТ", style = Brand.Label)
            Spacer(Modifier.height(8.dp))
            BasicTextField(
                value = text, onValueChange = { text = it.take(2000) },
                textStyle = if (mode == 0) Brand.Body.copy(fontFamily = Brand.Serif, fontSize = 18.sp, lineHeight = 26.sp) else Brand.Number.copy(fontSize = 22.sp),
                cursorBrush = SolidColor(Brand.Signal),
                keyboardOptions = KeyboardOptions(keyboardType = if (mode == 0) KeyboardType.Text else KeyboardType.Uri),
                modifier = Modifier.fillMaxWidth().heightIn(min = if (mode == 0) 120.dp else 40.dp),
                decorationBox = { inner ->
                    if (text.isEmpty()) Text(if (mode == 0) "Вставьте сюда SMS или сообщение из мессенджера" else "+7 7__ ___ __ __", style = Brand.Body.copy(color = Brand.Ink3))
                    inner()
                },
            )
        }
        BigButton(if (busy && !reading) "Проверяем…" else "Проверить", fill = Brand.Signal, enabled = !busy && text.isNotBlank()) { run() }
        if (mode == 0) {
            BigButton(if (reading) "Читаем скриншот…" else "Выбрать скриншот", fill = Brand.Ink, enabled = !busy) { pickImage.launch("image/*") }
        }

        if (mode == 0 && result == null && !busy) {
            Text("Быстрее всего — из самого мессенджера: зажмите сообщение или откройте скриншот → «Поделиться» → SaqBol.", style = Brand.Small)
        }

        when (val r = result) {
            is CheckResult.Message -> VerdictCard(r.v)
            is CheckResult.Number -> r.items.forEach { RecipientCard(it) }
            is CheckResult.Failed -> Text(r.text, style = Brand.Body.copy(color = Brand.Ink2))
            null -> {}
        }
    }
}

@Composable
private fun VerdictCard(v: Api.Verdict) {
    val (label, color) = when (v.verdict) {
        "scam" -> "Мошенничество" to Brand.Signal
        "suspicious" -> "Подозрительно" to Brand.Warn
        else -> "Не похоже на обман" to Brand.Ok
    }
    Cutout {
        Stamp(label, color)
        Spacer(Modifier.height(14.dp))
        Text(v.scheme, style = Brand.Heading)
        if (v.flags.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            Text("ПРИЗНАКИ", style = Brand.Label)
            v.flags.forEach { Text("— $it", style = Brand.Body, modifier = Modifier.padding(top = 4.dp)) }
        }
        Spacer(Modifier.height(12.dp))
        Text("ЧТО ДЕЛАТЬ", style = Brand.Label)
        Text(v.advice, style = Brand.Body, modifier = Modifier.padding(top = 4.dp))
        if (v.known.isNotEmpty()) {
            Spacer(Modifier.height(14.dp))
            Column(Modifier.fillMaxWidth().border(2.dp, Brand.Signal, RoundedCornerShape(8.dp)).padding(12.dp)) {
                Text("НА ЭТО УЖЕ ЖАЛОВАЛИСЬ", style = Brand.Label.copy(color = Brand.Signal))
                v.known.forEach { Text("${it.value} — ${Brand.people(it.reporters)}", style = Brand.Body.copy(fontFamily = Brand.Mono, fontSize = 14.sp), modifier = Modifier.padding(top = 4.dp)) }
            }
        }
    }
}

@Composable
private fun RecipientCard(r: Api.Recipient) {
    Cutout {
        Text(r.value, style = Brand.Number.copy(fontSize = 20.sp))
        Spacer(Modifier.height(12.dp))
        if (r.found) {
            Stamp(if (r.risk >= 45) "Не переводите" else "Будьте осторожны", if (r.risk >= 45) Brand.Signal else Brand.Warn)
            Spacer(Modifier.height(14.dp))
            Text("На него ${if (r.reporters == 1) "пожаловался" else "пожаловались"} ${Brand.people(r.reporters)}", style = Brand.Heading)
            Text("Схема: ${Brand.category(r.category).lowercase()}. Не переводите деньги и не сообщайте коды.", style = Brand.Body, modifier = Modifier.padding(top = 6.dp))
        } else {
            Stamp("В базе нет", Brand.Ink2)
            Spacer(Modifier.height(14.dp))
            Text("Жалоб пока не было. Это не значит, что он безопасен: мошенники часто меняют номера.", style = Brand.Body)
        }
    }
}

// ───────────────────────────── Защита ─────────────────────────────

@Composable
private fun GuardScreen() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var hasRole by remember { mutableStateOf(CallGuard.hasRole(ctx)) }
    var canOverlay by remember { mutableStateOf(CallGuard.canOverlay(ctx)) }
    var enabled by remember { mutableStateOf(CallGuard.enabled(ctx)) }
    var demoBusy by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf<String?>(null) }

    fun canNotify() = Build.VERSION.SDK_INT < 33 || ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    val askRole = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { hasRole = CallGuard.hasRole(ctx) }
    val askNotify = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    LifecycleResumeEffect(Unit) {
        hasRole = CallGuard.hasRole(ctx)
        canOverlay = CallGuard.canOverlay(ctx)
        onPauseOrDispose {}
    }

    val active = hasRole && enabled
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Определитель мошенников", style = Brand.Title)

        Cutout(fill = if (active) Brand.Ink else Brand.Card) {
            Text("ЗАЩИТА ЗВОНКОВ", style = Brand.Label.copy(color = if (active) Brand.Hair else Brand.Ink2))
            Text(if (active) "Включена" else "Выключена", style = Brand.Title.copy(color = if (active) Brand.Paper else Brand.Ink, fontSize = 36.sp))
            Text(
                if (active) "Когда позвонит незнакомый номер, мы за секунду сверим его с базой. Если на него жаловались — вы увидите предупреждение прямо во время звонка."
                else "Включите, и SaqBol предупредит вас, если звонит номер, на который уже жаловались другие люди.",
                style = Brand.Small.copy(color = if (active) Brand.Hair else Brand.Ink2), modifier = Modifier.padding(top = 8.dp),
            )
        }

        if (!hasRole) {
            BigButton("Включить защиту", fill = Brand.Signal) {
                if (!canNotify()) askNotify.launch(Manifest.permission.POST_NOTIFICATIONS)
                askRole.launch(CallGuard.roleIntent(ctx))
            }
        } else {
            BigButton(if (enabled) "Приостановить" else "Возобновить", fill = if (enabled) Brand.Ink2 else Brand.Signal) {
                enabled = !enabled
                CallGuard.setEnabled(ctx, enabled)
            }
        }

        if (hasRole && !canOverlay) {
            Cutout(fill = Brand.Paper2) {
                Text("ОСТАЛСЯ ОДИН ШАГ", style = Brand.Label.copy(color = Brand.Signal))
                Text("Разрешите показывать предупреждение поверх экрана звонка. Без этого оно спрячется в шторке, и вы его не заметите.", style = Brand.Body, modifier = Modifier.padding(top = 6.dp))
                Spacer(Modifier.height(12.dp))
                BigButton("Разрешить", fill = Brand.Signal) { ctx.startActivity(CallGuard.overlayIntent(ctx)) }
            }
        }

        Cutout {
            Text("КАК ЭТО ВЫГЛЯДИТ", style = Brand.Label)
            Text("Покажем предупреждение так, будто вам сейчас звонит номер из базы.", style = Brand.Body, modifier = Modifier.padding(top = 6.dp))
            Spacer(Modifier.height(12.dp))
            BigButton(if (demoBusy) "Сверяем с базой…" else "Показать пример", enabled = !demoBusy) {
                if (!canNotify()) { askNotify.launch(Manifest.permission.POST_NOTIFICATIONS); return@BigButton }
                demoBusy = true
                note = null
                scope.launch {
                    val hit = runCatching { Api.lookup("8 705 111 22 33") }.getOrNull()?.firstOrNull { it.found }
                    if (hit != null) CallGuard.alert(ctx, hit) else note = "Не удалось связаться с базой. Проверьте интернет."
                    demoBusy = false
                }
            }
            note?.let { Text(it, style = Brand.Small, modifier = Modifier.padding(top = 8.dp)) }
        }

        Text("Мы не блокируем звонки и не слушаем разговоры. Проверяется только номер, и только если его нет в ваших контактах.", style = Brand.Small)
    }
}

// ───────────────────────────── Сводка ─────────────────────────────

@Composable
private fun SummaryScreen() {
    val ctx = LocalContext.current
    var data by remember { mutableStateOf<Api.Summary?>(null) }
    var failed by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { runCatching { Api.summary() }.onSuccess { data = it }.onFailure { failed = true } }
    val time = remember { SimpleDateFormat("HH:mm", Locale("ru")) }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Что рассылают сейчас", style = Brand.Title)
        val s = data
        if (s == null) {
            Text(if (failed) "Нет связи с интернетом." else "Загружаем…", style = Brand.Body.copy(color = Brand.Ink3))
        } else {
            s.topCategory?.let {
                Cutout(fill = Brand.Signal) {
                    Text("ГЛАВНАЯ УГРОЗА", style = Brand.Label.copy(color = Color.White.copy(alpha = 0.85f)))
                    Text(Brand.category(it), style = Brand.Title.copy(color = Color.White))
                    Text("${s.topShare}% всех найденных обманов", style = Brand.Small.copy(color = Color.White.copy(alpha = 0.9f)), modifier = Modifier.padding(top = 4.dp))
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                listOf("Проверено" to s.checks, "Обманов" to s.flagged, "В базе" to s.indicators).forEach { (label, value) ->
                    Cutout(Modifier.weight(1f), shadow = 3.dp) {
                        Text("$value", style = Brand.Number.copy(fontSize = 24.sp, color = if (label == "Обманов") Brand.Signal else Brand.Ink))
                        Text(label.uppercase(), style = Brand.Label.copy(fontSize = 10.sp), modifier = Modifier.padding(top = 2.dp))
                    }
                }
            }
            Cutout {
                Text("ПОСЛЕДНИЕ ПРОВЕРКИ", style = Brand.Label)
                s.feed.take(8).forEach { f ->
                    Row(Modifier.fillMaxWidth().padding(top = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(time.format(Date(f.atMillis)), style = Brand.Body.copy(fontFamily = Brand.Mono, fontSize = 14.sp, color = Brand.Ink3))
                        Spacer(Modifier.width(12.dp))
                        Text(if (f.verdict == "safe") "обычное сообщение" else Brand.category(f.category).lowercase(), style = Brand.Body.copy(fontSize = 15.sp, fontWeight = if (f.verdict == "safe") FontWeight.Normal else FontWeight.Medium, color = if (f.verdict == "safe") Brand.Ink2 else Brand.Ink))
                    }
                }
            }
            Text("Тренажёр, памятка для родителей и подробности — на сайте", style = Brand.Small, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
            BigButton("Открыть saqbol-ai-kz.web.app") { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://saqbol-ai-kz.web.app"))) }
        }
    }
}
