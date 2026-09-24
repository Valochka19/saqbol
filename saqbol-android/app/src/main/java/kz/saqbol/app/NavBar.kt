package kz.saqbol.app

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

/**
 * Нижнее меню в почерке SaqBol: плавающая карточка с жёсткой тенью, под активной вкладкой — красный штамп.
 * Штамп переезжает с пружинкой и «опускается» с наклоном, как печать, телефон отзывается вибрацией.
 * На вкладке «Защита» фирменный квадратик: залит красным — защита звонков включена, пустая рамка — выключена.
 */
@Composable
fun NavBar(tabs: List<String>, selected: Int, guardOn: Boolean, onSelect: (Int) -> Unit) {
    val haptics = LocalHapticFeedback.current
    val shape = RoundedCornerShape(18.dp)
    val shadow = 5.dp

    // Штамп: при смене вкладки падает сверху (крупнее → в размер) и ложится с наклоном
    val stampScale = remember { Animatable(1f) }
    val stampTilt = remember { Animatable(-4f) }
    val opened = remember { booleanArrayOf(false) } // при открытии приложения штамп уже на месте, без анимации
    LaunchedEffect(selected) {
        if (!opened[0]) { opened[0] = true; return@LaunchedEffect }
        stampScale.snapTo(1.35f)
        stampTilt.snapTo(-12f)
        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        coroutineScope {
            launch { stampScale.animateTo(1f, spring(dampingRatio = 0.45f, stiffness = 500f)) }
            launch { stampTilt.animateTo(-4f, spring(dampingRatio = 0.5f, stiffness = 400f)) }
        }
    }

    Box(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp + shadow, top = 8.dp, bottom = 12.dp + shadow)) {
        Box(Modifier.matchParentSize().offset(shadow, shadow).clip(shape).background(Brand.Ink))
        BoxWithConstraints(Modifier.fillMaxWidth().height(68.dp).clip(shape).background(Brand.Card).border(2.5.dp, Brand.Ink, shape)) {
            val itemW = maxWidth / tabs.size
            val x by animateDpAsState(itemW * selected, spring(dampingRatio = 0.62f, stiffness = Spring.StiffnessMediumLow), label = "stamp-x")

            // красный штамп под активной вкладкой
            Box(
                Modifier.offset(x = x).width(itemW).fillMaxHeight().padding(7.dp)
                    .scale(stampScale.value).rotate(stampTilt.value)
                    .clip(RoundedCornerShape(11.dp)).background(Brand.Signal)
                    .border(2.dp, Brand.Ink, RoundedCornerShape(11.dp)),
            )

            Row(Modifier.fillMaxSize()) {
                tabs.forEachIndexed { i, title ->
                    val active = i == selected
                    val ink = if (active) Color.White else Brand.Ink
                    Column(
                        Modifier.weight(1f).fillMaxHeight()
                            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { if (!active) onSelect(i) },
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Box {
                            Canvas(Modifier.size(24.dp).rotate(if (active) stampTilt.value else 0f)) {
                                when (i) {
                                    0 -> magnifier(ink)
                                    1 -> shield(ink)
                                    else -> bars(ink)
                                }
                            }
                            if (i == 1) GuardDot(guardOn, active, Modifier.align(Alignment.TopEnd).offset(x = 8.dp, y = (-4).dp))
                        }
                        Spacer(Modifier.height(4.dp))
                        Text(title.uppercase(), style = Brand.Label.copy(color = ink, fontSize = 11.sp, letterSpacing = 1.2.sp))
                    }
                }
            }
        }
    }
}

/**
 * Метка защиты — фирменный квадратик: залит — защита включена, пустая рамка — выключена.
 * На красном штампе активной вкладки он белый, на светлом фоне — красный: так его видно всегда.
 */
@Composable
private fun GuardDot(on: Boolean, onRed: Boolean, modifier: Modifier) {
    val c = if (onRed) Brand.Card else Brand.Signal
    val shape = RoundedCornerShape(1.5.dp)
    Box(modifier.size(10.dp).rotate(-10f).clip(shape).background(if (on) c else Color.Transparent).border(2.dp, c, shape))
}

// Иконки рисуем сами — в том же толстом «чернильном» штрихе, что и обводки карточек
private fun DrawScope.stroke() = Stroke(width = size.minDimension * 0.11f, cap = StrokeCap.Round, join = StrokeJoin.Round)

private fun DrawScope.magnifier(c: Color) {
    val r = size.minDimension * 0.30f
    val center = Offset(size.width * 0.42f, size.height * 0.42f)
    drawCircle(c, r, center, style = stroke())
    drawLine(c, Offset(center.x + r * 0.72f, center.y + r * 0.72f), Offset(size.width * 0.9f, size.height * 0.9f), size.minDimension * 0.13f, StrokeCap.Round)
}

private fun DrawScope.shield(c: Color) {
    val w = size.width
    val h = size.height
    val p = Path().apply {
        moveTo(w * 0.5f, h * 0.06f)
        lineTo(w * 0.88f, h * 0.2f)
        cubicTo(w * 0.88f, h * 0.58f, w * 0.72f, h * 0.82f, w * 0.5f, h * 0.95f)
        cubicTo(w * 0.28f, h * 0.82f, w * 0.12f, h * 0.58f, w * 0.12f, h * 0.2f)
        close()
    }
    drawPath(p, c, style = stroke())
    val tick = Path().apply { moveTo(w * 0.34f, h * 0.5f); lineTo(w * 0.46f, h * 0.62f); lineTo(w * 0.67f, h * 0.38f) }
    drawPath(tick, c, style = stroke())
}

private fun DrawScope.bars(c: Color) {
    val bw = size.width * 0.18f
    val base = size.height * 0.9f
    listOf(0.14f to 0.45f, 0.41f to 0.7f, 0.68f to 0.3f).forEach { (x, top) ->
        drawLine(c, Offset(size.width * x + bw / 2, base), Offset(size.width * x + bw / 2, size.height * top), bw, StrokeCap.Round)
    }
}
