import Link from "next/link";

/** Два режима тренажёра — видно, где находишься, и как вернуться. */
export function TrainerModes({ active }: { active: "cases" | "call" }) {
  const items = [
    { key: "cases", href: "/trainer/", label: "Разбор сообщений" },
    { key: "call", href: "/trainer/call/", label: "Разговор с мошенником" },
  ] as const;
  return (
    <nav className="seg mb-5 w-full sm:w-auto" aria-label="Режим тренажёра">
      {items.map((it) => (
        <Link key={it.key} href={it.href} aria-current={active === it.key ? "page" : undefined}
          className={`flex min-h-[42px] items-center justify-center rounded-[9px] px-4 text-center text-[15px] font-semibold leading-tight transition-colors ${
            active === it.key ? "bg-ink text-paper" : "text-ink-2 hover:bg-[#fbf9f3] hover:text-ink"
          }`}>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
