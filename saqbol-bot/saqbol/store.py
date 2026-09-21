"""Общая база индикаторов в Firestore.

Хранит только то, что можно заблокировать (номер, карта, домен, аккаунт), счётчики жалоб
и обезличенную статистику. Текстов сообщений и личностей пользователей здесь нет.

Коллекции:
  indicators/{kind:value}            — индикатор и счётчики
  indicators/{...}/reporters/{hash}  — кто уже жаловался (обезличенно), чтобы считать разных людей
  checks/{auto}                      — статистика проверок для дашборда
"""

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .indicators import Indicator

log = logging.getLogger("saqbol")

_KEY_PATH = Path(os.getenv("FIREBASE_CREDENTIALS") or Path(__file__).resolve().parent.parent / "firebase-key.json")
_db = None
KZ_TZ = timezone(timedelta(hours=5))  # единое время Казахстана


@dataclass
class Sighting:
    indicator: Indicator
    others: int  # сколько ДРУГИХ людей уже жаловались на этот индикатор
    first_seen: datetime | None
    status: str  # unverified | confirmed | rejected


def is_configured() -> bool:
    return _KEY_PATH.exists()


def _get_db():
    global _db
    if _db is None:
        import firebase_admin
        from firebase_admin import credentials, firestore_async

        if not firebase_admin._apps:
            firebase_admin.initialize_app(credentials.Certificate(str(_KEY_PATH)))
        _db = firestore_async.client()
    return _db


def _doc_id(ind: Indicator) -> str:
    return f"{ind.kind}:{ind.value}".replace("/", "_")


async def report(ind: Indicator, reporter: str, verdict: str, scheme: str,
                 category: str = "other", demo: bool = False) -> Sighting:
    """Записать жалобу и вернуть, сколько других людей жаловались до неё. Одна транзакция."""
    from firebase_admin import firestore_async
    from google.cloud.firestore_v1 import Increment

    db = _get_db()
    ind_ref = db.collection("indicators").document(_doc_id(ind))
    rep_ref = ind_ref.collection("reporters").document(reporter)
    now = datetime.now(timezone.utc)

    @firestore_async.async_transactional
    async def tx_body(tx):
        ind_snap = await ind_ref.get(transaction=tx)
        rep_snap = await rep_ref.get(transaction=tx)
        data = ind_snap.to_dict() if ind_snap.exists else {}
        reporters = data.get("reporters_count", 0)
        is_new_reporter = not rep_snap.exists

        tx.set(ind_ref, {
            "kind": ind.kind, "value": ind.value, "display": ind.display,
            "first_seen": data.get("first_seen", now), "last_seen": now,
            "reports_count": data.get("reports_count", 0) + 1,
            "reporters_count": reporters + (1 if is_new_reporter else 0),
            "last_scheme": scheme, "last_verdict": verdict, "last_category": category,
            "demo": bool(data.get("demo", demo)) and demo,
            "status": data.get("status", "unverified"),
        })
        tx.set(rep_ref, {"last_report": now}, merge=True)

        # Накопительные счётчики для дашборда: не пересчитываем всю базу при каждой проверке
        totals = {}
        if not ind_snap.exists:
            totals["indicators"] = Increment(1)
        if is_new_reporter and reporters == 1:
            totals["repeat"] = Increment(1)  # второй независимый заявитель
        if totals or demo:
            agg = {"totals": totals} if totals else {}
            if not ind_snap.exists:
                agg["kinds"] = {ind.kind: Increment(1)}
            if demo:
                agg["has_demo"] = True
            tx.set(_agg_ref(db), agg, merge=True)
        return Sighting(ind, reporters - (0 if is_new_reporter else 1),
                        data.get("first_seen"), data.get("status", "unverified"))

    return await tx_body(db.transaction())


DAILY_REPORT_LIMIT = int(os.getenv("SAQBOL_DAILY_LIMIT", "5"))


async def take_daily_slot(reporter: str) -> bool:
    """Защита от накрутки: один заявитель может отправить из приложения не больше 5 жалоб в сутки."""
    ref = _get_db().collection("reporter_limits").document(reporter)
    day = datetime.now(KZ_TZ).date().isoformat()
    d = (await ref.get()).to_dict() or {}
    used = d.get("count", 0) if d.get("day") == day else 0
    if used >= DAILY_REPORT_LIMIT:
        return False
    await ref.set({"day": day, "count": used + 1})
    return True


async def lookup(ind: Indicator) -> Sighting | None:
    """Только посмотреть, не записывая жалобу — для сообщений, которые бот счёл безопасными."""
    snap = await _get_db().collection("indicators").document(_doc_id(ind)).get()
    if not snap.exists:
        return None
    data = snap.to_dict()
    return Sighting(ind, data.get("reporters_count", 0), data.get("first_seen"), data.get("status", "unverified"))


async def log_check(verdict: str, confidence: int, scheme: str, source: str, lang: str,
                    input_type: str, has_url: bool, indicators: int, category: str = "other",
                    created_at: datetime | None = None, demo: bool = False) -> None:
    from google.cloud.firestore_v1 import Increment

    db = _get_db()
    at = created_at or datetime.now(timezone.utc)
    await db.collection("checks").add({
        "created_at": at, "verdict": verdict, "confidence": confidence,
        "scheme": scheme, "category": category, "source": source, "lang": lang, "input_type": input_type,
        "has_url": has_url, "indicators": indicators, "demo": demo,
    })

    flagged = verdict != "safe"
    day = at.astimezone(KZ_TZ).date().isoformat()
    agg = {
        "totals": {"checks": Increment(1), "flagged": Increment(int(flagged)), "scam": Increment(int(verdict == "scam"))},
        "input_types": {input_type: Increment(1)},
        "daily": {day: {"total": Increment(1), "flagged": Increment(int(flagged))}},
    }
    if flagged:
        agg["categories"] = {category: Increment(1)}
    if demo:
        agg["has_demo"] = True
    await _agg_ref(db).set(agg, merge=True)


async def heartbeat() -> None:
    """Сайт и приложение смотрят на эту отметку: если она старая, сервис проверки выключен."""
    await _get_db().collection("public").document("status").set({"alive_at": datetime.now(timezone.utc)})


def _agg_ref(db):
    return db.collection("stats").document("aggregate")


def mask(kind: str, display: str) -> str:
    """В публичную сводку номера уходят только в замаскированном виде."""
    if kind == "phone":  # +7 705 111 22 33 -> +7 705 *** 22 33
        parts = display.split(" ")
        return " ".join(parts[:2] + ["***"] + parts[3:]) if len(parts) == 5 else display[:6] + "***"
    if kind == "telegram":
        return display[:5] + "***"
    return display  # карта уже замаскирована, фишинговый домен — не персональные данные


def risk_score(reporters: int, last_seen: datetime | None, category: str, status: str) -> int:
    """Риск-скоринг индикатора, 0–100. Прозрачная формула, которую можно объяснить аналитику банка.

    Основа — число НЕЗАВИСИМЫХ заявителей (насыщение: 1 -> 30, 2 -> 50, 3 -> 65, 5 -> 83, 10 -> 97).
    Жалобы устаревают: вес падает вдвое за 30 дней, но не ниже 40 %.
    Схемы с прямым хищением денег весят больше. Подтверждённый аналитиком индикатор — не ниже 90.
    """
    import math

    base = 100 * (1 - math.exp(-0.35 * max(reporters, 0)))
    days = (datetime.now(timezone.utc) - last_seen).days if last_seen else 0
    recency = max(0.4, 0.5 ** (days / 30))
    weight = 1.0 if category in ("bank_security", "phishing", "hacked_account", "authority") else 0.9
    score = round(base * recency * weight)
    if status == "confirmed":
        score = max(score, 90)
    return max(1, min(99, score))


async def publish_summary() -> None:
    """Собрать сводку для дашборда. Сайт читает только этот документ, сырые данные ему недоступны.

    Стоит ~40 чтений: документ счётчиков, 12 последних проверок и 25 индикаторов с наибольшим числом заявителей.
    """
    from google.cloud.firestore_v1 import Query

    db = _get_db()
    agg = (await _agg_ref(db).get()).to_dict() or {}
    feed = [d.to_dict() async for d in
            db.collection("checks").order_by("created_at", direction=Query.DESCENDING).limit(12).stream()]
    inds = [d.to_dict() async for d in
            db.collection("indicators").order_by("reporters_count", direction=Query.DESCENDING).limit(30).stream()]
    inds = [i for i in inds if i.get("status") != "rejected"][:25]

    totals = {"checks": 0, "flagged": 0, "scam": 0, "indicators": 0, "repeat": 0, **agg.get("totals", {})}
    today = datetime.now(KZ_TZ).date()
    daily = agg.get("daily", {})
    days = [(today - timedelta(days=n)).isoformat() for n in range(13, -1, -1)]

    summary = {
        "updated_at": datetime.now(timezone.utc),
        "totals": totals,
        "categories": agg.get("categories", {}),
        "kinds": agg.get("kinds", {}),
        "input_types": agg.get("input_types", {}),
        "daily": [{"date": d, "total": daily.get(d, {}).get("total", 0),
                   "flagged": daily.get(d, {}).get("flagged", 0)} for d in days],
        "top_indicators": [{
            "kind": i["kind"], "value": mask(i["kind"], i["display"]),
            "reporters": i.get("reporters_count", 0), "reports": i.get("reports_count", 0),
            "risk": risk_score(i.get("reporters_count", 0), i.get("last_seen"),
                               i.get("last_category", "other"), i.get("status", "unverified")),
            "first_seen": i.get("first_seen"), "last_seen": i.get("last_seen"),
            "category": i.get("last_category", "other"), "scheme": i.get("last_scheme", ""),
            "status": i.get("status", "unverified"),
        } for i in inds],
        "feed": [{
            "at": c["created_at"], "verdict": c["verdict"], "category": c.get("category", "other"),
            "scheme": c.get("scheme", ""), "input_type": c.get("input_type", "text"),
            "indicators": c.get("indicators", 0),
        } for c in feed],
        "has_demo_data": bool(agg.get("has_demo")),
    }
    await db.collection("public").document("summary").set(summary)
