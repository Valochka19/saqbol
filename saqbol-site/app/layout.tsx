import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, PT_Serif } from "next/font/google";
import "./globals.css";
import { Masthead } from "@/components/Masthead";
import { Footer } from "@/components/Footer";
import { MobileNav } from "@/components/MobileNav";
import { ServiceStatus } from "@/components/ServiceStatus";

// Все три гарнитуры содержат полную кириллицу с казахскими буквами
const serif = PT_Serif({ variable: "--font-pt-serif", weight: ["400", "700"], subsets: ["latin", "cyrillic", "cyrillic-ext"] });
const sans = IBM_Plex_Sans({ variable: "--font-plex-sans", weight: ["400", "500", "600"], subsets: ["latin", "cyrillic", "cyrillic-ext"] });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", weight: ["400", "500", "700"], subsets: ["latin", "cyrillic", "cyrillic-ext"] });

export const metadata: Metadata = {
  title: "SaqBol — проверьте сообщение на мошенничество",
  description: "Проверьте подозрительное сообщение или номер перед переводом. Общая база мошенников, которую наполняют сами люди.",
  applicationName: "SaqBol",
  appleWebApp: { capable: true, title: "SaqBol", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f3efe6", // строка браузера на телефоне — того же цвета, что бумага
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${serif.variable} ${sans.variable} ${mono.variable} antialiased`}>
      <body className="min-h-screen">
        <div className="mx-auto flex min-h-screen max-w-[1180px] flex-col px-4 pb-[calc(64px+env(safe-area-inset-bottom))] sm:px-8 sm:pb-0">
          <Masthead />
          <ServiceStatus />
          <main className="flex-1 py-5 sm:py-8">{children}</main>
          <Footer />
        </div>
        <MobileNav />
      </body>
    </html>
  );
}
