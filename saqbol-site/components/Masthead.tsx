"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { issueNumber } from "@/lib/labels";

// Слева — то, что нужно любому человеку. Справа, мельче — разделы для специалистов.
export const NAV = [
  { href: "/", label: "Проверить", short: "Проверка" },
  { href: "/trainer/", label: "Тренажёр", short: "Тренажёр" },
  { href: "/bulletin/", label: "Памятка", short: "Памятка" },
  { href: "/certificate/", label: "Сертификат", short: "Сертификат" },
  { href: "/method/", label: "Как это работает", short: "Как это работает" },
];
export const PRO = [
  { href: "/monitor/", label: "Мониторинг" },
  { href: "/demo-bank/", label: "Демо-банк" },
  { href: "/banks/", label: "Банкам" },
];

export function isActive(path: string, href: string) {
  return href === "/" ? path === "/" || path.startsWith("/check") : path.startsWith(href.replace(/\/$/, ""));
}

export function Masthead() {
  const path = usePathname();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const date = now?.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Almaty" });
  const shortDate = now?.toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "Asia/Almaty" }).replace(".", "");
  const time = now?.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" });

  return (
    <header className="pt-3 sm:pt-5">
      {/* Телефон: одна строка, чтобы главное действие было на первом экране. Меню — внизу, под большим пальцем. */}
      <div className="flex items-end justify-between pb-2 sm:hidden">
        <Link href="/" className="font-serif text-[30px] font-bold leading-none tracking-tight">SaqBol</Link>
        <span className="kicker pb-[3px]">{shortDate ?? "···"} · Астана</span>
      </div>

      {/* Планшет и компьютер: полная газетная шапка */}
      <div className="hidden sm:block">
        <div className="kicker flex flex-wrap items-center justify-between gap-x-6 gap-y-1 pb-2">
          <span>Выпуск № {now ? issueNumber(now) : "···"}</span>
          <span>Проверка сообщений на мошенничество</span>
          <span>
            {date ?? "···"} · {time ?? "··:··"} · Астана
          </span>
        </div>
      </div>
      <div className="rule-heavy" />
      <div className="hidden sm:block">
        <div className="flex items-end justify-between gap-4 py-3">
          <Link href="/" className="font-serif text-[64px] font-bold leading-none tracking-tight">SaqBol</Link>
          <p className="max-w-[300px] pb-1 text-right text-[13px] leading-snug text-ink-2">
            <span className="font-serif italic">сақ бол</span> — «будь осторожен».
            <br />
            Вместе против мошенников в Казахстане
          </p>
        </div>
        <div className="rule" />
        <nav className="flex flex-wrap items-center gap-x-0.5 py-1 text-[13px]" aria-label="Разделы">
          {[...NAV, null, ...PRO].map((item) => {
            if (!item) return <span key="gap" className="fine ml-auto whitespace-nowrap pr-2">специалистам:</span>;
            const pro = PRO.some((p) => p.href === item.href);
            const active = isActive(path, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap px-2.5 py-2 font-mono uppercase tracking-[0.08em] transition-colors ${
                  active ? "bg-ink text-paper" : pro ? "text-ink-2 hover:bg-paper-2" : "text-ink hover:bg-paper-2"
                } ${pro ? "text-[12px]" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="rule-double" />
      </div>
    </header>
  );
}
