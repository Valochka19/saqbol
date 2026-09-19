import { addDoc, collection, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Запрос к SaqBol через очередь в Firestore: кладём документ, ждём ответ под тем же id.
 * Сервером служит бот — он слушает очередь, поэтому отдельный бэкенд сайту не нужен.
 */
export function ask<T>(payload: Record<string, unknown>, timeoutMs = 40_000): Promise<T> {
  return new Promise((resolve, reject) => {
    addDoc(collection(db, "web_requests"), { ...payload, created_at: serverTimestamp() })
      .then((ref) => {
        const timer = setTimeout(() => {
          unsub();
          reject(new Error("timeout"));
        }, timeoutMs);
        const unsub = onSnapshot(doc(db, "web_results", ref.id), (snap) => {
          if (!snap.exists()) return;
          clearTimeout(timer);
          unsub();
          const data = snap.data() as T & { error?: string };
          if (data.error) reject(new Error(data.error));
          else resolve(data);
        });
      })
      .catch(() => reject(new Error("failed")));
  });
}

export const ASK_ERRORS: Record<string, string> = {
  timeout: "Сервис не ответил за 40 секунд. Скорее всего, он сейчас выключен — попробуйте позже.",
  busy: "Слишком много запросов одновременно. Повторите через минуту.",
  failed: "Не получилось. Попробуйте ещё раз.",
  unrecognized: "Не вижу здесь номера телефона, карты или ссылки. Проверьте, что ввели его полностью.",
};
