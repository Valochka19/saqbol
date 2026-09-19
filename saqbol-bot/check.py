"""Проверка одного сообщения из терминала, без Telegram.

  .venv\\Scripts\\python check.py "Ваша карта заблокирована, перейдите kaspi-bonus.xyz"
  .venv\\Scripts\\python check.py --no-llm "текст"
"""

import asyncio
import sys

from dotenv import load_dotenv

load_dotenv()

from saqbol.analyzer import analyze  # noqa: E402


async def main() -> None:
    args = sys.argv[1:]
    use_llm = "--no-llm" not in args
    text = " ".join(a for a in args if a != "--no-llm")
    if not text:
        raise SystemExit(__doc__)
    v = await analyze(text, use_llm=use_llm)
    print(f"{v.verdict.upper()}  уверенность {v.confidence}%  [{v.source}, балл правил {v.rule_score}]")
    print(f"Схема: {v.scheme}")
    for flag in v.red_flags:
        print(f"  - {flag}")
    print(f"Совет: {v.advice}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(main())
