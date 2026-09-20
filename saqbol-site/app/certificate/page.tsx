"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CertificateSheet, verifyUrl, type Certificate } from "@/components/CertificateSheet";
import { SectionHead } from "@/components/Data";
import { ask, ASK_ERRORS } from "@/lib/ask";
import { CERT_MIN_CALLS, CERT_MIN_CASES, certStats, EMPTY, loadProgress, type Progress, type QuizCase } from "@/lib/trainer";

const SAVED = "saqbol.certificate.v1";

interface Issued {
  id: string;
  name: string;
  score: number;
  cases: number;
  hard: number;
  calls: number;
}

export default function CertificatePage() {
  const [all, setAll] = useState<QuizCase[]>([]);
  const [progress, setProgress] = useState<Progress>(EMPTY);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cert, setCert] = useState<Certificate | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/quiz.json").then((r) => r.json()).then(setAll);
    setProgress(loadProgress());
    try {
      const raw = localStorage.getItem(SAVED);
      if (raw) {
        const c = JSON.parse(raw);
        setCert({ ...c, issuedAt: new Date(c.issuedAt) });
      }
    } catch {
      /* сертификат просто не восстановится — его можно получить заново */
    }
  }, []);

  const stats = certStats(progress, all);

  async function issue() {
    const clean = name.trim().replace(/\s+/g, " ");
    if (clean.length < 2 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await ask<Issued>({ cert: { name: clean.slice(0, 60), cases: stats.cases, hard: stats.hard, calls: stats.calls } });
      const issued: Certificate = { ...res, issuedAt: new Date() };
      setCert(issued);
      try {
        localStorage.setItem(SAVED, JSON.stringify(issued));
      } catch {
        /* приватный режим */
      }
    } catch (e) {
      const code = (e as Error).message;
      setError(code === "not_eligible" ? "Условия ещё не выполнены. Вернитесь в тренажёр." : (ASK_ERRORS[code] ?? ASK_ERRORS.failed));
    }
    setBusy(false);
  }

  const btn = "btn btn-ghost btn-sm";

  if (cert) {
    return (
      <div>
        <div className="no-print mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="kicker">Сертификат получен</p>
            <h1 className="mt-1 font-serif text-[28px] font-bold leading-[1.08] sm:text-[40px]">Поздравляем!</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => window.print()} className="btn btn-primary btn-sm">
              Распечатать или сохранить PDF
            </button>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(verifyUrl(cert.id));
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className={btn}
            >
              {copied ? "Скопировано" : "Скопировать ссылку для проверки"}
            </button>
          </div>
        </div>
        <CertificateSheet cert={cert} />
        <p className="no-print fine mt-4 text-center">
          По QR-коду или ссылке любой может убедиться, что сертификат настоящий. Улучшили результат?{" "}
          <button onClick={() => setCert(null)} className="underline underline-offset-2">Получить новый</button>
        </p>
      </div>
    );
  }

  const steps: [string, number, number, string, string][] = [
    ["Разобрать ситуации", stats.cases, CERT_MIN_CASES, `верно из 40 · нужно ${CERT_MIN_CASES}`, "/trainer/"],
    ["Устоять в разговоре с мошенником", stats.calls, CERT_MIN_CALLS, "хотя бы один раз", "/trainer/call/"],
  ];

  return (
    <div className="grid gap-x-10 gap-y-10 lg:grid-cols-[1.3fr_1fr]">
      <div>
        <p className="kicker">Сертификат финансовой безопасности</p>
        <h1 className="mt-2 font-serif text-[28px] font-bold leading-[1.08] sm:text-[44px]">Докажите, что вас не обмануть</h1>
        <p className="mt-3 max-w-[60ch] text-[16px] leading-relaxed text-ink-2">
          Пройдите тренажёр — и получите именной сертификат с оценкой вашей устойчивости к мошенникам. Это не
          официальный документ, а подтверждение, что вы дошли до конца и умеете распознавать обман. Его можно
          распечатать или отправить близким — пусть тоже попробуют.
        </p>

        <ol className="mt-6 space-y-5">
          {steps.map(([title, done, goal, note, href], i) => {
            const ok = done >= goal;
            return (
              <li key={title} className="grid grid-cols-[40px_1fr] gap-x-2">
                <span className={`num text-[30px] font-medium leading-none ${ok ? "text-ok" : "text-signal"}`}>{ok ? "✓" : i + 1}</span>
                <div>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="font-serif text-[20px] font-bold leading-snug">{title}</p>
                    <p className="num text-[14px] text-ink-2">{Math.min(done, 40)} · {note}</p>
                  </div>
                  <div className="mt-1 h-[8px] bg-paper-2">
                    <div className={`h-full ${ok ? "bg-ok" : "bg-ink"}`} style={{ width: `${Math.min(100, (done / goal) * 100)}%` }} />
                  </div>
                  {!ok && (
                    <Link href={href} className="kicker mt-2 inline-block underline underline-offset-4 hover:!text-signal">
                      Перейти →
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <aside>
        <SectionHead title="Получить сертификат" />
        {stats.eligible ? (
          <>
            <label htmlFor="who" className="kicker">Имя и фамилия — как написать в сертификате</label>
            <input
              id="who"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && issue()}
              maxLength={60}
              autoComplete="name"
              placeholder="Айгерим Сериккызы"
              className="mt-1 w-full border border-ink bg-[#fbf9f3] px-4 py-3 font-serif text-[20px] placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-signal"
            />
            <button onClick={issue} disabled={name.trim().length < 2 || busy} className="btn btn-primary btn-block mt-3">
              {busy ? "Оформляем…" : "Получить сертификат"}
            </button>
            <p className="fine mt-2">Имя и оценка сохраняются, чтобы сертификат можно было проверить по номеру.</p>
            {error && <p className="mt-3 text-[14px] text-signal">{error}</p>}
          </>
        ) : (
          <p className="text-[15px] leading-relaxed text-ink-2">
            Форма появится, когда оба условия слева будут выполнены. Прогресс хранится в этом браузере — проходите тренажёр
            на том же устройстве.
          </p>
        )}

        <div className="mt-8">
          <SectionHead title="Из чего складывается оценка" />
          <dl className="text-[14px]">
            {[
              ["Верно разобранные ситуации", "до 55"],
              ["Трудные ситуации среди них", "до 20"],
              ["Разговоры с мошенником", "до 25"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-hair py-[6px]">
                <dt className="text-ink-2">{k}</dt>
                <dd className="num">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </div>
  );
}
