"use client";

import { doc, onSnapshot, Timestamp } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "./firebase";

export type Verdict = "scam" | "suspicious" | "safe";
export type Kind = "phone" | "card" | "domain" | "telegram";

export interface IndicatorRow {
  kind: Kind;
  value: string; // уже замаскировано на стороне бота
  reporters: number;
  reports: number;
  risk: number;
  first_seen: Timestamp | null;
  last_seen: Timestamp | null;
  category: string;
  scheme: string;
  status: "unverified" | "confirmed" | "rejected";
}

export interface FeedRow {
  at: Timestamp;
  verdict: Verdict;
  category: string;
  scheme: string;
  input_type: string;
  indicators: number;
}

export interface Summary {
  updated_at: Timestamp;
  totals: { checks: number; flagged: number; scam: number; indicators: number; repeat: number };
  categories: Record<string, number>;
  kinds: Record<string, number>;
  input_types: Record<string, number>;
  daily: { date: string; total: number; flagged: number }[];
  top_indicators: IndicatorRow[];
  feed: FeedRow[];
  has_demo_data: boolean;
}

/** Подписка на сводку: страница обновляется сама, как только бот обработал новое сообщение. */
export function useSummary() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      onSnapshot(
        doc(db, "public", "summary"),
        (snap) => setSummary(snap.exists() ? (snap.data() as Summary) : null),
        (e) => setError(e.message),
      ),
    [],
  );

  return { summary, error };
}
