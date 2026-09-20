"""Слой 2: LLM. Читает смысл сообщения и объясняет вердикт человеческим языком.

Сама модель живёт в облаке провайдера. Бот отправляет ей текст по HTTPS
с ключом из .env и получает обратно строго структурированный ответ.

Провайдер выбирается в .env: SAQBOL_PROVIDER=gemini (по умолчанию) или claude.
Остальной код бота про провайдера ничего не знает — заменить модель можно только здесь.
"""

import os
from typing import Literal

from pydantic import BaseModel, Field

PROVIDER = os.getenv("SAQBOL_PROVIDER", "gemini").lower()
_DEFAULT_MODELS = {"gemini": "gemini-3.8-flash", "claude": "claude-opus-5"}
_KEY_VARS = {"gemini": "GEMINI_API_KEY", "claude": "ANTHROPIC_API_KEY"}
MODEL = os.getenv("SAQBOL_MODEL") or _DEFAULT_MODELS.get(PROVIDER, "")

SYSTEM_PROMPT = """Ты — антифрод-аналитик казахстанского банка. Тебе присылают сообщения, \
которые люди получили в SMS, WhatsApp, Telegram или по почте, и просят оценить, мошенничество ли это.

Контекст Казахстана: самые частые схемы — звонки и сообщения от «службы безопасности банка» \
и «Нацбанка», «безопасный счёт», фишинговые ссылки под Kaspi, Halyk, eGov, Казпочту и OLX, \
«на вас оформляют кредит», просьбы знакомых со взломанных аккаунтов занять денег, \
фейковые розыгрыши и выплаты, инвестиционные пирамиды, подработка «за лайки», \
просьбы установить AnyDesk или включить демонстрацию экрана. \
Настоящие банки никогда не просят код из SMS, CVV и не переводят деньги на «безопасные счета».

Вместе с сообщением ты получаешь результат автоматической проверки по правилам — \
используй его как подсказку, но решай сам: правила могут ошибаться в обе стороны.

Обычные сообщения (коды подтверждения, которые человек сам запросил, уведомления о покупках, \
бытовая переписка, настоящая реклама) не должны помечаться как мошенничество. \
Вердикт suspicious — когда признаки есть, но их недостаточно для уверенного вывода.

Отвечай на том языке, на котором написано сообщение (русский или казахский). \
Пиши коротко и просто, как для человека без технического образования."""


class LLMVerdict(BaseModel):
    verdict: Literal["scam", "suspicious", "safe"]
    confidence: int = Field(description="Уверенность в вердикте, от 0 до 100")
    scheme: str = Field(description="Название схемы в 2-5 словах, либо «Обычное сообщение»")
    category: Literal["bank_security", "phishing", "hacked_account", "authority", "investment",
                      "job", "marketplace", "prize", "loan", "other", "none"] = Field(
        description="Тип схемы: bank_security — лжесотрудник банка, безопасный счёт, код из SMS; "
                    "phishing — поддельная ссылка или сайт; hacked_account — просьба денег от имени знакомого "
                    "или родственника, угон аккаунта; authority — лжеполиция, КНБ, налоговая, суд; "
                    "investment — инвестиции, крипта, пирамида; job — фейковая работа; "
                    "marketplace — купля-продажа, доставка, аренда, предоплата; prize — выигрыш, выплата, "
                    "компенсация; loan — фейковый кредит; other — другое мошенничество; none — не мошенничество")
    red_flags: list[str] = Field(description="До 4 коротких признаков, по которым сделан вывод")
    advice: str = Field(description="Что делать человеку, 1-2 предложения")
    language: Literal["ru", "kk", "en"]


class LLMUnavailable(Exception):
    """LLM не ответила. Бот в этом случае отдаёт вердикт одних правил."""


_client = None


def is_configured() -> bool:
    return PROVIDER in _KEY_VARS and bool(os.getenv(_KEY_VARS[PROVIDER]))


async def classify(text: str, rules_summary: str) -> LLMVerdict:
    user_content = (
        f"<message>\n{text}\n</message>\n\n"
        f"<rules_check>\n{rules_summary}\n</rules_check>"
    )
    return await _structured(SYSTEM_PROMPT, user_content, LLMVerdict)


class ImageVerdict(LLMVerdict):
    extracted_text: str = Field(description="Весь текст сообщения или переписки со скриншота, дословно. Пустая строка, если текста нет")
    is_message: bool = Field(description="true, если на картинке сообщение, переписка, письмо, чек или объявление; false — если это посторонняя картинка")


IMAGE_TASK = (
    "На картинке — скриншот, который человек получил или сделал сам: переписка в мессенджере, SMS, письмо, "
    "чек перевода, объявление. Перепиши весь текст с картинки дословно в extracted_text и оцени, мошенничество ли это, "
    "по тем же правилам, что и для текстового сообщения. Учитывай то, чего нет в тексте: незнакомый номер вместо имени, "
    "аватарку с логотипом банка у обычного аккаунта, признаки поддельного чека (разные шрифты, неровные цифры, нет "
    "номера квитанции). Про чек перевода никогда не пиши, что он настоящий: по картинке это установить нельзя — "
    "советуй проверить поступление денег в приложении банка. Если на картинке нет сообщения, ставь is_message = false."
)


async def classify_image(data: bytes, mime: str) -> ImageVerdict:
    """Проверка скриншота: модель сама читает текст с картинки и сразу выносит вердикт."""
    return await _structured(SYSTEM_PROMPT, IMAGE_TASK, ImageVerdict, image=(data, mime))


class AudioVerdict(LLMVerdict):
    transcript: str = Field(description="Дословная расшифровка речи. Пустая строка, если речи нет")
    gist: str = Field(description="О чём говорят и чего хотят от слушателя, 1–2 предложения простыми словами")
    is_speech: bool = Field(description="true, если в записи есть разборчивая речь; false — если тишина, музыка или шум")


AUDIO_TASK = (
    "Это голосовое сообщение или запись телефонного разговора, которую человек получил и просит проверить. "
    "Расшифруй речь дословно в transcript, в gist коротко перескажи, о чём говорят и чего хотят от слушателя, "
    "и оцени, мошенничество ли это, по тем же правилам, что и для текстового сообщения. "
    "Слушай не только слова, но и манеру: заученный текст без пауз, давление и спешка, уход от прямых вопросов, "
    "фоновый шум колл-центра, обещание лёгкого заработка с просьбой сначала что-то оплатить или «зарегистрироваться». "
    "Если в записи несколько голосов, оценивай того, кто что-то предлагает или требует. "
    "Если разборчивой речи нет, ставь is_speech = false."
)


async def classify_audio(data: bytes, mime: str) -> AudioVerdict:
    """Проверка голосового или записи звонка: модель слушает запись сама, отдельная расшифровка не нужна."""
    if PROVIDER != "gemini":
        raise LLMUnavailable("аудио умеет слушать только Gemini")
    return await _structured(SYSTEM_PROMPT, AUDIO_TASK, AudioVerdict, image=(data, mime))


async def _structured(system: str, user_content: str, schema, temperature: float = 0,
                      image: tuple[bytes, str] | None = None):
    """Один вызов модели со строго структурированным ответом. Общий для проверки, скриншотов и симулятора."""
    if PROVIDER == "claude":
        return await _call_claude(system, user_content, schema, image)
    return await _call_gemini(system, user_content, schema, temperature, image)


async def _call_gemini(system: str, user_content: str, schema, temperature: float, image=None):
    from google import genai
    from google.genai import errors, types

    global _client
    if _client is None:
        _client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

    try:
        response = await _client.aio.models.generate_content(
            model=MODEL,
            contents=[types.Part.from_bytes(data=image[0], mime_type=image[1]), user_content] if image else user_content,
            config=types.GenerateContentConfig(
                system_instruction=system,
                response_mime_type="application/json",
                response_schema=schema,
                temperature=temperature,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            ),
        )
    except errors.ClientError as e:  # 4xx: ключ, имя модели, лимиты бесплатного тарифа
        raise LLMUnavailable(f"Gemini отклонил запрос ({e.code}): {e.message}") from e
    except errors.ServerError as e:
        raise LLMUnavailable(f"ошибка сервера Gemini {e.code}") from e
    except errors.APIError as e:
        raise LLMUnavailable(f"ошибка Gemini API {e.code}") from e

    if not isinstance(response.parsed, schema):
        raise LLMUnavailable("модель не вернула ответ")
    return response.parsed


async def _call_claude(system: str, user_content: str, schema, image=None):
    import anthropic

    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(timeout=60.0)

    try:
        response = await _client.messages.parse(
            model=MODEL,
            max_tokens=4000,
            system=system,
            messages=[{"role": "user", "content": _claude_content(user_content, image)}],
            output_format=schema,
            output_config={"effort": "low"},
        )
    except anthropic.AuthenticationError as e:
        raise LLMUnavailable("неверный ANTHROPIC_API_KEY") from e
    except anthropic.RateLimitError as e:
        raise LLMUnavailable("превышен лимит запросов") from e
    except anthropic.APIStatusError as e:
        raise LLMUnavailable(f"ошибка API {e.status_code}") from e
    except anthropic.APIConnectionError as e:
        raise LLMUnavailable("нет связи с API") from e

    if response.stop_reason == "refusal" or response.parsed_output is None:
        raise LLMUnavailable("модель не вернула ответ")
    return response.parsed_output


def _claude_content(user_content: str, image):
    if not image:
        return user_content
    import base64

    return [
        {"type": "image", "source": {"type": "base64", "media_type": image[1], "data": base64.standard_b64encode(image[0]).decode()}},
        {"type": "text", "text": user_content},
    ]
