"use client";

import { useEffect, useState } from "react";
import { SectionHead } from "@/components/Data";

interface Metrics {
  mode: string;
  model: string | null;
  total: number;
  tp: number;
  fn: number;
  fp: number;
  tn: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy_hard?: number;
}
interface Run {
  metrics: Metrics;
  results: { id: number; label: string; predicted: string; text: string; hard?: boolean }[];
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

const TRL: [string, string, "done" | "now" | "next"][] = [
  ["TRL 3", "Проверка идеи: правила + модель на размеченных примерах", "done"],
  ["TRL 4", "Рабочий прототип: бот, сайт, общая база, метрики на 90 сообщениях", "done"],
  ["TRL 5", "Пилот на реальных пользователях: датасет из настоящих сообщений, скриншоты и голосовые", "now"],
  ["TRL 6", "Пилот с банком-партнёром: фид по API, обратная связь аналитиков, модель в контуре банка", "next"],
  ["TRL 7", "Несколько банков в общем обмене индикаторами, интеграция с антифрод-системами", "next"],
];

export default function Method() {
  const [rules, setRules] = useState<Run | null>(null);
  const [llm, setLlm] = useState<Run | null>(null);

  useEffect(() => {
    fetch("/metrics_rules.json").then((r) => r.json()).then(setRules);
    fetch("/metrics_rules_llm.json").then((r) => r.json()).then(setLlm);
  }, []);

  const rows: [string, (m: Metrics) => string][] = [
    ["Accuracy — доля верных решений", (m) => pct(m.accuracy)],
    ["Precision — из тревог настоящих", (m) => pct(m.precision)],
    ["Recall — пойманного скама", (m) => pct(m.recall)],
    ["F1", (m) => m.f1.toFixed(3)],
    ["На трудных кейсах", (m) => (m.accuracy_hard === undefined ? "—" : pct(m.accuracy_hard))],
    ["Пропущено скама", (m) => `${m.fn} из ${m.tp + m.fn}`],
    ["Ложных тревог", (m) => `${m.fp} из ${m.fp + m.tn}`],
  ];
  const mistakes = llm?.results.filter((r) => (r.label === "scam") !== (r.predicted !== "safe")) ?? [];

  return (
    <div className="space-y-12">
      <header className="max-w-[820px]">
        <p className="kicker">Методика и результаты</p>
        <h1 className="mt-2 font-serif text-[34px] font-bold leading-[1.08] sm:text-[48px]">Как устроен SaqBol и насколько он точен</h1>
      </header>

      <section>
        <SectionHead title="Архитектура" />
        <ol className="grid gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Вход", "Telegram-бот и сайт. Текст на русском, казахском или вперемешку."],
            ["Слой 1 — правила", "Поддельные домены под Kaspi, Halyk, eGov; просьбы назвать код; «безопасный счёт»; удалённый доступ. Работает без сети, каждое срабатывание объяснимо."],
            ["Слой 2 — модель", "Языковая модель получает текст и результат правил, возвращает строго структурированное заключение: вердикт, схема, признаки, совет. Недоступна — отвечают правила."],
            ["Общая база", "Из мошеннических сообщений извлекаются телефоны, карты, домены. Хранится индикатор и число независимых заявителей, текст — нет."],
          ].map(([title, text], i) => (
            <li key={title} className={`pr-6 ${i ? "lg:border-l lg:border-hair lg:pl-6" : ""}`}>
              <span className="num text-[13px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-1 font-serif text-[19px] font-bold">{title}</h3>
              <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 max-w-[80ch] text-[14px] leading-relaxed text-ink-2">
          Страховка от ошибки модели: поддельный домен банка не может получить вердикт «чисто», что бы ни ответила
          модель. И наоборот — сообщение без тревожных признаков, но с номером, на который уже жаловались двое и более,
          поднимается до «подозрительно».
        </p>
      </section>

      <section className="grid gap-x-10 gap-y-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <SectionHead title="Метрики" note={llm ? `${llm.metrics.total} размеченных сообщений` : undefined} />
          {rules && llm ? (
            <table className="w-full text-[14px]">
              <thead>
                <tr className="kicker border-b border-ink text-left">
                  <th className="py-2 font-normal">Показатель</th>
                  <th className="py-2 text-right font-normal">Только правила</th>
                  <th className="py-2 text-right font-normal">Правила + модель</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, get]) => (
                  <tr key={label} className="border-b border-hair">
                    <td className="py-[7px]">{label}</td>
                    <td className="num py-[7px] text-right text-ink-2">{get(rules.metrics)}</td>
                    <td className="num py-[7px] text-right font-medium">{get(llm.metrics)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="kicker">Загружаем результаты прогона…</p>
          )}
          <p className="fine mt-3">Модель: {llm?.metrics.model ?? "…"} · «сработал» = вердикт «мошенничество» или «подозрительно»</p>
        </div>
        <div>
          <SectionHead title="Где система ошибается" />
          {mistakes.length ? (
            <ul className="space-y-3 text-[14px] leading-snug">
              {mistakes.map((m) => (
                <li key={m.id} className="border-l-[3px] border-signal pl-3">
                  <span className="kicker !text-signal">{m.label === "scam" ? "Пропуск" : "Ложная тревога"}</span>
                  <p className="mt-1 font-serif text-[16px]">«{m.text}»</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-ink-3">Ошибок в последнем прогоне нет.</p>
          )}
          <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
            Просьба занять денег от знакомого неотличима по тексту от взломанного аккаунта — здесь осторожность системы
            оправдана: совет «перезвоните человеку» верен в обоих случаях.
          </p>
        </div>
      </section>

      <section className="grid gap-x-10 gap-y-10 lg:grid-cols-2">
        <div>
          <SectionHead title="Датасет" />
          <ul className="space-y-2 text-[14px] leading-relaxed text-ink-2">
            <li>— 90 сообщений: 45 мошеннических и 45 обычных; русский, казахский, смешанная речь, транслит.</li>
            <li>— 30 из них намеренно трудные: скам без ссылок и тревожных слов, домены-опечатки (kaspl.kz), и наоборот — настоящие уведомления о долге, реклама займов, курьер с кодом выдачи.</li>
            <li>— Примеры составлены по типовым схемам, распространённым в Казахстане. Следующий шаг — пополнение реальными сообщениями от пользователей пилота.</li>
            <li>— Правила под датасет не подгонялись: ошибки слоя правил оставлены как есть, чтобы был виден вклад модели.</li>
          </ul>
        </div>
        <div>
          <SectionHead title="План доработки" note="уровни готовности технологии" />
          <ol>
            {TRL.map(([level, text, state]) => (
              <li key={level} className="grid grid-cols-[64px_1fr_auto] items-baseline gap-3 border-b border-hair py-[7px] text-[14px]">
                <span className="num font-medium">{level}</span>
                <span className={state === "next" ? "text-ink-2" : ""}>{text}</span>
                <span className={`kicker ${state === "now" ? "!text-signal" : state === "done" ? "!text-ok" : ""}`}>
                  {state === "done" ? "пройден" : state === "now" ? "сейчас" : "далее"}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
