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

describe("billing coherence", () => {
  test("no Stripe at all is a normal pre-launch state, not a failure", () => {
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
    // Unfinished setup, not a broken build: with no secret key checkout is unreachable,
    // so the deployment behaves exactly like one with no Stripe at all. `stripe:provision`
    // ends in this state by design, and red-gating it would break the engine's own
    // onboarding between two commands. The discrepancy still has to be said out loud.
    const result = inspectBillingCoherence([WEBHOOK, PRICE, SITE]);
    expect(result.status).toBe("WARN");
    expect(result.detail).toMatch(/billing is OFF despite looking configured/);
    expect(result.detail).toMatch(/pnpm secret:set STRIPE_SECRET_KEY/);
  });

  test("a reachable checkout that cannot pay out is the line between WARN and red", () => {
    // The severity rule, stated as a pair: the ONLY difference between these two is
    // whether a customer's card can be charged.
    expect(inspectBillingCoherence([WEBHOOK, PRICE, SITE]).status).toBe("WARN");
    expect(inspectBillingCoherence([SECRET, PRICE, SITE]).status).toBe("CRITICAL");
  });

  test("the money-losing state wins when several things are wrong at once", () => {
    // Secret set, nothing else. Webhook outranks price: it is the costlier failure.
    expect(inspectBillingCoherence([SECRET]).status).toBe("CRITICAL");
  });

  describe("Lemon Squeezy billing provider coherence", () => {
    const LS_KEY = "LEMON_SQUEEZY_API_KEY";
    const LS_WEBHOOK = "LEMON_SQUEEZY_WEBHOOK_SECRET";
    const LS_STORE = "LEMON_SQUEEZY_STORE_ID";
    const LS_VARIANT = "LEMON_SQUEEZY_VARIANT_PRO";

    const LS_MODE = "LEMON_SQUEEZY_MODE";

    test("a complete Lemon Squeezy configuration passes", () => {
      const result = inspectBillingCoherence([LS_KEY, LS_WEBHOOK, LS_STORE, LS_MODE, LS_VARIANT, SITE]);
      expect(result.status).toBe("PASS");
      expect(result.detail).toMatch(/Lemon Squeezy: API key, webhook secret, store ID and 1 variant\(s\) all present/);
    });

    test("Lemon Squeezy API key without webhook secret is CRITICAL", () => {
      const result = inspectBillingCoherence([LS_KEY, LS_STORE, LS_MODE, LS_VARIANT, SITE]);
      expect(result.status).toBe("CRITICAL");
      expect(result.detail).toMatch(/LEMON_SQUEEZY_API_KEY is set but LEMON_SQUEEZY_WEBHOOK_SECRET is not/);
    });

    test("Lemon Squeezy API key without store ID fails", () => {
      const result = inspectBillingCoherence([LS_KEY, LS_WEBHOOK, LS_MODE, LS_VARIANT, SITE]);
      expect(result.status).toBe("FAIL");
      expect(result.detail).toMatch(/LEMON_SQUEEZY_STORE_ID is missing/);
    });

    test("Lemon Squeezy API key without mode fails", () => {
      const result = inspectBillingCoherence([LS_KEY, LS_WEBHOOK, LS_STORE, LS_VARIANT, SITE]);
      expect(result.status).toBe("FAIL");
      expect(result.detail).toMatch(/LEMON_SQUEEZY_MODE is not configured/);
    });

    test("Lemon Squeezy API key without variants fails", () => {
      const result = inspectBillingCoherence([LS_KEY, LS_WEBHOOK, LS_STORE, LS_MODE, SITE]);
      expect(result.status).toBe("FAIL");
      expect(result.detail).toMatch(/no LEMON_SQUEEZY_VARIANT_\* is/);
    });

    test("Multiple active billing provider secrets fail with collision error", () => {
      const result = inspectBillingCoherence([SECRET, WEBHOOK, PRICE, LS_KEY, LS_WEBHOOK, LS_STORE, LS_MODE, LS_VARIANT, SITE]);
      expect(result.status).toBe("FAIL");
      expect(result.detail).toMatch(/Multiple billing provider secrets are configured/);
    });

    test("Lemon Squeezy orphan webhook/store/variant without key warns", () => {
      const result = inspectBillingCoherence([LS_WEBHOOK, LS_STORE, LS_VARIANT, SITE]);
      expect(result.status).toBe("WARN");
      expect(result.detail).toMatch(/Lemon Squeezy billing is OFF despite looking configured/);
    });
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
