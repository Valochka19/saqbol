"""«Защита близких»: телефон мамы привязан к Telegram родственника, без регистрации.

Приложение на телефоне мамы просит код из 6 цифр, родственник отправляет боту /family 123456.
Когда маме звонит номер из базы SaqBol, приложение сообщает об этом, и бот сразу пишет родственнику.
Телефон мамы узнаём по постоянному коду установки приложения, родственника — по его чату в Telegram.
"""

import logging
import secrets
from datetime import datetime, timedelta, timezone
from html import escape

from aiogram import Bot, Router
from aiogram.filters import Command, CommandObject
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
    """Код привязки для телефона мамы. Живёт 30 минут и сгорает после использования."""
    db = store._get_db()
    ref = None
    for _ in range(5):
        code = f"{secrets.randbelow(10**6):06d}"
        ref = db.collection("family_codes").document(code)
        if not (await ref.get()).exists:
            break
    await ref.set({"device": device, "expires": _now() + CODE_TTL})
    return {"created_at": _now(), "code": ref.id}


async def _chats(device: str) -> list[int]:
    snap = await store._get_db().collection("family_links").document(device).get()
    return list((snap.to_dict() or {}).get("chats", [])) if snap.exists else []


async def status(device: str) -> dict:
    return {"created_at": _now(), "linked": len(await _chats(device))}


async def alert(device: str, number: str, reporters: int, scheme: str) -> dict:
    """Маме звонит номер из базы — пишем всем привязанным близким."""
    chats = await _chats(device)
    if not chats or _bot is None:
        return {"created_at": _now(), "sent": 0}
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
    for chat in chats:
        try:
            await _bot.send_message(chat, text)
            sent += 1
        except Exception:
            log.exception("Не удалось предупредить близкого в чате %s", chat)
    return {"created_at": _now(), "sent": sent}


@router.message(Command("family"))
async def cmd_family(message: Message, command: CommandObject) -> None:
    from google.cloud.firestore_v1 import ArrayUnion

    code = (command.args or "").replace(" ", "").strip()
    if not (code.isdigit() and len(code) == 6):
        await message.answer(
            "🛡 <b>Защита близких</b>\n\n"
            "Поставьте приложение SaqBol маме, бабушке или другому близкому. В приложении: «Защита» → "
            "«Привязать близкого». Появится код из 6 цифр — отправьте его сюда так:\n\n"
            "<code>/family 123456</code>\n\n"
            "Если близкому позвонит номер, на который жаловались, я сразу напишу вам.")
        return

    db = store._get_db()
    ref = db.collection("family_codes").document(code)
    snap = await ref.get()
    d = snap.to_dict() if snap.exists else None
    if not d or d.get("expires") is None or d["expires"] < _now():
        await message.answer("Код не найден или устарел. Попросите получить новый в приложении: «Защита» → «Привязать близкого».")
        return

    await db.collection("family_links").document(d["device"]).set(
        {"chats": ArrayUnion([message.chat.id]), "updated_at": _now()}, merge=True)
    await ref.delete()  # код одноразовый
    await message.answer(
        "✅ <b>Готово, телефон близкого привязан.</b>\n\n"
        "Если на него позвонит номер, на который жаловались в SaqBol, я сразу напишу сюда — "
        "чтобы вы успели позвонить и остановить разговор.")
