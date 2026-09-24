"""«Защита близких»: телефон мамы привязан к Telegram родственника, без регистрации.

Приложение на телефоне мамы просит код из 6 цифр, родственник отправляет боту /family 123456.
Когда маме звонит номер из базы SaqBol, приложение сообщает об этом, и бот сразу пишет родственнику.
Телефон мамы узнаём по постоянному коду установки приложения, родственника — по его чату в Telegram
или, если у него тоже стоит SaqBol, по адресу для push-уведомлений (приходят, даже когда приложение закрыто).
"""

import asyncio
import logging
import secrets
from datetime import datetime, timedelta, timezone
from html import escape

from aiogram import Bot, F, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import Message

from . import store

log = logging.getLogger("saqbol")
router = Router()
CODE_TTL = timedelta(minutes=30)
_bot: Bot | None = None


def set_bot(bot: Bot) -> None:
    global _bot
    _bot = bot


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def new_code(device: str) -> dict:
    """Код привязки для телефона мамы. Живёт 30 минут."""
    db = store._get_db()
    ref = None
    for _ in range(5):
        code = f"{secrets.randbelow(10**6):06d}"
        ref = db.collection("family_codes").document(code)
        if not (await ref.get()).exists:
            break
    await ref.set({"device": device, "expires": _now() + CODE_TTL})
    return {"created_at": _now(), "code": ref.id}


async def _links(device: str) -> tuple[list[int], list[str]]:
    """Кого предупреждать: чаты родственников в Telegram и телефоны родственников с приложением (push)."""
    snap = await store._get_db().collection("family_links").document(device).get()
    d = (snap.to_dict() or {}) if snap.exists else {}
    return list(d.get("chats", [])), list(d.get("tokens", []))


async def _take_code(code: str) -> str | None:
    """Проверить код привязки. Возвращает телефон мамы или None.

    Код не сгорает после первого раза: за 30 минут по нему можно привязать нескольких близких —
    кого-то через Telegram, кого-то через приложение.
    """
    snap = await store._get_db().collection("family_codes").document(code).get()
    d = snap.to_dict() if snap.exists else None
    if not d or d.get("expires") is None or d["expires"] < _now():
        return None
    return d["device"]


async def status(device: str) -> dict:
    chats, tokens = await _links(device)
    return {"created_at": _now(), "linked": len(chats) + len(tokens)}


async def join(code: str, token: str) -> dict:
    """Телефон родственника с приложением ввёл код — будет получать push."""
    from google.cloud.firestore_v1 import ArrayUnion

    mom = await _take_code(code) if code.isdigit() and len(code) == 6 and len(token) > 20 else None
    if not mom:
        return {"created_at": _now(), "error": "bad_code"}
    await store._get_db().collection("family_links").document(mom).set(
        {"tokens": ArrayUnion([token]), "updated_at": _now()}, merge=True)
    return {"created_at": _now(), "ok": True}


def _push(tokens: list[str], title: str, body: str) -> int:
    """Push через Google: приходит, даже если приложение родственника закрыто."""
    from firebase_admin import messaging

    msg = messaging.MulticastMessage(
        tokens=tokens,
        notification=messaging.Notification(title=title, body=body),
        data={"title": title, "body": body},
        android=messaging.AndroidConfig(priority="high", notification=messaging.AndroidNotification(
            channel_id="family_alerts", color="#c8321a", icon="ic_stat_alert", default_vibrate_timings=True)),
    )
    resp = messaging.send_each_for_multicast(msg)
    for r in resp.responses:
        if not r.success:
            log.warning("Push родственнику не доставлен: %s", r.exception)
    return resp.success_count


async def alert(device: str, number: str, reporters: int, scheme: str) -> dict:
    """Маме звонит номер из базы — пишем всем привязанным близким."""
    chats, tokens = await _links(device)
    who = "человек" if reporters % 10 not in (2, 3, 4) or reporters % 100 in (12, 13, 14) else "человека"
    lines = [
        "🚨 <b>Вашему близкому сейчас звонит мошенник</b>",
        "",
        f"Номер: <b>{escape(number)}</b>",
        f"На него уже жаловались {reporters} {who}." if reporters > 0 else "Номер есть в базе мошенников SaqBol.",
    ]
    if scheme:
        lines.append(f"Схема: {escape(scheme.lower())}.")
    lines += ["", "Позвоните близкому прямо сейчас и попросите положить трубку. "
                  "Главное — не называть коды из SMS и не переводить деньги."]
    text = "\n".join(lines)
    sent = 0
    if tokens:
        body = f"{number} — на него жаловались {reporters} {who}. Позвоните близкому и попросите положить трубку."
        try:
            sent += await asyncio.to_thread(_push, tokens, "🚨 Вашему близкому звонит мошенник", body)
        except Exception:
            log.exception("Не удалось отправить push родственникам")
    for chat in chats if _bot is not None else []:
        try:
            await _bot.send_message(chat, text)
            sent += 1
        except Exception:
            log.exception("Не удалось предупредить близкого в чате %s", chat)
    return {"created_at": _now(), "sent": sent}


@router.message(Command("family"))
async def cmd_family(message: Message, command: CommandObject) -> None:
    code = (command.args or "").replace(" ", "").strip()
    if not (code.isdigit() and len(code) == 6):
        await message.answer(
            "🛡 <b>Защита близких</b>\n\n"
            "Поставьте приложение SaqBol маме, бабушке или другому близкому. В приложении: «Защита» → "
            "«Привязать близкого». Появится код из 6 цифр — отправьте его сюда так:\n\n"
            "<code>/family 123456</code>\n\n"
            "Если близкому позвонит номер, на который жаловались, я сразу напишу вам.")
        return

    await _link_chat(message, code)


@router.message(CommandStart(deep_link=True, magic=F.args.regexp(r"^family_\d{6}$")))
async def start_family(message: Message, command: CommandObject) -> None:
    """Ссылка из QR-кода на телефоне мамы: t.me/saqbolai_bot?start=family_123456 — код приходит сам."""
    await _link_chat(message, command.args.split("_", 1)[1])


async def _link_chat(message: Message, code: str) -> None:
    from google.cloud.firestore_v1 import ArrayUnion

    mom = await _take_code(code)
    if not mom:
        await message.answer("Код не найден или устарел. Попросите получить новый в приложении: «Защита» → «Привязать близкого».")
        return

    await store._get_db().collection("family_links").document(mom).set(
        {"chats": ArrayUnion([message.chat.id]), "updated_at": _now()}, merge=True)
    await message.answer(
        "✅ <b>Готово, телефон близкого привязан.</b>\n\n"
        "Если на него позвонит номер, на который жаловались в SaqBol, я сразу напишу сюда — "
        "чтобы вы успели позвонить и остановить разговор.")
