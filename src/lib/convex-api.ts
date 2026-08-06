/**
 * The Convex API seam — the ONE file the frontend imports function references from.
 *
 * `convex/_generated/` is produced by `npx convex dev`, which needs a Convex account.
 * The agent runs that on the buyer's behalf (the browser consent it opens is the
 * buyer's only part), so it cannot be committed here. Until it exists, `anyApi`
 * (a public export of `convex/server`) provides the same runtime references with no
 * types, which keeps `pnpm build` green on a fresh clone.
 *
 * ONBOARDING STEP — after `npx convex dev` succeeds, swap the two lines below to turn
 * on full type checking of every argument and return value. It is one line, and
 * `pnpm health` tells you which mode you are in.
 *
 *   import { api } from "../../convex/_generated/api";
 *   export { api };
 */
import { anyApi } from "convex/server";

export const api = anyApi;

/** True once `NEXT_PUBLIC_CONVEX_URL` is set. Components use this to render an honest
 *  "not connected yet" state instead of throwing. */
export const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
export const isConvexConfigured = Boolean(convexUrl);
