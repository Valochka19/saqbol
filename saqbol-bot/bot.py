"""Telegram-бот SaqBol AI. Запуск: .venv\\Scripts\\python bot.py"""

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone
from html import escape
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from aiogram import Bot, Dispatcher, F  # noqa: E402
from aiogram.client.default import DefaultBotProperties  # noqa: E402
from aiogram.enums import ChatAction, ParseMode  # noqa: E402
from aiogram.filters import Command, CommandStart  # noqa: E402
from aiogram.types import Message  # noqa: E402

from saqbol import indicators, llm, store, webqueue  # noqa: E402
from saqbol.analyzer import Verdict, analyze  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("saqbol")

STATS_FILE = Path(__file__).parent / "stats.jsonl"
MIN_INTERVAL_SEC = 3  # защита от спама и лишних трат на API
_last_request: dict[int, float] = {}

dp = Dispatcher()

START_TEXT = (
    "👋 <b>SaqBol AI</b> — проверка сообщений на мошенничество.\n\n"
    "Перешлите мне подозрительное SMS, сообщение из WhatsApp/Telegram или ссылку — "
    "я скажу, мошенники это или нет, и объясню почему.\n\n"
    "🇰🇿 Күмәнді хабарламаны немесе сілтемені маған жіберіңіз — "
    "алаяқтық па, жоқ па, түсіндіріп беремін.\n\n"
    "Тексты сообщений я не сохраняю."
)

HEADERS = {
    "ru": {"scam": "🔴 <b>Похоже на мошенничество</b>", "suspicious": "🟡 <b>Подозрительно</b>",
           "safe": "🟢 <b>Признаков мошенничества не найдено</b>"},
    "kk": {"scam": "🔴 <b>Алаяқтыққа ұқсайды</b>", "suspicious": "🟡 <b>Күмәнді</b>",
           "safe": "🟢 <b>Алаяқтық белгілері табылмады</b>"},
}
LABELS = {
    "ru": {"scheme": "Схема", "flags": "Признаки", "advice": "Что делать", "conf": "Уверенность"},
    "kk": {"scheme": "Схема", "flags": "Белгілері", "advice": "Не істеу керек", "conf": "Сенімділік"},
}


BASE_TEXT = {
    "ru": {"title": "📡 <b>Общая база SaqBol:</b>", "seen": "• {d} — уже пожаловались: {n} чел.",
           "first": "• {d} — добавлен в базу, вы сообщили первым",
           "known": "⚠️ В сообщении есть данные, на которые уже жаловались другие люди."},
    "kk": {"title": "📡 <b>SaqBol ортақ базасы:</b>", "seen": "• {d} — шағымданғандар: {n} адам",
           "first": "• {d} — базаға қосылды, сіз бірінші хабарладыңыз",
           "known": "⚠️ Хабарламадағы деректерге басқа адамдар шағымданған."},
}


async def check_base(text: str, v: Verdict, chat_id: int) -> list[store.Sighting]:
    """Сверка с общей базой. Скам пополняет базу, безопасное сообщение — только сверяется с ней."""
    if not store.is_configured():
        return []
    found = indicators.extract(text)[:8]
    try:
        if v.verdict == "safe":
            seen = [await store.lookup(i) for i in found]
            return [s for s in seen if s and s.others >= 2 and s.status != "rejected"]
        reporter = indicators.reporter_hash(chat_id)
        return [await store.report(i, reporter, v.verdict, v.scheme, v.category) for i in found]
    except Exception:
        log.exception("База недоступна, отвечаю без неё")
        return []


def render_base(sightings: list[store.Sighting], lang: str) -> str:
    t = BASE_TEXT[lang if lang in BASE_TEXT else "ru"]
    lines = [t["title"]]
    for s in sightings:
        d = escape(s.indicator.display)
        lines.append(t["seen"].format(d=d, n=s.others) if s.others else t["first"].format(d=d))
    return "\n".join(lines)


def render(v: Verdict) -> str:
    lang = v.language if v.language in HEADERS else "ru"
    lb = LABELS[lang]
    parts = [HEADERS[lang][v.verdict], f"{lb['conf']}: {v.confidence}%", ""]
    parts.append(f"<b>{lb['scheme']}:</b> {escape(v.scheme)}")
    if v.red_flags:
        parts.append(f"\n<b>{lb['flags']}:</b>")
        parts.extend(f"• {escape(flag)}" for flag in v.red_flags)
    parts.append(f"\n<b>{lb['advice']}:</b> {escape(v.advice)}")
    if v.source == "rules":
        parts.append("\n<i>Режим без ИИ: проверка только по правилам.</i>")
    return "\n".join(parts)


def save_stat(v: Verdict, text_len: int) -> None:
    # Сам текст сообщения не пишем — только обезличенную статистику
    row = {"ts": datetime.now(timezone.utc).isoformat(timespec="seconds"), "verdict": v.verdict,
           "confidence": v.confidence, "source": v.source, "rule_score": v.rule_score,
           "has_url": bool(v.urls), "len": text_len}
    with STATS_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


@dp.message(CommandStart())
@dp.message(Command("help"))
async def on_start(message: Message) -> None:
    await message.answer(START_TEXT)


@dp.message(F.text | F.caption)
async def on_message(message: Message) -> None:
    text = (message.text or message.caption or "").strip()
    if not text:
        return

    now = time.monotonic()
    if now - _last_request.get(message.chat.id, 0) < MIN_INTERVAL_SEC:
        await message.answer("⏳ Секунду, проверяю предыдущее сообщение.")
        return
    _last_request[message.chat.id] = now

    await message.bot.send_chat_action(message.chat.id, ChatAction.TYPING)
    verdict = await analyze(text[:4000])
    sightings = await check_base(text, verdict, message.chat.id)
    lang = verdict.language if verdict.language in BASE_TEXT else "ru"

    # Модель ничего не заподозрила, но на этот номер или сайт уже жаловались несколько человек
    if verdict.verdict == "safe" and sightings:
        verdict.verdict = "suspicious"
        verdict.red_flags = [BASE_TEXT[lang]["known"].removeprefix("⚠️ ")] + verdict.red_flags

    reply = render(verdict)
    if sightings:
        reply += "\n\n" + render_base(sightings, lang)
    save_stat(verdict, len(text))
    if store.is_configured():
        try:
            await store.log_check(verdict.verdict, verdict.confidence, verdict.scheme, verdict.source,
                                  lang, "text", bool(verdict.urls), len(sightings), verdict.category)
            await store.publish_summary()
        except Exception:
            log.exception("Не удалось записать статистику в базу")
    await message.reply(reply)


@dp.message()
async def on_other(message: Message) -> None:
    await message.answer("Пока я понимаю только текст и ссылки. Скопируйте сообщение текстом и пришлите мне.")


async def main() -> None:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        raise SystemExit("Нет TELEGRAM_BOT_TOKEN. Скопируйте .env.example в .env и впишите токен от @BotFather.")
    if not llm.is_configured():
        log.warning("Ключ LLM не задан — бот работает только на правилах, без ИИ.")
    if not store.is_configured():
        log.warning("Нет firebase-key.json — общая база индикаторов отключена.")

    if store.is_configured():
        webqueue.start(asyncio.get_running_loop())
        log.info("Очередь проверок с сайта подключена")

    bot = Bot(token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    log.info("SaqBol AI запущен, модель: %s", llm.MODEL if llm.is_configured() else "нет (только правила)")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
