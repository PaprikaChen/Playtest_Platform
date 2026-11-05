import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep server-only binary/zip helpers out of the bundler.
  serverExternalPackages: ["ts-ebml", "jszip"],
  // Lets a production build run alongside `next dev` (e.g. NEXT_DIST_DIR=.next-build npm run build).
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
