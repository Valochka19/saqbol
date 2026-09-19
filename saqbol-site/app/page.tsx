"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckWidget } from "@/components/CheckWidget";
import { LookupPanel } from "@/components/LookupPanel";
import { SchemeBars, SectionHead, Tape } from "@/components/Data";
import { fmtNum } from "@/lib/labels";
import { useSummary } from "@/lib/summary";

export default function Home() {
  const { summary } = useSummary();
  const [mode, setMode] = useState<"message" | "lookup">("message");

  return (
    <div className="space-y-12">
      {/* Главное действие — первым экраном. Два входа: есть сообщение или есть только номер. */}
      <section>
        <div className="mb-6 grid grid-cols-2 border border-ink text-[13px] sm:inline-grid" role="tablist" aria-label="Что проверяем">
          {([["message", "У меня сообщение"], ["lookup", "У меня номер, карта или ссылка"]] as const).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={mode === key}
              onClick={() => setMode(key)}
              className={`px-4 py-2 font-mono uppercase tracking-[0.08em] ${mode === key ? "bg-ink text-paper" : "hover:bg-paper-2"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "message" ? <CheckWidget /> : <LookupPanel />}
      </section>

      {summary && (
        <section>
          <div className="rule" />
          <dl className="grid sm:grid-cols-3">
            {[
              ["Сообщений проверено", summary.totals.checks, false],
              ["Оказались мошенническими", summary.totals.flagged, true],
              ["Номеров и сайтов мошенников в базе", summary.totals.indicators, false],
            ].map(([label, value, signal], i) => (
              <div key={label as string} className={`py-3 sm:px-5 ${i ? "sm:border-l sm:border-hair" : "sm:pl-0"}`}>
                <dd className={`num text-[44px] font-medium leading-none sm:text-[52px] ${signal ? "text-signal" : ""}`}>{fmtNum(value as number)}</dd>
                <dt className="mt-2 text-[14px] text-ink-2">{label}</dt>
              </div>
            ))}
          </dl>
          <Tape feed={summary.feed} />
        </section>
      )}

      <section className="grid gap-x-10 gap-y-10 lg:grid-cols-2">
        <div>
          <SectionHead title="Как это работает" />
          <ol className="space-y-5">
            {[
              ["Вы проверяете сообщение", "Здесь или в Telegram-боте. Ответ приходит за несколько секунд — с объяснением, по каким признакам видно обман."],
              ["Мы запоминаем мошенника", "Если это обман, номер телефона, карты или сайт из сообщения попадает в общую базу. Сам текст не сохраняется."],
              ["Следующего человека предупредят", "Когда тот же номер придёт кому-то ещё, он сразу увидит: на него уже жаловались. А банки смогут заблокировать счёт раньше, чем на него переведут деньги."],
            ].map(([title, text], i) => (
              <li key={title} className="grid grid-cols-[44px_1fr] gap-x-2">
                <span className="num text-[34px] font-medium leading-none text-signal">{i + 1}</span>
                <div>
                  <h3 className="font-serif text-[19px] font-bold leading-snug">{title}</h3>
                  <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <SectionHead title="Что рассылают мошенники сейчас" note="доля среди найденных обманов" />
          {summary ? <SchemeBars categories={summary.categories} limit={5} /> : <p className="kicker py-4">Загружаем…</p>}
          <div className="mt-6 border border-ink p-4">
            <p className="font-serif text-[19px] font-bold leading-snug">Сможете отличить мошенника сами?</p>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
              40 ситуаций по мотивам реальных схем. По каждой нужно решить: обман или обычное сообщение — и увидеть разбор.
            </p>
            <Link href="/trainer/" className="mt-3 inline-block bg-ink px-5 py-2 font-mono text-[12px] uppercase tracking-[0.1em] text-paper hover:bg-signal">
              Пройти тренажёр
            </Link>
          </div>
        </div>
      </section>

      {summary?.has_demo_data && <p className="fine">Прототип: часть цифр — тестовые данные для демонстрации.</p>}
    </div>
  );
}
