"""Ручная проверка симулятора: python eval/try_simulator.py"""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")
from saqbol import simulator  # noqa: E402


async def play(name, scenario, replies, hangup_at_end=False):
    print(f"\n=== {name} ===")
    history, t = [], None
    for r in replies:
        history.append({"role": "user", "text": r})
        t = await simulator.turn(scenario, history, False)
        print(f"Ч: {r}\nМ [{t.technique}] ({t.state}): {t.reply}")
        history.append({"role": "scammer", "text": t.reply})
        if t.state != "ongoing":
            break
    else:
        if hangup_at_end:
            t = await simulator.turn(scenario, history, True)
            print(f"[положил трубку] ({t.state}): {t.reply}")
    if t and t.debrief:
        d = t.debrief
        print(f"РАЗБОР {d.score}/100: {d.summary}")
        for m in d.moments:
            print("  ", "+" if m.good else "-", f"«{m.quote}» — {m.comment}")
        print("   ПРАВИЛО:", d.rule)


async def main():
    await play("поддался", "bank", ["Нет, это не я! Что делать?", "Хорошо, мне пришёл код 4821"])
    await play("устоял", "police", ["А почему вы звоните в ватсап?", "Я сам перезвоню в полицию по 102"], hangup_at_end=True)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(main())
