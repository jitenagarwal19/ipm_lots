import type { NextConfig } from "next";

const backend =
  process.env.BACKEND_INTERNAL_URL ||
  process.env.BACKEND_URL ||
  "";

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  async rewrites() {
    if (!backend) return [];
    const base = backend.replace(/\/+$/, "");
    return [
      {
        source: "/uploads/:path*",
        destination: `${base}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
