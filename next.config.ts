import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    proxyClientMaxBodySize: "200mb",
  },
  allowedDevOrigins: ['192.168.1.5'],
};

export default nextConfig;
