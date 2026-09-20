"""Оформление профиля бота: аватар, имя, описания, меню команд и кнопка-сайт.

Запускается один раз (и после смены текстов):  .venv\\Scripts\\python setup_bot.py
"""

import asyncio
import os
import sys
from pathlib import Path

from aiogram import Bot
from aiogram.types import BotCommand, FSInputFile, InputProfilePhotoStatic, MenuButtonWebApp, WebAppInfo
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
SITE = "https://saqbol-ai-kz.web.app"

DESCRIPTION = (
    "Пришло странное сообщение или просят перевести деньги незнакомцу?\n\n"
    "Пришлите мне текст, скриншот, голосовое или номер — скажу, мошенники это или нет, и объясню почему. "
    "Если на номер уже жаловались другие люди, вы об этом узнаете.\n\n"
    "Ещё здесь: тренажёр, разговор с «мошенником» и памятка для родителей.\n"
    "Сообщения не сохраняются. Русский и қазақша."
)
SHORT = "Проверю сообщение, скриншот, голосовое или номер на мошенничество. Сақ бол — будь осторожен."

COMMANDS = [
    BotCommand(command="start", description="Что умеет бот"),
    BotCommand(command="trainer", description="Тренажёр: мошенник или нет?"),
    BotCommand(command="call", description="Разговор с мошенником"),
    BotCommand(command="memo", description="Памятка для родителей"),
]


async def main() -> None:
    bot = Bot(os.environ["TELEGRAM_BOT_TOKEN"])
    steps = {
        "аватар": lambda: bot.set_my_profile_photo(photo=InputProfilePhotoStatic(photo=FSInputFile(Path(__file__).parent / "avatar.jpg"))),
        "имя": lambda: bot.set_my_name(name="SaqBol"),
        "описание": lambda: bot.set_my_description(description=DESCRIPTION),
        "короткое описание": lambda: bot.set_my_short_description(short_description=SHORT),
        "команды": lambda: bot.set_my_commands(COMMANDS),
        "кнопка меню": lambda: bot.set_chat_menu_button(menu_button=MenuButtonWebApp(text="SaqBol", web_app=WebAppInfo(url=SITE))),
    }
    for name, step in steps.items():
        try:
            await step()
            print(f"{name}: ок")
        except Exception as e:  # один неудачный шаг не должен отменять остальные
            print(f"{name}: НЕ ВЫШЛО — {type(e).__name__}: {str(e)[:160]}")
    await bot.session.close()


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(main())
