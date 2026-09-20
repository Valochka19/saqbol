"use client";

import Link from "next/link";
import { useState } from "react";
import { SectionHead } from "@/components/Data";

type Seg = { t: string; n?: number };
interface Sample {
  id: string;
  tab: string;
  from: string;
  good: boolean;
  verdict: string;
  segs: Seg[];
  notes: { title: string; text: string }[];
}

// Разобранные сообщения: фразы с пометкой n ссылаются на пояснение с тем же номером
const SAMPLES: Sample[] = [
  {
    id: "bank",
    tab: "«Карта заблокирована»",
    from: "SMS с незнакомого номера",
    good: false,
    verdict: "Мошенничество",
    segs: [
      { t: "Уважаемый клиент! Ваша карта Kaspi Gold " },
      { t: "заблокирована из-за подозрительной активности", n: 1 },
      { t: ". Для разблокировки " },
      { t: "в течение 2 часов", n: 2 },
      { t: " перейдите по ссылке: " },
      { t: "kaspi-secure.xyz/unlock", n: 3 },
      { t: " и " },
      { t: "введите код из SMS", n: 4 },
      { t: "." },
    ],
    notes: [
      { title: "Пугают", text: "Сообщение начинается с беды. Испуганный человек не проверяет, а действует — на это и расчёт." },
      { title: "Торопят", text: "Срок «2 часа» нужен, чтобы вы не успели позвонить в банк или спросить близких." },
      { title: "Поддельный адрес", text: "Настоящий сайт — kaspi.kz. Здесь чужой домен, в который вставили слово kaspi. Это SaqBol проверяет автоматически." },
      { title: "Просят код", text: "Банк никогда не просит код из SMS. Код — это ваша подпись под переводом денег." },
    ],
  },
  {
    id: "mom",
    tab: "«Мама, это я»",
    from: "WhatsApp, незнакомый номер",
    good: false,
    verdict: "Мошенничество",
    segs: [
      { t: "Мама, это я, " },
      { t: "пишу с чужого номера, телефон разбила", n: 1 },
      { t: ". Нужно оплатить ремонт, переведи 45000 на " },
      { t: "этот каспи 8 705 111 22 33", n: 2 },
      { t: ", мастер ждёт. " },
      { t: "Позвонить не могу, микрофон не работает", n: 3 },
    ],
    notes: [
      { title: "Объясняют чужой номер", text: "В сообщении нет ни ссылок, ни слова «срочно» — правила здесь бессильны. Смысл понимает нейросеть: незнакомый номер выдаёт себя за близкого." },
      { title: "Деньги — третьему лицу", text: "Перевести просят не «дочери», а на чужую карту. Этот номер SaqBol запомнит — и предупредит следующего, кому он придёт." },
      { title: "Запрещают проверить", text: "Главный признак. Один звонок разрушил бы обман, поэтому заранее придумана причина не звонить." },
    ],
  },
  {
    id: "real",
    tab: "Настоящее сообщение банка",
    from: "SMS от Kaspi.kz",
    good: true,
    verdict: "Не похоже на обман",
    segs: [
      { t: "Kaspi.kz: " },
      { t: "Покупка 4 500 ₸ в Magnum", n: 1 },
      { t: ". Доступно 128 340 ₸. " },
      { t: "Если это не вы, позвоните 9999", n: 2 },
      { t: "." },
    ],
    notes: [
      { title: "Сообщает, а не просит", text: "Банк рассказывает, что произошло. Он не просит ничего сделать, ввести или назвать." },
      { title: "Вы звоните сами", text: "Нет ссылки и нет «мы вам перезвоним». Предлагают позвонить самому — по короткому официальному номеру." },
    ],
  },
];

const TIMELINE: [string, string, string][] = [
  ["09:12", "Первое обращение", "Айгуль из Караганды получила «Мама, переведи 45 000» и засомневалась. Проверила в SaqBol — обман. Номер 8 705 *** 22 33 попал в базу."],
  ["09:40", "Второе", "То же сообщение пришло пенсионеру в Астане. SaqBol отвечает уже увереннее: «на этот номер сегодня жаловались»."],
  ["11:05", "Третье", "Три разных человека за два часа. Оценка риска номера поднимается до 65 из 99 — это уже не случайность, а рассылка."],
  ["11:06", "Банк получает сигнал", "Номер появляется у антифрод-службы банка. Заявлений в полицию ещё нет — пострадавших тоже."],
  ["13:30", "Перевод остановлен", "Четвёртая мама не засомневалась и открыла приложение банка. Банк показал: «На этого получателя пожаловались 3 человека». 45 000 ₸ остались у неё."],
];

export default function HowItWorks() {
  const [active, setActive] = useState(SAMPLES[0].id);
  const [focus, setFocus] = useState<number | null>(null);
  const sample = SAMPLES.find((s) => s.id === active)!;
  const ink = sample.good ? "var(--ok)" : "var(--signal)";

  return (
    <div className="space-y-14">
      <header className="max-w-[860px]">
        <p className="kicker">Как это работает</p>
        <h1 className="mt-2 font-serif text-[28px] font-bold leading-[1.08] sm:text-[48px]">
          Один человек засомневался — тысяча предупреждена
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-ink-2">
          Мошенник рассылает одно и то же сообщение тысячам людей. Кто-то из них обязательно засомневается и проверит его в
          SaqBol. В этот момент мы узнаём номер телефона или карты мошенника — и предупреждаем всех остальных, включая банк,
          который может остановить перевод.
        </p>
      </header>

      {/* Анатомия обмана */}
      <section>
        <SectionHead title="Анатомия обмана" note={<><span className="sm:hidden">нажмите на подчёркнутое</span><span className="hidden sm:inline">наведите на подчёркнутое</span></>} />
        <div className="seg mb-5 !grid-flow-row sm:!grid-flow-col" role="tablist" aria-label="Пример сообщения">
          {SAMPLES.map((s) => (
            <button key={s.id} role="tab" aria-selected={active === s.id} onClick={() => { setActive(s.id); setFocus(null); }}
>
              {s.tab}
            </button>
          ))}
        </div>

        <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[1.15fr_1fr]">
          {/* Вырезка с пометками редакторской ручкой */}
          <div className="card relative !p-6 sm:!p-8" style={{ transform: "rotate(-0.4deg)" }}>
            <p className="kicker border-b border-hair pb-2">{sample.from}</p>
            <p className="mt-5 font-serif text-[21px] leading-[1.9] sm:text-[24px]">
              {sample.segs.map((seg, i) =>
                seg.n ? (
                  <mark key={i} tabIndex={0} onMouseEnter={() => setFocus(seg.n!)} onMouseLeave={() => setFocus(null)} onFocus={() => setFocus(seg.n!)} onBlur={() => setFocus(null)}
                    className="cursor-help bg-transparent text-inherit outline-none"
                    style={{ textDecoration: `underline wavy ${ink}`, textDecorationThickness: "2px", textUnderlineOffset: "6px", background: focus === seg.n ? `color-mix(in srgb, ${ink} 16%, transparent)` : undefined }}>
                    {seg.t}
                    <sup className="num ml-[2px] text-[12px] font-bold" style={{ color: ink }}>{seg.n}</sup>
                  </mark>
                ) : (
                  <span key={i}>{seg.t}</span>
                ),
              )}
            </p>
            <span key={sample.id} className="stamp stamp-in absolute -bottom-4 right-5 bg-[#fbf9f3] text-[14px]" style={{ color: ink }}>{sample.verdict}</span>
          </div>

          <ol className="space-y-4">
            {sample.notes.map((note, i) => (
              <li key={note.title} onMouseEnter={() => setFocus(i + 1)} onMouseLeave={() => setFocus(null)}
                className="grid grid-cols-[34px_1fr] gap-x-2 border-l-[3px] pl-3 transition-colors"
                style={{ borderColor: focus === i + 1 ? ink : "var(--hair)" }}>
                <span className="num text-[22px] font-bold leading-none" style={{ color: ink }}>{i + 1}</span>
                <div>
                  <p className="font-serif text-[19px] font-bold leading-tight">{note.title}</p>
                  <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{note.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <p className="mt-8 max-w-[78ch] text-[15px] leading-relaxed text-ink-2">
          SaqBol смотрит на сообщение дважды. Сначала — простые проверки, которые нельзя обмануть формулировкой: поддельный
          адрес сайта, просьба назвать код. Потом нейросеть читает смысл — так находится обман, в котором нет ни одного
          «тревожного» слова. Ответ вы получаете обычными словами: что не так и что делать.
        </p>
      </section>

      {/* Путь одного номера */}
      <section>
        <SectionHead title="Путь одного номера" note="пример одного дня" />
        <ol className="relative">
          {TIMELINE.map(([time, title, text], i) => {
            const last = i === TIMELINE.length - 1;
            return (
              <li key={time} className="grid grid-cols-[64px_22px_1fr] gap-x-3 sm:grid-cols-[84px_22px_1fr]">
                <span className="num pt-[2px] text-right text-[17px] font-medium sm:text-[20px]">{time}</span>
                <span className="relative flex justify-center">
                  <span className={`mt-[7px] h-[12px] w-[12px] shrink-0 border-2 border-ink ${last ? "bg-ok border-ok" : i === 0 ? "bg-signal border-signal" : "bg-paper"}`} />
                  {!last && <span className="absolute bottom-0 top-[22px] w-[2px] bg-ink" />}
                </span>
                <div className={last ? "pb-0" : "pb-7"}>
                  <p className={`font-serif text-[20px] font-bold leading-tight ${last ? "text-ok" : ""}`}>{title}</p>
                  <p className="mt-1 max-w-[70ch] text-[15px] leading-relaxed text-ink-2">{text}</p>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-6 max-w-[78ch] text-[15px] leading-relaxed text-ink-2">
          Сегодня банк узнаёт о счёте мошенника только после заявления пострадавшего — когда деньги уже ушли. Здесь сигнал
          приходит от тех, кто <b className="text-ink">не</b> попался. Поэтому он приходит раньше.{" "}
          <Link href="/demo-bank/" className="underline underline-offset-4 hover:text-signal">Посмотреть, как банк останавливает перевод →</Link>
        </p>
      </section>

      {/* Честно о границах */}
      <section>
        <SectionHead title="Что важно знать" />
        <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Мы не храним ваши сообщения", "Текст нужен на несколько секунд проверки. В базе остаются только номера и сайты мошенников."],
            ["Жалоба — не приговор", "Одна жалоба ничего не решает. Нужны разные люди, и каждое их сообщение должно быть признано обманом."],
            ["Один человек — один голос", "Сто жалоб с одного аккаунта считаются как одна. Накрутить номер честного человека не получится."],
            ["Система может ошибаться", "На 90 проверочных сообщениях она ошиблась один раз — приняла просьбу друга занять денег за взлом аккаунта. Поэтому совет всегда один: перезвоните сами."],
          ].map(([t, d]) => (
            <div key={t}>
              <dt className="font-serif text-[18px] font-bold leading-snug">{t}</dt>
              <dd className="mt-1 text-[14px] leading-relaxed text-ink-2">{d}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
