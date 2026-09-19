"use client";

import { doc, getDoc, type Timestamp } from "firebase/firestore";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CertificateSheet, type Certificate } from "@/components/CertificateSheet";
import { db } from "@/lib/firebase";

function Verify() {
  const id = (useSearchParams().get("id") ?? "").trim().toUpperCase();
  const [state, setState] = useState<"loading" | "valid" | "missing" | "failed">("loading");
  const [cert, setCert] = useState<Certificate | null>(null);

  useEffect(() => {
    if (!/^SB-\d{4}-[A-Z0-9]{6}$/.test(id)) {
      setState("missing");
      return;
    }
    getDoc(doc(db, "certificates", id))
      .then((snap) => {
        if (!snap.exists()) return setState("missing");
        const d = snap.data();
        setCert({ id, name: d.name, score: d.score, cases: d.cases, hard: d.hard, calls: d.calls, issuedAt: (d.issued_at as Timestamp).toDate() });
        setState("valid");
      })
      .catch(() => setState("failed"));
  }, [id]);

  return (
    <div>
      <p className="kicker">Проверка сертификата</p>
      {state === "loading" && <p className="kicker py-10">Ищем сертификат…</p>}

      {state === "valid" && cert && (
        <>
          <div className="mb-6 mt-2 flex flex-wrap items-center gap-4">
            <span className="stamp stamp-in text-[18px] text-ok">Подлинный</span>
            <h1 className="font-serif text-[24px] font-bold leading-tight sm:text-[32px]">Сертификат № {cert.id} выдан SaqBol</h1>
          </div>
          <CertificateSheet cert={cert} />
        </>
      )}

      {state === "missing" && (
        <div className="mt-2 max-w-[60ch]">
          <span className="stamp stamp-in text-[18px] text-signal">Не найден</span>
          <h1 className="mt-5 font-serif text-[24px] font-bold leading-tight sm:text-[32px]">Такого сертификата нет</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
            Номер {id ? <span className="num text-ink">{id}</span> : "не указан"}. Проверьте, что ссылка скопирована целиком. Если вам показали
            сертификат с этим номером — он не выдавался SaqBol.
          </p>
        </div>
      )}

      {state === "failed" && <p className="mt-4 text-[15px] text-ink-2">Не получилось связаться с базой. Проверьте интернет и обновите страницу.</p>}

      <p className="no-print mt-8 text-[14px]">
        <Link href="/certificate/" className="underline underline-offset-4 hover:text-signal">Получить свой сертификат →</Link>
      </p>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<p className="kicker py-10">Загружаем…</p>}>
      <Verify />
    </Suspense>
  );
}
