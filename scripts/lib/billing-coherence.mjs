/**
 * Is billing COHERENT on a deployment — across supported providers (Stripe, Polar, Lemon Squeezy).
 *
 * Each key on its own looks fine; the damage lives in the combinations. A secret key
 * with no webhook secret takes the money and never grants the plan. A deployment
 * carrying prices and a webhook secret but no secret key reads as configured while
 * `billingIsLive()` is false, which silently leaves `workspaces.changePlan` open to the
 * browser — any owner can put their own workspace on a paid plan for nothing.
 *
 * Names only. This module never receives, inspects, or reports a secret VALUE.
 */

export const BILLING_ENV = {
  stripe: {
    secret: "STRIPE_SECRET_KEY",
    webhook: "STRIPE_WEBHOOK_SECRET",
    pricePrefix: "STRIPE_PRICE_",
    siteUrl: "SITE_URL",
  },
  polar: {
    secret: "POLAR_ACCESS_TOKEN",
    webhook: "POLAR_WEBHOOK_SECRET",
    pricePrefix: "POLAR_PRODUCT_",
    siteUrl: "SITE_URL",
  },
  lemonsqueezy: {
    secret: "LEMON_SQUEEZY_API_KEY",
    webhook: "LEMON_SQUEEZY_WEBHOOK_SECRET",
    storeId: "LEMON_SQUEEZY_STORE_ID",
    pricePrefix: "LEMON_SQUEEZY_VARIANT_",
    siteUrl: "SITE_URL",
  },
  // Legacy aliases
  secret: "STRIPE_SECRET_KEY",
  webhook: "STRIPE_WEBHOOK_SECRET",
  pricePrefix: "STRIPE_PRICE_",
  siteUrl: "SITE_URL",
};

/**
 * @param {Iterable<string>} envNames names present on the deployment
 * @returns {{ status: "PASS"|"WARN"|"FAIL"|"CRITICAL", detail: string }}
 */
export function inspectBillingCoherence(envNames) {
  const names = new Set(envNames);
  const has = (name) => names.has(name);

  const hasStripeKeys = [...names].some((name) => name.startsWith("STRIPE_"));
  const hasPolarKeys = [...names].some((name) => name.startsWith("POLAR_"));
  const hasLemonKeys = [...names].some((name) => name.startsWith("LEMON_SQUEEZY_") || name.startsWith("LEMONSQUEEZY_"));

  if (!hasStripeKeys && !hasPolarKeys && !hasLemonKeys) {
    return {
      status: "WARN",
      detail:
        "no billing keys on this deployment — billing is off and plans switch directly, which is a normal pre-launch state. Run `pnpm onboard stripe` or configure Polar / Lemon Squeezy when you want checkout.",
    };
  }

  const results = [];

  // 1. Evaluate Stripe Coherence if any Stripe key is present
  if (hasStripeKeys) {
    const prices = [...names].filter((name) => name.startsWith(BILLING_ENV.stripe.pricePrefix));
    if (has(BILLING_ENV.stripe.secret) && !has(BILLING_ENV.stripe.webhook)) {
      results.push({
        status: "CRITICAL",
        detail:
          "STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is not — checkout completes, the webhook is rejected unsigned, and entitlement never arrives. The customer pays and gets nothing.",
      });
    } else if (has(BILLING_ENV.stripe.secret) && prices.length === 0) {
      results.push({
        status: "FAIL",
        detail:
          "STRIPE_SECRET_KEY is set but no STRIPE_PRICE_* is — every checkout throws before it reaches Stripe. Run `pnpm stripe:provision`.",
      });
    } else if (has(BILLING_ENV.stripe.secret) && !has(BILLING_ENV.stripe.siteUrl)) {
      results.push({
        status: "FAIL",
        detail:
          "STRIPE_SECRET_KEY is set but SITE_URL is not — createCheckout throws, because Stripe needs a return URL that exists.",
      });
    } else if (!has(BILLING_ENV.stripe.secret)) {
      const orphans = [has(BILLING_ENV.stripe.webhook) ? BILLING_ENV.stripe.webhook : null, ...prices].filter(Boolean);
      results.push({
        status: "WARN",
        detail:
          `${orphans.join(", ")} present but STRIPE_SECRET_KEY is missing — billing is OFF despite looking configured. ` +
          "createCheckout refuses, the settings screen offers direct plan switching, and entitlement is not webhook-owned yet. " +
          "Finish it with `pnpm secret:set STRIPE_SECRET_KEY` (hidden input, straight into Convex env) — Stripe issues that key only in its dashboard, so it is the one step no CLI can automate. " +
          `To stay pre-billing on purpose instead, drop the orphans: ${orphans.map((name) => `\`npx convex env remove ${name}\``).join(" ")}.`,
      });
    } else {
      results.push({
        status: "PASS",
        detail: `Stripe: secret, webhook and ${prices.length} price(s) all present`,
      });
    }
  }

  // 2. Evaluate Polar Coherence if any Polar key is present
  if (hasPolarKeys) {
    const products = [...names].filter((name) => name.startsWith(BILLING_ENV.polar.pricePrefix));
    if (has(BILLING_ENV.polar.secret) && !has(BILLING_ENV.polar.webhook)) {
      results.push({
        status: "CRITICAL",
        detail:
          "POLAR_ACCESS_TOKEN is set but POLAR_WEBHOOK_SECRET is not — checkout completes, the webhook is rejected unsigned, and entitlement never arrives. The customer pays and gets nothing.",
      });
    } else if (has(BILLING_ENV.polar.secret) && products.length === 0) {
      results.push({
        status: "FAIL",
        detail:
          "POLAR_ACCESS_TOKEN is set but no POLAR_PRODUCT_* is — checkout throws before reaching Polar.",
      });
    } else if (has(BILLING_ENV.polar.secret) && !has(BILLING_ENV.polar.siteUrl)) {
      results.push({
        status: "FAIL",
        detail:
          "POLAR_ACCESS_TOKEN is set but SITE_URL is not — Polar customer checkout needs a valid return URL.",
      });
    } else if (!has(BILLING_ENV.polar.secret)) {
      const orphans = [has(BILLING_ENV.polar.webhook) ? BILLING_ENV.polar.webhook : null, ...products].filter(Boolean);
      results.push({
        status: "WARN",
        detail:
          `${orphans.join(", ")} present but POLAR_ACCESS_TOKEN is missing — Polar billing is OFF despite looking configured.`,
      });
    } else {
      results.push({
        status: "PASS",
        detail: `Polar: access token, webhook secret and ${products.length} product(s) all present`,
      });
    }
  }

  // 3. Evaluate Lemon Squeezy Coherence if any Lemon Squeezy key is present
  if (hasLemonKeys) {
    const variants = [...names].filter((name) => name.startsWith(BILLING_ENV.lemonsqueezy.pricePrefix));
    if (has(BILLING_ENV.lemonsqueezy.secret) && !has(BILLING_ENV.lemonsqueezy.webhook)) {
      results.push({
        status: "CRITICAL",
        detail:
          "LEMON_SQUEEZY_API_KEY is set but LEMON_SQUEEZY_WEBHOOK_SECRET is not — checkout completes, the webhook is rejected unsigned, and entitlement never arrives. The customer pays and gets nothing.",
      });
    } else if (has(BILLING_ENV.lemonsqueezy.secret) && !has(BILLING_ENV.lemonsqueezy.storeId)) {
      results.push({
        status: "FAIL",
        detail:
          "LEMON_SQUEEZY_API_KEY is set but LEMON_SQUEEZY_STORE_ID is missing — checkout throws before reaching Lemon Squeezy.",
      });
    } else if (has(BILLING_ENV.lemonsqueezy.secret) && variants.length === 0) {
      results.push({
        status: "FAIL",
        detail:
          "LEMON_SQUEEZY_API_KEY is set but no LEMON_SQUEEZY_VARIANT_* is — checkout throws before reaching Lemon Squeezy.",
      });
    } else if (has(BILLING_ENV.lemonsqueezy.secret) && !has(BILLING_ENV.lemonsqueezy.siteUrl)) {
      results.push({
        status: "FAIL",
        detail:
          "LEMON_SQUEEZY_API_KEY is set but SITE_URL is not — Lemon Squeezy checkout needs a valid return URL.",
      });
    } else if (!has(BILLING_ENV.lemonsqueezy.secret)) {
      const orphans = [
        has(BILLING_ENV.lemonsqueezy.webhook) ? BILLING_ENV.lemonsqueezy.webhook : null,
        has(BILLING_ENV.lemonsqueezy.storeId) ? BILLING_ENV.lemonsqueezy.storeId : null,
        ...variants,
      ].filter(Boolean);
      results.push({
        status: "WARN",
        detail:
          `${orphans.join(", ")} present but LEMON_SQUEEZY_API_KEY is missing — Lemon Squeezy billing is OFF despite looking configured.`,
      });
    } else {
      results.push({
        status: "PASS",
        detail: `Lemon Squeezy: API key, webhook secret, store ID, and ${variants.length} variant(s) all present`,
      });
    }
  }

  // Return the highest severity result: CRITICAL > FAIL > WARN > PASS
  const severityOrder = { CRITICAL: 4, FAIL: 3, WARN: 2, PASS: 1 };
  results.sort((a, b) => severityOrder[b.status] - severityOrder[a.status]);

  return results[0];
}

/** Parse `convex env list` output into NAMES. Values are dropped here and never returned. */
export function envNamesFrom(stdout) {
  return (stdout ?? "")
    .split("\n")
    .map((line) => (/^\s*([A-Za-z_][A-Za-z0-9_]*)=/.exec(line) ?? [])[1])
    .filter(Boolean);
}
