import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SaqBol — проверка на мошенничество",
    short_name: "SaqBol",
    description: "Проверьте подозрительное сообщение или номер перед переводом.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3efe6",
    theme_color: "#f3efe6",
    lang: "ru",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    ],
  };
}
