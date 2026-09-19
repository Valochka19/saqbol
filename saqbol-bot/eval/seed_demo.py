"""Демо-данные для дашборда: 14 дней «работы» сети. Все записи помечены demo=True.

Источник — мошеннические сообщения из нашего же датасета: из них извлекаются индикаторы,
а жалобы на них раскладываются по дням от вымышленных заявителей.
  .venv\Scripts\python eval\seed_demo.py
"""

import asyncio
import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from saqbol import indicators, store  # noqa: E402

SCHEME_CATEGORY = {
    "phishing_bank": "phishing", "phishing_egov": "phishing", "phishing_post": "phishing", "malware_apk": "phishing",
    "telegram_hijack": "phishing", "fake_tax": "authority", "police": "authority", "fake_boss": "authority",
    "bank_security": "bank_security", "safe_account": "bank_security", "card_data": "bank_security",
    "remote_access": "bank_security", "sim_swap": "bank_security", "egov_hijack": "bank_security",
    "hacked_friend": "hacked_account", "fake_relative": "hacked_account", "fake_accident": "hacked_account",
    "gift_cards": "hacked_account", "identity_theft": "other", "investment": "investment", "crypto": "investment",
    "crypto_drainer": "investment", "fake_broker": "investment", "enpf": "prize", "prize": "prize", "refund": "prize",
    "easy_job": "job", "olx_delivery": "marketplace", "marketplace": "marketplace", "prepay_sale": "marketplace",
    "rent_deposit": "marketplace", "fake_loan": "loan",
}
# Насколько «массовая» рассылка у каждой схемы: сколько разных людей принесут один и тот же индикатор
POPULARITY = {"bank_security": 9, "phishing": 7, "hacked_account": 5, "authority": 4, "marketplace": 3,
              "investment": 3, "prize": 3, "job": 2, "loan": 2, "other": 1}


async def main() -> None:
    random.seed(19)
    rows = [json.loads(x) for x in (ROOT / "eval" / "dataset.jsonl").read_text(encoding="utf-8").splitlines() if x.strip()]
    scams = [r for r in rows if r["label"] == "scam"]
    now = datetime.now(timezone.utc)
    checks = 0

    for r in scams:
        category = SCHEME_CATEGORY.get(r["scheme"], "other")
        found = indicators.extract(r["text"])
        people = random.randint(1, POPULARITY[category])
        for n in range(people):
            # Рассылки идут волнами: ближе к сегодняшнему дню жалоб больше
            age_days = min(13, int(random.expovariate(1 / 4)))
            at = now - timedelta(days=age_days, minutes=random.randint(0, 900))
            verdict = "scam" if random.random() < 0.9 else "suspicious"
            for ind in found:
                await store.report(ind, f"demo-{r['id']}-{n}", verdict, r["scheme"], category, demo=True)
            await store.log_check(verdict, random.randint(88, 99), r["scheme"], "rules+llm", r["lang"][:2],
                                  random.choices(["text", "photo", "voice", "web"], [70, 15, 5, 10])[0],
                                  any(i.kind == "domain" for i in found), len(found), category, created_at=at, demo=True)
            checks += 1

    # Обычные сообщения тоже проверяют — примерно столько же, сколько мошеннических
    for _ in range(int(checks * 1.1)):
        at = now - timedelta(days=min(13, int(random.expovariate(1 / 5))), minutes=random.randint(0, 900))
        await store.log_check("safe", random.randint(85, 99), "Обычное сообщение", "rules+llm", "ru",
                              random.choices(["text", "photo", "web"], [75, 15, 10])[0], False, 0, "none",
                              created_at=at, demo=True)
        checks += 1

    await store.publish_summary()
    print("демо-проверок записано:", checks)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(main())
