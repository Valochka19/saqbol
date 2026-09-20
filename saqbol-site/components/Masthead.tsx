"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Слева — то, что нужно любому человеку. Справа, мельче — разделы для специалистов.
export const NAV = [
  { href: "/", label: "Проверить", short: "Проверка" },
  { href: "/trainer/", label: "Тренажёр", short: "Тренажёр" },
  { href: "/bulletin/", label: "Памятка", short: "Памятка" },
  { href: "/certificate/", label: "Сертификат", short: "Сертификат" },
  { href: "/method/", label: "Как работает", short: "Как это работает" },
];
export const PRO = [
  { href: "/monitor/", label: "Мониторинг" },
  { href: "/demo-bank/", label: "Демо-банк" },
  { href: "/banks/", label: "Банкам" },
  { href: "/pricing/", label: "Тарифы" },
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

  const shortDate = now?.toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "Asia/Almaty" }).replace(".", "");

  return (
    <header className="pt-3 sm:pt-5">
      {/* Телефон: одна строка, чтобы главное действие было на первом экране. Меню — внизу, под большим пальцем. */}
      <div className="flex items-end justify-between pb-2 sm:hidden">
        <Link href="/" className="font-serif text-[30px] font-bold leading-none tracking-tight">SaqBol</Link>
        <span className="kicker pb-[3px]">{shortDate ?? "···"} · Астана</span>
      </div>

      {/* Планшет и компьютер: логотип и меню в одну строку */}
      <div className="hidden items-center gap-x-6 pb-3 sm:flex">
        <Link href="/" className="shrink-0 font-serif text-[40px] font-bold leading-none tracking-tight" title="сақ бол — «будь осторожен»">
          SaqBol
        </Link>
        <nav className="flex flex-1 flex-wrap items-center gap-1 text-[15px]" aria-label="Разделы">
          {[...NAV, null, ...PRO].map((item) => {
            if (!item) return <span key="gap" className="ml-auto" aria-hidden />;
            const pro = PRO.some((p) => p.href === item.href);
            const active = isActive(path, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-[10px] px-2.5 py-2 font-medium transition-colors ${
                  active ? "bg-ink text-paper" : pro ? "text-ink-2 hover:bg-paper-2 hover:text-ink" : "text-ink hover:bg-paper-2"
                } ${pro ? "text-[14px]" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="rule-heavy" />
    </header>
  );
}
