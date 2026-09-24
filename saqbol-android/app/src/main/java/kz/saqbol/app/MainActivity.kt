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
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LinearProgressIndicator
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : ComponentActivity() {
    private var shared by mutableStateOf<String?>(null)
    private var sharedImage by mutableStateOf<Uri?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Push.channel(this) // канал нужен заранее: push может прийти, когда приложение закрыто
        take(intent)
        ScrollDebug.toEnd = intent?.getBooleanExtra("end", false) == true
        val startTab = intent?.getIntExtra("tab", 0) ?: 0 // открыть сразу нужную вкладку (для проверки и ярлыков)
        setContent { App(shared, sharedImage, startTab) { shared = null; sharedImage = null } }
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
fun App(shared: String?, sharedImage: Uri?, startTab: Int = 0, onSharedUsed: () -> Unit) {
    var tab by remember { mutableIntStateOf(startTab.coerceIn(0, 2)) }
    LaunchedEffect(shared, sharedImage) { if (shared != null || sharedImage != null) tab = 0 }
    val ctx = LocalContext.current

    Column(Modifier.fillMaxSize().background(Brand.Paper).systemBarsPadding().imePadding()) {
        // Шапка: лого-штамп, имя и перевод
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            LogoStamp()
            Spacer(Modifier.width(12.dp))
            Text("SaqBol", style = Brand.Title.copy(fontSize = 28.sp))
            Spacer(Modifier.weight(1f))
            Text("сақ бол — будь осторожен", style = Brand.Small.copy(fontFamily = Brand.Serif, fontStyle = FontStyle.Italic, fontSize = 13.sp))
        }
        Box(Modifier.fillMaxWidth().height(2.5.dp).background(Brand.Ink))

        Box(Modifier.weight(1f).fillMaxWidth().dotGrid()) {
            when (tab) {
                0 -> CheckScreen(shared, sharedImage, onSharedUsed)
                1 -> GuardScreen()
                else -> SummaryScreen()
            }
        }

        // Нижнее меню-штамп; точка на «Защите» показывает, включена ли защита звонков
        var guardOn by remember { mutableStateOf(CallGuard.hasRole(ctx) && CallGuard.enabled(ctx)) }
        LifecycleResumeEffect(tab) {
            guardOn = CallGuard.hasRole(ctx) && CallGuard.enabled(ctx)
            onPauseOrDispose {}
        }
        NavBar(TABS, tab, guardOn) { tab = it }
    }
}

private fun screen() = Modifier.fillMaxSize()

@Composable
private fun ScreenColumn(revealOn: Any? = null, content: @Composable () -> Unit) {
    val scroll = rememberScrollState()
    LaunchedEffect(Unit) { if (ScrollDebug.toEnd) { delay(1500); scroll.animateScrollTo(scroll.maxValue) } }
    // пришёл ответ — плавно доезжаем до него, иначе он остаётся за краем экрана
    LaunchedEffect(revealOn) { if (revealOn != null) { delay(120); scroll.animateScrollTo(scroll.maxValue) } }
    Column(
        screen().verticalScroll(scroll).padding(horizontal = 20.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) { content() }
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
    val clipboard = LocalClipboardManager.current
    var reading by remember { mutableStateOf(false) } // идёт проверка скриншота
    var scanned by remember { mutableStateOf<String?>(null) } // что было спрятано в QR-коде

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

    // QR-код человек прочитать не может, а мы можем: показываем, что в нём спрятано, и сразу проверяем
    val scanQr = rememberLauncherForActivityResult(ScanContract()) { r ->
        val content = r.contents?.trim()?.takeIf { it.isNotEmpty() } ?: return@rememberLauncherForActivityResult
        mode = 0
        text = content.take(2000)
        scanned = text
        run()
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

    ScreenColumn(revealOn = result) {
        ScreenHeader("ПРОВЕРКА", if (mode == 0) "Пришло странное сообщение?" else "Переводите незнакомцу?")
        Segmented(listOf("Сообщение", "Номер или ссылка"), mode) { mode = it; result = null; text = ""; scanned = null }

        Cutout {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (mode == 0) "ТЕКСТ СООБЩЕНИЯ" else "НОМЕР, КАРТА, ССЫЛКА", style = Brand.Label, modifier = Modifier.weight(1f))
                if (text.isEmpty()) Chip("Вставить") { clipboard.getText()?.text?.let { text = it.take(2000) } }
                else Chip("Очистить") { text = ""; result = null; scanned = null }
            }
            Spacer(Modifier.height(10.dp))
            BasicTextField(
                value = text, onValueChange = { text = it.take(2000) },
                textStyle = if (mode == 0) Brand.Body.copy(fontFamily = Brand.Serif, fontSize = 18.sp, lineHeight = 26.sp) else Brand.Number.copy(fontSize = 22.sp),
                cursorBrush = SolidColor(Brand.Signal),
                keyboardOptions = KeyboardOptions(keyboardType = if (mode == 0) KeyboardType.Text else KeyboardType.Uri),
                modifier = Modifier.fillMaxWidth().heightIn(min = if (mode == 0) 110.dp else 40.dp),
                decorationBox = { inner ->
                    if (text.isEmpty()) Text(if (mode == 0) "Вставьте сюда SMS или сообщение из мессенджера" else "+7 7__ ___ __ __", style = Brand.Body.copy(color = Brand.Ink3))
                    inner()
                },
            )
        }

        PrimaryButton(if (busy && !reading) "Проверяем…" else "Проверить", icon = Ic.Search, enabled = !busy && text.isNotBlank()) { run() }
        if (busy) LinearProgressIndicator(Modifier.fillMaxWidth().clip(RoundedCornerShape(4.dp)), color = Brand.Signal, trackColor = Brand.Paper2)

        if (mode == 0) {
            Row(Modifier.height(IntrinsicSize.Max), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ActionTile(Ic.Image, if (reading) "Читаем…" else "Скриншот", "Переписка или SMS из галереи", Modifier.weight(1f), enabled = !busy) { pickImage.launch("image/*") }
                ActionTile(Ic.Qr, "QR-код", "Куда ведёт — до перехода", Modifier.weight(1f), enabled = !busy) {
                    scanQr.launch(
                        ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE).setBeepEnabled(false).setOrientationLocked(true)
                            .setPrompt("Наведите камеру на QR-код — покажем, куда он ведёт, до того как вы перейдёте"),
                    )
                }
            }
        }

        if (scanned != null && scanned == text && mode == 0) InfoLine("Это было спрятано в QR-коде. Мы по нему не переходили — только проверили.")

        when (val r = result) {
            is CheckResult.Message -> VerdictCard(r.v)
            is CheckResult.Number -> r.items.forEach { RecipientCard(it) }
            is CheckResult.Failed -> InfoLine(r.text)
            null -> {}
        }

        if (result == null && !busy) {
            if (mode == 0) Fold("Как проверять быстрее") {
                FoldText("Прямо из мессенджера: зажмите сообщение или откройте скриншот, нажмите «Поделиться» и выберите SaqBol. Проверка начнётся сама.")
                FoldText("Мы не храним текст сообщения: номера, карты и ссылки мошенников попадают в общую базу, а сама переписка — нет.")
            } else Fold("Что можно проверить") {
                FoldText("Номер телефона, номер карты, ссылку или @аккаунт — до того, как переводить деньги или переходить по ссылке.")
                FoldText("Покажем, сколько человек уже пожаловались на этого получателя и какую схему с ним связывают.")
            }
        }
    }
}

@Composable
private fun VerdictCard(v: Api.Verdict) {
    val (label, color, soft) = when (v.verdict) {
        "scam" -> Triple("Мошенничество", Brand.Signal, Tone.SignalSoft)
        "suspicious" -> Triple("Подозрительно", Brand.Warn, Tone.WarnSoft)
        else -> Triple("Не похоже на обман", Brand.Ok, Tone.OkSoft)
    }
    Cutout {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Stamp(label, color)
            Spacer(Modifier.weight(1f))
            if (v.confidence > 0) Column(horizontalAlignment = Alignment.End) {
                Text("${v.confidence}%", style = Brand.Number.copy(fontSize = 22.sp, color = color))
                Text("УВЕРЕННОСТЬ", style = Brand.Label.copy(fontSize = 9.sp))
            }
        }
        Spacer(Modifier.height(14.dp))
        Text(v.scheme, style = Brand.Heading)
        if (v.flags.isNotEmpty()) {
            Spacer(Modifier.height(14.dp))
            Text("ПРИЗНАКИ", style = Brand.Label.copy(fontWeight = FontWeight.Bold))
            v.flags.forEach {
                Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.Top) {
                    Box(Modifier.padding(top = 8.dp).size(6.dp).background(color))
                    Spacer(Modifier.width(10.dp))
                    Text(it, style = Brand.Body)
                }
            }
        }
        Spacer(Modifier.height(14.dp))
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(soft).padding(14.dp)) {
            Text("ЧТО ДЕЛАТЬ", style = Brand.Label.copy(color = color, fontWeight = FontWeight.Bold))
            Text(v.advice, style = Brand.Body, modifier = Modifier.padding(top = 4.dp))
        }
        if (v.known.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Tone.Night).padding(14.dp)) {
                Text("НА ЭТО УЖЕ ЖАЛОВАЛИСЬ", style = Brand.Label.copy(color = Tone.SignalSoft, fontWeight = FontWeight.Bold))
                v.known.forEach {
                    Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(it.value, style = Brand.Body.copy(fontFamily = Brand.Mono, fontSize = 14.sp, color = Brand.Paper), modifier = Modifier.weight(1f))
                        Text(Brand.people(it.reporters), style = Brand.Small.copy(color = Brand.Hair))
                    }
                }
            }
        }
    }
}

@Composable
private fun RecipientCard(r: Api.Recipient) {
    val danger = r.found && r.risk >= 45
    val color = when { !r.found -> Brand.Ink2; danger -> Brand.Signal; else -> Brand.Warn }
    Cutout {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(r.value, style = Brand.Number.copy(fontSize = 20.sp), modifier = Modifier.weight(1f))
            if (r.found) Column(horizontalAlignment = Alignment.End) {
                Text("${r.risk}", style = Brand.Number.copy(fontSize = 22.sp, color = color))
                Text("РИСК ИЗ 100", style = Brand.Label.copy(fontSize = 9.sp))
            }
        }
        Spacer(Modifier.height(12.dp))
        if (r.found) {
            Stamp(if (danger) "Не переводите" else "Будьте осторожны", color)
            Spacer(Modifier.height(14.dp))
            Text("На него ${if (r.reporters == 1) "пожаловался" else "пожаловались"} ${Brand.people(r.reporters)}", style = Brand.Heading)
            Spacer(Modifier.height(10.dp))
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if (danger) Tone.SignalSoft else Tone.WarnSoft).padding(14.dp)) {
                Text("СХЕМА: ${Brand.category(r.category).uppercase()}", style = Brand.Label.copy(color = color, fontWeight = FontWeight.Bold))
                Text("Не переводите деньги и не сообщайте коды из SMS.", style = Brand.Body, modifier = Modifier.padding(top = 4.dp))
            }
        } else {
            Stamp("В базе нет", Brand.Ink2)
            Spacer(Modifier.height(12.dp))
            Text("Жалоб пока не было. Это не значит, что получатель безопасен: мошенники часто меняют номера.", style = Brand.Body)
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
    ScreenColumn {
        ScreenHeader("ЗАЩИТА", "Определитель мошенников")

        // Главная панель: живой статус защиты звонков
        Cutout(fill = Tone.Night) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                LiveDot(active)
                Spacer(Modifier.width(10.dp))
                Text(if (active) "ЗАЩИТА ЗВОНКОВ ВКЛЮЧЕНА" else "ЗАЩИТА ЗВОНКОВ ВЫКЛЮЧЕНА", style = Brand.Label.copy(color = Brand.Hair, fontWeight = FontWeight.Bold))
            }
            Text(if (active) "Вы под защитой" else "Звонки не проверяются", style = Brand.Title.copy(color = Brand.Paper), modifier = Modifier.padding(top = 10.dp))
            Text(
                if (active) "Незнакомый номер сверим с базой за секунду. Если на него жаловались — предупреждение появится поверх звонка."
                else "Включите — и SaqBol предупредит, если звонит номер, на который уже жаловались другие люди.",
                style = Brand.Small.copy(color = Brand.Hair), modifier = Modifier.padding(top = 6.dp),
            )
            Spacer(Modifier.height(16.dp))
            when {
                !hasRole -> PrimaryButton("Включить защиту", icon = Ic.Shield) {
                    if (!canNotify()) askNotify.launch(Manifest.permission.POST_NOTIFICATIONS)
                    askRole.launch(CallGuard.roleIntent(ctx))
                }
                !enabled -> PrimaryButton("Возобновить", icon = Ic.Shield) { enabled = true; CallGuard.setEnabled(ctx, true) }
                else -> GhostButton("Приостановить", onDark = true) { enabled = false; CallGuard.setEnabled(ctx, false) }
            }
        }

        if (hasRole && !canOverlay) {
            Cutout(fill = Tone.SignalSoft) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconBadge(Ic.Info, back = Brand.Card)
                    Spacer(Modifier.width(12.dp))
                    Text("Остался один шаг", style = Brand.Heading.copy(fontSize = 19.sp))
                }
                Text("Разрешите показывать предупреждение поверх экрана звонка — иначе оно спрячется в шторке.", style = Brand.Body, modifier = Modifier.padding(top = 10.dp))
                Spacer(Modifier.height(14.dp))
                PrimaryButton("Разрешить") { ctx.startActivity(CallGuard.overlayIntent(ctx)) }
            }
        }

        SectionLabel("ПОПРОБОВАТЬ")
        Row(Modifier.height(IntrinsicSize.Max), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ActionTile(Ic.Phone, if (demoBusy) "Сверяем…" else "Звонок", "Как выглядит предупреждение", Modifier.weight(1f), enabled = !demoBusy) {
                if (!canNotify()) { askNotify.launch(Manifest.permission.POST_NOTIFICATIONS); return@ActionTile }
                demoBusy = true
                note = null
                scope.launch {
                    val hit = runCatching { Api.lookup("8 705 111 22 33") }.getOrNull()?.firstOrNull { it.found }
                    if (hit != null) {
                        CallGuard.alert(ctx, hit)
                        // как при настоящем звонке: привязанные близкие получают уведомление
                        val sent = runCatching { Api.familyAlert(CallGuard.deviceId(ctx), hit.value, hit.reporters, Brand.category(hit.category)) }.getOrDefault(0)
                        if (sent > 0) note = "Близким отправлено уведомление."
                    } else note = "Не удалось связаться с базой. Проверьте интернет."
                    demoBusy = false
                }
            }
            ActionTile(Ic.Bell, "После звонка", "Вопрос «Кто звонил?»", Modifier.weight(1f)) {
                if (!canNotify()) { askNotify.launch(Manifest.permission.POST_NOTIFICATIONS); return@ActionTile }
                CallGuard.askAfterCall(ctx, "+7 705 111 22 33")
                note = "Готово — откройте шторку уведомлений."
            }
        }
        note?.let { InfoLine(it) }

        Fold("Как работает определитель") {
            FoldText("Когда звонит номер, которого нет в ваших контактах, SaqBol за секунду сверяет его с общей базой. Если на него жаловались — поверх звонка появляется красное предупреждение.")
            FoldText("После звонка с незнакомого номера в шторке остаётся вопрос «Кто звонил?». Одно нажатие «Это мошенники» — и номер попадёт в базу: следующего человека SaqBol предупредит.")
            FoldText("Мы не блокируем звонки и не слушаем разговоры. Проверяется только номер.")
        }

        SectionLabel("БЛИЗКИЕ")
        FamilyCard()
        RelativeCard()
    }
}

/**
 * «Защита близких»: телефон мамы привязывается к родственнику без регистрации — QR, ссылка или код.
 * Если маме позвонит номер из базы, родственник сразу получает уведомление.
 */
@Composable
private fun FamilyCard() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val device = remember { CallGuard.deviceId(ctx) }
    var linked by remember { mutableStateOf<Int?>(null) }
    var code by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf<String?>(null) }

    fun refresh() = scope.launch { runCatching { Api.familyLinked(device) }.onSuccess { linked = it } }
    LaunchedEffect(Unit) { refresh() }
    fun newCode() {
        busy = true
        note = null
        scope.launch {
            runCatching { Api.familyCode(device) }
                .onSuccess { code = it }
                .onFailure { note = if (it is Api.ApiError) Api.errorText(it.code) else "Не получилось. Попробуйте ещё раз." }
            busy = false
        }
    }

    val n = linked ?: 0
    Cutout {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconBadge(Ic.Family)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Защита близких", style = Brand.Heading.copy(fontSize = 19.sp))
                Text(if (n > 0) "Привязано: ${Brand.people(n)}" else "Пока никто не привязан", style = Brand.Small)
            }
            if (n > 0) LiveDot(true)
        }
        Text("Маме или бабушке звонит мошенник — вам сразу приходит уведомление.", style = Brand.Body, modifier = Modifier.padding(top = 12.dp))

        code?.let { c ->
            Spacer(Modifier.height(14.dp))
            val link = Family.link(c)
            val qr = remember(c) { runCatching { Family.qr(link) }.getOrNull() }
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Brand.Paper).border(2.dp, Brand.Signal, RoundedCornerShape(14.dp)).padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("ПОКАЖИТЕ РОДСТВЕННИКУ", style = Brand.Label.copy(color = Brand.Signal, fontWeight = FontWeight.Bold))
                qr?.let { Image(it.asImageBitmap(), contentDescription = "QR-код для привязки", modifier = Modifier.padding(vertical = 10.dp).size(196.dp)) }
                Text("Камера телефона → Telegram → «Старт»", style = Brand.Small, textAlign = TextAlign.Center)
                Text(c.chunked(3).joinToString(" "), style = Brand.Number.copy(fontSize = 26.sp), modifier = Modifier.padding(top = 10.dp))
                Text("КОД ДЕЙСТВУЕТ 30 МИНУТ", style = Brand.Label.copy(fontSize = 9.sp), modifier = Modifier.padding(top = 2.dp))
            }
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GhostButton("Ссылка", Modifier.weight(1f), icon = Ic.Send) {
                    val text = "Привяжи мой телефон в SaqBol — если мне позвонит мошенник, ты сразу узнаешь: $link"
                    ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), "Отправить ссылку"))
                }
                GhostButton("Новый код", Modifier.weight(1f), enabled = !busy) { newCode() }
            }
        }

        Spacer(Modifier.height(14.dp))
        if (code == null) {
            PrimaryButton(if (busy) "Получаем код…" else if (n > 0) "Привязать ещё одного" else "Привязать близкого", icon = Ic.Link, enabled = !busy) { newCode() }
        } else {
            PrimaryButton(if (busy) "Проверяем…" else "Родственник привязался", icon = Ic.Check, enabled = !busy) {
                busy = true
                scope.launch {
                    val now = runCatching { Api.familyLinked(device) }.getOrNull()
                    if (now != null) linked = now
                    // засчитываем, если привязан хоть кто-то: тот же родственник мог привязаться повторно
                    if (now != null && now > 0) { code = null; note = "Готово. Проверьте плиткой «Звонок» выше — родственнику придёт уведомление." }
                    else note = "Пока не вижу привязки. Проверьте, что родственник нажал «Старт» или ввёл код целиком."
                    busy = false
                }
            }
        }
        note?.let { Spacer(Modifier.height(10.dp)); InfoLine(it) }
        Spacer(Modifier.height(12.dp))
        Fold("Как это работает") {
            FoldText("1. На телефоне мамы нажмите «Привязать близкого» — появится QR-код.")
            FoldText("2. Родственник наводит на него обычную камеру: откроется Telegram, остаётся нажать «Старт». Если он далеко — отправьте ему ссылку.")
            FoldText("3. Когда маме позвонит номер, на который жаловались, у неё появится предупреждение, а родственнику — уведомление с номером и схемой. Он успеет позвонить и остановить разговор.")
            FoldText("Регистрация не нужна. По одному коду можно привязать нескольких близких.")
        }
    }
}

/** Телефон родственника: вводим или сканируем код с телефона мамы — и сюда приходит push, когда ей звонит мошенник. */
@Composable
private fun RelativeCard() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val prefs = remember { ctx.getSharedPreferences("saqbol", android.content.Context.MODE_PRIVATE) }
    var joined by remember { mutableStateOf(prefs.getInt("family_joined", 0)) }
    var open by remember { mutableStateOf(false) }
    var input by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf<String?>(null) }
    val askNotify = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}

    fun join(code: String) {
        if (Build.VERSION.SDK_INT >= 33 && ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            askNotify.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        input = code
        busy = true
        note = null
        scope.launch {
            try {
                Api.familyJoin(code, CallGuard.deviceId(ctx), Push.token())
                joined += 1
                prefs.edit().putInt("family_joined", joined).apply()
                open = false
                input = ""
                note = "Готово. Когда близкому позвонит номер из базы, уведомление придёт на этот телефон."
            } catch (e: Api.ApiError) {
                note = Api.errorText(e.code)
            } catch (e: Exception) {
                note = "Не получилось подключить уведомления. Проверьте интернет и попробуйте ещё раз."
            }
            busy = false
        }
    }
    // QR с телефона мамы: в нём ссылка на бота с кодом — берём из неё код и подключаем сразу
    val scan = rememberLauncherForActivityResult(ScanContract()) { r ->
        val c = r.contents?.let(Family::codeFrom)
        if (c != null) join(c) else if (r.contents != null) note = "Это не QR-код SaqBol. Наведите камеру на код на телефоне близкого."
    }

    Cutout {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconBadge(Ic.Bell, tint = Brand.Ink, back = Brand.Paper2)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Я родственник", style = Brand.Heading.copy(fontSize = 19.sp))
                Text(if (joined > 0) "Уведомления о близких: $joined" else "Уведомления в этом телефоне", style = Brand.Small)
            }
        }
        if (open) {
            Spacer(Modifier.height(14.dp))
            BasicTextField(
                value = input, onValueChange = { input = it.filter(Char::isDigit).take(6) },
                textStyle = Brand.Number.copy(fontSize = 30.sp, textAlign = TextAlign.Center),
                cursorBrush = SolidColor(Brand.Signal),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Brand.Paper).border(2.dp, Brand.Ink, RoundedCornerShape(12.dp)).padding(12.dp),
                decorationBox = { inner ->
                    Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxWidth()) {
                        if (input.isEmpty()) Text("_ _ _ _ _ _", style = Brand.Number.copy(fontSize = 30.sp, color = Brand.Ink3))
                        inner()
                    }
                },
            )
        }
        Spacer(Modifier.height(14.dp))
        if (!open) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PrimaryButton(if (busy) "…" else "Сканировать", Modifier.weight(1f), icon = Ic.Qr, enabled = !busy) {
                    scan.launch(ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE).setBeepEnabled(false).setOrientationLocked(true)
                        .setPrompt("Наведите камеру на QR-код на телефоне близкого"))
                }
                GhostButton("Ввести код", Modifier.weight(1f), enabled = !busy) { open = true; note = null }
            }
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PrimaryButton(if (busy) "…" else "Подключить", Modifier.weight(1f), enabled = !busy && input.length == 6) { join(input) }
                GhostButton("Отмена", Modifier.weight(1f)) { open = false; input = "" }
            }
        }
        note?.let { Spacer(Modifier.height(10.dp)); InfoLine(it) }
        Spacer(Modifier.height(12.dp))
        Fold("Когда это нужно") {
            FoldText("Если у вас тоже стоит SaqBol, отсканируйте QR-код с телефона мамы или введите цифры. Когда ей позвонит мошенник, уведомление придёт сюда, даже если приложение закрыто.")
            FoldText("Приложения нет? Достаточно навести на QR обычную камеру — уведомления будут приходить в Telegram.")
        }
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

    ScreenColumn {
        ScreenHeader("СВОДКА", "Что рассылают сейчас")
        val s = data
        if (s == null) {
            if (failed) InfoLine("Нет связи с интернетом.")
            else LinearProgressIndicator(Modifier.fillMaxWidth().clip(RoundedCornerShape(4.dp)), color = Brand.Signal, trackColor = Brand.Paper2)
        } else {
            s.topCategory?.let {
                Cutout(fill = Brand.Signal) {
                    Text("ГЛАВНАЯ УГРОЗА", style = Brand.Label.copy(color = Color.White.copy(alpha = 0.85f), fontWeight = FontWeight.Bold))
                    Text(Brand.category(it), style = Brand.Title.copy(color = Color.White), modifier = Modifier.padding(top = 4.dp))
                    Spacer(Modifier.height(12.dp))
                    ShareBar(s.topShare / 100f, Color.White, Color.White.copy(alpha = 0.28f))
                    Text("${s.topShare}% всех найденных обманов", style = Brand.Small.copy(color = Color.White.copy(alpha = 0.92f)), modifier = Modifier.padding(top = 6.dp))
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                listOf("Проверено" to s.checks, "Обманов" to s.flagged, "В базе" to s.indicators).forEachIndexed { i, (label, value) ->
                    Cutout(Modifier.weight(1f), fill = if (i == 1) Tone.Night else Brand.Card, shadow = 3.dp) {
                        Text("$value", style = Brand.Number.copy(fontSize = 24.sp, color = if (i == 1) Tone.SignalSoft else Brand.Ink))
                        Text(label.uppercase(), style = Brand.Label.copy(fontSize = 9.sp, color = if (i == 1) Brand.Hair else Brand.Ink2), modifier = Modifier.padding(top = 2.dp))
                    }
                }
            }
            Cutout {
                Text("ПОСЛЕДНИЕ ПРОВЕРКИ", style = Brand.Label.copy(fontWeight = FontWeight.Bold))
                s.feed.take(8).forEach { f ->
                    val scam = f.verdict != "safe"
                    Row(Modifier.fillMaxWidth().padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(8.dp).rotate(-10f).background(if (scam) Brand.Signal else Brand.Hair))
                        Spacer(Modifier.width(10.dp))
                        Text(time.format(Date(f.atMillis)), style = Brand.Body.copy(fontFamily = Brand.Mono, fontSize = 13.sp, color = Brand.Ink3))
                        Spacer(Modifier.width(12.dp))
                        Text(
                            if (scam) Brand.category(f.category) else "обычное сообщение",
                            style = Brand.Body.copy(fontSize = 15.sp, fontWeight = if (scam) FontWeight.Medium else FontWeight.Normal, color = if (scam) Brand.Ink else Brand.Ink2),
                        )
                    }
                }
            }
            Cutout(onClick = { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://saqbol-ai-kz.web.app"))) }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconBadge(Ic.Globe)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Тренажёр и памятка", style = Brand.Body.copy(fontWeight = FontWeight.SemiBold))
                        Text("saqbol-ai-kz.web.app", style = Brand.Small.copy(fontFamily = Brand.Mono, fontSize = 12.sp))
                    }
                    Glyph(Ic.Chevron, Brand.Ink, Modifier.size(18.dp).rotate(-90f))
                }
            }
        }
    }
}
