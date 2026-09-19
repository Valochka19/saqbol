"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { issueNumber } from "@/lib/labels";

// Слева — то, что нужно любому человеку. Справа, мельче — разделы для специалистов.
const NAV = [
  { href: "/", label: "Проверить сообщение" },
  { href: "/trainer/", label: "Тренажёр" },
  { href: "/bulletin/", label: "Памятка родителям" },
  { href: "/method/", label: "Как это работает" },
];
const PRO = [
  { href: "/monitor/", label: "Мониторинг" },
  { href: "/demo-bank/", label: "Демо-банк" },
  { href: "/banks/", label: "Банкам" },
];

export function Masthead() {
  const path = usePathname();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const date = now?.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Almaty" });
  const time = now?.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" });

  return (
    <header className="pt-5">
      <div className="kicker flex flex-wrap items-center justify-between gap-x-6 gap-y-1 pb-2">
        <span>Выпуск № {now ? issueNumber(now) : "···"}</span>
        <span className="hidden sm:inline">Проверка сообщений на мошенничество</span>
        <span>
          {date ?? "···"} · {time ?? "··:··"} · Астана
        </span>
      </div>
      <div className="rule-heavy" />
      <div className="flex items-end justify-between gap-4 py-3">
        <Link href="/" className="font-serif text-[44px] font-bold leading-none tracking-tight sm:text-[64px]">
          SaqBol
        </Link>
        <p className="max-w-[300px] pb-1 text-right text-[13px] leading-snug text-ink-2">
          <span className="font-serif italic">сақ бол</span> — «будь осторожен».
          <br />
          Вместе против мошенников в Казахстане
        </p>
      </div>
      <div className="rule" />
      <nav className="flex items-center gap-x-1 overflow-x-auto py-1 text-[13px]" aria-label="Разделы">
        {[...NAV, null, ...PRO].map((item) => {
          if (!item) return <span key="gap" className="fine ml-auto hidden whitespace-nowrap pr-2 sm:inline">специалистам:</span>;
          const pro = PRO.includes(item);
          const active = item.href === "/" ? path === "/" : path.startsWith(item.href.replace(/\/$/, ""));
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap px-3 py-2 font-mono uppercase tracking-[0.1em] transition-colors ${
                active ? "bg-ink text-paper" : pro ? "text-ink-2 hover:bg-paper-2" : "text-ink hover:bg-paper-2"
              } ${pro ? "text-[12px]" : ""}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="rule-double" />
    </header>
  );
}
