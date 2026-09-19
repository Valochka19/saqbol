import type { Timestamp } from "firebase/firestore";
import type { Kind, Verdict } from "./summary";

export const CATEGORY: Record<string, string> = {
  bank_security: "Лжесотрудник банка",
  phishing: "Фишинговая ссылка",
  hacked_account: "Взлом знакомого",
  authority: "Лжеполиция и госорганы",
  investment: "Инвестиции и крипта",
  job: "Фейковая работа",
  marketplace: "Купля-продажа, доставка",
  prize: "Выигрыш и выплаты",
  loan: "Фейковый кредит",
  other: "Другое",
  none: "—",
};

export const KIND: Record<Kind, string> = {
  phone: "Телефон",
  card: "Карта",
  domain: "Домен",
  telegram: "Telegram",
};

export const VERDICT: Record<Verdict, { label: string; short: string; tone: string }> = {
  scam: { label: "Мошенничество", short: "обман", tone: "text-signal" },
  suspicious: { label: "Подозрительно", short: "подозрительно", tone: "text-warn" },
  safe: { label: "Не похоже на обман", short: "чисто", tone: "text-ok" },
};

export const INPUT_TYPE: Record<string, string> = { text: "текст", photo: "скриншот", voice: "голос", web: "сайт" };

const KZ = "Asia/Almaty";

export function fmtTime(t: Timestamp | null | undefined): string {
  if (!t) return "—";
  return t.toDate().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: KZ });
}

export function fmtDate(t: Timestamp | null | undefined): string {
  if (!t) return "—";
  return t.toDate().toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", timeZone: KZ });
}

export function fmtNum(n: number): string {
  return n.toLocaleString("ru-RU").replace(/,/g, " ");
}

/** Номер выпуска сводки — порядковый день года. */
export function issueNumber(d = new Date()): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86_400_000);
}
