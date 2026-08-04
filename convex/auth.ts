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
 * Deliberately minimal: email + password only. Everything else — magic links, 2FA,
 * social providers, organizations — is a PLUGIN TOGGLE in createAuthOptions, not a
 * rewrite. Add the plugin here and its client half in src/lib/auth-client.ts; domain
 * code never changes, because it only ever talks to requireUser (convex/lib/auth.ts).
 *
 * Secrets: BETTER_AUTH_SECRET and SITE_URL live in Convex env (`npx convex env set`),
 * never in .env.local. pnpm health enforces both directions.
 */

const siteUrl = process.env.SITE_URL;

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  return {
    baseURL: siteUrl,
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
