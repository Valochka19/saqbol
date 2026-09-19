"""Данные для тренажёра на сайте: примеры из датасета + разбор, который даёт сам SaqBol."""

import asyncio
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")
from saqbol.analyzer import analyze  # noqa: E402

OUT = ROOT.parent / "saqbol-site" / "public" / "quiz.json"


async def main() -> None:
    rows = [json.loads(x) for x in (ROOT / "eval" / "dataset.jsonl").read_text(encoding="utf-8").splitlines() if x.strip()]
    rows = [r for r in rows if r["lang"] in ("ru", "kk", "mix")]
    random.seed(7)
    picked = []
    for label in ("scam", "safe"):
        hard = [r for r in rows if r["label"] == label and r.get("hard")]
        easy = [r for r in rows if r["label"] == label and not r.get("hard")]
        picked += random.sample(hard, 10) + random.sample(easy, 10)

    done = {q["id"]: q for q in json.loads(OUT.read_text(encoding="utf-8"))} if OUT.exists() else {}
    quiz = []
    for i, r in enumerate(picked, 1):
        if r["id"] in done:
            quiz.append(done[r["id"]])
            continue
        for _ in range(4):
            v = await analyze(r["text"])
            if v.source == "rules+llm":
                break
            await asyncio.sleep(35)
        # В тренажёр берём только разборы, где SaqBol сам ответил верно
        if v.source == "rules+llm" and (v.verdict != "safe") == (r["label"] == "scam"):
            quiz.append({"id": r["id"], "text": r["text"], "scam": r["label"] == "scam", "hard": bool(r.get("hard")),
                         "scheme": v.scheme, "flags": v.red_flags, "advice": v.advice})
        print(f"[{i}/{len(picked)}] #{r['id']} {v.verdict} ({v.source})", flush=True)
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(quiz, ensure_ascii=False, indent=1), encoding="utf-8")
        await asyncio.sleep(6)
    print("готово:", len(quiz))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    asyncio.run(main())
