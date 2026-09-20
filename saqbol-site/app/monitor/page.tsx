"use client";

import { DailyChart, Figures, IndicatorTable, SchemeBars, Tape } from "@/components/Data";
import { fmtTime, INPUT_TYPE, KIND } from "@/lib/labels";
import { useSummary, type Kind } from "@/lib/summary";

function Breakdown({ data, labels }: { data: Record<string, number>; labels: Record<string, string> }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, [, n]) => s + n, 0) || 1;
  return (
    <table className="w-full text-[14px]">
      <tbody>
        {rows.map(([k, n]) => (
          <tr key={k} className="border-b border-hair">
            <td className="py-[6px]">{labels[k] ?? k}</td>
            <td className="num py-[6px] text-right">{n}</td>
            <td className="num w-[52px] py-[6px] text-right text-ink-3">{Math.round((n / total) * 100)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Monitor() {
  const { summary, error } = useSummary();
  if (error) return <p className="py-16 text-ink-2">Мониторинг временно недоступен: {error}</p>;
  if (!summary) return <p className="kicker py-16">Получаем данные…</p>;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-[28px] font-bold leading-[1.08] sm:text-[44px]">Что рассылают прямо сейчас</h1>
          <p className="mt-2 text-[15px] text-ink-2">Экран антифрод-службы банка. Обновляется сам, как только кто-то проверил сообщение.</p>
        </div>
        <p className="chip !cursor-default">обновлено в {fmtTime(summary.updated_at)}</p>
      </header>

      <section>
        <Figures totals={summary.totals} />
        <div className="mt-4"><Tape feed={summary.feed} /></div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="card card-plain">
          <p className="mb-3 font-serif text-[20px] font-bold">Проверки и угрозы по дням</p>
          <DailyChart daily={summary.daily} />
        </div>
        <div className="card card-plain">
          <p className="mb-3 font-serif text-[20px] font-bold">Какие схемы идут чаще</p>
          <SchemeBars categories={summary.categories} limit={6} />
        </div>
      </section>

      <section className="card card-plain">
        <p className="font-serif text-[20px] font-bold">Номера и сайты мошенников</p>
        <p className="mb-4 mt-1 text-[14px] text-ink-2">Чем больше разных людей пожаловались, тем выше риск. Номера здесь скрыты — банк видит их целиком.</p>
        <IndicatorTable rows={[...summary.top_indicators].sort((a, b) => b.risk - a.risk)} filterable />
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="card card-plain">
          <p className="mb-2 font-serif text-[20px] font-bold">Что попадает в базу</p>
          <Breakdown data={summary.kinds} labels={KIND as Record<Kind, string>} />
        </div>
        <div className="card card-plain">
          <p className="mb-2 font-serif text-[20px] font-bold">Как присылают сообщения</p>
          <Breakdown data={summary.input_types} labels={INPUT_TYPE} />
        </div>
      </section>

      {summary.has_demo_data && (
        <p className="fine">Прототип: часть записей — тестовые данные, сгенерированные для демонстрации интерфейса.</p>
      )}
    </div>
  );
}
