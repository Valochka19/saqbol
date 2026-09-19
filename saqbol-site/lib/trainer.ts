export interface QuizCase {
  id: number;
  text: string;
  scam: boolean;
  hard: boolean;
  scheme: string;
  flags: string[];
  advice: string;
}

export interface Progress {
  xp: number;
  bestStreak: number;
  shifts: number;
  /** Сколько раз человек устоял в «Разговоре с мошенником» */
  callsWon: number;
  /** id кейса -> отвечен ли верно в последний раз */
  cases: Record<number, boolean>;
}

export const EMPTY: Progress = { xp: 0, bestStreak: 0, shifts: 0, callsWon: 0, cases: {} };
const KEY = "saqbol.trainer.v1";

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* приватный режим — тренажёр работает и без сохранения */
  }
}

export const RANKS = [
  { xp: 0, title: "Стажёр" },
  { xp: 100, title: "Инспектор" },
  { xp: 250, title: "Аналитик" },
  { xp: 450, title: "Старший аналитик" },
  { xp: 700, title: "Антифрод-офицер" },
];

export function rankOf(xp: number) {
  const index = RANKS.reduce((acc, r, i) => (xp >= r.xp ? i : acc), 0);
  const next = RANKS[index + 1];
  return { index, title: RANKS[index].title, next, toNext: next ? next.xp - xp : 0, span: next ? (xp - RANKS[index].xp) / (next.xp - RANKS[index].xp) : 1 };
}

/** Очки за верный ответ: трудные кейсы дороже, серия от трёх подряд даёт надбавку. */
export function xpFor(c: QuizCase, streak: number): number {
  return (c.hard ? 15 : 10) + (streak >= 3 ? 5 : 0);
}

export interface Quest {
  id: string;
  title: string;
  brief: string;
  goal: number;
  progress: (p: Progress, all: QuizCase[]) => number;
}

const correct = (p: Progress, all: QuizCase[], pick: (c: QuizCase) => boolean) =>
  all.filter((c) => pick(c) && p.cases[c.id]).length;

export const QUESTS: Quest[] = [
  { id: "first", title: "Дело № 1. Первая смена", brief: "Отработать одну смену до конца.", goal: 1, progress: (p) => Math.min(1, p.shifts) },
  { id: "streak", title: "Дело № 2. Без промаха", brief: "Пять верных ответов подряд.", goal: 5, progress: (p) => Math.min(5, p.bestStreak) },
  { id: "calm", title: "Дело № 3. Без паники", brief: "Верно опознать 10 обычных сообщений: ложная тревога тоже ошибка.", goal: 10, progress: (p, all) => Math.min(10, correct(p, all, (c) => !c.scam)) },
  { id: "hard", title: "Дело № 4. Тонкая работа", brief: "Раскрыть 12 трудных кейсов — без ссылок и тревожных слов.", goal: 12, progress: (p, all) => Math.min(12, correct(p, all, (c) => c.hard)) },
  { id: "all", title: "Дело № 5. Вся картотека", brief: "Верно разобрать каждый кейс в картотеке.", goal: 40, progress: (p, all) => correct(p, all, () => true) },
];

export function pickShift(all: QuizCase[], p: Progress, size = 8): QuizCase[] {
  // Сначала то, что ещё не решено верно, затем остальное; внутри групп — случайно
  const shuffled = [...all].sort(() => Math.random() - 0.5);
  const fresh = shuffled.filter((c) => !p.cases[c.id]);
  const rest = shuffled.filter((c) => p.cases[c.id]);
  return [...fresh, ...rest].slice(0, size).sort(() => Math.random() - 0.5);
}

// Условия сертификата — те же, что проверяет сервер
export const CERT_MIN_CASES = 24;
export const CERT_MIN_CALLS = 1;

export function certStats(p: Progress, all: QuizCase[]) {
  const solved = all.filter((c) => p.cases[c.id]);
  const cases = solved.length;
  const hard = solved.filter((c) => c.hard).length;
  return { cases, hard, calls: p.callsWon, eligible: cases >= CERT_MIN_CASES && p.callsWon >= CERT_MIN_CALLS };
}
