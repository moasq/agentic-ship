import { action, query } from "./_generated/server";
import { components } from "./_generated/api";
import { StripeSubscriptions } from "@convex-dev/stripe";
import { v } from "convex/values";
import { requireUser } from "./lib/auth";

/**
 * The billing seam. One domain, one file — this is the entire public billing API.
 *
 * The @convex-dev/stripe component owns the hard parts: webhook signature
 * verification, retries, and syncing customers/subscriptions/payments into its own
 * tables. This file adds only what it cannot know — our allowlist, our entitlement
 * rule, our identity.
 *
 * Rules enforced here (see the phase-3 plan):
 *   R1 secrets in Convex env only — the client below reads STRIPE_SECRET_KEY from env
 *   R2 the browser never names an amount: it sends a PLAN KEY, not even a price ID
 *   R3 fulfillment via webhook: entitlement reads component tables, never a redirect
 *   R5 entitlement checked server-side, per request, from the synced subscription
 *   R8 no money math in our code — Stripe computed it, we read it
 */

const stripeClient = new StripeSubscriptions(components.stripe, {});

/**
 * R2 in practice: the browser picks a plan by NAME. The Stripe price ID never appears
 * in client code, so a tampered request can only choose a plan we already sell.
 * Price IDs land in Convex env at onboarding: `npx convex env set STRIPE_PRICE_PRO ...`
 */
const PLANS = {
  pro: { envKey: "STRIPE_PRICE_PRO" },
} as const;

type PlanKey = keyof typeof PLANS;

function priceIdFor(plan: PlanKey): string {
  const priceId = process.env[PLANS[plan].envKey];
  if (!priceId) {
    throw new Error(`Plan "${plan}" is not configured — set ${PLANS[plan].envKey} in Convex env (pnpm onboard).`);
  }
  return priceId;
}

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export const createCheckout = action({
  args: { plan: v.union(v.literal("pro")) },
  returns: v.object({ url: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const siteUrl = process.env.SITE_URL;
    if (!siteUrl) throw new Error("SITE_URL is not set in Convex env.");

    const customer = await stripeClient.getOrCreateCustomer(ctx, {
      userId: user.subject,
      email: user.email,
    });

    const session = await stripeClient.createCheckoutSession(ctx, {
      priceId: priceIdFor(args.plan),
      customerId: customer.customerId,
      mode: "subscription",
      // R3: the success page is a courtesy. Nothing is granted on it — entitlement
      // flips when the webhook lands in the component's tables.
      successUrl: `${siteUrl}/billing?status=success`,
      cancelUrl: `${siteUrl}/billing?status=canceled`,
      subscriptionMetadata: { userId: user.subject, plan: args.plan },
    });

    // Only the redirect URL crosses to the browser. Session internals stay server-side.
    return { url: session.url };
  },
});

/** Stripe-hosted billing management — cancel, resume, change card. Their UI, not ours. */
export const createPortal = action({
  args: {},
  returns: v.object({ url: v.string() }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const siteUrl = process.env.SITE_URL;
    if (!siteUrl) throw new Error("SITE_URL is not set in Convex env.");

    const customer = await stripeClient.getOrCreateCustomer(ctx, {
      userId: user.subject,
      email: user.email,
    });

    const portal = await stripeClient.createCustomerPortalSession(ctx, {
      customerId: customer.customerId,
      returnUrl: `${siteUrl}/billing`,
    });
    return { url: portal.url };
  },
});

/**
 * R5: THE entitlement read. UI renders from this and only this — never a client-held
 * flag, never the success redirect. Reactive: when Stripe's webhook updates the
 * subscription, every open tab re-renders on its own.
 */
export const getEntitlement = query({
  args: {},
  returns: v.object({
    plan: v.union(v.literal("pro"), v.null()),
    status: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) return { plan: null, status: null };

    const subscriptions = await ctx.runQuery(components.stripe.public.listSubscriptionsByUserId, {
      userId: user.subject,
    });

    const active = subscriptions.find((s: { status: string }) => ACTIVE_STATUSES.has(s.status));
    if (!active) return { plan: null, status: subscriptions[0]?.status ?? null };

    const plan = (active.metadata?.plan as PlanKey | undefined) ?? "pro";
    return { plan, status: active.status };
  },
});
