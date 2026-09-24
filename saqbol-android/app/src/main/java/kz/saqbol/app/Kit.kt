package kz.saqbol.app

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/*
 * Набор элементов интерфейса SaqBol. Почерк прежний — бумага, чернила, один красный, толстая обводка
 * и жёсткая тень. Сверху — то, чего не хватало: объём (тёмные панели и мягкие подложки), иконки,
 * отклик на нажатие и раскрывающиеся пояснения, чтобы текст-объяснение не путался с кнопками.
 */

/** Служебное: открыть экран сразу пролистанным до конца (параметр запуска end=true, для проверки вёрстки). */
object ScrollDebug { var toEnd = false }

object Tone {
    val Night = Color(0xFF1B1916)       // тёмная панель: главный статус экрана
    val NightLine = Color(0xFF3A362F)
    val SignalSoft = Color(0xFFF5DED6)  // мягкая красная подложка: иконки, «что делать» при обмане
    val WarnSoft = Color(0xFFF3E7C9)
    val OkSoft = Color(0xFFDCEADF)
    val Live = Color(0xFF2E9E57)        // «защита включена»
}

enum class Ic { Search, Shield, Bars, Image, Qr, Phone, Bell, Family, Send, Info, Chevron, Globe, Link, Check }

/** Иконки рисуем сами — тем же толстым «чернильным» штрихом, что и обводки. */
@Composable
fun Glyph(ic: Ic, color: Color, modifier: Modifier = Modifier.size(22.dp)) {
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        val st = Stroke(width = size.minDimension * 0.1f, cap = StrokeCap.Round, join = StrokeJoin.Round)
        fun line(x1: Float, y1: Float, x2: Float, y2: Float) = drawLine(color, Offset(w * x1, h * y1), Offset(w * x2, h * y2), st.width, StrokeCap.Round)
        fun path(block: Path.() -> Unit) = drawPath(Path().apply(block), color, style = st)
        when (ic) {
            Ic.Search -> { drawCircle(color, w * 0.3f, Offset(w * 0.42f, h * 0.42f), style = st); line(0.64f, 0.64f, 0.9f, 0.9f) }
            Ic.Shield -> {
                path { moveTo(w * .5f, h * .06f); lineTo(w * .88f, h * .2f); cubicTo(w * .88f, h * .58f, w * .72f, h * .82f, w * .5f, h * .95f)
                    cubicTo(w * .28f, h * .82f, w * .12f, h * .58f, w * .12f, h * .2f); close() }
                path { moveTo(w * .34f, h * .5f); lineTo(w * .46f, h * .62f); lineTo(w * .67f, h * .38f) }
            }
            Ic.Bars -> { line(0.22f, 0.88f, 0.22f, 0.5f); line(0.5f, 0.88f, 0.5f, 0.22f); line(0.78f, 0.88f, 0.78f, 0.62f) }
            Ic.Image -> {
                drawRoundRect(color, Offset(w * .08f, h * .16f), Size(w * .84f, h * .68f), CornerRadius(w * .12f), style = st)
                path { moveTo(w * .18f, h * .74f); lineTo(w * .42f, h * .46f); lineTo(w * .58f, h * .62f); lineTo(w * .68f, h * .52f); lineTo(w * .84f, h * .72f) }
                drawCircle(color, w * .07f, Offset(w * .68f, h * .34f))
            }
            Ic.Qr -> {
                listOf(0.08f to 0.08f, 0.58f to 0.08f, 0.08f to 0.58f).forEach { (x, y) ->
                    drawRoundRect(color, Offset(w * x, h * y), Size(w * .34f, h * .34f), CornerRadius(w * .06f), style = st)
                    drawRect(color, Offset(w * (x + .12f), h * (y + .12f)), Size(w * .1f, h * .1f))
                }
                drawRect(color, Offset(w * .62f, h * .62f), Size(w * .12f, h * .12f)); drawRect(color, Offset(w * .8f, h * .8f), Size(w * .12f, h * .12f))
                drawRect(color, Offset(w * .8f, h * .6f), Size(w * .12f, h * .12f))
            }
            Ic.Phone -> {
                drawRoundRect(color, Offset(w * .26f, h * .06f), Size(w * .48f, h * .88f), CornerRadius(w * .12f), style = st)
                line(0.42f, 0.8f, 0.58f, 0.8f)
            }
            Ic.Bell -> {
                path { moveTo(w * .2f, h * .72f); cubicTo(w * .28f, h * .6f, w * .24f, h * .2f, w * .5f, h * .16f)
                    cubicTo(w * .76f, h * .2f, w * .72f, h * .6f, w * .8f, h * .72f); close() }
                line(0.42f, 0.86f, 0.58f, 0.86f)
            }
            Ic.Family -> {
                drawCircle(color, w * .13f, Offset(w * .34f, h * .3f), style = st)
                drawCircle(color, w * .1f, Offset(w * .7f, h * .36f), style = st)
                path { moveTo(w * .1f, h * .88f); cubicTo(w * .12f, h * .58f, w * .56f, h * .58f, w * .58f, h * .88f) }
                path { moveTo(w * .56f, h * .66f); cubicTo(w * .66f, h * .56f, w * .92f, h * .6f, w * .92f, h * .88f) }
            }
            Ic.Send -> path { moveTo(w * .1f, h * .46f); lineTo(w * .9f, h * .12f); lineTo(w * .6f, h * .9f); lineTo(w * .46f, h * .56f); close() }
            Ic.Info -> { drawCircle(color, w * .42f, Offset(w * .5f, h * .5f), style = st); line(0.5f, 0.46f, 0.5f, 0.72f); drawCircle(color, w * .06f, Offset(w * .5f, h * .3f)) }
            Ic.Chevron -> path { moveTo(w * .2f, h * .36f); lineTo(w * .5f, h * .66f); lineTo(w * .8f, h * .36f) }
            Ic.Globe -> {
                drawCircle(color, w * .42f, Offset(w * .5f, h * .5f), style = st)
                drawOval(color, Offset(w * .32f, h * .08f), Size(w * .36f, h * .84f), style = st)
                line(0.1f, 0.5f, 0.9f, 0.5f)
            }
            Ic.Link -> {
                drawRoundRect(color, Offset(w * .06f, h * .34f), Size(w * .5f, h * .32f), CornerRadius(h * .16f), style = st)
                drawRoundRect(color, Offset(w * .44f, h * .34f), Size(w * .5f, h * .32f), CornerRadius(h * .16f), style = st)
            }
            Ic.Check -> path { moveTo(w * .16f, h * .52f); lineTo(w * .4f, h * .76f); lineTo(w * .86f, h * .26f) }
        }
    }
}

/** Фон-«бумага для расчётов»: едва заметная сетка точек, чтобы экран не был плоским. */
fun Modifier.dotGrid(): Modifier = drawBehind {
    val step = 22.dp.toPx()
    val r = 1.1.dp.toPx()
    val c = Brand.Hair.copy(alpha = 0.55f)
    var y = step / 2
    while (y < size.height) {
        var x = step / 2
        while (x < size.width) { drawCircle(c, r, Offset(x, y)); x += step }
        y += step
    }
}

/** Заголовок экрана: красная метка-«печать», подпись моноширинным и крупный заголовок с засечками. */
@Composable
fun ScreenHeader(kicker: String, title: String) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(9.dp).rotate(-10f).background(Brand.Signal))
            Spacer(Modifier.width(8.dp))
            Text(kicker, style = Brand.Label.copy(color = Brand.Ink2, fontWeight = FontWeight.Bold))
        }
        Spacer(Modifier.height(6.dp))
        Text(title, style = Brand.Title)
    }
}

/** Подпись раздела с тонкой линией до края. */
@Composable
fun SectionLabel(text: String) {
    Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text, style = Brand.Label.copy(fontWeight = FontWeight.Bold))
        Spacer(Modifier.width(10.dp))
        Box(Modifier.weight(1f).height(1.5.dp).background(Brand.Hair))
    }
}

/** Главная кнопка: красная, с жёсткой тенью; при нажатии «вдавливается» в тень. */
@Composable
fun PrimaryButton(text: String, modifier: Modifier = Modifier, icon: Ic? = null, enabled: Boolean = true, fill: Color = Brand.Signal, onClick: () -> Unit) {
    val src = remember { MutableInteractionSource() }
    val pressed by src.collectIsPressedAsState()
    val shadow = 4.dp
    val shift by animateDpAsState(if (pressed && enabled) shadow else 0.dp, tween(70), label = "press")
    val shape = RoundedCornerShape(14.dp)
    Box(modifier.fillMaxWidth().padding(end = shadow, bottom = shadow)) {
        Box(Modifier.matchParentSize().offset(shadow, shadow).clip(shape).background(Brand.Ink))
        Row(
            Modifier.fillMaxWidth().offset(shift, shift).clip(shape).background(if (enabled) fill else fill.copy(alpha = 0.42f).compositeOver(Brand.Card))
                .border(2.5.dp, Brand.Ink, shape)
                .clickable(interactionSource = src, indication = null, enabled = enabled, onClick = onClick)
                .padding(vertical = 15.dp, horizontal = 14.dp),
            horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
        ) {
            if (icon != null) { Glyph(icon, Color.White, Modifier.size(19.dp)); Spacer(Modifier.width(10.dp)) }
            Text(text.uppercase(), style = Brand.Label.copy(color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp), maxLines = 1)
        }
    }
}

/** Второстепенная кнопка — контурная: видно, что это кнопка, но она не спорит с главной. */
@Composable
fun GhostButton(text: String, modifier: Modifier = Modifier, icon: Ic? = null, onDark: Boolean = false, enabled: Boolean = true, onClick: () -> Unit) {
    val src = remember { MutableInteractionSource() }
    val pressed by src.collectIsPressedAsState()
    val s by animateFloatAsState(if (pressed) 0.97f else 1f, tween(80), label = "ghost")
    val ink = when { !enabled -> Brand.Ink3; onDark -> Brand.Paper; else -> Brand.Ink }
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier.fillMaxWidth().scale(s).clip(shape).background(if (onDark) Color.Transparent else Brand.Card).border(2.dp, ink, shape)
            .clickable(interactionSource = src, indication = null, enabled = enabled, onClick = onClick)
            .padding(vertical = 14.dp, horizontal = 12.dp),
        horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) { Glyph(icon, ink, Modifier.size(18.dp)); Spacer(Modifier.width(9.dp)) }
        Text(text.uppercase(), style = Brand.Label.copy(color = ink, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.3.sp), maxLines = 1)
    }
}

/** Иконка в мягкой подложке — метка раздела или плитки. */
@Composable
fun IconBadge(ic: Ic, tint: Color = Brand.Signal, back: Color = Tone.SignalSoft, size: Int = 44) {
    Box(Modifier.size(size.dp).clip(RoundedCornerShape(12.dp)).background(back).border(2.dp, Brand.Ink, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
        Glyph(ic, tint, Modifier.size((size * 0.5f).dp))
    }
}

/** Плитка-действие: иконка, название и одна строка пояснения. Вдавливается при нажатии. */
@Composable
fun ActionTile(ic: Ic, title: String, caption: String, modifier: Modifier = Modifier, enabled: Boolean = true, onClick: () -> Unit) {
    val src = remember { MutableInteractionSource() }
    val pressed by src.collectIsPressedAsState()
    val shadow = 4.dp
    val shift by animateDpAsState(if (pressed && enabled) shadow else 0.dp, tween(70), label = "tile")
    val shape = RoundedCornerShape(16.dp)
    Box(modifier.fillMaxHeight().padding(end = shadow, bottom = shadow)) {
        Box(Modifier.matchParentSize().offset(shadow, shadow).clip(shape).background(Brand.Ink))
        Column(
            Modifier.fillMaxWidth().fillMaxHeight().offset(shift, shift).clip(shape).background(Brand.Card).border(2.5.dp, Brand.Ink, shape)
                .clickable(interactionSource = src, indication = null, enabled = enabled, onClick = onClick).padding(14.dp),
        ) {
            IconBadge(ic, tint = if (enabled) Brand.Signal else Brand.Ink3)
            Spacer(Modifier.height(12.dp))
            Text(title, style = Brand.Body.copy(fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = if (enabled) Brand.Ink else Brand.Ink3), maxLines = 1)
            Text(caption, style = Brand.Small.copy(fontSize = 13.sp, lineHeight = 17.sp), maxLines = 2, modifier = Modifier.padding(top = 2.dp))
        }
    }
}

/**
 * Раскрывающееся пояснение. Объяснения живут здесь, а не рядом с кнопками:
 * своя подложка, значок «i» и стрелка — сразу видно, что это текст, который можно прочитать, а не действие.
 */
@Composable
fun Fold(title: String, modifier: Modifier = Modifier, onDark: Boolean = false, content: @Composable ColumnScope.() -> Unit) {
    var open by rememberSaveable(title) { mutableStateOf(false) }
    val turn by animateFloatAsState(if (open) 180f else 0f, spring(stiffness = 500f), label = "fold")
    val ink = if (onDark) Brand.Hair else Brand.Ink2
    val shape = RoundedCornerShape(12.dp)
    Column(
        modifier.fillMaxWidth().clip(shape).background(if (onDark) Tone.NightLine.copy(alpha = 0.45f) else Brand.Paper2)
            .border(1.5.dp, if (onDark) Tone.NightLine else Brand.Hair, shape),
    ) {
        Row(
            Modifier.fillMaxWidth().clickable { open = !open }.padding(horizontal = 14.dp, vertical = 13.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Glyph(Ic.Info, ink, Modifier.size(18.dp))
            Spacer(Modifier.width(10.dp))
            Text(title, style = Brand.Body.copy(fontSize = 15.sp, fontWeight = FontWeight.Medium, color = if (onDark) Brand.Paper else Brand.Ink), modifier = Modifier.weight(1f))
            Glyph(Ic.Chevron, ink, Modifier.size(16.dp).rotate(turn))
        }
        AnimatedVisibility(open, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
            Column(Modifier.padding(start = 42.dp, end = 14.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
        }
    }
}

@Composable
fun FoldText(text: String, onDark: Boolean = false) = Text(text, style = Brand.Small.copy(color = if (onDark) Brand.Hair else Brand.Ink2))

/** Короткая строка-подсказка с результатом действия. */
@Composable
fun InfoLine(text: String, onDark: Boolean = false) {
    Row(verticalAlignment = Alignment.Top) {
        Box(Modifier.padding(top = 7.dp).size(6.dp).background(Brand.Signal))
        Spacer(Modifier.width(10.dp))
        Text(text, style = Brand.Small.copy(color = if (onDark) Brand.Hair else Brand.Ink2))
    }
}

/** Живая точка: зелёная и «дышит», когда включено; красная — когда выключено. */
@Composable
fun LiveDot(on: Boolean, size: Int = 10) {
    val pulse = rememberInfiniteTransition(label = "live")
    val halo by pulse.animateFloat(1f, 2.4f, infiniteRepeatable(tween(1400), RepeatMode.Restart), label = "halo")
    val haloA by pulse.animateFloat(0.55f, 0f, infiniteRepeatable(tween(1400), RepeatMode.Restart), label = "halo-a")
    val color = if (on) Tone.Live else Brand.Signal
    Box(Modifier.size(size.dp), contentAlignment = Alignment.Center) {
        if (on) Box(Modifier.size(size.dp).scale(halo).clip(CircleShape).background(color.copy(alpha = haloA)))
        Box(Modifier.size(size.dp).clip(CircleShape).background(color))
    }
}

/** Маленькая кнопка-метка внутри карточки: «Вставить», «Очистить». */
@Composable
fun Chip(text: String, onClick: () -> Unit) {
    Box(
        Modifier.clip(RoundedCornerShape(50)).border(1.5.dp, Brand.Ink, RoundedCornerShape(50)).clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 5.dp),
    ) { Text(text.uppercase(), style = Brand.Label.copy(color = Brand.Ink, fontWeight = FontWeight.Bold, fontSize = 10.sp)) }
}

/** Переключатель режимов с ползунком, который переезжает с пружинкой. */
@Composable
fun Segmented(items: List<String>, selected: Int, onSelect: (Int) -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    BoxWithConstraints(Modifier.fillMaxWidth().height(50.dp).clip(shape).background(Brand.Paper2).border(2.dp, Brand.Ink, shape).padding(4.dp)) {
        val w = maxWidth / items.size
        val x by animateDpAsState(w * selected, spring(dampingRatio = 0.7f, stiffness = 500f), label = "seg")
        Box(Modifier.offset(x = x).width(w).fillMaxHeight().clip(RoundedCornerShape(10.dp)).background(Brand.Ink))
        Row(Modifier.fillMaxSize()) {
            items.forEachIndexed { i, t ->
                Box(
                    Modifier.weight(1f).fillMaxHeight().clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { onSelect(i) },
                    contentAlignment = Alignment.Center,
                ) { Text(t.uppercase(), style = Brand.Label.copy(color = if (i == selected) Brand.Paper else Brand.Ink, fontWeight = FontWeight.Bold)) }
            }
        }
    }
}

/** Лого-штамп «S» в наклонной рамке — как на иконке приложения. */
@Composable
fun LogoStamp(size: Int = 30) {
    Box(Modifier.size(size.dp).rotate(-6f).border(2.5.dp, Brand.Signal, RoundedCornerShape(3.dp)), contentAlignment = Alignment.Center) {
        Text("S", style = Brand.Title.copy(color = Brand.Signal, fontSize = (size * 0.62f).sp, lineHeight = (size * 0.7f).sp))
    }
}

/** Горизонтальная полоса доли: «41 % всех обманов». */
@Composable
fun ShareBar(share: Float, color: Color, track: Color) {
    Box(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)).background(track)) {
        Box(Modifier.fillMaxWidth(share.coerceIn(0.03f, 1f)).fillMaxHeight().clip(RoundedCornerShape(4.dp)).background(color))
    }
}
