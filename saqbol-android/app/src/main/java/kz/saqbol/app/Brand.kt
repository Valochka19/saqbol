package kz.saqbol.app

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Фирменный почерк SaqBol — тот же, что на сайте: бумага, чернила, один красный, засечки и моноширинные цифры. */
object Brand {
    val Paper = Color(0xFFF3EFE6)
    val Paper2 = Color(0xFFEBE6DA)
    val Card = Color(0xFFFBF9F3)
    val Ink = Color(0xFF141311)
    val Ink2 = Color(0xFF4A4740)
    val Ink3 = Color(0xFF8A857A)
    val Hair = Color(0xFFCFC8B8)
    val Signal = Color(0xFFC8321A)
    val Ok = Color(0xFF1F6B3A)
    val Warn = Color(0xFF9A6A00)

    val Serif = FontFamily(
        Font(R.font.pt_serif_regular, FontWeight.Normal),
        Font(R.font.pt_serif_italic, FontWeight.Normal, FontStyle.Italic),
        Font(R.font.pt_serif_bold, FontWeight.Bold),
    )
    val Sans = FontFamily(
        Font(R.font.plex_sans_regular, FontWeight.Normal),
        Font(R.font.plex_sans_medium, FontWeight.Medium),
        Font(R.font.plex_sans_semibold, FontWeight.SemiBold),
    )
    val Mono = FontFamily(
        Font(R.font.plex_mono_regular, FontWeight.Normal),
        Font(R.font.plex_mono_medium, FontWeight.Medium),
        Font(R.font.plex_mono_bold, FontWeight.Bold),
    )

    val Title = TextStyle(fontFamily = Serif, fontWeight = FontWeight.Bold, fontSize = 30.sp, lineHeight = 34.sp, color = Ink)
    val Heading = TextStyle(fontFamily = Serif, fontWeight = FontWeight.Bold, fontSize = 21.sp, lineHeight = 26.sp, color = Ink)
    val Body = TextStyle(fontFamily = Sans, fontSize = 16.sp, lineHeight = 23.sp, color = Ink)
    val Small = TextStyle(fontFamily = Sans, fontSize = 14.sp, lineHeight = 20.sp, color = Ink2)
    val Label = TextStyle(fontFamily = Mono, fontWeight = FontWeight.Medium, fontSize = 11.sp, letterSpacing = 1.4.sp, color = Ink2)
    val Number = TextStyle(fontFamily = Mono, fontWeight = FontWeight.Medium, fontSize = 34.sp, color = Ink)

    fun category(key: String): String = when (key) {
        "bank_security" -> "Лжесотрудник банка"
        "phishing" -> "Поддельная ссылка"
        "hacked_account" -> "Взлом знакомого"
        "authority" -> "Лжеполиция"
        "investment" -> "Инвестиции и крипта"
        "job" -> "Фейковая работа"
        "marketplace" -> "Купля-продажа"
        "prize" -> "Выигрыш и выплаты"
        "loan" -> "Фейковый кредит"
        else -> "Мошенничество"
    }

    fun people(n: Int): String {
        val d = n % 10
        val h = n % 100
        return "$n " + if (d in 2..4 && h !in 12..14) "человека" else "человек"
    }
}

/** Карточка-«вырезка»: толстая чёрная обводка и жёсткая тень — как телефоны в Демо-банке на сайте. */
@Composable
fun Cutout(modifier: Modifier = Modifier, fill: Color = Brand.Card, shadow: Dp = 5.dp, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    Box(modifier) {
        Box(Modifier.matchParentSize().offset(shadow, shadow).clip(shape).background(Brand.Ink))
        Column(
            Modifier.fillMaxWidth().clip(shape).background(fill).border(2.5.dp, Brand.Ink, shape)
                .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(18.dp),
            content = content,
        )
    }
}

/** Большая кнопка под палец. */
@Composable
fun BigButton(text: String, modifier: Modifier = Modifier, fill: Color = Brand.Ink, enabled: Boolean = true, content: Color = Color.White, onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    Box(
        modifier.fillMaxWidth().clip(shape).background(if (enabled) fill else Brand.Ink3).clickable(enabled = enabled, onClick = onClick).padding(vertical = 17.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text.uppercase(), style = Brand.Label.copy(color = if (enabled) content else Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold))
    }
}

/** Штамп вердикта: с размаху опускается на экран, телефон отзывается вибрацией. */
@Composable
fun Stamp(text: String, color: Color, modifier: Modifier = Modifier) {
    val scale = remember(text) { Animatable(2.2f) }
    val haptics = LocalHapticFeedback.current
    LaunchedEffect(text) {
        scale.animateTo(1f, spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium))
        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
    }
    Box(modifier.scale(scale.value).rotate(-4f).border(3.dp, color, RoundedCornerShape(4.dp)).padding(horizontal = 14.dp, vertical = 7.dp)) {
        Text(text.uppercase(), style = Brand.Label.copy(color = color, fontSize = 15.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp))
    }
}
