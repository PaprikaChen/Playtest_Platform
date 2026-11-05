import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep server-only binary/zip helpers out of the bundler.
  serverExternalPackages: ["ts-ebml", "jszip"],
};

export default nextConfig;
