"""Склейка двух слоёв: правила + LLM -> один итоговый вердикт."""

import logging
from dataclasses import dataclass, field

from . import llm, rules

log = logging.getLogger("saqbol")


@dataclass
class Verdict:
    verdict: str  # scam | suspicious | safe
    confidence: int
    scheme: str
    red_flags: list[str]
    advice: str
    language: str = "ru"
    category: str = "other"
    source: str = "rules"  # rules | rules+llm
    rule_score: int = 0
    urls: list[str] = field(default_factory=list)


_DEFAULT_ADVICE = {
    "scam": "Не переходите по ссылкам, не сообщайте коды и данные карты. Заблокируйте отправителя. "
            "Если уже что-то сообщили — сразу звоните в банк по номеру с карты.",
    "suspicious": "Не торопитесь. Перепроверьте информацию через официальное приложение или "
                  "позвоните в организацию сами по номеру с её сайта.",
    "safe": "Явных признаков мошенничества не найдено. Но коды из SMS и данные карты "
            "всё равно никому не сообщайте.",
}
_DEFAULT_SCHEME = {"scam": "Признаки мошенничества", "suspicious": "Есть подозрительные признаки",
                   "safe": "Обычное сообщение"}


# Без LLM категорию определяем по сработавшим правилам
_SIGNAL_CATEGORY = [
    ("lookalike", "phishing"), ("punycode", "phishing"), ("ip_url", "phishing"),
    ("code_request", "bank_security"), ("safe_account", "bank_security"), ("card_data", "bank_security"),
    ("remote_access", "bank_security"), ("credit_alert", "bank_security"), ("authority", "authority"),
    ("investment", "investment"), ("easy_job", "job"), ("prepay", "marketplace"),
    ("prize", "prize"), ("money_request", "hacked_account"),
]


def _rule_category(r: rules.RuleResult) -> str:
    if r.verdict == "safe":
        return "none"
    codes = {s.code for s in r.signals}
    return next((cat for code, cat in _SIGNAL_CATEGORY if code in codes), "other")


def _rules_only(r: rules.RuleResult) -> Verdict:
    return Verdict(
        verdict=r.verdict,
        confidence=min(95, 50 + r.score * 8) if r.signals else 60,
        scheme=_DEFAULT_SCHEME[r.verdict],
        red_flags=[s.description for s in r.signals][:4],
        advice=_DEFAULT_ADVICE[r.verdict],
        category=_rule_category(r),
        rule_score=r.score,
        urls=r.urls,
    )


def _summarize(r: rules.RuleResult) -> str:
    if not r.signals:
        return "Правила не нашли признаков мошенничества."
    lines = [f"- {s.description} (вес {s.weight}): «{s.evidence}»" for s in r.signals]
    return f"Балл риска {r.score}, предварительно: {r.verdict}\n" + "\n".join(lines)


async def analyze(text: str, use_llm: bool = True) -> Verdict:
    r = rules.analyze(text)
    if not (use_llm and llm.is_configured()):
        return _rules_only(r)

    try:
        v = await llm.classify(text, _summarize(r))
    except llm.LLMUnavailable as e:
        log.warning("LLM недоступна, отвечаю по правилам: %s", e)
        return _rules_only(r)

    verdict = v.verdict
    # Страховка: поддельный домен банка не может быть «безопасным», что бы ни сказала модель
    if verdict == "safe" and any(s.code in ("lookalike", "punycode") for s in r.signals):
        verdict = "suspicious"

    return Verdict(
        verdict=verdict,
        confidence=max(0, min(99, v.confidence)),  # 100% в антифроде не бывает
        scheme=v.scheme,
        red_flags=v.red_flags[:4],
        advice=v.advice,
        language=v.language,
        category=v.category if verdict != "safe" else "none",
        source="rules+llm",
        rule_score=r.score,
        urls=r.urls,
    )


class NotAMessage(Exception):
    """На картинке нет сообщения — проверять нечего."""


async def analyze_image(data: bytes, mime: str) -> tuple[Verdict, str]:
    """Проверка скриншота. Возвращает вердикт и распознанный текст: из него потом достаются номера и ссылки."""
    if not llm.is_configured():
        raise llm.LLMUnavailable("для скриншотов нужна модель")
    v = await llm.classify_image(data, mime)
    if not v.is_message:
        raise NotAMessage()

    r = rules.analyze(v.extracted_text)
    verdict = v.verdict
    if verdict == "safe" and any(s.code in ("lookalike", "punycode") for s in r.signals):
        verdict = "suspicious"
    return Verdict(
        verdict=verdict, confidence=max(0, min(99, v.confidence)), scheme=v.scheme, red_flags=v.red_flags[:4],
        advice=v.advice, language=v.language, category=v.category if verdict != "safe" else "none",
        source="rules+llm", rule_score=r.score, urls=r.urls,
    ), v.extracted_text


async def analyze_audio(data: bytes, mime: str) -> tuple[Verdict, str, str]:
    """Проверка голосового или записи звонка. Возвращает вердикт, расшифровку и короткий пересказ."""
    if not llm.is_configured():
        raise llm.LLMUnavailable("для голосовых нужна модель")
    v = await llm.classify_audio(data, mime)
    if not v.is_speech:
        raise NotAMessage()

    r = rules.analyze(v.transcript)
    return Verdict(
        verdict=v.verdict, confidence=max(0, min(99, v.confidence)), scheme=v.scheme, red_flags=v.red_flags[:4],
        advice=v.advice, language=v.language, category=v.category if v.verdict != "safe" else "none",
        source="rules+llm", rule_score=r.score, urls=r.urls,
    ), v.transcript, v.gist
