"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SectionHead } from "@/components/Data";
import { CERT_MIN_CASES, certStats, EMPTY, loadProgress, pickShift, QUESTS, rankOf, saveProgress, xpFor, type Progress, type QuizCase } from "@/lib/trainer";

type Answer = { case: QuizCase; saidScam: boolean; right: boolean; gained: number };

export default function Trainer() {
  const [all, setAll] = useState<QuizCase[]>([]);
  const [progress, setProgress] = useState<Progress>(EMPTY);
  const [shift, setShift] = useState<QuizCase[] | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    fetch("/quiz.json").then((r) => r.json()).then(setAll);
    setProgress(loadProgress());
  }, []);

  const rank = rankOf(progress.xp);
  const current = shift?.[step];
  const last = answers[step]; // ответ на текущий кейс, если уже дан
  const finished = shift !== null && step >= shift.length;

  function start() {
    setShift(pickShift(all, progress));
    setStep(0);
    setAnswers([]);
    setStreak(0);
  }

  function answer(saidScam: boolean) {
    if (!current || last) return;
    const right = saidScam === current.scam;
    const newStreak = right ? streak + 1 : 0;
    const gained = right ? xpFor(current, newStreak) : 0;
    const next: Progress = {
      ...progress,
      xp: progress.xp + gained,
      bestStreak: Math.max(progress.bestStreak, newStreak),
      cases: { ...progress.cases, [current.id]: right },
    };
    setStreak(newStreak);
    setAnswers([...answers, { case: current, saidScam, right, gained }]);
    setProgress(next);
    saveProgress(next);
  }

  function forward() {
    if (!shift) return;
    if (step + 1 >= shift.length) {
      const next = { ...progress, shifts: progress.shifts + 1 };
      setProgress(next);
      saveProgress(next);
    }
    setStep(step + 1);
  }

  // Клавиатура: M — мошенники, O — обычное, Enter — дальше
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!current) return;
      const k = e.key.toLowerCase();
      if (!last && (k === "m" || k === "ь")) answer(true);
      else if (!last && (k === "o" || k === "щ")) answer(false);
      else if (last && e.key === "Enter") forward();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const solved = useMemo(() => all.filter((c) => progress.cases[c.id]).length, [all, progress]);

  return (
    <div className="grid gap-x-10 gap-y-10 lg:grid-cols-[1.6fr_1fr]">
      <div>
        <p className="kicker">Тренажёр</p>
        <h1 className="mt-2 font-serif text-[28px] font-bold leading-[1.08] sm:text-[44px]">Мошенник или нет?</h1>

        {!shift && (
          <div className="mt-4">
            <p className="max-w-[58ch] text-[16px] leading-relaxed text-ink-2">
              Вы — дежурный аналитик антифрод-службы. На стол ложатся сообщения, которые люди получили сегодня. По
              каждому нужно вынести решение. Половина кейсов — трудные: без ссылок, без слова «срочно», а иногда и
              настоящее сообщение банка выглядит как угроза. После ответа SaqBol покажет свой разбор.
            </p>
            <button
              onClick={start}
              disabled={!all.length}
              className="mt-6 bg-ink px-6 py-3 font-mono text-[13px] uppercase tracking-[0.1em] text-paper hover:bg-signal disabled:opacity-40"
            >
              {progress.shifts ? "Заступить на смену" : "Начать первую смену"} · 8 кейсов
            </button>

            <div className="mt-8 border border-ink p-5">
              <p className="kicker !text-signal">Новое</p>
              <p className="mt-1 font-serif text-[22px] font-bold leading-snug">Разговор с мошенником</p>
              <p className="mt-1 max-w-[56ch] text-[14px] leading-relaxed text-ink-2">
                Читать чужие сообщения легко. А если звонят вам и торопят? Нейросеть сыграет мошенника, вы — попробуете
                не поддаться. В конце — разбор приёмов, которыми на вас давили.
              </p>
              <Link href="/trainer/call/" className="mt-3 inline-block border border-ink px-5 py-2 font-mono text-[12px] uppercase tracking-[0.1em] hover:bg-ink hover:text-paper">
                Принять звонок
              </Link>
            </div>
          </div>
        )}

        {current && (
          <article className="mt-6">
            <div className="flex items-center justify-between">
              <span className="kicker">
                Кейс {step + 1} из {shift!.length}
                {current.hard && <span className="ml-3 border border-ink px-2 py-[1px] !text-ink">трудный</span>}
              </span>
              <span className="kicker">Серия: {streak}</span>
            </div>
            <div className="mt-2 flex gap-[3px]" aria-hidden>
              {shift!.map((c, i) => (
                <span key={c.id} className={`h-[5px] flex-1 ${answers[i] ? (answers[i].right ? "bg-ink" : "bg-signal") : i === step ? "bg-ink-3" : "bg-paper-2"}`} />
              ))}
            </div>

            {/* Бланк сообщения */}
            <div className="relative mt-5 border border-ink bg-[#fbf9f3] p-5 sm:p-7">
              <p className="kicker border-b border-hair pb-2">Входящее сообщение · № {String(current.id).padStart(4, "0")}</p>
              <p className="mt-4 whitespace-pre-wrap font-serif text-[19px] leading-[1.5] sm:text-[21px]">{current.text}</p>
              {last && (
                <span key={current.id} className={`stamp stamp-in absolute right-4 top-3 text-[15px] ${last.right ? "text-ok" : "text-signal"}`}>
                  {last.right ? "Верно" : "Ошибка"}
                </span>
              )}
            </div>

            {!last ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button onClick={() => answer(true)} className="border border-signal bg-signal px-4 py-4 font-mono text-[13px] uppercase tracking-[0.1em] text-white hover:bg-ink hover:border-ink">
                  Мошенники <span className="ml-2 hidden opacity-60 sm:inline">[M]</span>
                </button>
                <button onClick={() => answer(false)} className="border border-ink px-4 py-4 font-mono text-[13px] uppercase tracking-[0.1em] hover:bg-ink hover:text-paper">
                  Обычное сообщение <span className="ml-2 hidden opacity-60 sm:inline">[O]</span>
                </button>
              </div>
            ) : (
              <div className="mt-5">
                <p className="text-[15px]">
                  На самом деле: <b>{current.scam ? "мошенничество" : "обычное сообщение"}</b>.
                  {last.gained > 0 && <span className="num ml-2 text-ok">+{last.gained} очков</span>}
                </p>
                <div className="mt-3 border-l-[3px] border-ink pl-4">
                  <p className="kicker">Разбор SaqBol · {current.scheme}</p>
                  {current.flags.length > 0 && (
                    <ul className="mt-2 space-y-1 text-[15px] leading-snug">
                      {current.flags.map((f) => (
                        <li key={f} className="flex gap-2">
                          <span className="num text-ink-3">—</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-[15px] leading-snug text-ink-2">{current.advice}</p>
                </div>
                <button onClick={forward} className="mt-5 bg-ink px-6 py-3 font-mono text-[13px] uppercase tracking-[0.1em] text-paper hover:bg-signal">
                  {step + 1 >= shift!.length ? "Сдать смену" : "Следующий кейс"} <span className="ml-2 hidden opacity-60 sm:inline">[Enter]</span>
                </button>
              </div>
            )}
          </article>
        )}

        {finished && (
          <div className="mt-6">
            <div className="rule-heavy" />
            <p className="kicker pt-2">Смена сдана</p>
            <p className="num mt-2 text-[64px] font-medium leading-none">
              {answers.filter((a) => a.right).length}
              <span className="text-ink-3">/{answers.length}</span>
            </p>
            <p className="mt-2 text-[15px] text-ink-2">
              Заработано очков: <span className="num text-ink">{answers.reduce((s, a) => s + a.gained, 0)}</span>
            </p>
            {answers.some((a) => !a.right) && (
              <div className="mt-5">
                <p className="kicker">Где ошиблись</p>
                <ul className="mt-2 divide-y divide-hair border-y border-hair text-[14px]">
                  {answers.filter((a) => !a.right).map((a) => (
                    <li key={a.case.id} className="py-2">
                      <span className="text-signal">{a.case.scam ? "Пропущен скам" : "Ложная тревога"}:</span>{" "}
                      <span className="text-ink-2">{a.case.text.slice(0, 110)}…</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button onClick={start} className="mt-6 bg-ink px-6 py-3 font-mono text-[13px] uppercase tracking-[0.1em] text-paper hover:bg-signal">
              Ещё одна смена
            </button>
          </div>
        )}
      </div>

      {/* Личное дело */}
      <aside>
        <SectionHead title="Личное дело" note="хранится только в этом браузере" />
        <p className="font-serif text-[26px] font-bold leading-tight">{rank.title}</p>
        <p className="num mt-1 text-[14px] text-ink-2">
          {progress.xp} очков{rank.next && <> · до звания «{rank.next.title}» — {rank.toNext}</>}
        </p>
        <div className="mt-2 h-[8px] bg-paper-2">
          <div className="h-full bg-ink transition-[width] duration-500" style={{ width: `${rank.span * 100}%` }} />
        </div>
        <dl className="mt-4 grid grid-cols-3 border-y border-hair text-center">
          {[
            ["Смен", progress.shifts],
            ["Раскрыто", `${solved}/${all.length || "··"}`],
            ["Лучшая серия", progress.bestStreak],
          ].map(([label, value], i) => (
            <div key={label} className={`py-3 ${i ? "border-l border-hair" : ""}`}>
              <dd className="num text-[22px] font-medium">{value}</dd>
              <dt className="kicker mt-1">{label}</dt>
            </div>
          ))}
        </dl>

        <div className="mt-8 border border-ink p-4">
          <p className="kicker !text-signal">Сертификат</p>
          <p className="mt-1 font-serif text-[19px] font-bold leading-snug">
            {certStats(progress, all).eligible ? "Сертификат готов к выдаче" : "Получите именной сертификат"}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-ink-2">
            Нужно верно разобрать {CERT_MIN_CASES} ситуаций из 40 и один раз устоять в разговоре с мошенником. Сейчас: {solved} и {progress.callsWon}.
          </p>
          <Link href="/certificate/" className="mt-3 inline-block bg-ink px-4 py-2 font-mono text-[12px] uppercase tracking-[0.08em] text-paper hover:bg-signal">
            {certStats(progress, all).eligible ? "Получить" : "Подробнее"}
          </Link>
        </div>

        <div className="mt-8">
          <SectionHead title="Дела в производстве" />
          <ul className="space-y-4">
            {QUESTS.map((q) => {
              const done = q.progress(progress, all);
              const closed = done >= q.goal;
              return (
                <li key={q.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={`text-[15px] font-medium ${closed ? "line-through decoration-1" : ""}`}>{q.title}</span>
                    <span className="num shrink-0 text-[13px] text-ink-2">{closed ? "закрыто" : `${done}/${q.goal}`}</span>
                  </div>
                  <p className="text-[13px] leading-snug text-ink-2">{q.brief}</p>
                  <div className="mt-1 h-[4px] bg-paper-2">
                    <div className={`h-full ${closed ? "bg-ok" : "bg-ink"}`} style={{ width: `${Math.min(100, (done / q.goal) * 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </div>
  );
}
