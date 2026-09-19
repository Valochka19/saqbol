"""Индикаторы мошенников: то, что можно заблокировать.

Из сообщения вытаскиваем телефоны, номера карт, домены и Telegram-аккаунты.
Именно они попадают в общую базу — сам текст сообщения не хранится нигде.
"""

import hashlib
import os
import re
from dataclasses import dataclass

from .rules import OFFICIAL_DOMAINS, URL_RE, _extract

PHONE_RE = re.compile(r"(?<!\d)(?:\+?7|8)(?:[\s\-()]*\d){10}(?!\d)")
CARD_RE = re.compile(r"(?<!\d)(?:\d[ \-]?){15}\d(?!\d)")
TG_RE = re.compile(r"(?<![\w@])@([A-Za-z][A-Za-z0-9_]{4,31})\b")

# Короткие и служебные номера банков — не индикаторы
_IGNORED_TG = {"botfather", "telegram"}


@dataclass(frozen=True)
class Indicator:
    kind: str  # phone | card | domain | telegram
    value: str  # нормализованное значение
    display: str  # как показать человеку


def _luhn_ok(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 1:
            d = d * 2 - 9 if d * 2 > 9 else d * 2
        total += d
    return total % 10 == 0


def mask_card(digits: str) -> str:
    return f"{digits[:4]} {digits[4:6]}** **** {digits[-4:]}"


def extract(text: str) -> list[Indicator]:
    found: dict[tuple[str, str], Indicator] = {}

    card_spans = []
    for m in CARD_RE.finditer(text):
        digits = re.sub(r"\D", "", m.group(0))
        if _luhn_ok(digits):
            card_spans.append(m.span())
            found[("card", digits)] = Indicator("card", digits, mask_card(digits))

    for m in PHONE_RE.finditer(text):
        if any(s <= m.start() < e for s, e in card_spans):
            continue
        digits = re.sub(r"\D", "", m.group(0))
        value = "+7" + digits[-10:]
        found[("phone", value)] = Indicator(
            "phone", value, f"+7 {value[2:5]} {value[5:8]} {value[8:10]} {value[10:12]}")

    for m in URL_RE.finditer(text):
        domain = _extract(m.group(0)).top_domain_under_public_suffix.lower()
        if domain and domain not in OFFICIAL_DOMAINS:
            found[("domain", domain)] = Indicator("domain", domain, domain)

    for m in TG_RE.finditer(text):
        name = m.group(1).lower()
        if name not in _IGNORED_TG:
            found[("telegram", name)] = Indicator("telegram", name, "@" + name)

    return list(found.values())


def reporter_hash(chat_id: int) -> str:
    """Обезличенный идентификатор отправителя: считаем независимые жалобы, не зная, кто жаловался."""
    salt = os.getenv("SAQBOL_SALT", "saqbol")
    return hashlib.sha256(f"{salt}:{chat_id}".encode()).hexdigest()[:32]
