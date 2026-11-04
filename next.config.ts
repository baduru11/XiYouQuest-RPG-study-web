import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ws"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // Sign-in is a full-page redirect, never a popup, so nothing needs an opener.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // Content-Security-Policy is set per-request in src/proxy.ts so
          // scripts can use a nonce + 'strict-dynamic' instead of
          // unsafe-inline/unsafe-eval. Microphone is intentionally NOT in the
          // Permissions-Policy deny list: speech recording needs it.
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=()" },
        ],
      },
    ];
  },
  async redirects() {
    // Legacy paths from earlier builds; send visitors to the closest current
    // surface instead of a 404.
    return [
      { source: "/settings", destination: "/profile", permanent: false },
      { source: "/journey", destination: "/main-quest", permanent: false },
      { source: "/onboarding", destination: "/dashboard", permanent: false },
      { source: "/ai-learning-path", destination: "/learning-path", permanent: false },
    ];
  },
};

export default nextConfig;
