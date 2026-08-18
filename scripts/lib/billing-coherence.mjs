/**
 * Is billing COHERENT on a deployment — not merely "are some billing names present".
 * Supports both Stripe and Polar downstream billing providers.
 *
 * Each key on its own looks fine; the damage lives in the combinations. A secret key
 * with no webhook secret takes the money and never grants the plan. A deployment
 * carrying prices/products and a webhook secret but no secret key reads as configured while
 * `billingIsLive()` is false, which silently leaves `workspaces.changePlan` open to the
 * browser — any owner can put their own workspace on a paid plan for nothing.
 *
 * Names only. This module never receives, inspects, or reports a secret VALUE.
 */

export const BILLING_ENV = {
  secret: "STRIPE_SECRET_KEY",
  webhook: "STRIPE_WEBHOOK_SECRET",
  pricePrefix: "STRIPE_PRICE_",
  siteUrl: "SITE_URL",
};

export const POLAR_BILLING_ENV = {
  secret: "POLAR_ACCESS_TOKEN",
  webhook: "POLAR_WEBHOOK_SECRET",
  server: "POLAR_SERVER",
  productPrefix: "POLAR_PRODUCT_",
  siteUrl: "SITE_URL",
};

const SEVERITY_RANK = {
  CRITICAL: 4,
  FAIL: 3,
  WARN: 2,
  PASS: 1,
};

function inspectStripeCoherence(names, has) {
  const prices = [...names].filter((name) => name.startsWith(BILLING_ENV.pricePrefix));
  const anyStripe = [...names].some((name) => name.startsWith("STRIPE_"));

  if (!anyStripe) return null;

  if (has(BILLING_ENV.secret) && !has(BILLING_ENV.webhook)) {
    return {
      status: "CRITICAL",
      detail:
        "STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is not — checkout completes, the webhook is rejected unsigned, and entitlement never arrives. The customer pays and gets nothing.",
    };
  }

  if (has(BILLING_ENV.secret) && prices.length === 0) {
    return {
      status: "FAIL",
      detail:
        "STRIPE_SECRET_KEY is set but no STRIPE_PRICE_* is — every checkout throws before it reaches Stripe. Run `pnpm stripe:provision`.",
    };
  }

  if (has(BILLING_ENV.secret) && !has(BILLING_ENV.siteUrl)) {
    return {
      status: "FAIL",
      detail:
        "STRIPE_SECRET_KEY is set but SITE_URL is not — createCheckout throws, because Stripe needs a return URL that exists.",
    };
  }

  if (!has(BILLING_ENV.secret)) {
    const orphans = [has(BILLING_ENV.webhook) ? BILLING_ENV.webhook : null, ...prices].filter(Boolean);
    return {
      status: "WARN",
      detail:
        `${orphans.join(", ")} present but STRIPE_SECRET_KEY is missing — billing is OFF despite looking configured. ` +
        "createCheckout refuses, the settings screen offers direct plan switching, and entitlement is not webhook-owned yet. " +
        "Finish it with `pnpm secret:set STRIPE_SECRET_KEY` (hidden input, straight into Convex env) — Stripe issues that key only in its dashboard, so it is the one step no CLI can automate. " +
        `To stay pre-billing on purpose instead, drop the orphans: ${orphans.map((name) => `\`npx convex env remove ${name}\``).join(" ")}.`,
    };
  }

  return { status: "PASS", detail: `secret, webhook and ${prices.length} price(s) all present` };
}

function inspectPolarCoherence(names, has) {
  const products = [...names].filter((name) => name.startsWith(POLAR_BILLING_ENV.productPrefix));
  const anyPolar = [...names].some((name) => name.startsWith("POLAR_"));

  if (!anyPolar) return null;

  if (has(POLAR_BILLING_ENV.secret) && !has(POLAR_BILLING_ENV.webhook)) {
    return {
      status: "CRITICAL",
      detail:
        "POLAR_ACCESS_TOKEN is set but POLAR_WEBHOOK_SECRET is not — checkout completes, the webhook is rejected unsigned, and entitlement never arrives. The customer pays and gets nothing.",
    };
  }

  if (has(POLAR_BILLING_ENV.secret) && !has(POLAR_BILLING_ENV.server)) {
    return {
      status: "FAIL",
      detail:
        "POLAR_ACCESS_TOKEN is set but POLAR_SERVER is not configured — set POLAR_SERVER=production (or sandbox for testing).",
    };
  }

  if (has(POLAR_BILLING_ENV.secret) && products.length === 0) {
    return {
      status: "FAIL",
      detail:
        "POLAR_ACCESS_TOKEN is set but no POLAR_PRODUCT_* is — every checkout throws before it reaches Polar.",
    };
  }

  if (has(POLAR_BILLING_ENV.secret) && !has(POLAR_BILLING_ENV.siteUrl)) {
    return {
      status: "FAIL",
      detail:
        "POLAR_ACCESS_TOKEN is set but SITE_URL is not — createCheckout throws, because Polar needs a return URL that exists.",
    };
  }

  if (!has(POLAR_BILLING_ENV.secret)) {
    const orphans = [
      has(POLAR_BILLING_ENV.webhook) ? POLAR_BILLING_ENV.webhook : null,
      has(POLAR_BILLING_ENV.server) ? POLAR_BILLING_ENV.server : null,
      ...products,
    ].filter(Boolean);
    return {
      status: "WARN",
      detail:
        `${orphans.join(", ")} present but POLAR_ACCESS_TOKEN is missing — Polar billing is OFF despite looking configured. ` +
        "createCheckout refuses, the settings screen offers direct plan switching, and entitlement is not webhook-owned yet. " +
        "Finish it with `pnpm secret:set POLAR_ACCESS_TOKEN` (hidden input, straight into Convex env). " +
        `To stay pre-billing on purpose instead, drop the orphans: ${orphans.map((name) => `\`npx convex env remove ${name}\``).join(" ")}.`,
    };
  }

  return { status: "PASS", detail: `Polar access token, webhook and ${products.length} product(s) all present` };
}

/**
 * @param {Iterable<string>} envNames names present on the deployment
 * @returns {{ status: "PASS"|"WARN"|"FAIL"|"CRITICAL", detail: string }}
 */
export function inspectBillingCoherence(envNames) {
  const names = new Set(envNames);
  const has = (name) => names.has(name);

  const hasStripeSecret = has(BILLING_ENV.secret);
  const hasPolarSecret = has(POLAR_BILLING_ENV.secret);

  if (hasStripeSecret && hasPolarSecret) {
    return {
      status: "FAIL",
      detail:
        "Both STRIPE_SECRET_KEY and POLAR_ACCESS_TOKEN are configured — multiple active billing providers on a single deployment are not supported. Choose one primary provider.",
    };
  }

  const stripeResult = inspectStripeCoherence(names, has);
  const polarResult = inspectPolarCoherence(names, has);

  if (!stripeResult && !polarResult) {
    return {
      status: "WARN",
      detail:
        "no Stripe or Polar keys on this deployment — billing is off and plans switch directly, which is a normal pre-launch state. Run `pnpm onboard stripe --host <host>` or configure Polar when you want checkout.",
    };
  }

  if (stripeResult && !polarResult) return stripeResult;
  if (polarResult && !stripeResult) return polarResult;

  // Both configured: report the most severe state
  const results = [stripeResult, polarResult];
  results.sort((a, b) => SEVERITY_RANK[b.status] - SEVERITY_RANK[a.status]);
  return results[0];
}

/** Parse `convex env list` output into NAMES. Values are dropped here and never returned. */
export function envNamesFrom(stdout) {
  return (stdout ?? "")
    .split("\n")
    .map((line) => (/^\s*([A-Za-z_][A-Za-z0-9_]*)=/.exec(line) ?? [])[1])
    .filter(Boolean);
}
