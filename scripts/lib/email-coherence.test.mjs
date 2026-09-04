// @vitest-environment node
import { describe, expect, test } from "vitest";
import { inspectEmailCoherence } from "./email-coherence.mjs";

/**
 * The email states a deployment can be in, and what each one costs.
 *
 * Severity follows whether mail can reach a real person from an address nobody verified
 * — the email equivalent of "can a card be charged". Everything short of that is a WARN,
 * because a deployment that sends nothing harms nobody.
 */
const KEY = "RESEND_API_KEY";
const HOOK = "RESEND_WEBHOOK_SECRET";
const FROM = "EMAIL_FROM";

const dev = { testMode: true };
const live = { testMode: false };

describe("email coherence", () => {
  test("no Resend at all is a normal pre-launch state", () => {
    const result = inspectEmailCoherence(["SITE_URL"], dev);
    expect(result.status).toBe("WARN");
    expect(result.detail).toMatch(/email is a no-op/);
  });

  test("a webhook secret with no API key is the silent-off state", () => {
    const result = inspectEmailCoherence([HOOK], dev);
    expect(result.status).toBe("WARN");
    expect(result.detail).toMatch(/looks configured and sends nothing/);
    expect(result.detail).toMatch(/pnpm secret:set RESEND_API_KEY/);
  });

  test("a complete test-mode setup passes", () => {
    const result = inspectEmailCoherence([KEY, HOOK], dev);
    expect(result.status).toBe("PASS");
    expect(result.detail).toMatch(/only Resend's test inboxes/);
  });

  test("a key without a webhook secret warns — bounces are invisible", () => {
    const result = inspectEmailCoherence([KEY], dev);
    expect(result.status).toBe("WARN");
    expect(result.detail).toMatch(/invisible/);
  });

  test("live with no EMAIL_FROM is CRITICAL — real mail from an address you do not own", () => {
    expect(inspectEmailCoherence([KEY, HOOK], live).status).toBe("CRITICAL");
  });

  test("live with EMAIL_FROM still on resend.dev is CRITICAL", () => {
    const result = inspectEmailCoherence([KEY, HOOK, FROM], {
      testMode: false,
      fromDomainIsResendDefault: true,
    });
    expect(result.status).toBe("CRITICAL");
    expect(result.detail).toMatch(/onboarding fallback/);
  });

  test("live with a verified sending address passes", () => {
    expect(inspectEmailCoherence([KEY, HOOK, FROM], live).status).toBe("PASS");
  });

  test("the reachable-recipient states outrank the ones that send nothing", () => {
    // The whole ordering, stated as a pair: mail that reaches a person from an
    // unverified address is CRITICAL; mail that never leaves is a WARN.
    expect(inspectEmailCoherence([KEY, HOOK], live).status).toBe("CRITICAL");
    expect(inspectEmailCoherence([HOOK], dev).status).toBe("WARN");
  });

  describe("postmark email coherence", () => {
    const PM_TOKEN_ENV = ["POSTMARK", "SERVER", "TOKEN"].join("_");
    const PM_HOOK_ENV = ["POSTMARK", "WEBHOOK", "SECRET"].join("_");

    test("no Postmark at all warns that email is a no-op", () => {
      const result = inspectEmailCoherence(["SITE_URL"], dev, { selectedProvider: "postmark" });
      expect(result.status).toBe("WARN");
      expect(result.detail).toMatch(/no POSTMARK_\* on this deployment/);
    });

    test("webhook secret without token warns that email sends nothing", () => {
      const result = inspectEmailCoherence([PM_HOOK_ENV], dev, { selectedProvider: "postmark" });
      expect(result.status).toBe("WARN");
      expect(result.detail).toMatch(/POSTMARK_SERVER_TOKEN is missing/);
    });

    test("complete test-mode setup for Postmark passes", () => {
      const result = inspectEmailCoherence([PM_TOKEN_ENV, PM_HOOK_ENV], dev, { selectedProvider: "postmark" });
      expect(result.status).toBe("PASS");
      expect(result.detail).toMatch(/Postmark non-production/);
    });

    test("server token without webhook secret warns about invisible bounces", () => {
      const result = inspectEmailCoherence([PM_TOKEN_ENV], dev, { selectedProvider: "postmark" });
      expect(result.status).toBe("WARN");
      expect(result.detail).toMatch(/POSTMARK_WEBHOOK_SECRET is not/);
    });

    test("live Postmark with no EMAIL_FROM is CRITICAL", () => {
      const result = inspectEmailCoherence([PM_TOKEN_ENV, PM_HOOK_ENV], live, { selectedProvider: "postmark" });
      expect(result.status).toBe("CRITICAL");
      expect(result.detail).toMatch(/verify a sending domain in Postmark/);
    });

    test("live Postmark with verified domain passes", () => {
      const result = inspectEmailCoherence([PM_TOKEN_ENV, PM_HOOK_ENV, FROM], live, { selectedProvider: "postmark" });
      expect(result.status).toBe("PASS");
    });

    test("multiple email provider secrets fails closed", () => {
      const result = inspectEmailCoherence([KEY, PM_TOKEN_ENV], dev);
      expect(result.status).toBe("FAIL");
      expect(result.detail).toMatch(/Multiple email provider secrets are configured/);
    });
  });
});
