"""То, что умеет сайт, — прямо в чате: проверка номера, тренажёр, разговор с мошенником, памятка.

Этот роутер подключается раньше общей проверки сообщений: пока идёт «разговор с мошенником»,
реплики человека уходят в симулятор, а не на проверку.
"""

import json
import logging
import random
import re
from html import escape
from pathlib import Path

from aiogram import F, Router
from aiogram.enums import ChatAction
from aiogram.filters import Command
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo

from . import indicators, simulator, store, webqueue
from .rules import URL_RE

log = logging.getLogger("saqbol")
router = Router()

SITE = "https://saqbol-ai-kz.web.app"
QUIZ_FILE = Path(__file__).resolve().parent.parent / "data" / "quiz.json"

CATEGORY = {
    "bank_security": "лжесотрудник банка", "phishing": "поддельная ссылка", "hacked_account": "взлом знакомого",
    "authority": "лжеполиция и госорганы", "investment": "инвестиции и крипта", "job": "фейковая работа",
    "marketplace": "купля-продажа, доставка", "prize": "выигрыш и выплаты", "loan": "фейковый кредит", "other": "мошенничество",
}


def people(n: int) -> str:
    d, h = n % 10, n % 100
    return f"{n} " + ("человека" if 2 <= d <= 4 and not 12 <= h <= 14 else "человек")


def kb(*rows: list[InlineKeyboardButton]) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[list(r) for r in rows])


def btn(text: str, data: str) -> InlineKeyboardButton:
    return InlineKeyboardButton(text=text, callback_data=data)


def main_menu() -> InlineKeyboardMarkup:
    return kb(
        [btn("🎯 Тренажёр", "menu:trainer"), btn("📞 Разговор с мошенником", "menu:call")],
        [btn("📄 Памятка для родителей", "menu:memo")],
        [InlineKeyboardButton(text="Открыть SaqBol", web_app=WebAppInfo(url=SITE))],
    )


# ───────────────────────────── Проверка номера, карты, ссылки ─────────────────────────────

def looks_like_bare_indicator(text: str) -> bool:
    """Человек прислал только номер, карту, ссылку или @аккаунт — без самого сообщения."""
    if len(text) > 80:
        return False
    rest = URL_RE.sub(" ", text)
    rest = indicators.PHONE_RE.sub(" ", rest)
    rest = indicators.CARD_RE.sub(" ", rest)
    rest = indicators.TG_RE.sub(" ", rest)
    letters = re.sub(r"[\W\d_]+", "", rest)
    bare_domain = " " not in text.strip() and "." in text and len(text) > 4
    return (len(letters) <= 12 and rest.strip() != text.strip()) or bare_domain


async def try_lookup(message: Message) -> bool:
    """Отвечает, если это был голый номер. Возвращает False, если надо проверять как обычное сообщение."""
    text = (message.text or "").strip()
    if not store.is_configured() or not looks_like_bare_indicator(text):
        return False
    result = await webqueue._lookup(text[:120])
    if result.get("error"):
        return False

    parts = []
    for it in result["items"]:
        value = escape(it["value"])
        if it["found"]:
            head = "🔴 <b>Не переводите</b>" if it["risk"] >= 45 else "🟡 <b>Будьте осторожны</b>"
            verb = "пожаловался" if it["reporters"] == 1 else "пожаловались"
            parts.append(f"{head}\n<code>{value}</code>\nНа него {verb} {people(it['reporters'])}. "
                         f"Схема: {CATEGORY.get(it['category'], 'мошенничество')}. Оценка риска: {it['risk']} из 99.")
        else:
            parts.append(f"⚪️ <b>В базе нет</b>\n<code>{value}</code>\nЖалоб пока не было. Это не значит, что он безопасен: "
                         "мошенники часто меняют номера. Если вас торопят или просят код из SMS — не переводите.")
    await message.reply("\n\n".join(parts))
    return True


# ───────────────────────────── Тренажёр ─────────────────────────────

_quiz_cases: list[dict] = json.loads(QUIZ_FILE.read_text(encoding="utf-8")) if QUIZ_FILE.exists() else []
_quiz: dict[int, dict] = {}  # chat_id -> {"seen": set, "right": int, "total": int}


async def send_case(message: Message, chat_id: int) -> None:
    if not _quiz_cases:
        await message.answer(f"Тренажёр сейчас доступен на сайте: {SITE}/trainer/")
        return
    state = _quiz.setdefault(chat_id, {"seen": set(), "right": 0, "total": 0})
    fresh = [c for c in _quiz_cases if c["id"] not in state["seen"]]
    if not fresh:
        state["seen"].clear()
        fresh = _quiz_cases
    case = random.choice(fresh)
    state["seen"].add(case["id"])
    hard = " · <i>трудное</i>" if case.get("hard") else ""
    await message.answer(
        f"🎯 <b>Сообщение {state['total'] + 1}</b>{hard}\n\n<blockquote>{escape(case['text'])}</blockquote>\n\nЭто мошенники?",
        reply_markup=kb([btn("Мошенники", f"q:{case['id']}:1"), btn("Обычное сообщение", f"q:{case['id']}:0")]),
    )


@router.message(Command("trainer"))
async def on_trainer(message: Message) -> None:
    _calls.pop(message.chat.id, None)
    await message.answer("Покажу сообщение — вы решаете, обман это или нет. После ответа будет разбор. Половина сообщений трудные.")
    await send_case(message, message.chat.id)


@router.callback_query(F.data.startswith("q:"))
async def on_quiz_answer(cb: CallbackQuery) -> None:
    _, case_id, said = cb.data.split(":")
    case = next((c for c in _quiz_cases if str(c["id"]) == case_id), None)
    await cb.answer()
    if not case or not cb.message:
        return
    await cb.message.edit_reply_markup(reply_markup=None)

    state = _quiz.setdefault(cb.message.chat.id, {"seen": set(), "right": 0, "total": 0})
    right = (said == "1") == case["scam"]
    state["total"] += 1
    state["right"] += int(right)

    lines = [("✅ <b>Верно.</b>" if right else "❌ <b>Ошибка.</b>") + f" Это {'мошенничество' if case['scam'] else 'обычное сообщение'}.",
             f"\n<b>{escape(case['scheme'])}</b>"]
    lines += [f"• {escape(f)}" for f in case.get("flags", [])]
    lines.append(f"\n{escape(case['advice'])}")
    lines.append(f"\nСчёт: {state['right']} из {state['total']}")
    await cb.message.answer("\n".join(lines), reply_markup=kb([btn("Следующее", "qnext"), btn("Хватит", "qstop")]))


@router.callback_query(F.data == "qnext")
async def on_quiz_next(cb: CallbackQuery) -> None:
    await cb.answer()
    if cb.message:
        await cb.message.edit_reply_markup(reply_markup=None)
        await send_case(cb.message, cb.message.chat.id)


@router.callback_query(F.data == "qstop")
async def on_quiz_stop(cb: CallbackQuery) -> None:
    await cb.answer()
    if not cb.message:
        return
    state = _quiz.get(cb.message.chat.id, {"right": 0, "total": 0})
    await cb.message.edit_reply_markup(reply_markup=None)
    await cb.message.answer(
        f"Итог: {state['right']} из {state['total']}. Именной сертификат и все 40 сообщений — на сайте: {SITE}/trainer/",
        reply_markup=main_menu(),
    )


# ───────────────────────────── Разговор с мошенником ─────────────────────────────

_calls: dict[int, dict] = {}  # chat_id -> {"scenario": str, "history": [{"role", "text"}]}
HANGUP = kb([btn("📵 Положить трубку", "hang")])
TECHNIQUE = {"authority": "давит авторитетом", "urgency": "торопит", "fear": "пугает",
             "isolation": "просит никому не говорить", "help": "изображает заботу", "details": "убеждает деталями"}


@router.message(Command("call"))
async def on_call(message: Message) -> None:
    _calls.pop(message.chat.id, None)
    await message.answer(
        "📞 <b>Разговор с мошенником</b>\n\nНейросеть сыграет мошенника — так, как они говорят на самом деле: торопит, пугает, давит. "
        "Ваша задача — не отдать ни кода, ни денег. В конце будет разбор.\n\n"
        "⚠️ Это тренировка. <b>Не вводите настоящие коды и номера карт</b> — придумайте любые цифры.\n\nКто вам звонит?",
        reply_markup=kb(*[[btn(sc["title"], f"call:{key}")] for key, sc in simulator.SCENARIOS.items()]),
    )


@router.callback_query(F.data.startswith("call:"))
async def on_call_start(cb: CallbackQuery) -> None:
    await cb.answer()
    scenario = cb.data.split(":", 1)[1]
    if scenario not in simulator.SCENARIOS or not cb.message:
        return
    await cb.message.edit_reply_markup(reply_markup=None)
    _calls[cb.message.chat.id] = {"scenario": scenario, "history": []}
    await cb.message.answer(f"📞 <i>Входящий звонок…</i>\n\n{escape(simulator.SCENARIOS[scenario]['opening'])}", reply_markup=HANGUP)


async def call_turn(message: Message, chat_id: int, hangup: bool) -> None:
    call = _calls.get(chat_id)
    if not call:
        return
    await message.bot.send_chat_action(chat_id, ChatAction.TYPING)
    try:
        turn = await simulator.turn(call["scenario"], call["history"], hangup)
    except Exception:
        log.exception("Симулятор не ответил")
        _calls.pop(chat_id, None)
        await message.answer("Связь оборвалась — не получилось продолжить разговор. Попробуйте ещё раз: /call")
        return

    call["history"].append({"role": "scammer", "text": turn.reply, "technique": turn.technique})
    if turn.state == "ongoing":
        await message.answer(escape(turn.reply), reply_markup=HANGUP)
        return

    _calls.pop(chat_id, None)
    await message.answer(escape(turn.reply))
    won = turn.state == "victim_won"
    lines = ["🟢 <b>Вы устояли</b>" if won else "🔴 <b>Вы поддались</b>"]
    if turn.debrief:
        d = turn.debrief
        lines.append(f"Оценка устойчивости: <b>{d.score} из 100</b>\n\n{escape(d.summary)}")
        for m in d.moments:
            lines.append(f"\n{'✅' if m.good else '⚠️'} <i>«{escape(m.quote)}»</i>\n{escape(m.comment)}")
        used = list(dict.fromkeys(TECHNIQUE[h["technique"]] for h in call["history"] if h.get("technique") in TECHNIQUE))
        if used:
            lines.append("\n<b>Чем на вас давили:</b> " + ", ".join(used) + ".")
        lines.append(f"\n<b>Запомните:</b> {escape(d.rule)}")
    await message.answer("\n".join(lines), reply_markup=kb([btn("Ещё один звонок", "menu:call")], [btn("В меню", "menu:home")]))


@router.callback_query(F.data == "hang")
async def on_hangup(cb: CallbackQuery) -> None:
    await cb.answer("Вы положили трубку")
    if cb.message:
        await cb.message.edit_reply_markup(reply_markup=None)
        await call_turn(cb.message, cb.message.chat.id, hangup=True)


@router.message(F.text & ~F.text.startswith("/"), lambda m: m.chat.id in _calls)
async def on_call_reply(message: Message) -> None:
    _calls[message.chat.id]["history"].append({"role": "user", "text": (message.text or "")[:400]})
    await call_turn(message, message.chat.id, hangup=False)


# ───────────────────────────── Памятка ─────────────────────────────

GUIDE = {
    "bank_security": ("Звонок «из банка»", "Говорят, что с карты списывают деньги или на вас оформляют кредит, и просят код из SMS.",
                      "Положите трубку и сами позвоните в банк по номеру на карте."),
    "phishing": ("Ссылка в сообщении", "Пишут, что карта заблокирована или вам положена выплата, и дают ссылку.",
                 "Не нажимайте. Откройте приложение банка сами."),
    "hacked_account": ("«Мама, срочно нужны деньги»", "Близкий человек просит срочно перевести на чужую карту, а позвонить «не может».",
                       "Позвоните ему по обычному телефону. Пока не услышали голос — не переводите."),
    "authority": ("Звонок «из полиции»", "Пугают уголовным делом и запрещают рассказывать о разговоре.",
                  "Положите трубку. Полиция не решает дела по телефону."),
    "investment": ("«Гарантированный доход»", "Обещают большой доход каждую неделю без риска.", "Гарантированного дохода не бывает. Не вкладывайте."),
    "job": ("Лёгкая работа за большие деньги", "Предлагают ставить лайки за десятки тысяч, потом просят заплатить за регистрацию.",
            "Работодатель не берёт деньги с работника."),
    "marketplace": ("Покупатель в интернете", "«Покупатель» присылает ссылку, чтобы вы «получили оплату».",
                    "Чтобы получить деньги, достаточно номера карты. CVV и коды — никому."),
    "prize": ("Выигрыш или выплата", "Сообщают о призе, но просят сначала оплатить «комиссию».", "За настоящий выигрыш не платят заранее."),
    "loan": ("Кредит без проверок", "Обещают кредит, но просят оплатить «страховку» заранее.", "Банки не берут деньги до выдачи кредита."),
}


@router.message(Command("memo"))
async def on_memo(message: Message) -> None:
    top = ["bank_security", "phishing", "hacked_account"]
    try:
        snap = await store._get_db().collection("public").document("summary").get()
        cats = (snap.to_dict() or {}).get("categories", {})
        ranked = [k for k, _ in sorted(cats.items(), key=lambda kv: -kv[1]) if k in GUIDE]
        top = (ranked + [k for k in top if k not in ranked])[:3]
    except Exception:
        log.exception("Не удалось прочитать сводку для памятки")

    lines = ["📄 <b>Памятка: осторожно, мошенники</b>\n",
             "1. Код из SMS не называйте никому. Ни банку, ни полиции, ни родным.",
             "2. Вас торопят и пугают — это мошенники. Положите трубку.",
             "3. Сомневаетесь — позвоните детям или в банк по номеру на карте.\n",
             "<b>Что сейчас делают мошенники чаще всего:</b>"]
    for key in top:
        title, looks, do = GUIDE[key]
        lines.append(f"\n<b>{title}</b>\n{looks}\n➡️ {do}")
    lines.append(f"\nПерешлите это сообщение родителям. Версия для печати: {SITE}/bulletin/")
    await message.answer("\n".join(lines))


# ───────────────────────────── Меню ─────────────────────────────

@router.callback_query(F.data.startswith("menu:"))
async def on_menu(cb: CallbackQuery) -> None:
    await cb.answer()
    if not cb.message:
        return
    target = cb.data.split(":", 1)[1]
    if target == "trainer":
        await on_trainer(cb.message)
    elif target == "call":
        await on_call(cb.message)
    elif target == "memo":
        await on_memo(cb.message)
    else:
        await cb.message.answer("Пришлите сообщение, скриншот или номер — проверю.", reply_markup=main_menu())
