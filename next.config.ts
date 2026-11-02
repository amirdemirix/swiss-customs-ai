import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // CSP: keine externen Skripte/Verbindungen; 'unsafe-inline' für Next.js-Inline-Bootstrap (Nonce-CSP als spätere Verschärfung)
  { key: "Content-Security-Policy", value: [
    "default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self'",
    "connect-src 'self'", "frame-src 'self'", "object-src 'self'", "frame-ancestors 'self'", "base-uri 'self'", "form-action 'self'",
  ].join("; ") },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const config: NextConfig = {
  poweredByHeader: false,
  // Für Docker/Self-Hosting (z. B. CH-Rechenzentrum): eigenständiger Server-Build
  ...(process.env.STANDALONE_BUILD === "1" ? { output: "standalone" as const } : {}),
  serverExternalPackages: ["@prisma/client", "bcryptjs", "exceljs", "unpdf"],
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default config;
