"""Метрики качества на размеченном датасете.

  .venv\\Scripts\\python eval\\run_eval.py            # только правила, бесплатно
  .venv\\Scripts\\python eval\\run_eval.py --llm      # правила + LLM, нужен ANTHROPIC_API_KEY

«Сработал» = бот выдал scam или suspicious (человек предупреждён).
"""

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

from saqbol import llm  # noqa: E402
from saqbol.analyzer import analyze  # noqa: E402

DATASET = ROOT / "eval" / "dataset.jsonl"
RESULTS_DIR = ROOT / "eval" / "results"
PAUSE_SEC = 7  # пауза между запросами к LLM, чтобы уложиться в лимит бесплатного тарифа


async def main() -> None:
    use_llm = "--llm" in sys.argv
    if use_llm and not llm.is_configured():
        raise SystemExit("Для --llm нужен ANTHROPIC_API_KEY в .env")

    rows = [json.loads(line) for line in DATASET.read_text(encoding="utf-8").splitlines() if line.strip()]

    async def run(row: dict) -> dict:
        v = await analyze(row["text"], use_llm=use_llm)
        return {**row, "predicted": v.verdict, "confidence": v.confidence, "source": v.source}

    if not use_llm:
        results = [await run(r) for r in rows]
    else:
        # Бесплатный тариф Gemini режет запросы в минуту: идём по одному с паузой,
        # при отказе ждём и повторяем. Уже полученные ответы LLM берём из прошлого прогона.
        prev_file = RESULTS_DIR / "metrics_rules_llm.json"
        done = {}
        if prev_file.exists() and "--fresh" not in sys.argv:
            prev = json.loads(prev_file.read_text(encoding="utf-8"))["results"]
            done = {r["id"]: r for r in prev if r["source"] == "rules+llm"
                    and any(r["text"] == row["text"] for row in rows if row["id"] == r["id"])}
        results = []
        for i, row in enumerate(rows, 1):
            if row["id"] in done:
                results.append(done[row["id"]])
                continue
            for attempt in range(4):
                res = await run(row)
                if res["source"] == "rules+llm":
                    break
                await asyncio.sleep(35)
            results.append(res)
            print(f"  [{i}/{len(rows)}] #{row['id']} -> {res['predicted']} ({res['source']})", flush=True)
            await asyncio.sleep(PAUSE_SEC)

    tp = sum(r["label"] == "scam" and r["predicted"] != "safe" for r in results)
    fn = sum(r["label"] == "scam" and r["predicted"] == "safe" for r in results)
    fp = sum(r["label"] == "safe" and r["predicted"] != "safe" for r in results)
    tn = sum(r["label"] == "safe" and r["predicted"] == "safe" for r in results)

    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    metrics = {
        "mode": "rules+llm" if use_llm else "rules",
        "model": llm.MODEL if use_llm else None,
        "total": len(results), "tp": tp, "fn": fn, "fp": fp, "tn": tn,
        "accuracy": round((tp + tn) / len(results), 3),
        "precision": round(precision, 3), "recall": round(recall, 3), "f1": round(f1, 3),
        "llm_fallbacks": sum(use_llm and r["source"] == "rules" for r in results),
    }

    print(f"Режим: {metrics['mode']}   сообщений: {metrics['total']}")
    print(f"Accuracy {metrics['accuracy']}   Precision {metrics['precision']}   "
          f"Recall {metrics['recall']}   F1 {metrics['f1']}")
    print(f"Поймано скама: {tp} из {tp + fn}   Ложных тревог: {fp} из {fp + tn}")
    for name, subset in (("обычные", [r for r in results if not r.get("hard")]),
                         ("трудные", [r for r in results if r.get("hard")])):
        if subset:
            ok = sum((r["label"] == "scam") == (r["predicted"] != "safe") for r in subset)
            metrics[f"accuracy_{'hard' if name == 'трудные' else 'easy'}"] = round(ok / len(subset), 3)
            print(f"  {name}: верно {ok} из {len(subset)}")
    if metrics["llm_fallbacks"]:
        print(f"ВНИМАНИЕ: LLM не ответила {metrics['llm_fallbacks']} раз, там считались одни правила")

    errors = [r for r in results if (r["label"] == "scam") != (r["predicted"] != "safe")]
    if errors:
        print("\nОшибки:")
        for r in errors:
            kind = "ПРОПУСК" if r["label"] == "scam" else "ЛОЖНАЯ ТРЕВОГА"
            print(f"  #{r['id']} {kind} [{r['scheme']}] {r['text'][:90]}")

    RESULTS_DIR.mkdir(exist_ok=True)
    out = RESULTS_DIR / f"metrics_{metrics['mode'].replace('+', '_')}.json"
    out.write_text(json.dumps({"metrics": metrics, "results": results}, ensure_ascii=False, indent=2),
                   encoding="utf-8")
    print(f"\nСохранено: {out}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    asyncio.run(main())
