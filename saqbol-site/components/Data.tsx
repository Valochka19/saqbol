"use client";

import { useState } from "react";
import { CATEGORY, fmtDate, fmtNum, fmtTime, INPUT_TYPE, KIND, VERDICT } from "@/lib/labels";
import type { FeedRow, IndicatorRow, Kind, Summary } from "@/lib/summary";

/** Заголовок раздела: моноширинная подпись над жирной линейкой. */
export function SectionHead({ title, note }: { title: string; note?: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="rule-heavy" />
      <div className="flex items-baseline justify-between gap-4 pt-2">
        <h2 className="kicker !text-ink">{title}</h2>
        {note && <span className="fine">{note}</span>}
      </div>
    </div>
  );
}

/** Четыре главные цифры сводки. */
export function Figures({ totals }: { totals: Summary["totals"] }) {
  const share = totals.checks ? Math.round((totals.flagged / totals.checks) * 100) : 0;
  const items = [
    { label: "Сообщений проверено", value: totals.checks, note: "за всё время" },
    { label: "Оказались обманом", value: totals.flagged, note: `${share}% от проверенных`, signal: true },
    { label: "Номеров и сайтов в базе", value: totals.indicators, note: "телефоны, карты, сайты, аккаунты" },
    { label: "Жаловались несколько человек", value: totals.repeat, note: "двое и больше — это уже рассылка" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className={`card ${it.signal ? "card-ink" : "card-plain"}`}>
          <dd className="num text-[36px] font-medium leading-none sm:text-[44px]">{fmtNum(it.value)}</dd>
          <dt className="mt-2 text-[14px] font-medium leading-snug">{it.label}</dt>
          <dd className={`mt-1 text-[12px] ${it.signal ? "opacity-70" : "text-ink-3"}`}>{it.note}</dd>
        </div>
      ))}
    </dl>
  );
}

function feedLine(f: FeedRow): string {
  const v = VERDICT[f.verdict];
  const what = f.verdict === "safe" ? "обычное сообщение" : `${v.short}: ${(CATEGORY[f.category] ?? f.category).toLowerCase()}`;
  const via = INPUT_TYPE[f.input_type] ?? f.input_type;
  return `${fmtTime(f.at)}  ${what} · ${via}`;
}

/** Телетайпная лента последних событий. */
export function Tape({ feed }: { feed: FeedRow[] }) {
  if (!feed.length) return null;
  const line = feed.map(feedLine);
  return (
    <div className="flex items-stretch overflow-hidden rounded-[12px] border-[2.5px] border-ink bg-[#fbf9f3] text-[13px]" aria-label="Лента последних проверок">
      <div className="kicker flex shrink-0 items-center bg-ink px-3 !text-paper">Последние проверки</div>
      <div className="overflow-hidden whitespace-nowrap py-2">
        <div className="tape inline-block">
          {[0, 1].map((copy) => (
            <span key={copy} aria-hidden={copy === 1}>
              {line.map((l, i) => (
                <span key={i} className="num px-6">
                  {l}
                  <span className="pl-12 text-ink-3">///</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Схемы: горизонтальные полосы одним цветом, значение подписано у каждой. */
export function SchemeBars({ categories, limit }: { categories: Record<string, number>; limit?: number }) {
  const all = Object.entries(categories)
    .filter(([k]) => k !== "none")
    .sort((a, b) => b[1] - a[1]);
  const rows = limit ? all.filter(([k]) => k !== "other").slice(0, limit) : all;
  const max = Math.max(1, ...rows.map(([, n]) => n));
  const total = all.reduce((s, [, n]) => s + n, 0);
  if (!rows.length) return <p className="py-6 text-[14px] text-ink-3">Угроз пока не зафиксировано.</p>;
  return (
    <ol className="space-y-[10px]">
      {rows.map(([key, n], i) => (
        <li key={key} className="grid grid-cols-[1fr_auto] items-end gap-x-3" title={`${CATEGORY[key] ?? key}: ${n} из ${total}`}>
          <div>
            <div className="flex items-baseline justify-between text-[14px]">
              <span>
                <span className="num mr-2 text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                {CATEGORY[key] ?? key}
              </span>
            </div>
            <div className="mt-1 h-[10px] bg-paper-2">
              <div className={`h-full ${i === 0 ? "bg-signal" : "bg-ink"}`} style={{ width: `${(n / max) * 100}%` }} />
            </div>
          </div>
          <span className="num w-[72px] text-right text-[14px]">
            {n} <span className="text-ink-3">· {Math.round((n / total) * 100)}%</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function RiskCell({ risk }: { risk: number }) {
  const tone = risk >= 70 ? "bg-signal text-white" : risk >= 45 ? "bg-ink text-paper" : "border border-ink text-ink";
  return <span className={`num inline-block w-[38px] py-[2px] text-center text-[13px] font-medium ${tone}`}>{risk}</span>;
}

const STATUS: Record<string, string> = { unverified: "на проверке", confirmed: "подтверждён", rejected: "отклонён" };

/** Таблица индикаторов. Номера приходят уже замаскированными. */
export function IndicatorTable({ rows, limit, filterable }: { rows: IndicatorRow[]; limit?: number; filterable?: boolean }) {
  const [kind, setKind] = useState<Kind | "all">("all");
  const shown = rows.filter((r) => kind === "all" || r.kind === kind).slice(0, limit ?? rows.length);
  const kinds: (Kind | "all")[] = ["all", "phone", "card", "domain", "telegram"];

  return (
    <div>
      {filterable && (
        <div className="mb-3 flex flex-wrap gap-1" role="group" aria-label="Тип индикатора">
          {kinds.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className="chip"
            >
              {k === "all" ? "Все" : KIND[k]}
            </button>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="kicker border-b border-ink text-left">
              <th className="py-2 pr-3 font-normal">Риск</th>
              <th className="py-2 pr-3 font-normal">Индикатор</th>
              <th className="hidden py-2 pr-3 font-normal sm:table-cell">Схема</th>
              <th className="py-2 pr-3 text-right font-normal"><span className="sm:hidden">Жалоб</span><span className="hidden sm:inline">Заявителей</span></th>
              <th className="hidden py-2 pr-3 text-right font-normal md:table-cell">Впервые</th>
              <th className="hidden py-2 text-right font-normal md:table-cell">Статус</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={`${r.kind}:${r.value}`} className="row-in border-b border-hair align-baseline">
                <td className="py-[7px] pr-3">
                  <RiskCell risk={r.risk} />
                </td>
                <td className="py-[7px] pr-3">
                  <span className="num break-all">{r.value}</span>
                  <span className="kicker ml-2 !text-ink-3">{KIND[r.kind]}</span>
                  <span className="block text-[12px] text-ink-2 sm:hidden">{CATEGORY[r.category] ?? r.category}</span>
                </td>
                <td className="hidden py-[7px] pr-3 text-ink-2 sm:table-cell">{CATEGORY[r.category] ?? r.category}</td>
                <td className="num py-[7px] pr-3 text-right">{r.reporters}</td>
                <td className="num hidden py-[7px] pr-3 text-right text-ink-2 md:table-cell">{fmtDate(r.first_seen)}</td>
                <td className="hidden py-[7px] text-right text-[12px] text-ink-2 md:table-cell">{STATUS[r.status]}</td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={6} className="py-6 text-ink-3">
                  Индикаторов этого типа пока нет.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Угрозы по дням за две недели: столбики, по наведению — точные числа. */
export function DailyChart({ daily }: { daily: Summary["daily"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...daily.map((d) => d.total));
  const W = 560, H = 170, PAD = 22, slot = (W - PAD) / daily.length;
  const ticks = [0, Math.ceil(max / 2), max];
  const y = (v: number) => H - 20 - (v / max) * (H - 40);
  const active = hover === null ? null : daily[hover];

  return (
    <figure>
      <div className="flex items-baseline justify-between text-[12px] text-ink-2">
        <span className="flex gap-4">
          <span><span className="mr-1 inline-block h-[9px] w-[9px] bg-signal" />угрозы</span>
          <span><span className="mr-1 inline-block h-[9px] w-[9px] border border-ink bg-paper-2" />все проверки</span>
        </span>
        <span className="num h-[16px]">
          {active ? `${active.date.slice(8)}.${active.date.slice(5, 7)} — угроз ${active.flagged} из ${active.total}` : ""}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label="Проверки и угрозы по дням за 14 дней">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD} x2={W} y1={y(t)} y2={y(t)} stroke="var(--hair)" strokeWidth="1" />
            <text x={PAD - 5} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--ink-3)" className="num">{t}</text>
          </g>
        ))}
        {daily.map((d, i) => {
          const x = PAD + i * slot;
          const bw = Math.min(22, slot - 8);
          const cx = x + slot / 2;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={x} y={0} width={slot} height={H} fill="transparent" />
              <rect x={cx - bw / 2} y={y(d.total)} width={bw} height={H - 20 - y(d.total)} fill="var(--paper-2)" stroke="var(--ink)" strokeWidth="1" />
              <rect x={cx - bw / 2} y={y(d.flagged)} width={bw} height={H - 20 - y(d.flagged)} fill="var(--signal)" opacity={hover === null || hover === i ? 1 : 0.45} />
              {(i % 2 === 1 || i === daily.length - 1) && (
                <text x={cx} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--ink-3)" className="num">
                  {d.date.slice(8)}.{d.date.slice(5, 7)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={PAD} x2={W} y1={H - 20} y2={H - 20} stroke="var(--ink)" strokeWidth="1" />
      </svg>
      <details className="mt-1 text-[12px] text-ink-2">
        <summary className="cursor-pointer">Таблицей</summary>
        <table className="num mt-2 w-full max-w-[320px]">
          <tbody>
            {daily.map((d) => (
              <tr key={d.date} className="border-b border-hair">
                <td className="py-[2px]">{d.date}</td>
                <td className="text-right">{d.flagged}</td>
                <td className="text-right text-ink-3">из {d.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
