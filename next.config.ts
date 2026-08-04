import type { NextConfig } from "next";
import createMDX from "@next/mdx";

/**
 * Convex talks to its deployment over HTTPS and a WebSocket. With a strict
 * `connect-src 'self'` the browser blocks that the moment the backend is connected —
 * silently, as a CSP violation in the console rather than an app error.
 *
 * So the deployment origin is added to the policy when it exists, and only then. The
 * policy is never loosened to a wildcard to make a connection work; the origin is named.
 */
const convexOrigins = (() => {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return [];
  try {
    const { origin, host } = new URL(url);
    return [origin, `wss://${host}`];
  } catch {
    return [];
  }
})();

/**
 * Security headers ship on by default.
 * When you leave a hosted builder, the security posture becomes yours.
 * Reasoning for each header: .agents/skills/frontend-security/SKILL.md
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // 'unsafe-inline' is required by Next's inline bootstrap script.
      // Move to a nonce-based policy before production if your host allows it.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://images.unsplash.com https://images.pexels.com",
      "font-src 'self' data:",
      ["connect-src 'self'", ...convexOrigins].join(" "),
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/**
 * PostHog reverse proxy. The browser only ever talks to /ingest on our own origin, so
 * the CSP keeps `connect-src 'self'` — no analytics vendor is added to the policy — and
 * ad blockers do not silently drop the analytics of technical users. This is PostHog's
 * own recommended setup, not a workaround.
 */
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const posthogAssetHost = posthogHost.replace(".i.posthog.com", "-assets.i.posthog.com");

const nextConfig: NextConfig = {
  // Articles are `page.mdx` files under src/app/blog/. MDX is compiled by Next's own
  // plugin — no CMS, no third-party renderer, no runtime dependency.
  pageExtensions: ["ts", "tsx", "mdx"],
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: `${posthogAssetHost}/static/:path*` },
      { source: "/ingest/:path*", destination: `${posthogHost}/:path*` },
    ];
  },
  // Rewrites to an external host need the trailing-slash behaviour PostHog expects.
  skipTrailingSlashRedirect: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "images.pexels.com" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default createMDX({})(nextConfig);
