"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isActive, NAV, PRO } from "./Masthead";

/** Нижняя панель для телефона — та же, что в приложении SaqBol: три главных раздела и «Ещё». */
export function MobileNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  const main = NAV.slice(0, 3);
  const more = [...NAV.slice(3), ...PRO];
  const moreActive = more.some((m) => isActive(path, m.href));
  const cell = "flex min-h-[56px] flex-1 items-center justify-center px-1 text-center font-mono text-[11px] uppercase leading-tight tracking-[0.08em]";

  return (
    <div className="no-print sm:hidden">
      {open && (
        <div className="fixed inset-0 z-40 bg-ink/40" onClick={() => setOpen(false)} aria-hidden>
          <div className="absolute inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] border-t-[3px] border-ink bg-paper px-4 pb-3 pt-2" onClick={(e) => e.stopPropagation()}>
            <ul className="divide-y divide-hair">
              {more.map((m, i) => (
                <li key={m.href}>
                  {i === NAV.length - 3 && <p className="fine pt-3">специалистам</p>}
                  <Link href={m.href} className={`flex min-h-[48px] items-center font-serif text-[19px] font-bold ${isActive(path, m.href) ? "text-signal" : ""}`}>
                    {m.label}
                  </Link>
                </li>
              ))}
              <li>
                <a href="https://t.me/saqbolai_bot" target="_blank" rel="noreferrer" className="flex min-h-[48px] items-center font-serif text-[19px] font-bold">
                  Бот в Telegram ↗
                </a>
              </li>
            </ul>
          </div>
        </div>
      )}

      <nav aria-label="Разделы" className="fixed inset-x-0 bottom-0 z-50 flex border-t-2 border-ink bg-paper pb-[env(safe-area-inset-bottom)]">
        {main.map((m) => {
          const active = !open && isActive(path, m.href);
          return (
            <Link key={m.href} href={m.href} aria-current={active ? "page" : undefined} className={`${cell} ${active ? "bg-ink text-paper" : "text-ink"}`}>
              {m.short}
            </Link>
          );
        })}
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`${cell} ${open || moreActive ? "bg-ink text-paper" : "text-ink"}`}>
          {open ? "Закрыть" : "Ещё"}
        </button>
      </nav>
    </div>
  );
}
