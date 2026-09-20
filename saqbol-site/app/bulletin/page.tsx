"use client";

import { useState } from "react";
import { issueNumber } from "@/lib/labels";
import { GOLDEN_RULES, SCHEME_GUIDE } from "@/lib/bulletin";
import { useSummary } from "@/lib/summary";

const FALLBACK = ["bank_security", "phishing", "hacked_account"];

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob(["﻿", content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export default function Bulletin() {
  const { summary } = useSummary();
  const [copied, setCopied] = useState(false);

  // Три самые частые схемы недели — из живых данных; пока данные грузятся, берём типовые
  const ranked = summary
    ? Object.entries(summary.categories)
        .filter(([k]) => k in SCHEME_GUIDE && k !== "other")
        .sort((a, b) => b[1] - a[1])
        .map(([k]) => k)
    : [];
  const top = [...ranked, ...FALLBACK.filter((k) => !ranked.includes(k))].slice(0, 3);
  const date = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const issue = issueNumber();

  const asText = () =>
    [
      `SAQBOL. ПАМЯТКА О МОШЕННИКАХ. Выпуск № ${issue}, ${date}`,
      "",
      "ТРИ ПРАВИЛА",
      ...GOLDEN_RULES.map((r, i) => `${i + 1}. ${r}`),
      "",
      "ЧТО СЕЙЧАС ДЕЛАЮТ МОШЕННИКИ",
      ...top.flatMap((k, i) => {
        const g = SCHEME_GUIDE[k];
        return ["", `${i + 1}. ${g.title.toUpperCase()}`, g.looks, `Говорят: ${g.say}`, `Что делать: ${g.do}`];
      }),
      "",
      "Кому позвонить, если сомневаюсь: ______________________",
      "",
      "Проверить сообщение: saqbol-ai-kz.web.app или Telegram-бот @saqbolai_bot",
    ].join("\n");

  const asWord = () => `<html><head><meta charset="utf-8"><title>Памятка SaqBol</title></head>
<body style="font-family:'Times New Roman',serif;font-size:15pt;line-height:1.35">
<p style="font-size:10pt;letter-spacing:1px">ВЫПУСК № ${issue} · ${date.toUpperCase()}</p>
<h1 style="font-size:30pt;margin:0;border-top:3px solid #000;border-bottom:1px solid #000;padding:6px 0">SaqBol: осторожно, мошенники</h1>
<h2 style="font-size:17pt;margin-top:16px">Три правила</h2>
<ol>${GOLDEN_RULES.map((r) => `<li style="margin-bottom:6px"><b>${r}</b></li>`).join("")}</ol>
<h2 style="font-size:17pt;border-top:1px solid #000;padding-top:10px">Что сейчас делают мошенники</h2>
${top.map((k, i) => { const g = SCHEME_GUIDE[k]; return `<h3 style="font-size:16pt;margin-bottom:2px">${i + 1}. ${g.title}</h3><p style="margin:0">${g.looks}</p><p style="margin:4px 0"><i>Говорят: ${g.say}</i></p><p style="margin:0 0 10px"><b>Что делать:</b> ${g.do}</p>`; }).join("")}
<p style="border-top:1px solid #000;padding-top:10px;font-size:16pt">Кому позвонить, если сомневаюсь: ______________________</p>
<p style="font-size:11pt">Проверить сообщение: saqbol-ai-kz.web.app · Telegram-бот @saqbolai_bot</p>
</body></html>`;

  async function copy() {
    await navigator.clipboard.writeText(asText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const btn = "btn btn-ghost btn-sm";

  return (
    <div>
      <div className="no-print mb-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <h1 className="font-serif text-[28px] font-bold leading-[1.08] sm:text-[44px]">Памятка для родителей и бабушек</h1>
          <p className="mt-3 max-w-[60ch] text-[16px] leading-relaxed text-ink-2">
            Чаще всего мошенники обманывают пожилых людей — тех, кто не пользуется ботами и сайтами. Распечатайте этот
            лист и повесьте у телефона или на холодильник. Схемы на нём обновляются сами: это три самых частых обмана
            за последние дни по данным SaqBol.
          </p>
        </div>
        <div className="flex flex-wrap content-start gap-2">
          <button onClick={() => window.print()} className="btn btn-primary btn-sm">
            Распечатать или сохранить PDF
          </button>
          <button onClick={() => download(`saqbol-pamyatka-${issue}.doc`, asWord(), "application/msword")} className={btn}>Скачать для Word</button>
          <button onClick={() => download(`saqbol-pamyatka-${issue}.txt`, asText(), "text/plain;charset=utf-8")} className={btn}>Скачать текстом</button>
          <button onClick={copy} className={btn}>{copied ? "Скопировано" : "Скопировать текст"}</button>
          <p className="fine w-full">PDF: в окне печати выберите «Сохранить как PDF». Текст удобно переслать в WhatsApp.</p>
        </div>
      </div>

      {/* Сам лист: крупный шрифт, чёрное на белом, помещается на А4 */}
      <article className="sheet mx-auto max-w-[820px] border border-ink bg-white p-6 sm:p-10">
        <p className="kicker flex justify-between"><span>Выпуск № {issue}</span><span>{date}</span></p>
        <div className="rule-heavy mt-1" />
        <p className="py-2 font-serif text-[40px] font-bold leading-none sm:text-[52px]">Осторожно, мошенники</p>
        <div className="rule" />

        <ol className="mt-5 space-y-2">
          {GOLDEN_RULES.map((r, i) => (
            <li key={r} className="grid grid-cols-[40px_1fr] items-baseline font-serif text-[21px] font-bold leading-snug sm:text-[24px]">
              <span className="num text-signal">{i + 1}</span>
              {r}
            </li>
          ))}
        </ol>

        <div className="rule-double mt-6" />
        <p className="kicker pt-2 !text-ink">Что сейчас делают мошенники</p>
        <div className="mt-3 space-y-5">
          {top.map((k) => {
            const g = SCHEME_GUIDE[k];
            return (
              <section key={k} className="break-inside-avoid">
                <h2 className="font-serif text-[24px] font-bold leading-tight">{g.title}</h2>
                <p className="mt-1 text-[18px] leading-snug">{g.looks}</p>
                <p className="mt-1 font-serif text-[18px] italic text-ink-2">Говорят: {g.say}</p>
                <p className="mt-1 border-l-[4px] border-signal pl-3 text-[18px] font-medium leading-snug">{g.do}</p>
              </section>
            );
          })}
        </div>

        <div className="rule mt-6" />
        <p className="pt-4 font-serif text-[22px] font-bold">Кому позвонить, если сомневаюсь:</p>
        <div className="mt-8 border-b-2 border-ink" />
        <p className="fine mt-4 !text-ink-2">Проверить сообщение: saqbol-ai-kz.web.app · Telegram-бот @saqbolai_bot</p>
      </article>
    </div>
  );
}
