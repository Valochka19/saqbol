"use client";

import { DailyChart, Figures, IndicatorTable, SchemeBars, SectionHead, Tape } from "@/components/Data";
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
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">Центр мониторинга · для антифрод-службы</p>
          <h1 className="mt-2 font-serif text-[34px] font-bold leading-[1.08] sm:text-[44px]">Что рассылают прямо сейчас</h1>
        </div>
        <p className="fine">Обновлено в {fmtTime(summary.updated_at)} · страница обновляется сама</p>
      </header>

      <section>
        <div className="rule" />
        <Figures totals={summary.totals} />
        <Tape feed={summary.feed} />
      </section>

      <section className="grid gap-x-10 gap-y-10 lg:grid-cols-[1.35fr_1fr]">
        <div>
          <SectionHead title="Проверки и угрозы по дням" note="14 дней, время Астаны" />
          <DailyChart daily={summary.daily} />
        </div>
        <div>
          <SectionHead title="Схемы" note="доля среди выявленных угроз" />
          <SchemeBars categories={summary.categories} />
        </div>
      </section>

      <section>
        <SectionHead title="База индикаторов" note="25 с наибольшим числом заявителей · номера замаскированы" />
        <IndicatorTable rows={[...summary.top_indicators].sort((a, b) => b.risk - a.risk)} filterable />
        <p className="mt-3 max-w-[78ch] text-[13px] leading-relaxed text-ink-2">
          Риск от 1 до 99 считается по прозрачной формуле: число независимых заявителей, давность последней жалобы и тип
          схемы. Статус «на проверке» означает сигнал для аналитика, а не обвинение: подтвердить или отклонить индикатор
          может только сотрудник банка. Банк-участник получает те же данные без маскировки по API.
        </p>
      </section>

      <section className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
        <div>
          <SectionHead title="Что попадает в базу" />
          <Breakdown data={summary.kinds} labels={KIND as Record<Kind, string>} />
        </div>
        <div>
          <SectionHead title="Как присылают сообщения" />
          <Breakdown data={summary.input_types} labels={INPUT_TYPE} />
        </div>
      </section>

      {summary.has_demo_data && (
        <p className="fine">Прототип: часть записей — тестовые данные, сгенерированные для демонстрации интерфейса.</p>
      )}
    </div>
  );
}
