"use client";

import type { Timestamp } from "firebase/firestore";
import { useState } from "react";
import { ask, ASK_ERRORS } from "@/lib/ask";
import { CATEGORY, fmtDate, KIND } from "@/lib/labels";
import type { Kind } from "@/lib/summary";

interface Item {
  kind: Kind;
  value: string;
  found: boolean;
  reporters: number;
  risk: number;
  category: string;
  first_seen: Timestamp | null;
  last_seen: Timestamp | null;
}

const EXAMPLES = ["8 705 111 22 33", "kazpost-track.click", "+7 777 000 00 00"];

function people(n: number) {
  const d = n % 10, h = n % 100;
  return `${n} ${d === 1 && h !== 11 ? "человек" : d >= 2 && d <= 4 && (h < 12 || h > 14) ? "человека" : "человек"}`;
}

export function LookupPanel() {
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "waiting" | "done">("idle");
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function submit(v = value) {
    if (!v.trim() || state === "waiting") return;
    setState("waiting");
    setError(null);
    try {
      const res = await ask<{ items: Item[] }>({ lookup: v.trim().slice(0, 120) });
      setItems(res.items);
    } catch (e) {
      setItems([]);
      setError(ASK_ERRORS[(e as Error).message] ?? ASK_ERRORS.failed);
    }
    setState("done");
  }

  return (
    <div className="grid gap-x-10 gap-y-10 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <h1 className="font-serif text-[28px] font-bold leading-[1.08] sm:text-[48px]">Переводите деньги незнакомцу? Сначала проверьте его</h1>
        <p className="mt-2 max-w-[58ch] text-[15px] leading-snug text-ink-2 sm:mt-3 sm:text-[16px] sm:leading-relaxed">
          Введите номер телефона, номер карты, ссылку или Telegram-аккаунт, который вам прислали. Мы скажем, жаловались ли
          на него другие люди.
        </p>

        <div className="card mt-5">
        <label htmlFor="lookup" className="kicker block">Номер, карта, ссылка или @аккаунт</label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            id="lookup"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            maxLength={120}
            inputMode="text"
            autoComplete="off"
            placeholder="+7 7__ ___ __ __"
            className="field num px-4 py-3 text-[20px] placeholder:text-ink-3"
          />
          <button
            onClick={() => submit()}
            disabled={!value.trim() || state === "waiting"}
            className="btn btn-primary shrink-0"
          >
            {state === "waiting" ? "Ищем…" : "Проверить"}
          </button>
        </div>
        <p className="mt-3 text-[13px] text-ink-3">Введённое нигде не сохраняется и в базу не попадает.</p>
        </div>

        <div className="mt-5">
          <p className="text-[14px] text-ink-2">Попробуйте на примере:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => { setValue(ex); submit(ex); }} className="chip num">
                {ex}
              </button>
            ))}
          </div>
        </div>
      </div>

      <aside aria-live="polite" className="card card-plain self-start lg:sticky lg:top-6">
        <p className="kicker mb-3 !text-ink">Ответ</p>
        {state === "idle" && <p className="text-[14px] leading-relaxed text-ink-3">Здесь появится ответ: жаловались ли на этот номер и сколько человек.</p>}
        {state === "waiting" && <p className="kicker">Ищем в базе…</p>}
        {state === "done" && error && <p className="text-[14px] leading-relaxed text-ink-2">{error}</p>}
        {state === "done" && items.map((it) => (
          <div key={it.value} className="mb-6">
            <p className="num text-[18px]">{it.value} <span className="fine">{KIND[it.kind]}</span></p>
            {it.found ? (
              <>
                <div className="py-3">
                  <span className={`stamp stamp-in text-[18px] ${it.risk >= 45 ? "text-signal" : "text-warn"}`}>
                    {it.risk >= 45 ? "Не переводите" : "Будьте осторожны"}
                  </span>
                </div>
                <p className="mt-2 font-serif text-[20px] font-bold leading-snug">
                  На него {it.reporters === 1 ? "пожаловался" : "пожаловались"} {people(it.reporters)}
                </p>
                <dl className="mt-3 text-[14px]">
                  {[
                    ["Схема", CATEGORY[it.category] ?? it.category],
                    ["Оценка риска", `${it.risk} из 99`],
                    ["Первая жалоба", fmtDate(it.first_seen)],
                    ["Последняя жалоба", fmtDate(it.last_seen)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-hair py-[6px]">
                      <dt className="text-ink-2">{k}</dt>
                      <dd className="num">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
                  Не переводите деньги и не сообщайте коды. Если уже перевели — сразу звоните в свой банк по номеру на карте.
                </p>
              </>
            ) : (
              <>
                <div className="py-3">
                  <span className="stamp stamp-in text-[18px] text-ink-2">В базе нет</span>
                </div>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
                  Жалоб на него пока не было. Это <b className="text-ink">не значит, что он безопасен</b>: мошенники часто меняют
                  номера. Если вас торопят, просят предоплату или код из SMS — не переводите.
                </p>
              </>
            )}
          </div>
        ))}
      </aside>
    </div>
  );
}
