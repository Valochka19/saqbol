"""Слой 1: правила. Работает без интернета и без LLM.

Ищет в сообщении типичные признаки мошенничества и считает балл риска.
Каждый признак — это объяснимая причина, которую бот показывает человеку.
"""

import re
from dataclasses import dataclass, field

import tldextract

# Встроенный список доменных зон, без скачивания из сети
_extract = tldextract.TLDExtract(suffix_list_urls=())

# Настоящие домены банков и сервисов Казахстана
OFFICIAL_DOMAINS = {
    "kaspi.kz", "halykbank.kz", "homebank.kz", "egov.kz", "elicense.kz", "gov.kz",
    "bcc.kz", "jusan.kz", "forte.kz", "berekebank.kz", "eubank.kz", "bankffin.kz",
    "otbasybank.kz", "enpf.kz", "nationalbank.kz", "post.kz", "olx.kz", "kolesa.kz",
    "krisha.kz", "beeline.kz", "kcell.kz", "tele2.kz", "activ.kz", "altel.kz",
}

# Названия брендов, под которые чаще всего подделывают ссылки
BRANDS = ("kaspi", "halyk", "homebank", "egov", "jusan", "forte", "bereke",
          "enpf", "olx", "kolesa", "krisha", "kazpost", "otbasy")

SHORTENERS = {"bit.ly", "clck.ru", "tinyurl.com", "t.co", "is.gd", "cutt.ly",
              "goo.su", "vk.cc", "rb.gy", "shorturl.at"}

SUSPICIOUS_TLDS = {"xyz", "top", "click", "site", "online", "icu", "shop",
                   "link", "live", "cc", "buzz", "cfd", "sbs", "rest"}

URL_RE = re.compile(r"(?:https?://|www\.)[^\s<>\"']+|\b[\w-]+(?:\.[\w-]+)+/[^\s<>\"']*|\b[\w-]+\.(?:kz|ru|com|net|org|xyz|top|site|online|shop|link|cc)\b", re.I)
IP_URL_RE = re.compile(r"https?://\d{1,3}(?:\.\d{1,3}){3}", re.I)

# (код признака, вес, описание для человека, регулярка)
TEXT_SIGNALS = [
    ("code_request", 3, "Просят сообщить код из SMS",
     r"(код\w*|code|пароль\w*|құпия\s?сөз).{0,40}(смс|sms|сообщ|назов|продикт|скаж|айт|жібер|хабарла)|(назов|продикт|скаж|сообщ|айт|жібер)\w*.{0,40}(код|code)"),
    ("card_data", 3, "Просят данные карты (номер, срок, CVV)",
     r"\bcvv\b|\bcvc\b|срок\w* действия|номер\w* карт|карта\s?нөмір|реквизит\w* карт|данные карт"),
    ("safe_account", 3, "Схема «безопасный счёт»",
     r"(безопасн|резервн|защищ[её]нн|страхов)\w*\s+сч[её]т|қауіпсіз\s+шот"),
    ("remote_access", 3, "Просят установить программу удалённого доступа",
     r"anydesk|teamviewer|rustdesk|rudesktop|удал[её]нн\w+ доступ|демонстраци\w+ экрана"),
    ("authority", 2, "Представляются банком или госорганом",
     r"служб\w+ безопасности|сотрудник\w* банка|банк қызметкері|нацбанк|национальн\w+ банк|следовател|кнб|финмониторинг|прокуратур|полици|антифрод"),
    ("prize", 2, "Обещают выигрыш, приз или выплату",
     r"вы выиграли|выигрыш|\bприз\w*|розыгрыш|компенсаци|ұтып алдыңыз|ұтыс|сыйлық|сыйақы"),
    ("money_request", 2, "Просят перевести или занять деньги",
     r"(займи|одолжи|скинь|переведи|перекинь|закинь)\w*.{0,40}(\d|тенге|тг|₸|деньг)|қарызға|ақша\s+(сал|жібер|аудар)"),
    ("investment", 2, "Обещают гарантированный доход",
     r"гарантированн\w+ (доход|прибыл)|пассивн\w+ доход|\d+\s?% в (день|сутки|неделю)|без вложений|кепілдендірілген табыс"),
    ("prepay", 2, "Просят предоплату или оплату по ссылке",
     r"предоплат|оплат\w+ доставк|получ\w+ (деньги|оплату) по ссылк|алдын ала төлем"),
    ("credit_alert", 2, "Пугают кредитом или подозрительной операцией",
     r"(оформл|заявк)\w*.{0,30}кредит|подозрительн\w+ (операци|перевод|активност)|несанкционированн|сіздің атыңызға несие"),
    ("urgency", 1, "Торопят и давят срочностью",
     r"срочно|немедленно|в течение \d+|прямо сейчас|заблокирован|блокировк|шұғыл|тез арада|бұғатталды|бұғатталады"),
    ("secrecy", 1, "Просят никому не рассказывать",
     r"никому не (говори|сообща|рассказыва)|не кладите трубку|не отключайтесь|ешкімге айтпа"),
    ("easy_job", 1, "Лёгкая подработка с нереальной оплатой",
     r"(подработк|работа на дому|удал[её]нн\w+ работ)\w*.{0,60}(\d{4,}|тг|тенге|₸)|за лайки|ставить лайки"),
]
_COMPILED = [(c, w, d, re.compile(p, re.I | re.S)) for c, w, d, p in TEXT_SIGNALS]

# Настоящие банки пишут «никому НЕ сообщайте код» — это предупреждение, а не просьба
_PROTECTIVE_RE = re.compile(
    r"(никому|никогда)?\s*не\s+(сообщайте|давайте|называйте|говорите|спрашива\w+|прос[ия]т)\s+(этот\s+|эти\s+)?(код|данные)"
    r"|код\w*\s+ешкімге\s+(айтпа|берме)", re.I)
_NEGATABLE = {"code_request", "card_data"}


@dataclass
class Signal:
    code: str
    weight: int
    description: str
    evidence: str = ""


@dataclass
class RuleResult:
    score: int
    verdict: str  # scam | suspicious | safe
    signals: list[Signal] = field(default_factory=list)
    urls: list[str] = field(default_factory=list)


def _check_url(url: str) -> list[Signal]:
    found = []
    if IP_URL_RE.match(url):
        found.append(Signal("ip_url", 2, "Ссылка ведёт на IP-адрес вместо сайта", url))
        return found

    parts = _extract(url)
    domain = parts.top_domain_under_public_suffix.lower()
    if not domain:
        return found
    if domain in OFFICIAL_DOMAINS:
        return found

    full_host = ".".join(p for p in (parts.subdomain, parts.domain, parts.suffix) if p).lower()
    if "xn--" in full_host:
        found.append(Signal("punycode", 2, "В адресе спрятаны похожие символы (punycode)", domain))
    brand = next((b for b in BRANDS if b in full_host.replace("-", "")), None)
    if brand:
        found.append(Signal("lookalike", 3, f"Домен подделан под «{brand}», это не официальный сайт", domain))
    if domain in SHORTENERS:
        found.append(Signal("shortener", 1, "Сокращённая ссылка скрывает настоящий адрес", domain))
    if parts.suffix.split(".")[-1] in SUSPICIOUS_TLDS:
        found.append(Signal("cheap_tld", 1, "Дешёвая доменная зона, популярная у мошенников", domain))
    return found


def analyze(text: str) -> RuleResult:
    signals: list[Signal] = []
    urls = [m.group(0).rstrip(".,;:!?)") for m in URL_RE.finditer(text)]

    for url in urls:
        signals.extend(_check_url(url))

    protective = bool(_PROTECTIVE_RE.search(text))
    for code, weight, description, pattern in _COMPILED:
        if protective and code in _NEGATABLE:
            continue
        match = pattern.search(text)
        if match:
            signals.append(Signal(code, weight, description, match.group(0)[:80]))

    # Один и тот же признак считаем один раз
    unique: dict[str, Signal] = {}
    for s in signals:
        unique.setdefault(s.code, s)
    signals = list(unique.values())

    score = sum(s.weight for s in signals)
    verdict = "scam" if score >= 4 else "suspicious" if score >= 2 else "safe"
    return RuleResult(score=score, verdict=verdict, signals=signals, urls=urls)
