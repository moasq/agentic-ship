import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

/**
 * Server half of auth: the proxy handler for /api/auth/* plus the authed data
 * utilities (preloadAuthQuery, fetchAuthMutation, …) for RSCs and Server Actions.
 *
 * Pre-login contract: with no NEXT_PUBLIC_CONVEX_URL the real thing cannot be
 * constructed, so the proxy answers 503 with the onboarding pointer instead of
 * crashing the build. Same rule as everywhere else — a fresh clone builds green,
 * and every auth surface says "not connected yet" out loud.
 */
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

const notConnected = () =>
  Response.json(
    { error: "Backend not connected yet. Run `pnpm onboard`, then `npx convex dev`." },
    { status: 503 },
  );

const real = convexUrl && convexSiteUrl ? convexBetterAuthNextJs({ convexUrl, convexSiteUrl }) : null;

export const handler = real?.handler ?? { GET: notConnected, POST: notConnected };
export const preloadAuthQuery = real?.preloadAuthQuery ?? null;
export const fetchAuthQuery = real?.fetchAuthQuery ?? null;
export const fetchAuthMutation = real?.fetchAuthMutation ?? null;
export const isAuthenticated = real?.isAuthenticated ?? (async () => false);
export const getToken = real?.getToken ?? (async () => null);
