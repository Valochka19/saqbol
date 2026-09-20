"use client";

import { doc, onSnapshot, type Timestamp } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";

const STALE_MS = 100_000; // бот отмечается раз в 30 секунд; три пропуска подряд — значит, выключен

/** Показывается только когда сервис проверки не отвечает — чтобы человек не ждал ответа впустую. */
export function ServiceStatus() {
  const [aliveAt, setAliveAt] = useState<number | null | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "public", "status"),
      (snap) => setAliveAt(snap.exists() ? ((snap.data().alive_at as Timestamp)?.toMillis() ?? null) : null),
      () => setAliveAt(null),
    );
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      unsub();
      clearInterval(t);
    };
  }, []);

  if (aliveAt === undefined) return null; // ещё не знаем — не пугаем
  if (aliveAt !== null && now - aliveAt < STALE_MS) return null;

  return (
    <div role="status" className="no-print mt-4 rounded-[12px] border-[2.5px] border-ink bg-[#fff3d6] px-4 py-3 text-[14px] leading-snug">
      <b>Проверка сейчас выключена.</b> Сервер SaqBol не отвечает, поэтому проверка сообщений и номеров, разговор с мошенником
      и выдача сертификатов временно не работают. Тренажёр с сообщениями, памятка и «Как это работает» доступны.
    </div>
  );
}
