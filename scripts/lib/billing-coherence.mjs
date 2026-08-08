/**
 * Is billing COHERENT on a deployment — not merely "are some Stripe names present".
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
  const prices = [...names].filter((name) => name.startsWith(BILLING_ENV.pricePrefix));
  const anyStripe = [...names].some((name) => name.startsWith("STRIPE_"));

  if (!anyStripe) {
    return {
      status: "WARN",
      detail:
        "no Stripe keys on this deployment — billing is off and plans switch directly, which is a normal pre-launch state. Run `pnpm onboard stripe --host <host>` when you want checkout.",
    };
  }

  // Ordered by what each state costs. Taking money without granting the plan first.
  if (has(BILLING_ENV.secret) && !has(BILLING_ENV.webhook)) {
    return {
      status: "CRITICAL",
      detail:
        "STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is not — checkout completes, the webhook is rejected unsigned, and entitlement never arrives. The customer pays and gets nothing.",
    };
  }

  // Below here nothing can take money — checkout throws before it reaches Stripe — so
  // these are FAIL rather than CRITICAL. Severity tracks what it costs, not how broken
  // it looks.
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

  // No secret key means checkout is unreachable, so this deployment behaves EXACTLY like
  // one with no Stripe at all: nothing is charged, nothing leaks, no customer is touched.
  // It is unfinished setup, not a broken build — and `pnpm stripe:provision` deliberately
  // ends here, printing the one human step. Grading its own documented waypoint red would
  // turn the engine's onboarding into a failing gate between two commands.
  //
  // The thing worth saying out loud is the DISCREPANCY: a deployment carrying prices and
  // a webhook endpoint looks live to a person reading its env, and is not.
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

/** Parse `convex env list` output into NAMES. Values are dropped here and never returned. */
export function envNamesFrom(stdout) {
  return (stdout ?? "")
    .split("\n")
    .map((line) => (/^\s*([A-Za-z_][A-Za-z0-9_]*)=/.exec(line) ?? [])[1])
    .filter(Boolean);
}
