import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, PT_Serif } from "next/font/google";
import "./globals.css";
import { Masthead } from "@/components/Masthead";
import { Footer } from "@/components/Footer";

// Все три гарнитуры содержат полную кириллицу с казахскими буквами
const serif = PT_Serif({ variable: "--font-pt-serif", weight: ["400", "700"], subsets: ["latin", "cyrillic", "cyrillic-ext"] });
const sans = IBM_Plex_Sans({ variable: "--font-plex-sans", weight: ["400", "500", "600"], subsets: ["latin", "cyrillic", "cyrillic-ext"] });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", weight: ["400", "500", "700"], subsets: ["latin", "cyrillic", "cyrillic-ext"] });

export const metadata: Metadata = {
  title: "SaqBol — проверьте сообщение на мошенничество",
  description: "Народная сеть датчиков мошенничества: проверка сообщений, общая база номеров и счетов, фид для антифрод-служб банков Казахстана.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${serif.variable} ${sans.variable} ${mono.variable} antialiased`}>
      <body className="min-h-screen">
        <div className="mx-auto flex min-h-screen max-w-[1180px] flex-col px-4 sm:px-8">
          <Masthead />
          <main className="flex-1 py-8">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
