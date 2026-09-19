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
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .indicators import Indicator

log = logging.getLogger("saqbol")

_KEY_PATH = Path(os.getenv("FIREBASE_CREDENTIALS") or Path(__file__).resolve().parent.parent / "firebase-key.json")
_db = None


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
        return Sighting(ind, reporters - (0 if is_new_reporter else 1),
                        data.get("first_seen"), data.get("status", "unverified"))

    return await tx_body(db.transaction())


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
    await _get_db().collection("checks").add({
        "created_at": created_at or datetime.now(timezone.utc), "verdict": verdict, "confidence": confidence,
        "scheme": scheme, "category": category, "source": source, "lang": lang, "input_type": input_type,
        "has_url": has_url, "indicators": indicators, "demo": demo,
    })


KZ_TZ = timezone(timedelta(hours=5))  # единое время Казахстана


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
    """Пересчитать сводку для дашборда. Сайт читает только этот документ, сырые данные ему недоступны."""
    from google.cloud.firestore_v1 import Query

    db = _get_db()
    checks = [d.to_dict() async for d in
              db.collection("checks").order_by("created_at", direction=Query.DESCENDING).limit(3000).stream()]
    inds = [d.to_dict() async for d in db.collection("indicators").limit(1000).stream()]
    checks = [c for c in checks if c.get("source") != "selftest"]
    inds = [i for i in inds if i.get("value") != "saqbol_selftest" and i.get("status") != "rejected"]

    flagged = [c for c in checks if c["verdict"] != "safe"]
    today = datetime.now(KZ_TZ).date()
    days = [today - timedelta(days=n) for n in range(13, -1, -1)]
    per_day_total = Counter(c["created_at"].astimezone(KZ_TZ).date() for c in checks)
    per_day_flagged = Counter(c["created_at"].astimezone(KZ_TZ).date() for c in flagged)

    inds.sort(key=lambda i: (i.get("reporters_count", 0), i.get("last_seen")), reverse=True)
    summary = {
        "updated_at": datetime.now(timezone.utc),
        "totals": {
            "checks": len(checks), "flagged": len(flagged),
            "scam": sum(c["verdict"] == "scam" for c in checks),
            "indicators": len(inds),
            "repeat": sum(i.get("reporters_count", 0) >= 2 for i in inds),
        },
        "categories": dict(Counter(c.get("category", "other") for c in flagged)),
        "kinds": dict(Counter(i["kind"] for i in inds)),
        "input_types": dict(Counter(c.get("input_type", "text") for c in checks)),
        "daily": [{"date": d.isoformat(), "total": per_day_total[d], "flagged": per_day_flagged[d]} for d in days],
        "top_indicators": [{
            "kind": i["kind"], "value": mask(i["kind"], i["display"]),
            "reporters": i.get("reporters_count", 0), "reports": i.get("reports_count", 0),
            "risk": risk_score(i.get("reporters_count", 0), i.get("last_seen"),
                               i.get("last_category", "other"), i.get("status", "unverified")),
            "first_seen": i.get("first_seen"), "last_seen": i.get("last_seen"),
            "category": i.get("last_category", "other"), "scheme": i.get("last_scheme", ""),
            "status": i.get("status", "unverified"),
        } for i in inds[:25]],
        "feed": [{
            "at": c["created_at"], "verdict": c["verdict"], "category": c.get("category", "other"),
            "scheme": c.get("scheme", ""), "input_type": c.get("input_type", "text"),
            "indicators": c.get("indicators", 0),
        } for c in checks[:12]],
        "has_demo_data": any(c.get("demo") for c in checks) or any(i.get("demo") for i in inds),
    }
    await db.collection("public").document("summary").set(summary)
