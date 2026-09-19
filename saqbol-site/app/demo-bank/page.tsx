"use client";

import { useState, type ReactNode } from "react";
import { SectionHead } from "@/components/Data";
import { ask } from "@/lib/ask";
import { CATEGORY, fmtNum } from "@/lib/labels";
import type { Kind } from "@/lib/summary";

interface Item {
  kind: Kind;
  value: string;
  found: boolean;
  reporters: number;
  risk: number;
  category: string;
}
type Decision = "allow" | "warn" | "block";
type Stage = "idle" | "checking" | "decided";
type Choice = null | "cancelled" | "delayed" | "forced";
type LogLine = { kind: "out" | "in" | "note"; text: string };

// Пороги решения. Банк настраивает их под свою политику риска.
const BLOCK_FROM = 45;

const STORIES = [
  { id: "mom", title: "«Мама, я разбила телефон»", note: "Просят срочно перевести на чужой номер", recipient: "8 705 111 22 33", amount: 45000 },
  { id: "safe", title: "«Безопасный счёт»", note: "Лжесотрудник банка диктует номер", recipient: "+7 700 555 01 23", amount: 380000 },
  { id: "friend", title: "Перевод подруге за обед", note: "Обычный честный получатель", recipient: "+7 777 000 00 00", amount: 5000 },
];

function people(n: number) {
  const d = n % 10, h = n % 100;
  return `${n} ${d >= 2 && d <= 4 && (h < 12 || h > 14) ? "человека" : "человек"}`;
}

/** Корпус телефона: чёрная рамка и жёсткая тень, как вырезка, наклеенная на газетную полосу. */
function Phone({ label, caption, muted, children }: { label: string; caption: string; muted?: boolean; children: ReactNode }) {
  return (
    <figure className="mx-auto w-full max-w-[330px]">
      <figcaption className="mb-2 text-center">
        <span className={`kicker ${muted ? "" : "!text-signal"}`}>{label}</span>
        <span className="block font-serif text-[19px] font-bold leading-tight">{caption}</span>
      </figcaption>
      <div className={`h-[400px] overflow-hidden rounded-[34px] border-[9px] border-ink bg-white font-sans shadow-[7px_7px_0_var(--ink)] ${muted ? "grayscale" : ""}`}>
        <div className="flex items-center justify-between px-5 pt-4 text-[11px] text-ink-3">
          <span className="font-semibold text-ink">Demo Bank</span>
          <span>макет</span>
        </div>
        {children}
      </div>
    </figure>
  );
}

function TransferForm({ recipient, amount, busy, busyText }: { recipient: string; amount: number; busy: boolean; busyText: string }) {
  return (
    <div className="px-5 pt-5">
      <p className="text-[18px] font-semibold">Перевод по номеру</p>
      <p className="mt-4 text-[11px] text-ink-3">Кому</p>
      <p className="num mt-1 rounded-[10px] bg-[#f4f4f2] px-3 py-[10px] text-[16px]">{recipient || "—"}</p>
      <p className="mt-3 text-[11px] text-ink-3">Сумма</p>
      <p className="num mt-1 rounded-[10px] bg-[#f4f4f2] px-3 py-[10px] text-[16px]">{fmtNum(amount)} ₸</p>
      <div className={`mt-5 rounded-[12px] py-3 text-center text-[15px] font-semibold text-white ${busy ? "bg-ink-3" : "bg-ink"}`}>{busy ? busyText : "Перевести"}</div>
    </div>
  );
}

function Sent({ recipient, amount, note }: { recipient: string; amount: number; note?: string }) {
  return (
    <div className="stamp-none px-5 pt-16 text-center">
      <p className="text-[52px] leading-none text-ok">✓</p>
      <p className="mt-3 text-[19px] font-semibold">Перевод отправлен</p>
      <p className="num mt-1 text-[13px] text-ink-3">{recipient}</p>
      <p className="num mt-1 text-[22px] font-semibold">−{fmtNum(amount)} ₸</p>
      {note && <p className="mt-4 text-[12px] leading-snug text-ink-2">{note}</p>}
    </div>
  );
}

export default function DemoBank() {
  const [recipient, setRecipient] = useState(STORIES[0].recipient);
  const [amount, setAmount] = useState(STORIES[0].amount);
  const [story, setStory] = useState<string | null>(STORIES[0].id);
  const [stage, setStage] = useState<Stage>("idle");
  const [hit, setHit] = useState<Item | null>(null);
  const [decision, setDecision] = useState<Decision>("allow");
  const [choice, setChoice] = useState<Choice>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [saved, setSaved] = useState(0);

  function pick(id: string) {
    const s = STORIES.find((x) => x.id === id)!;
    setStory(id);
    setRecipient(s.recipient);
    setAmount(s.amount);
    reset();
  }

  function reset() {
    setStage("idle");
    setHit(null);
    setChoice(null);
    setLog([]);
  }

  async function transfer() {
    if (!recipient.trim() || stage === "checking") return;
    setStage("checking");
    setHit(null);
    setChoice(null);
    const t0 = performance.now();
    setLog([{ kind: "out", text: `Банк → SaqBol\nGET /v1/check?recipient=${recipient.trim()}` }]);

    let item: Item | null = null;
    let failed = false;
    try {
      const res = await ask<{ items: Item[] }>({ lookup: recipient.trim().slice(0, 120) }, 15_000);
      item = res.items.find((i) => i.found) ?? res.items[0] ?? null;
    } catch {
      failed = true;
    }
    const ms = Math.round(performance.now() - t0);
    // Если сервис не ответил, банк не останавливает платежи: защита добавляется, а не ломает переводы
    const d: Decision = failed || !item?.found ? "allow" : item.risk >= BLOCK_FROM ? "block" : "warn";

    setHit(item?.found ? item : null);
    setDecision(d);
    setLog((l) => [
      ...l,
      failed
        ? { kind: "in", text: "SaqBol не ответил за 15 с" }
        : { kind: "in", text: `SaqBol → Банк · ${ms} мс\n${JSON.stringify(item?.found ? { found: true, risk: item.risk, reporters: item.reporters, category: item.category } : { found: false })}` },
      { kind: "note", text: failed ? "Решение: пропустить — сервис недоступен, платежи не останавливаем" : d === "block" ? `Решение: ОСТАНОВИТЬ — риск ${item!.risk} ≥ ${BLOCK_FROM}` : d === "warn" ? `Решение: ПРЕДУПРЕДИТЬ — жалобы есть, риск ${item!.risk} ниже ${BLOCK_FROM}` : "Решение: пропустить — жалоб нет" },
    ]);
    setStage("decided");
  }

  function choose(c: Exclude<Choice, null>) {
    setChoice(c);
    if (c !== "forced") setSaved((s) => s + amount);
    setLog((l) => [...l, { kind: "note", text: c === "cancelled" ? "Клиент отменил перевод — деньги сохранены" : c === "delayed" ? "Перевод отложен на 1 час — «период охлаждения»" : "Клиент настоял на переводе — банк фиксирует, что предупреждал" }]);
  }

  const decided = stage === "decided";
  const stopped = decided && decision !== "allow";
  const red = decision === "block";

  return (
    <div className="space-y-7">
      <header className="max-w-[900px]">
        <p className="kicker">Защита платежа · демонстрация для банков</p>
        <h1 className="mt-1 font-serif text-[34px] font-bold leading-[1.05] sm:text-[44px]">Один перевод — две концовки</h1>
        <p className="mt-2 text-[16px] leading-snug text-ink-2">
          Деньги теряют не когда читают сообщение мошенника, а когда нажимают «Перевести». Справа банк перед отправкой
          спрашивает у SaqBol, жаловались ли на получателя.
        </p>
      </header>

      {/* Пульт: одна кнопка запускает оба телефона */}
      <section className="border-y-[3px] border-ink py-3">
        <div className="grid gap-x-8 gap-y-4 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <p className="kicker">Ситуация</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {STORIES.map((s) => (
                <button key={s.id} onClick={() => pick(s.id)} aria-pressed={story === s.id}
                  className={`border border-ink p-3 text-left ${story === s.id ? "bg-ink text-paper" : "hover:bg-paper-2"}`}>
                  <span className="block font-serif text-[16px] font-bold leading-tight">{s.title}</span>
                  <span className={`mt-1 block text-[12px] leading-snug ${story === s.id ? "opacity-80" : "text-ink-2"}`}>{s.note}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="rcp" className="kicker">Или свой получатель</label>
            <div className="mt-2 flex gap-2">
              <input id="rcp" value={recipient} onChange={(e) => { setRecipient(e.target.value); setStory(null); reset(); }} onKeyDown={(e) => e.key === "Enter" && transfer()}
                autoComplete="off" placeholder="+7 7__ ___ __ __" className="num w-full min-w-0 border border-ink bg-[#fbf9f3] px-3 py-2 text-[16px] focus:outline-none focus:ring-2 focus:ring-signal" />
              <button onClick={transfer} disabled={!recipient.trim() || stage === "checking"}
                className="shrink-0 bg-signal px-5 py-2 font-mono text-[13px] uppercase tracking-[0.1em] text-white hover:bg-ink disabled:opacity-40">
                {stage === "checking" ? "Идёт…" : "Перевести"}
              </button>
            </div>
            <p className="fine mt-2">Кнопка запускает перевод сразу на обоих телефонах.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-x-6 gap-y-10 md:grid-cols-2">
        <Phone label="Сегодня" caption="Банк без SaqBol" muted>
          {stage === "idle" ? <TransferForm recipient={recipient} amount={amount} busy={false} busyText="" /> : <Sent recipient={recipient} amount={amount} />}
        </Phone>

        <Phone label="С защитой" caption="Тот же банк + SaqBol">
          {!decided && <TransferForm recipient={recipient} amount={amount} busy={stage === "checking"} busyText="Проверяем получателя…" />}

          {decided && decision === "allow" && <Sent recipient={recipient} amount={amount} note="Получатель проверен, жалоб нет. Клиент задержки не заметил." />}

          {stopped && hit && !choice && (
            <div className={`mt-3 h-full px-5 pt-5 text-white ${red ? "bg-signal" : "bg-[#9a6a00]"}`}>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em]">{red ? "Перевод остановлен" : "Проверьте получателя"}</p>
              <p className="mt-2 text-[20px] font-semibold leading-tight">На этого получателя {hit.reporters === 1 ? "пожаловался" : "пожаловались"} {people(hit.reporters)}</p>
              <p className="mt-2 text-[13px] leading-snug opacity-95">
                Схема: {(CATEGORY[hit.category] ?? "мошенничество").toLowerCase()}. Если вас торопят или деньги просит знакомый в переписке — это мошенники.
              </p>
              <button onClick={() => choose("cancelled")} className="mt-4 w-full rounded-[12px] bg-white py-[10px] text-[15px] font-semibold text-ink">Отменить перевод</button>
              <button onClick={() => choose("delayed")} className="mt-2 w-full rounded-[12px] border border-white/70 py-[10px] text-[14px] font-medium">Отложить на 1 час</button>
              <button onClick={() => choose("forced")} className="mt-3 w-full text-[12px] underline underline-offset-4 opacity-90">Всё равно перевести</button>
            </div>
          )}

          {stopped && choice === "forced" && <Sent recipient={recipient} amount={amount} note="Клиент настоял. Банк предупреждал — это зафиксировано." />}
          {stopped && choice && choice !== "forced" && (
            <div className="px-5 pt-16 text-center">
              <p className="text-[48px] leading-none">{choice === "cancelled" ? "✕" : "⏱"}</p>
              <p className="mt-3 text-[19px] font-semibold">{choice === "cancelled" ? "Перевод отменён" : "Отложен на 1 час"}</p>
              <p className="num mt-2 text-[22px] font-semibold text-ok">{fmtNum(amount)} ₸ остались у клиента</p>
              {choice === "delayed" && <p className="mt-3 text-[12px] leading-snug text-ink-2">За час давление мошенника спадает, и человек успевает посоветоваться с близкими.</p>}
            </div>
          )}
        </Phone>
      </section>

      {/* Развязка: газетная строка под телефонами */}
      <section aria-live="polite">
        <div className="rule-double" />
        <div className="grid gap-x-10 gap-y-4 py-4 lg:grid-cols-[1.6fr_1fr]">
          <p className="font-serif text-[24px] font-bold leading-snug sm:text-[30px]">
            {!decided && "Нажмите «Перевести» и сравните, чем закончится один и тот же перевод."}
            {decided && decision === "allow" && "Честному получателю защита не мешает: оба перевода прошли одинаково."}
            {stopped && !choice && "Слева деньги уже ушли мошеннику, и вернуть их почти невозможно. Справа у клиента ещё есть выбор."}
            {stopped && choice === "forced" && "Клиент настоял на своём — но банк сделал всё, что мог, и это зафиксировано."}
            {stopped && choice && choice !== "forced" && <>Слева клиент потерял {fmtNum(amount)} ₸. Справа — не потерял ничего.</>}
          </p>
          <div className="lg:border-l lg:border-hair lg:pl-8">
            <p className="kicker">Сохранено за эту демонстрацию</p>
            <p className="num mt-1 text-[44px] font-medium leading-none text-ok">{fmtNum(saved)} ₸</p>
          </div>
        </div>
        <div className="rule" />
      </section>

      <section className="grid gap-x-10 gap-y-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <SectionHead title="Что происходит за кадром" note="обмен между банком и SaqBol" />
          {log.length === 0 ? (
            <p className="text-[14px] text-ink-3">Здесь появится запрос банка, ответ сервиса и принятое решение.</p>
          ) : (
            <ol className="space-y-2">
              {log.map((l, i) => (
                <li key={i} className={`row-in border-l-[3px] pl-3 ${l.kind === "note" ? "border-signal" : "border-ink"}`}>
                  <pre className={`whitespace-pre-wrap break-all font-mono text-[12.5px] leading-[1.5] ${l.kind === "note" ? "font-medium text-ink" : "text-ink-2"}`}>{l.text}</pre>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div>
          <SectionHead title="Три решения банка" />
          <dl className="space-y-3 text-[14px]">
            {[
              ["Пропустить", "Жалоб нет. Клиент ничего не замечает."],
              ["Предупредить", "Жалобы есть, риск невысокий. Клиент видит предупреждение и решает сам."],
              ["Остановить", `Риск от ${BLOCK_FROM}. Отмена или «период охлаждения» на час.`],
            ].map(([t, d]) => (
              <div key={t} className="grid grid-cols-[120px_1fr] gap-3 border-b border-hair pb-3">
                <dt className="font-serif text-[16px] font-bold">{t}</dt>
                <dd className="leading-snug text-ink-2">{d}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[13px] leading-relaxed text-ink-2">
            Пороги банк настраивает сам. Если SaqBol недоступен, перевод проходит как обычно: защита добавляется к
            платежам, но не может их остановить.
          </p>
        </div>
      </section>

      <p className="fine">
        Макет: деньги никуда не переводятся, это не приложение реального банка. Проверка получателя — настоящая, по живой
        базе SaqBol. В промышленной версии это серверный вызов API с ключом банка.
      </p>
    </div>
  );
}
