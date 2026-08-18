// @vitest-environment node
import { describe, expect, test } from "vitest";
import { envNamesFrom, inspectBillingCoherence } from "./billing-coherence.mjs";

/**
 * The billing states a deployment can be in, and what each one costs.
 *
 * These combinations are why the check exists: every name below is individually valid
 * and the deployment is broken anyway. The severities are asserted rather than assumed,
 * because the ordering IS the rule — a state that can take money without granting a plan
 * has to outrank one where checkout simply throws.
 */
const PRICE = "STRIPE_PRICE_PRO";
const SECRET = "STRIPE_SECRET_KEY";
const WEBHOOK = "STRIPE_WEBHOOK_SECRET";
const SITE = "SITE_URL";

const POLAR_PRODUCT = "POLAR_PRODUCT_PRO";
const POLAR_SECRET = "POLAR_ACCESS_TOKEN";
const POLAR_WEBHOOK = "POLAR_WEBHOOK_SECRET";

describe("billing coherence - Stripe", () => {
  test("no Stripe or Polar at all is a normal pre-launch state, not a failure", () => {
    // AGENTS.md: not-yet-connected is a WARN, never an error.
    const result = inspectBillingCoherence([SITE, "BETTER_AUTH_SECRET"]);
    expect(result.status).toBe("WARN");
    expect(result.detail).toMatch(/billing is off/i);
  });

  test("a complete configuration passes", () => {
    expect(inspectBillingCoherence([SECRET, WEBHOOK, PRICE, SITE]).status).toBe("PASS");
  });

  test("secret key without a webhook secret is CRITICAL — the customer pays and gets nothing", () => {
    // The only state here where money moves and no entitlement follows.
    const result = inspectBillingCoherence([SECRET, PRICE, SITE]);
    expect(result.status).toBe("CRITICAL");
    expect(result.detail).toMatch(/pays and gets nothing/i);
  });

  test("secret key without a price fails, but is not CRITICAL — checkout throws first", () => {
    expect(inspectBillingCoherence([SECRET, WEBHOOK, SITE]).status).toBe("FAIL");
  });

  test("secret key without SITE_URL fails — Stripe needs a return URL", () => {
    expect(inspectBillingCoherence([SECRET, WEBHOOK, PRICE]).status).toBe("FAIL");
  });

  test("prices and a webhook secret with no key warns rather than fails", () => {
    const result = inspectBillingCoherence([WEBHOOK, PRICE, SITE]);
    expect(result.status).toBe("WARN");
    expect(result.detail).toMatch(/billing is OFF despite looking configured/);
    expect(result.detail).toMatch(/pnpm secret:set STRIPE_SECRET_KEY/);
  });

  test("a reachable checkout that cannot pay out is the line between WARN and red", () => {
    expect(inspectBillingCoherence([WEBHOOK, PRICE, SITE]).status).toBe("WARN");
    expect(inspectBillingCoherence([SECRET, PRICE, SITE]).status).toBe("CRITICAL");
  });

  test("the money-losing state wins when several things are wrong at once", () => {
    expect(inspectBillingCoherence([SECRET]).status).toBe("CRITICAL");
  });
});

describe("billing coherence - Polar", () => {
  const POLAR_SERVER = "POLAR_SERVER";

  test("a complete Polar configuration passes", () => {
    const result = inspectBillingCoherence([POLAR_SECRET, POLAR_WEBHOOK, POLAR_SERVER, POLAR_PRODUCT, SITE]);
    expect(result.status).toBe("PASS");
    expect(result.detail).toMatch(/Polar access token, webhook and 1 product\(s\) all present/);
  });

  test("Polar access token without a webhook secret is CRITICAL", () => {
    const result = inspectBillingCoherence([POLAR_SECRET, POLAR_SERVER, POLAR_PRODUCT, SITE]);
    expect(result.status).toBe("CRITICAL");
    expect(result.detail).toMatch(/POLAR_ACCESS_TOKEN is set but POLAR_WEBHOOK_SECRET is not/);
  });

  test("Polar access token without POLAR_SERVER fails", () => {
    const result = inspectBillingCoherence([POLAR_SECRET, POLAR_WEBHOOK, POLAR_PRODUCT, SITE]);
    expect(result.status).toBe("FAIL");
    expect(result.detail).toMatch(/POLAR_SERVER is not configured/);
  });

  test("Polar access token without products fails", () => {
    const result = inspectBillingCoherence([POLAR_SECRET, POLAR_WEBHOOK, POLAR_SERVER, SITE]);
    expect(result.status).toBe("FAIL");
    expect(result.detail).toMatch(/no POLAR_PRODUCT_\* is/);
  });

  test("Polar access token without SITE_URL fails", () => {
    const result = inspectBillingCoherence([POLAR_SECRET, POLAR_WEBHOOK, POLAR_SERVER, POLAR_PRODUCT]);
    expect(result.status).toBe("FAIL");
    expect(result.detail).toMatch(/POLAR_ACCESS_TOKEN is set but SITE_URL is not/);
  });

  test("Configuring both Stripe and Polar secret keys fails with provider collision error", () => {
    const result = inspectBillingCoherence([
      SECRET,
      WEBHOOK,
      PRICE,
      POLAR_SECRET,
      POLAR_WEBHOOK,
      POLAR_SERVER,
      POLAR_PRODUCT,
      SITE,
    ]);
    expect(result.status).toBe("FAIL");
    expect(result.detail).toMatch(/Both STRIPE_SECRET_KEY and POLAR_ACCESS_TOKEN are configured/);
  });

  test("Polar products and webhook with no access token warns", () => {
    const result = inspectBillingCoherence([POLAR_WEBHOOK, POLAR_PRODUCT, SITE]);
    expect(result.status).toBe("WARN");
    expect(result.detail).toMatch(/POLAR_ACCESS_TOKEN is missing/);
    expect(result.detail).toMatch(/pnpm secret:set POLAR_ACCESS_TOKEN/);
  });
});

describe("env parsing", () => {
  test("keeps names and drops every value", () => {
    const names = envNamesFrom("STRIPE_SECRET_KEY=sk_test_dont_leak_me\nSITE_URL=http://x\n\n");
    expect(names).toEqual(["STRIPE_SECRET_KEY", "SITE_URL"]);
    expect(names.join()).not.toMatch(/sk_test/);
  });

  test("survives an empty or noisy stream", () => {
    expect(envNamesFrom("")).toEqual([]);
    expect(envNamesFrom(undefined)).toEqual([]);
    expect(envNamesFrom("not an assignment line\n")).toEqual([]);
  });
});
