"use client";

import { addDoc, collection, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { SectionHead } from "@/components/Data";
import { db } from "@/lib/firebase";
import { CATEGORY, KIND, VERDICT } from "@/lib/labels";
import { shrinkImage } from "@/lib/shrink";
import type { Kind, Verdict } from "@/lib/summary";

interface Result {
  error?: "busy" | "failed" | "not_a_message";
  verdict: Verdict;
  confidence: number;
  scheme: string;
  category: string;
  flags: string[];
  advice: string;
  source: string;
  known: { kind: Kind; value: string; reporters: number }[];
}

const EXAMPLES = [
  "Здравствуйте, вас беспокоит служба безопасности банка. На ваше имя оформляют кредит. Чтобы отменить заявку, назовите код из SMS.",
  "Привет! Проголосуй пожалуйста за мою племянницу в конкурсе рисунков, там нужно войти через телеграм: https://t-me-vote.top/konkurs",
  "Kaspi.kz: Покупка 4 500 ₸ в Magnum. Доступно 128 340 ₸",
];

const STAGES = ["Отправляем", "Ищем известные номера и сайты мошенников", "Разбираем смысл сообщения"];

export function CheckWidget() {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "waiting" | "done" | "timeout">("idle");
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const [shot, setShot] = useState<{ base64: string; preview: string } | null>(null);
  const [shotError, setShotError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  async function attach(file: Blob | null | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    setShotError(null);
    try {
      setShot(await shrinkImage(file));
      setResult(null);
      setState("idle");
    } catch {
      setShotError("Не получилось прочитать картинку. Попробуйте другой скриншот.");
    }
  }

  useEffect(() => () => stop.current?.(), []);

  async function submit() {
    const body = text.trim();
    if ((!body && !shot) || state === "waiting") return;
    setState("waiting");
    setStage(0);
    setResult(null);
    stop.current?.();

    const payload = shot ? { image: shot.base64 } : { text: body.slice(0, 2000) };
    const ref = await addDoc(collection(db, "web_requests"), { ...payload, created_at: serverTimestamp() });
    const stages = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 1300);
    const timer = setTimeout(() => finish("timeout"), 40_000);
    const unsub = onSnapshot(doc(db, "web_results", ref.id), (snap) => {
      if (!snap.exists()) return;
      setResult(snap.data() as Result);
      finish("done");
    });
    function finish(next: "done" | "timeout") {
      clearInterval(stages);
      clearTimeout(timer);
      unsub();
      setState(next);
    }
    stop.current = () => finish("timeout");
  }

  const v = result && !result.error ? VERDICT[result.verdict] : null;

  return (
    <div className="grid gap-x-10 gap-y-10 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <h1 className="font-serif text-[28px] font-bold leading-[1.08] sm:text-[48px]">
          Пришло странное сообщение? Проверьте, не мошенники ли это
        </h1>
        <p className="mt-2 max-w-[58ch] text-[15px] leading-snug text-ink-2 sm:mt-3 sm:text-[16px] sm:leading-relaxed">
          Вставьте текст SMS, сообщения из WhatsApp или Telegram, письма или ссылку — на русском или казахском. Через
          несколько секунд получите ответ с объяснением. Текст мы не сохраняем.
        </p>

        <label htmlFor="msg" className="kicker mt-4 block sm:mt-6">Текст сообщения</label>
        <textarea
          id="msg"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === "Enter" && submit()}
          onPaste={(e) => {
            const img = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
            if (img) { e.preventDefault(); attach(img); }
          }}
          onDrop={(e) => { e.preventDefault(); attach(e.dataTransfer.files[0]); }}
          onDragOver={(e) => e.preventDefault()}
          disabled={!!shot}
          maxLength={2000}
          rows={5}
          placeholder={shot ? "Проверим скриншот ниже" : "Например: «Ваша карта заблокирована, для разблокировки перейдите по ссылке…»"}
          className="mt-1 w-full resize-y border border-ink bg-[#fbf9f3] p-4 font-serif text-[18px] leading-[1.5] placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-signal"
        />
        <input ref={picker} type="file" accept="image/*" hidden onChange={(e) => { attach(e.target.files?.[0]); e.target.value = ""; }} />
        {shot ? (
          <div className="mt-2 flex items-center gap-3 border border-ink bg-[#fbf9f3] p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot.preview} alt="Выбранный скриншот" className="h-[72px] w-[72px] border border-hair object-cover" />
            <p className="flex-1 text-[14px] leading-snug">Скриншот выбран. Мы прочитаем текст с картинки сами.</p>
            <button onClick={() => setShot(null)} className="kicker min-h-[40px] border border-ink px-3 hover:bg-ink hover:!text-paper">Убрать</button>
          </div>
        ) : (
          <button onClick={() => picker.current?.click()} className="mt-2 w-full border border-dashed border-ink px-4 py-3 text-left text-[14px] leading-snug hover:bg-paper-2">
            <span className="font-medium">Или загрузите скриншот</span>
            <span className="text-ink-2"> — переписки, SMS или чека перевода. Можно вставить из буфера обмена.</span>
          </button>
        )}
        {shotError && <p className="mt-2 text-[14px] text-signal">{shotError}</p>}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <span className="fine num">{text.length} / 2000<span className="hidden sm:inline"> · Ctrl + Enter</span></span>
          <button
            onClick={submit}
            disabled={(!text.trim() && !shot) || state === "waiting"}
            className="bg-signal px-6 py-3 font-mono text-[13px] uppercase tracking-[0.1em] text-white hover:bg-ink disabled:opacity-40"
          >
            {state === "waiting" ? "Проверяем…" : "Проверить"}
          </button>
        </div>

        <div className="mt-5">
          <p className="kicker">Нет сообщения под рукой? Нажмите на пример</p>
          <ul className="mt-2 divide-y divide-hair border-y border-hair">
            {EXAMPLES.map((ex) => (
              <li key={ex}>
                <button onClick={() => setText(ex)} className="w-full py-2 text-left text-[14px] leading-snug text-ink-2 hover:text-ink">
                  {ex}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <aside aria-live="polite">
        <SectionHead title="Ответ" />

        {state === "idle" && <p className="text-[14px] leading-relaxed text-ink-3">Здесь появится ответ: мошенники это или нет, по каким признакам это видно и что делать.</p>}

        {state === "waiting" && (
          <ol className="space-y-2 text-[14px]">
            {STAGES.map((s, i) => (
              <li key={s} className={`flex gap-3 ${i > stage ? "text-ink-3" : ""}`}>
                <span className="num">{i < stage ? "✓" : i === stage ? "›" : "·"}</span>
                {s}
              </li>
            ))}
          </ol>
        )}

        {state === "timeout" && (
          <p className="text-[14px] leading-relaxed text-ink-2">
            Сервис проверки не ответил за 40 секунд. Скорее всего, он сейчас выключен. Попробуйте позже или напишите
            боту <a className="underline" href="https://t.me/saqbolai_bot">@saqbolai_bot</a>.
          </p>
        )}

        {state === "done" && result?.error && (
          <p className="text-[14px] leading-relaxed text-ink-2">
            {result.error === "busy" ? "Слишком много проверок одновременно. Повторите через минуту."
              : result.error === "not_a_message" ? "Не вижу на картинке сообщения. Загрузите скриншот переписки, SMS или чека."
              : "Проверка не удалась. Попробуйте ещё раз."}
          </p>
        )}

        {state === "done" && result && v && (
          <div>
            <div className="py-3">
              <span className={`stamp stamp-in text-[20px] ${v.tone}`}>{v.label}</span>
            </div>
            <p className="num mt-3 text-[13px] text-ink-2">Уверенность {result.confidence}%</p>
            <p className="mt-3 font-serif text-[22px] font-bold leading-snug">{result.scheme}</p>
            {result.category !== "none" && <p className="kicker mt-1">{CATEGORY[result.category] ?? result.category}</p>}

            {result.flags.length > 0 && (
              <>
                <p className="kicker mt-5">Признаки</p>
                <ul className="mt-1 space-y-1 text-[15px] leading-snug">
                  {result.flags.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="num text-ink-3">—</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <p className="kicker mt-5">Что делать</p>
            <p className="mt-1 text-[15px] leading-snug">{result.advice}</p>

            {result.known.length > 0 && (
              <div className="mt-5 border border-signal p-3">
                <p className="kicker !text-signal">На это уже жаловались другие люди</p>
                <ul className="mt-1 text-[14px]">
                  {result.known.map((k) => (
                    <li key={k.value} className="flex justify-between gap-3 py-[2px]">
                      <span><span className="num">{k.value}</span> <span className="fine">{KIND[k.kind]}</span></span>
                      <span className="num">{k.reporters} чел.</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.source === "rules" && <p className="fine mt-4">Нейросеть сейчас недоступна — ответ дан по упрощённой проверке.</p>}
          </div>
        )}
      </aside>
    </div>
  );
}
