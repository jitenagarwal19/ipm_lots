/** @type {import('next').NextConfig} */

// Where the Express API actually listens. Server-side only — the browser never
// sees this, it talks to /api on its own origin.
const BACKEND_ORIGIN = process.env.BACKEND_URL || "http://127.0.0.1:4000";

const nextConfig = {
  // Avoid `output: "export"`: dynamic routes like `/lots/[id]` load real UUIDs at runtime from the API.

  /**
   * Proxy /api and /uploads to the Express backend so the browser only ever
   * talks to one origin.
   *
   * This is what makes the session cookie work. A cookie set by localhost:4000
   * is not sent by a page served from localhost:3000 unless it is
   * SameSite=None; Secure, which needs HTTPS and re-opens CSRF. Same-origin
   * gets us SameSite=Lax, no CORS, and no mixed-content trap.
   *
   * Production mirrors this in Nginx, so development and production route
   * requests the same way.
   */
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND_ORIGIN}/api/:path*` },
      { source: "/uploads/:path*", destination: `${BACKEND_ORIGIN}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
