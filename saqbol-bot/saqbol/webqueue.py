"""Очередь проверок с сайта.

Сайт кладёт текст в коллекцию web_requests, бот видит новый документ, проверяет сообщение
и пишет ответ в web_results под тем же id. Сам запрос с текстом сразу удаляется.
Проверки с сайта только сверяются с общей базой и никогда её не пополняют:
у анонимного посетителя нет личности, по которой можно отличить жалобу от накрутки.
Приложение пополнять базу может (_report): у установки есть постоянный код и суточный лимит.
"""

import asyncio
import logging
import os
import time
from datetime import datetime, timezone

from . import indicators, simulator, store
from .analyzer import NotAMessage, analyze, analyze_image

log = logging.getLogger("saqbol")

MAX_PER_MINUTE = 20
MAX_PER_DAY = int(os.getenv("SAQBOL_WEB_DAILY_CAP", "1500"))  # потолок расходов на модель, если очередь начнут заливать
_recent: list[float] = []
_today: list[float] = []


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


async def _report(rep: dict) -> dict:
    """Жалоба из приложения после звонка: «Это были мошенники».

    У установки приложения есть постоянный код — по нему считаем независимых заявителей, как по аккаунту
    в Telegram. С сайта жалобы не принимаем: там личности нет. Принимаем только телефон и не больше
    пяти жалоб в сутки с одной установки.
    """
    now = datetime.now(timezone.utc)
    phones = [i for i in indicators.extract(str(rep.get("number", ""))[:40]) if i.kind == "phone"]
    device = str(rep.get("device", ""))
    if not phones or len(device) < 16:
        return {"created_at": now, "error": "unrecognized"}
    ind = phones[0]
    reporter = indicators.reporter_hash(f"app:{device}")
    if not await store.take_daily_slot(reporter):
        return {"created_at": now, "error": "limit"}

    # Схему и категорию не затираем: про этот номер база может знать больше, чем человек, нажавший кнопку
    snap = await store._get_db().collection("indicators").document(store._doc_id(ind)).get()
    old = snap.to_dict() if snap.exists else {}
    category = old.get("last_category", "other")
    scheme = old.get("last_scheme") or "Подозрительный звонок"
    s = await store.report(ind, reporter, "scam", scheme, category)
    reporters = s.others + 1
    await store.log_check("scam", 100, scheme, "app", "ru", "call", False, 1, category)
    await store.publish_summary()
    return {"created_at": now, "value": ind.display, "reporters": reporters,
            "risk": store.risk_score(reporters, now, category, s.status)}


TOTAL_CASES = 40
HARD_CASES = 20
CERT_MIN_CASES = 24  # верно разобрать не меньше 24 кейсов из 40
CERT_MIN_CALLS = 1   # и устоять хотя бы в одном разговоре с мошенником


def cert_score(cases: int, hard: int, calls: int) -> int:
    """Оценка устойчивости, 0–100: кейсы — 55, трудные кейсы — 20, разговоры с мошенником — 25."""
    return round(55 * min(cases, TOTAL_CASES) / TOTAL_CASES + 20 * min(hard, HARD_CASES) / HARD_CASES + 25 * min(calls, 2) / 2)


async def _certificate(cert: dict) -> dict:
    """Сертификат финансовой безопасности: считаем оценку, выдаём номер, сохраняем для проверки по QR."""
    import secrets

    now = datetime.now(timezone.utc)
    name = " ".join(str(cert.get("name", "")).split())[:60]
    cases, hard, calls = (max(0, int(cert.get(k, 0) or 0)) for k in ("cases", "hard", "calls"))
    if len(name) < 2 or cases < CERT_MIN_CASES or calls < CERT_MIN_CALLS:
        return {"created_at": now, "error": "not_eligible"}

    score = cert_score(cases, hard, calls)
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # без похожих символов: O/0, I/1, L
    cert_id = f"SB-{now.year}-" + "".join(secrets.choice(alphabet) for _ in range(6))
    record = {"name": name, "score": score, "cases": min(cases, TOTAL_CASES), "hard": min(hard, HARD_CASES),
              "calls": calls, "issued_at": now}
    await store._get_db().collection("certificates").document(cert_id).set(record)
    return {"created_at": now, "id": cert_id, **record}


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
        _today[:] = [t for t in _today if now - t < 86400]
        if len(_recent) >= MAX_PER_MINUTE or len(_today) >= MAX_PER_DAY:
            await result_ref.set({"error": "busy", "created_at": datetime.now(timezone.utc)})
            return
        _recent.append(now)
        _today.append(now)

        if "lookup" in data:
            await result_ref.set(await _lookup(str(data["lookup"])[:120]))
            return
        if "report" in data:
            await result_ref.set(await _report(data["report"] if isinstance(data["report"], dict) else {}))
            return
        if "cert" in data:
            await result_ref.set(await _certificate(data["cert"]))
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


PLAN_NAMES = {"team": "обучение команды", "bank": "банку и финтеху"}


def start_leads(loop: asyncio.AbstractEventLoop, notify):
    """Заявки со страницы тарифов: пересылаем владельцу в Telegram и помечаем, чтобы не слать дважды."""
    from firebase_admin import firestore

    db = store._get_db()

    async def handle(doc_id: str, d: dict) -> None:
        if d.get("notified"):
            return
        from html import escape

        lines = [
            "💼 <b>Новая заявка SaqBol</b>",
            f"Тариф: {PLAN_NAMES.get(d.get('plan'), d.get('plan'))}",
            f"Организация: {escape(str(d.get('org', '')))}",
            f"Контакт: {escape(str(d.get('contact', '')))}",
        ]
        if d.get("note"):
            lines.append(f"Комментарий: {escape(str(d['note']))}")
        text = "\n".join(lines)
        try:
            if await notify(text):
                await db.collection("leads").document(doc_id).update({"notified": True})
        except Exception:
            log.exception("Не удалось переслать заявку %s", doc_id)

    def on_snapshot(_docs, changes, _read_time):
        for change in changes:
            if change.type.name == "ADDED":
                asyncio.run_coroutine_threadsafe(handle(change.document.id, change.document.to_dict() or {}), loop)

    return firestore.client().collection("leads").on_snapshot(on_snapshot)


def start(loop: asyncio.AbstractEventLoop):
    """Слушатель Firestore работает в своём потоке и передаёт новые запросы в цикл бота."""
    from firebase_admin import firestore

    store._get_db()  # инициализирует приложение Firebase

    def on_snapshot(_docs, changes, _read_time):
        for change in changes:
            if change.type.name == "ADDED":
                asyncio.run_coroutine_threadsafe(_handle(change.document.id, change.document.to_dict() or {}), loop)

    return firestore.client().collection("web_requests").on_snapshot(on_snapshot)
