import { components } from "./_generated/api";
import { Resend } from "@convex-dev/resend";
import type { ActionCtx } from "./_generated/server";

/**
 * The email seam. Every outbound email in the app goes through this file, and no
 * domain file ever imports the Resend SDK — swapping providers is a change here and
 * nowhere else, exactly like the auth seam in lib/auth.ts.
 *
 * The component gives us a durable queue (workpool + rate limiter), so a send is
 * enqueued transactionally with the mutation that triggered it. No "email sent but the
 * transaction rolled back", and no retry loop of our own.
 *
 * SAFETY: testMode stays TRUE. In test mode Resend refuses every address except its
 * own test inboxes (delivered@resend.dev, bounced@resend.dev, …), so a mistake during
 * development cannot reach a real person. Going to production is a deliberate,
 * documented three-step flip — see references/email-resend.md:
 *   1. verify a sending domain in Resend
 *   2. set EMAIL_FROM in Convex env to an address at that domain
 *   3. set testMode: false here, and only then turn on requireEmailVerification
 */
export const resend: Resend = new Resend(components.resend, {
  testMode: true,
});

/** Resend rejects sends from unverified domains, so this stays test-safe by default. */
const from = () => process.env.EMAIL_FROM ?? "ShipKit <onboarding@resend.dev>";

/**
 * Auth's email callbacks call these. They take an ActionCtx because Better Auth's
 * callbacks run in an action context — `requireActionCtx` in convex/auth.ts is what
 * proves that at the call site rather than at runtime.
 *
 * Plain strings, deliberately: React Email is a fine upgrade, but it drags in a render
 * dependency and a "use node" boundary that the engine does not need to ship. The
 * upgrade path is documented in the reference.
 */
export const sendEmailVerification = async (ctx: ActionCtx, { to, url }: { to: string; url: string }) => {
  await resend.sendEmail(ctx, {
    from: from(),
    to,
    subject: "Verify your email address",
    html: `<p>Confirm your address to finish signing in.</p><p><a href="${url}">Verify email</a></p>`,
  });
};

export const sendResetPassword = async (ctx: ActionCtx, { to, url }: { to: string; url: string }) => {
  await resend.sendEmail(ctx, {
    from: from(),
    to,
    subject: "Reset your password",
    html: `<p>Someone asked to reset this account's password. If it was not you, ignore this email.</p><p><a href="${url}">Reset password</a></p>`,
  });
};
