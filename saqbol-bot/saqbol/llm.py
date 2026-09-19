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


async def _structured(system: str, user_content: str, schema, temperature: float = 0):
    """Один вызов модели со строго структурированным ответом. Общий для проверки и симулятора."""
    if PROVIDER == "claude":
        return await _call_claude(system, user_content, schema)
    return await _call_gemini(system, user_content, schema, temperature)


async def _call_gemini(system: str, user_content: str, schema, temperature: float):
    from google import genai
    from google.genai import errors, types

    global _client
    if _client is None:
        _client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

    try:
        response = await _client.aio.models.generate_content(
            model=MODEL,
            contents=user_content,
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


async def _call_claude(system: str, user_content: str, schema):
    import anthropic

    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(timeout=60.0)

    try:
        response = await _client.messages.parse(
            model=MODEL,
            max_tokens=4000,
            system=system,
            messages=[{"role": "user", "content": user_content}],
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
