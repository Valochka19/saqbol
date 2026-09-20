"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TrainerModes } from "@/components/TrainerModes";
import { ask, ASK_ERRORS } from "@/lib/ask";
import { loadProgress, saveProgress } from "@/lib/trainer";

type Scenario = "bank" | "police" | "buyer";
type Line = { role: "scammer" | "user"; text: string; technique?: string };
interface Debrief {
  score: number;
  summary: string;
  moments: { quote: string; good: boolean; comment: string }[];
  rule: string;
}
interface Turn {
  reply: string;
  technique: string;
  state: "ongoing" | "victim_lost" | "victim_won";
  debrief: Debrief | null;
}

const SCENARIOS: Record<Scenario, { title: string; who: string; brief: string; opening: string }> = {
  bank: {
    title: "Служба безопасности банка",
    who: "Звонящий",
    brief: "Вам звонят с незнакомого номера. Самая частая схема в Казахстане.",
    opening: "Здравствуйте! Вас беспокоит служба безопасности банка, старший специалист Айдар Сериков. По вашей карте зафиксирована подозрительная операция: попытка списания 187 000 тенге в городе Шымкент. Это вы совершаете перевод?",
  },
  police: {
    title: "Следователь",
    who: "Звонящий",
    brief: "Звонок в WhatsApp, на аватарке — человек в форме.",
    opening: "Добрый день. Майор Ахметов, следственное управление департамента полиции. Вы проходите по уголовному делу как потерпевший: с вашего счёта пытались перевести средства на финансирование запрещённой организации. Разговор записывается. Вам удобно говорить, рядом никого нет?",
  },
  buyer: {
    title: "Покупатель с OLX",
    who: "Покупатель",
    brief: "Вы продаёте диван на OLX. Пишет покупательница из другого города.",
    opening: "Здравствуйте! Я по вашему объявлению на OLX, вещь ещё продаётся? Я из Караганды, сама приехать не смогу, оформлю через OLX Доставку с курьером — так безопаснее для нас обоих. Вам удобно?",
  },
};

const TECHNIQUE: Record<string, string> = {
  authority: "давит авторитетом",
  urgency: "торопит",
  fear: "пугает",
  isolation: "изолирует: «никому не говорите»",
  help: "изображает заботу",
  details: "убеждает деталями",
};

const MAX_TURNS = 8;

export default function Call() {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [end, setEnd] = useState<Turn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [lines, busy, end]);

  function begin(s: Scenario) {
    setScenario(s);
    setLines([{ role: "scammer", text: SCENARIOS[s].opening, technique: "authority" }]);
    setEnd(null);
    setError(null);
    setInput("");
  }

  async function send(hangup: boolean) {
    if (!scenario || busy || end) return;
    const text = input.trim();
    if (!hangup && !text) return;
    const next: Line[] = hangup ? lines : [...lines, { role: "user", text }];
    setLines(next);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      // Первую реплику мошенника сервер знает сам, поэтому в историю её не кладём
      const history = next.slice(1).map((l) => ({ role: l.role, text: l.text.slice(0, 400) }));
      const t = await ask<Turn>({ sim: { scenario, history, hangup } }, 60_000);
      setLines([...next, { role: "scammer", text: t.reply, technique: t.technique }]);
      if (t.state !== "ongoing") {
        setEnd(t);
        const p = loadProgress();
        const won = t.state === "victim_won";
        saveProgress({ ...p, xp: p.xp + (won ? 30 : 5), callsWon: p.callsWon + (won ? 1 : 0) });
      }
    } catch (e) {
      setError(ASK_ERRORS[(e as Error).message] ?? ASK_ERRORS.failed);
    }
    setBusy(false);
  }

  const userTurns = lines.filter((l) => l.role === "user").length;
  const sc = scenario ? SCENARIOS[scenario] : null;
  const won = end?.state === "victim_won";

  return (
    <div>
      <TrainerModes active="call" />

      {!sc && (
        <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <h1 className="font-serif text-[28px] font-bold leading-[1.08] sm:text-[44px]">Вам звонит мошенник. Сможете не поддаться?</h1>
            <p className="mt-3 max-w-[58ch] text-[16px] leading-relaxed text-ink-2">
              Нейросеть сыграет мошенника — так, как они разговаривают на самом деле: торопит, пугает, давит. Ваша задача —
              не отдать ему ни кода, ни денег. В конце будет разбор: какие приёмы он применял и где вы могли попасться.
            </p>
            <p className="mt-4 border-l-[3px] border-signal pl-3 text-[14px] leading-relaxed">
              Это тренировка. <b>Не вводите настоящие коды, номера карт и пароли</b> — если по сюжету захочется что-то
              назвать, придумайте любые цифры.
            </p>
          </div>
          <div>
            <p className="kicker mb-3 !text-ink">Выберите, кто вам звонит</p>
            <ul className="space-y-3">
              {(Object.keys(SCENARIOS) as Scenario[]).map((key) => (
                <li key={key}>
                  <button onClick={() => begin(key)} className="card card-plain group w-full text-left transition-transform hover:-translate-y-[2px] hover:shadow-[5px_5px_0_var(--ink)]">
                    <span className="flex items-center justify-between gap-3 font-serif text-[20px] font-bold">
                      {SCENARIOS[key].title}
                      <span className="btn btn-primary btn-sm shrink-0">Принять звонок</span>
                    </span>
                    <span className="mt-1 block text-[14px] text-ink-2">{SCENARIOS[key].brief}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {sc && (
        <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <h1 className="font-serif text-[28px] font-bold leading-tight sm:text-[34px]">{sc.title}</h1>
              {!end && <span className="kicker shrink-0">Реплика {Math.min(userTurns + 1, MAX_TURNS)} из {MAX_TURNS}</span>}
            </div>
            {/* Стенограмма */}
            <div className="card card-plain mt-3 max-h-[52vh] overflow-y-auto !py-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[92px_1fr] gap-x-3 border-b border-hair py-3 last:border-b-0 sm:grid-cols-[120px_1fr]">
                  <span className={`kicker pt-1 ${l.role === "scammer" ? "!text-signal" : "!text-ink"}`}>{l.role === "scammer" ? sc.who : "Вы"}</span>
                  <div>
                    <p className={`text-[17px] leading-[1.45] ${l.role === "scammer" ? "font-serif" : ""}`}>{l.text}</p>
                    {end && l.role === "scammer" && l.technique && TECHNIQUE[l.technique] && (
                      <p className="fine mt-1 !text-signal">↑ {TECHNIQUE[l.technique]}</p>
                    )}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="grid grid-cols-[92px_1fr] gap-x-3 py-3 sm:grid-cols-[120px_1fr]">
                  <span className="kicker pt-1 !text-signal">{sc.who}</span>
                  <p className="kicker pt-1">говорит…</p>
                </div>
              )}
              <div ref={bottom} />
            </div>

            {!end && (
              <div className="mt-3">
                <label htmlFor="say" className="kicker">Ваш ответ</label>
                <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                  <input
                    id="say"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && send(false)}
                    maxLength={400}
                    disabled={busy}
                    autoComplete="off"
                    placeholder="Что вы ему скажете?"
                    className="field px-4 py-3 text-[16px] placeholder:text-ink-3"
                  />
                  <button onClick={() => send(false)} disabled={busy || !input.trim()} className="btn btn-primary shrink-0">
                    Ответить
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="fine">Настоящие коды и номера карт не вводите.</span>
                  <button onClick={() => send(true)} disabled={busy} className="btn btn-primary btn-sm">
                    Положить трубку
                  </button>
                </div>
              </div>
            )}
            {error && <p className="mt-3 text-[14px] text-ink-2">{error}</p>}
          </div>

          <aside aria-live="polite" className="card card-plain self-start">
            <p className="kicker mb-3 !text-ink">Разбор</p>
            {!end && (
              <p className="text-[14px] leading-relaxed text-ink-3">
                Появится, когда разговор закончится: вы положите трубку, твёрдо откажете или отдадите мошеннику то, что он
                просит. Подсказок по ходу не будет — как и в жизни.
              </p>
            )}
            {end && (
              <div>
                <div className="py-3">
                  <span className={`stamp stamp-in text-[20px] ${won ? "text-ok" : "text-signal"}`}>{won ? "Вы устояли" : "Вы поддались"}</span>
                </div>
                {end.debrief && (
                  <>
                    <p className="num mt-3 text-[44px] font-medium leading-none">
                      {end.debrief.score}
                      <span className="text-[20px] text-ink-3"> / 100</span>
                    </p>
                    <p className="mt-3 text-[15px] leading-relaxed">{end.debrief.summary}</p>
                    <ul className="mt-4 space-y-3">
                      {end.debrief.moments.map((m) => (
                        <li key={m.quote} className={`border-l-[3px] pl-3 ${m.good ? "border-ok" : "border-signal"}`}>
                          <p className="font-serif text-[16px] italic">«{m.quote}»</p>
                          <p className="text-[14px] leading-snug text-ink-2">{m.comment}</p>
                        </li>
                      ))}
                    </ul>
                    <p className="kicker mt-5">Запомните</p>
                    <p className="mt-1 font-serif text-[19px] font-bold leading-snug">{end.debrief.rule}</p>
                  </>
                )}
                <p className="fine mt-4">В стенограмме слева подписано, каким приёмом мошенник давил в каждой реплике.</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button onClick={() => begin(scenario!)} className="btn btn-primary btn-sm">Ещё раз</button>
                  <button onClick={() => setScenario(null)} className="btn btn-ghost btn-sm">Другой сценарий</button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
