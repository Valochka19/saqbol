"use client";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import Link from "next/link";
import { useRef, useState } from "react";
import { db } from "@/lib/firebase";
import { fmtNum } from "@/lib/labels";

// Цены пилотного периода. Меняются в одном месте.
const TEAM_PER_EMPLOYEE_YEAR = 1200; // ₸ за сотрудника в год
const TEAM_MIN = 10;
const API_PER_CHECK = 3; // ₸ за проверку получателя
const API_FREE_CHECKS = 10_000; // бесплатно каждый месяц
const FEED_PER_MONTH = 250_000; // ₸ в месяц, фид номеров и сайтов

type PlanKey = "people" | "team" | "bank";

const PLANS: { key: PlanKey; name: string; price: string; unit: string; who: string; items: string[]; cta: string; tone: string }[] = [
  {
    key: "people", name: "Людям", price: "0 ₸", unit: "навсегда", who: "Каждому, у кого есть телефон",
    items: ["Проверка сообщений, скриншотов и номеров", "Определитель мошенников в приложении", "Тренажёр и именной сертификат", "Памятка для родителей"],
    cta: "Проверить сообщение", tone: "card-plain",
  },
  {
    key: "team", name: "Командам", price: `${fmtNum(TEAM_PER_EMPLOYEE_YEAR)} ₸`, unit: "за сотрудника в год", who: "Компаниям, вузам, колледжам",
    items: ["Ссылка-приглашение для сотрудников", "Тренажёр и разговоры с «мошенником»", "Сертификат каждому, кто прошёл", "Отчёт руководителю: кто прошёл и на чём ошибаются", "Новые схемы каждый месяц"],
    cta: "Оставить заявку", tone: "card-ink",
  },
  {
    key: "bank", name: "Банкам и финтеху", price: `${API_PER_CHECK} ₸`, unit: "за проверку получателя", who: "Банкам, МФО, маркетплейсам",
    items: [`Первые ${fmtNum(API_FREE_CHECKS)} проверок в месяц — бесплатно`, `База номеров и сайтов мошенников — ${fmtNum(FEED_PER_MONTH)} ₸ в месяц`, "Оценка риска и число независимых жалоб", "Обучение ваших клиентов под вашим брендом", "Пилот на 3 месяца без оплаты"],
    cta: "Запросить пилот", tone: "card-plain",
  },
];

export default function Pricing() {
  const [mode, setMode] = useState<"team" | "bank">("team");
  const [employees, setEmployees] = useState(50);
  const [transfers, setTransfers] = useState(200_000);
  const [withFeed, setWithFeed] = useState(true);

  const [plan, setPlan] = useState<PlanKey>("team");
  const [org, setOrg] = useState("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState<"idle" | "sending" | "done" | "error">("idle");
  const form = useRef<HTMLElement>(null);

  const teamSeats = Math.max(TEAM_MIN, employees || 0);
  const teamYear = teamSeats * TEAM_PER_EMPLOYEE_YEAR;
  const paidChecks = Math.max(0, (transfers || 0) - API_FREE_CHECKS);
  const bankMonth = paidChecks * API_PER_CHECK + (withFeed ? FEED_PER_MONTH : 0);

  function choose(key: PlanKey) {
    setPlan(key);
    setSent("idle");
    form.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submit() {
    if (org.trim().length < 2 || contact.trim().length < 5 || sent === "sending") return;
    setSent("sending");
    try {
      await addDoc(collection(db, "leads"), {
        plan, org: org.trim().slice(0, 80), contact: contact.trim().slice(0, 80), note: note.trim().slice(0, 400), created_at: serverTimestamp(),
      });
      setSent("done");
    } catch {
      setSent("error");
    }
  }

  return (
    <div className="space-y-12">
      <header className="max-w-[820px]">
        <h1 className="font-serif text-[28px] font-bold leading-[1.08] sm:text-[48px]">Людям — бесплатно. Платят те, кто теряет деньги из-за мошенников</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-2 sm:text-[17px]">
          Человек не станет платить за защиту, пока его не обманули. А банк и работодатель теряют на мошенниках каждый
          месяц — им SaqBol экономит деньги.
        </p>
      </header>

      <section className="grid gap-5 lg:grid-cols-3">
        {PLANS.map((p) => {
          const dark = p.tone === "card-ink";
          return (
            <div key={p.key} className={`card ${p.tone} flex flex-col`}>
              <p className={`kicker ${dark ? "!text-hair" : ""}`}>{p.who}</p>
              <p className="mt-1 font-serif text-[26px] font-bold leading-tight">{p.name}</p>
              <p className="num mt-4 text-[40px] font-medium leading-none">{p.price}</p>
              <p className={`mt-1 text-[14px] ${dark ? "opacity-75" : "text-ink-2"}`}>{p.unit}</p>
              <ul className="mt-5 flex-1 space-y-2 text-[15px] leading-snug">
                {p.items.map((it) => (
                  <li key={it} className="flex gap-2">
                    <span className={dark ? "text-signal" : "text-ok"}>✓</span>
                    {it}
                  </li>
                ))}
              </ul>
              {p.key === "people" ? (
                <Link href="/" className="btn btn-ghost btn-block mt-6">{p.cta}</Link>
              ) : (
                <button onClick={() => choose(p.key)} className={`btn btn-block mt-6 ${dark ? "btn-primary" : "btn-ink"}`}>{p.cta}</button>
              )}
            </div>
          );
        })}
      </section>

      <section className="card card-plain">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="font-serif text-[24px] font-bold">Сколько это будет стоить</p>
          <div className="seg" role="tablist" aria-label="Кто считает">
            <button role="tab" aria-selected={mode === "team"} onClick={() => setMode("team")}>Компания</button>
            <button role="tab" aria-selected={mode === "bank"} onClick={() => setMode("bank")}>Банк</button>
          </div>
        </div>

        {mode === "team" ? (
          <div className="mt-6 grid gap-8 lg:grid-cols-2">
            <div>
              <label htmlFor="emp" className="text-[15px] font-medium">Сколько у вас сотрудников</label>
              <input id="emp" type="number" min={1} max={100000} value={employees || ""} onChange={(e) => setEmployees(Number(e.target.value))} className="field num mt-2 px-4 py-3 text-[22px]" />
              <input type="range" min={10} max={1000} step={10} value={Math.min(1000, teamSeats)} onChange={(e) => setEmployees(Number(e.target.value))} className="mt-4 w-full accent-[var(--signal)]" aria-label="Число сотрудников" />
              {employees < TEAM_MIN && <p className="mt-2 text-[13px] text-ink-3">Минимальный пакет — {TEAM_MIN} сотрудников.</p>}
            </div>
            <div>
              <p className="text-[14px] text-ink-2">В год</p>
              <p className="num text-[44px] font-medium leading-none sm:text-[56px]">{fmtNum(teamYear)} ₸</p>
              <p className="mt-3 text-[15px] text-ink-2">
                Это <b className="text-ink">{fmtNum(Math.round(teamYear / 12))} ₸ в месяц</b>, или {fmtNum(Math.round(TEAM_PER_EMPLOYEE_YEAR / 12))} ₸ на человека в месяц.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-6 grid gap-8 lg:grid-cols-2">
            <div>
              <label htmlFor="tr" className="text-[15px] font-medium">Переводов по номеру в месяц</label>
              <input id="tr" type="number" min={0} step={10000} value={transfers || ""} onChange={(e) => setTransfers(Number(e.target.value))} className="field num mt-2 px-4 py-3 text-[22px]" />
              <input type="range" min={0} max={5_000_000} step={50_000} value={Math.min(5_000_000, transfers || 0)} onChange={(e) => setTransfers(Number(e.target.value))} className="mt-4 w-full accent-[var(--signal)]" aria-label="Переводов в месяц" />
              <label className="mt-4 flex items-center gap-3 text-[15px]">
                <input type="checkbox" checked={withFeed} onChange={(e) => setWithFeed(e.target.checked)} className="h-5 w-5 accent-[var(--signal)]" />
                Подключить базу номеров и сайтов мошенников
              </label>
            </div>
            <div>
              <p className="text-[14px] text-ink-2">В месяц</p>
              <p className="num text-[44px] font-medium leading-none sm:text-[56px]">{fmtNum(bankMonth)} ₸</p>
              <dl className="mt-3 space-y-1 text-[14px] text-ink-2">
                <div className="flex justify-between border-b border-hair py-1"><dt>Бесплатные проверки</dt><dd className="num">{fmtNum(Math.min(transfers || 0, API_FREE_CHECKS))}</dd></div>
                <div className="flex justify-between border-b border-hair py-1"><dt>Платные проверки × {API_PER_CHECK} ₸</dt><dd className="num">{fmtNum(paidChecks * API_PER_CHECK)} ₸</dd></div>
                <div className="flex justify-between border-b border-hair py-1"><dt>База номеров</dt><dd className="num">{withFeed ? `${fmtNum(FEED_PER_MONTH)} ₸` : "—"}</dd></div>
              </dl>
            </div>
          </div>
        )}
      </section>

      <section ref={form} className="grid scroll-mt-4 gap-8 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <h2 className="font-serif text-[26px] font-bold leading-tight sm:text-[32px]">Оставьте заявку — ответим в течение дня</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
            Расскажем, как подключиться, и покажем сервис на ваших примерах. Для банков первые три месяца — пилот без оплаты.
          </p>
        </div>
        <div className="card">
          {sent === "done" ? (
            <div className="py-6 text-center">
              <span className="stamp stamp-in text-[18px] text-ok">Заявка принята</span>
              <p className="mt-5 text-[16px]">Спасибо! Мы напишем вам по контакту <b>{contact}</b>.</p>
              <button onClick={() => { setSent("idle"); setOrg(""); setContact(""); setNote(""); }} className="btn btn-ghost btn-sm mt-5">Отправить ещё одну</button>
            </div>
          ) : (
            <>
              <p className="text-[14px] font-medium">Что вас интересует</p>
              <div className="seg mt-2 w-full" role="tablist" aria-label="Тариф">
                <button role="tab" aria-selected={plan === "team"} onClick={() => setPlan("team")}>Обучение команды</button>
                <button role="tab" aria-selected={plan === "bank"} onClick={() => setPlan("bank")}>Банку и финтеху</button>
              </div>
              <label htmlFor="org" className="mt-4 block text-[14px] font-medium">Организация</label>
              <input id="org" value={org} onChange={(e) => setOrg(e.target.value)} maxLength={80} autoComplete="organization" placeholder="Название компании или банка" className="field mt-1 px-4 py-3 text-[16px]" />
              <label htmlFor="contact" className="mt-4 block text-[14px] font-medium">Как с вами связаться</label>
              <input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={80} placeholder="Телефон, почта или Telegram" className="field mt-1 px-4 py-3 text-[16px]" />
              <label htmlFor="note" className="mt-4 block text-[14px] font-medium">Комментарий <span className="font-normal text-ink-3">— необязательно</span></label>
              <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} rows={3} placeholder={plan === "team" ? "Сколько сотрудников, что важно" : "Сколько переводов в месяц, что хотите проверить на пилоте"} className="field mt-1 resize-y px-4 py-3 text-[16px]" />
              <button onClick={submit} disabled={org.trim().length < 2 || contact.trim().length < 5 || sent === "sending"} className="btn btn-primary btn-block mt-5">
                {sent === "sending" ? "Отправляем…" : plan === "bank" ? "Запросить пилот" : "Оставить заявку"}
              </button>
              {sent === "error" && <p className="mt-3 text-[14px] text-signal">Не получилось отправить. Проверьте интернет и попробуйте ещё раз.</p>}
            </>
          )}
        </div>
      </section>

      <p className="fine">Цены пилотного периода. Это прототип: приём оплаты не подключён, заявки принимаются и обрабатываются вручную.</p>
    </div>
  );
}
