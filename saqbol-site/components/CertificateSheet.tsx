"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

export interface Certificate {
  id: string;
  name: string;
  score: number;
  cases: number;
  hard: number;
  calls: number;
  issuedAt: Date;
}

export const SITE = "https://saqbol-ai-kz.web.app";
export const verifyUrl = (id: string) => `${SITE}/certificate/verify/?id=${encodeURIComponent(id)}`;

export function grade(score: number): string {
  return score >= 85 ? "с отличием" : score >= 70 ? "уверенно" : "успешно";
}

/** Лист сертификата: альбомный А4, двойная рамка, штамп и QR-код для проверки подлинности. */
export function CertificateSheet({ cert }: { cert: Certificate }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(verifyUrl(cert.id), { margin: 0, width: 300, color: { dark: "#141311", light: "#ffffff" } }).then(setQr);
  }, [cert.id]);

  const date = cert.issuedAt.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

  return (
    <article className="sheet cert mx-auto w-full max-w-[980px] bg-white p-3 sm:p-4">
      <div className="border-[3px] border-ink p-[5px]">
        <div className="relative border border-ink px-5 py-7 text-center sm:px-12 sm:py-10">
          <p className="kicker">SaqBol · сақ бол — будь осторожен</p>
          <p className="mt-3 font-serif text-[30px] font-bold leading-none sm:text-[52px]">Сертификат</p>
          <p className="mt-2 font-serif text-[17px] italic text-ink-2 sm:text-[22px]">финансовой безопасности</p>

          <div className="mx-auto mt-6 h-[3px] w-[120px] bg-ink" />
          <p className="kicker mt-6">Настоящим подтверждается, что</p>
          <p className="mt-2 break-words font-serif text-[28px] font-bold leading-tight sm:text-[44px]">{cert.name}</p>
          <p className="mx-auto mt-4 max-w-[60ch] text-[15px] leading-relaxed sm:text-[17px]">
            {grade(cert.score)} прошёл(ла) тренажёр SaqBol: верно разобрал(а) <b>{cert.cases} из 40</b> ситуаций, в том числе{" "}
            <b>{cert.hard} трудных</b>, и устоял(а) в разговоре с мошенником{cert.calls > 1 ? ` (${cert.calls} раза)` : ""}.
          </p>

          <div className="mt-7 grid items-end gap-6 text-left sm:grid-cols-[1fr_auto_1fr]">
            <div>
              <p className="kicker">Оценка устойчивости</p>
              <p className="num text-[46px] font-medium leading-none sm:text-[64px]">
                {cert.score}
                <span className="text-[20px] text-ink-3"> / 100</span>
              </p>
            </div>
            <div className="justify-self-center">
              <span className="stamp text-[15px] text-signal sm:text-[18px]">Проверено · SaqBol</span>
            </div>
            <div className="flex items-end justify-start gap-3 sm:justify-end">
              <div className="text-left sm:text-right">
                <p className="kicker">№ {cert.id}</p>
                <p className="mt-1 text-[13px] text-ink-2">Выдан {date}</p>
                <p className="fine mt-1">Подлинность — по QR-коду</p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {qr && <img src={qr} alt="QR-код для проверки сертификата" className="h-[84px] w-[84px] sm:h-[96px] sm:w-[96px]" />}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
