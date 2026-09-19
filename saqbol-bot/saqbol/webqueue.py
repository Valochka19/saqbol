"""Очередь проверок с сайта.

Сайт кладёт текст в коллекцию web_requests, бот видит новый документ, проверяет сообщение
и пишет ответ в web_results под тем же id. Сам запрос с текстом сразу удаляется.
Проверки с сайта только сверяются с общей базой и никогда её не пополняют:
у анонимного посетителя нет личности, по которой можно отличить жалобу от накрутки.
"""

import asyncio
import logging
import time
from datetime import datetime, timezone

from . import indicators, simulator, store
from .analyzer import NotAMessage, analyze, analyze_image

log = logging.getLogger("saqbol")

MAX_PER_MINUTE = 20
_recent: list[float] = []


async def _lookup(value: str) -> dict:
    """«Проверь получателя»: номер, карта, ссылка или аккаунт без текста сообщения."""
    found = indicators.extract(value)
    # Голый домен или @аккаунт человек мог ввести без https:// и без контекста
    if not found and "." in value and " " not in value.strip():
        found = indicators.extract("https://" + value.strip())
    now = datetime.now(timezone.utc)
    if not found:
        return {"created_at": now, "error": "unrecognized"}
    items = []
    db = store._get_db()
    for ind in found[:5]:
        snap = await db.collection("indicators").document(store._doc_id(ind)).get()
        d = snap.to_dict() if snap.exists else None
        if d and d.get("status") == "rejected":
            d = None
        items.append({
            "kind": ind.kind, "value": ind.display, "found": bool(d),
            "reporters": d.get("reporters_count", 0) if d else 0,
            "risk": store.risk_score(d.get("reporters_count", 0), d.get("last_seen"),
                                     d.get("last_category", "other"), d.get("status", "unverified")) if d else 0,
            "category": d.get("last_category", "other") if d else "none",
            "first_seen": d.get("first_seen") if d else None,
            "last_seen": d.get("last_seen") if d else None,
            "status": d.get("status", "unverified") if d else "unknown",
        })
    return {"created_at": now, "items": items}


async def _simulate(sim: dict) -> dict:
    scenario = sim.get("scenario")
    if scenario not in simulator.SCENARIOS:
        return {"created_at": datetime.now(timezone.utc), "error": "failed"}
    history = [m for m in (sim.get("history") or []) if isinstance(m, dict)][:20]
    t = await simulator.turn(scenario, history, bool(sim.get("hangup")))
    return {"created_at": datetime.now(timezone.utc), "reply": t.reply, "technique": t.technique,
            "state": t.state, "debrief": t.debrief.model_dump() if t.debrief else None}


async def _handle(doc_id: str, data: dict) -> None:
    db = store._get_db()
    result_ref = db.collection("web_results").document(doc_id)
    try:
        now = time.monotonic()
        _recent[:] = [t for t in _recent if now - t < 60]
        if len(_recent) >= MAX_PER_MINUTE:
            await result_ref.set({"error": "busy", "created_at": datetime.now(timezone.utc)})
            return
        _recent.append(now)

        if "lookup" in data:
            await result_ref.set(await _lookup(str(data["lookup"])[:120]))
            return
        if "sim" in data:
            await result_ref.set(await _simulate(data["sim"]))
            return

        if "image" in data:
            import base64

            try:
                v, text = await analyze_image(base64.b64decode(str(data["image"]), validate=True), "image/jpeg")
            except NotAMessage:
                await result_ref.set({"error": "not_a_message", "created_at": datetime.now(timezone.utc)})
                return
            input_type = "photo"
        else:
            text = str(data.get("text", ""))[:2000]
            v = await analyze(text)
            input_type = "web"

        known = []
        for ind in indicators.extract(text)[:8]:
            s = await store.lookup(ind)
            if s and s.others >= 1 and s.status != "rejected":
                known.append({"kind": ind.kind, "value": store.mask(ind.kind, ind.display), "reporters": s.others})
        verdict = "suspicious" if v.verdict == "safe" and any(k["reporters"] >= 2 for k in known) else v.verdict

        await result_ref.set({
            "created_at": datetime.now(timezone.utc), "verdict": verdict, "confidence": v.confidence,
            "scheme": v.scheme, "category": v.category, "flags": v.red_flags, "advice": v.advice,
            "language": v.language, "source": v.source, "known": known,
        })
        await store.log_check(verdict, v.confidence, v.scheme, v.source, v.language, input_type,
                              bool(v.urls), len(known), v.category)
        await store.publish_summary()
    except Exception:
        log.exception("Веб-проверка %s не удалась", doc_id)
        await result_ref.set({"error": "failed", "created_at": datetime.now(timezone.utc)})
    finally:
        await db.collection("web_requests").document(doc_id).delete()  # текст сообщения не храним


def start(loop: asyncio.AbstractEventLoop):
    """Слушатель Firestore работает в своём потоке и передаёт новые запросы в цикл бота."""
    from firebase_admin import firestore

    store._get_db()  # инициализирует приложение Firebase

    def on_snapshot(_docs, changes, _read_time):
        for change in changes:
            if change.type.name == "ADDED":
                asyncio.run_coroutine_threadsafe(_handle(change.document.id, change.document.to_dict() or {}), loop)

    return firestore.client().collection("web_requests").on_snapshot(on_snapshot)
