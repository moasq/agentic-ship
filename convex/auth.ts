import { components } from "./_generated/api";
import { query } from "./_generated/server";
import type { DataModel } from "./_generated/dataModel";
import { v } from "convex/values";
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { requireActionCtx } from "@convex-dev/better-auth/utils";
import { sendEmailVerification, sendResetPassword } from "./email";
import authConfig from "./auth.config";

/**
 * Better Auth, wired through the first-party @convex-dev/better-auth component.
 *
 * Deliberately minimal: email + password, plus Google and GitHub when their credentials
 * are present. Everything else — magic links, 2FA, organizations — is a PLUGIN TOGGLE in
 * createAuthOptions, not a rewrite. Add the plugin here and its client half in
 * src/lib/auth-client.ts; domain code never changes, because it only ever talks to
 * requireUser (convex/lib/auth.ts).
 *
 * Secrets: BETTER_AUTH_SECRET and SITE_URL live in Convex env (`npx convex env set`),
 * never in .env.local. pnpm health enforces both directions.
 */

const siteUrl = process.env.SITE_URL;

/**
 * The origins Better Auth will accept a credential request from.
 *
 * `SITE_URL` is always trusted and is the only entry in production. `E2E_ORIGIN` exists
 * because gate G3 runs the production build on port 3100 while the deployment's
 * SITE_URL names port 3000, and Better Auth correctly refuses that cross-origin
 * credential POST with INVALID_ORIGIN. Setting it on the DEV deployment is what lets
 * the browser gate drive a real signup instead of skipping itself.
 *
 * It must never exist on prod — a trusted origin nobody deliberately added is a CSRF
 * hole — and `pnpm preflight --prod` FAILS if it does.
 */
const trustedOrigins = [siteUrl, process.env.E2E_ORIGIN].filter(
  (origin): origin is string => Boolean(origin),
);

/**
 * Social sign-in, enabled per provider by the presence of its credential pair.
 *
 * Both halves or neither: Better Auth will happily register a provider with a client id
 * and no secret, and the failure then lands on the CUSTOMER as a broken redirect at the
 * provider's own domain — after they have already clicked "Sign in with Google". A
 * provider that cannot complete is worse than one that is not offered, so a half-set
 * pair is treated as absent here, and `pnpm health` says so out loud rather than
 * letting it ship quietly.
 *
 * The credentials are issued by Google and GitHub's own consoles — no CLI can mint
 * them — so they arrive through `pnpm secret:set` and live in Convex env, never here
 * and never in `.env.local`.
 */
function socialProviders() {
  const providers: Record<string, { clientId: string; clientSecret: string }> = {};

  const google = { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET };
  if (google.clientId && google.clientSecret) {
    providers.google = { clientId: google.clientId, clientSecret: google.clientSecret };
  }

  const github = { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET };
  if (github.clientId && github.clientSecret) {
    providers.github = { clientId: github.clientId, clientSecret: github.clientSecret };
  }

  return providers;
}

/**
 * What the browser is allowed to OFFER. The server decides; the sign-in screen renders
 * from this rather than from a hardcoded list, so a button can never exist for a
 * provider this deployment cannot actually complete.
 */
export const enabledSocialProviders = query({
  args: {},
  returns: v.array(v.string()),
  handler: async () => Object.keys(socialProviders()),
});

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  return {
    baseURL: siteUrl,
    trustedOrigins,
    database: authComponent.adapter(ctx),
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmailVerification(requireActionCtx(ctx), { to: user.email, url });
      },
    },
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, url }) => {
        await sendResetPassword(requireActionCtx(ctx), { to: user.email, url });
      },
      // The sender now exists, but convex/email.ts still runs in testMode, where
      // Resend refuses every real address. Turning this on before flipping testMode
      // would lock out every genuine signup. Both flips happen together, as the last
      // step of the production checklist in references/email-resend.md — and
      // `pnpm health` FAILS on the mismatch in either direction.
      requireEmailVerification: false,
    },
    // Adding a provider is this line plus a credential pair in Convex env — never a new
    // endpoint and never a custom credential flow. Better Auth owns the whole redirect.
    socialProviders: socialProviders(),
    plugins: [convex({ authConfig })],
  } satisfies BetterAuthOptions;
};

export const createAuth = (ctx: GenericCtx<DataModel>) => betterAuth(createAuthOptions(ctx));

export const { getAuthUser } = authComponent.clientApi();

// The one query the frontend uses to render session state. Null when signed out —
// never throws, so public pages stay public.
export const getCurrentUser = query({
  args: {},
  // The user document's shape is owned by the Better Auth component and changes with
  // its versions — v.any() is honest here where a hand-copied v.object() would drift.
  returns: v.union(v.null(), v.any()),
  handler: async (ctx) => {
    return authComponent.safeGetAuthUser(ctx);
  },
});
