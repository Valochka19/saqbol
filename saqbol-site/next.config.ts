import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export", // чистая статика для Firebase Hosting, сервер не нужен
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
