// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  createPlausibleClient,
  createSyntheticPlausibleEvent,
  filterPlausibleProps,
  getPublicPlausibleConfig,
  isValidPlausibleApiHost,
  isValidPlausibleDomain,
  isValidPlausibleScriptUrl,
  scrubPlausibleEvent,
  simulatePlausibleCapture,
} from "./plausible.mjs";

describe("Plausible domain and URL validation", () => {
  test("accepts valid domain names", () => {
    expect(isValidPlausibleDomain("example.com")).toBe(true);
    expect(isValidPlausibleDomain("app.example.com")).toBe(true);
    expect(isValidPlausibleDomain("sub-domain.my-app.org")).toBe(true);
    expect(isValidPlausibleDomain("test.co.uk")).toBe(true);
    expect(isValidPlausibleDomain("localhost")).toBe(true);
    expect(isValidPlausibleDomain("app.internal")).toBe(true);
  });

  test("rejects invalid domain formats", () => {
    expect(isValidPlausibleDomain("")).toBe(false);
    expect(isValidPlausibleDomain("   ")).toBe(false);
    expect(isValidPlausibleDomain("http://example.com")).toBe(false);
    expect(isValidPlausibleDomain("https://example.com")).toBe(false);
    expect(isValidPlausibleDomain("example.com/path")).toBe(false);
    expect(isValidPlausibleDomain("example.com:8080")).toBe(false);
    expect(isValidPlausibleDomain(null)).toBe(false);
    expect(isValidPlausibleDomain(undefined)).toBe(false);
  });

  test("validates script URL must be HTTPS", () => {
    expect(isValidPlausibleScriptUrl("https://plausible.io/js/script.js")).toBe(true);
    expect(isValidPlausibleScriptUrl("https://stats.example.com/js/script.tagged-events.js")).toBe(true);
    expect(isValidPlausibleScriptUrl("http://insecure.com/js/script.js")).toBe(false);
    expect(isValidPlausibleScriptUrl("not-a-url")).toBe(false);
    expect(isValidPlausibleScriptUrl("")).toBe(false);
  });

  test("validates API host URL must be HTTPS", () => {
    expect(isValidPlausibleApiHost("https://plausible.io")).toBe(true);
    expect(isValidPlausibleApiHost("https://analytics.custom-domain.com")).toBe(true);
    expect(isValidPlausibleApiHost("http://insecure.com")).toBe(false);
    expect(isValidPlausibleApiHost("not-a-url")).toBe(false);
  });
});

describe("Plausible public configuration", () => {
  test("generates disabled config when unconfigured", () => {
    const config = getPublicPlausibleConfig({});
    expect(config.enabled).toBe(false);
    expect(config.domain).toBeNull();
    expect(config.provider).toBe("plausible");
  });

  test("generates enabled config with valid domain and options", () => {
    const config = getPublicPlausibleConfig({
      domain: "my-saas.com",
      scriptUrl: "https://plausible.io/js/script.tagged-events.outbound-links.js",
      outboundLinks: true,
      taggedEvents: true,
    });
    expect(config.enabled).toBe(true);
    expect(config.domain).toBe("my-saas.com");
    expect(config.scriptUrl).toBe("https://plausible.io/js/script.tagged-events.outbound-links.js");
    expect(config.outboundLinks).toBe(true);
    expect(config.taggedEvents).toBe(true);
    expect(config.hashMode).toBe(false);
  });
});

describe("Plausible privacy filtering and data scrubbing", () => {
  test("redacts emails from event properties", () => {
    const props = {
      plan: "pro",
      authorEmail: "alice@example.com",
      nested: { email: "bob@company.org" },
    };
    const filtered = filterPlausibleProps(props);
    expect(filtered.plan).toBe("pro");
    expect(filtered.authorEmail).toBe("[REDACTED_EMAIL]");
    expect(filtered.nested).toContain("[REDACTED_EMAIL]");
  });

  test("redacts sensitive tokens and secret keys", () => {
    const fakeBearer = ["Bearer", "abcdef0123456789abcdef"].join(" ");
    const fakeJwt = ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", "doNotLeakThisSignature"].join(".");
    const fakeStripeKey = ["sk", "live", "0123456789abcdef0123456789"].join("_");
    const fakePosthogKey = ["phx", "0123456789abcdef0123456789"].join("_");
    const fakeSentryToken = ["sntrys", "0123456789abcdef0123456789"].join("_");

    const props = {
      authHeader: fakeBearer,
      jwt: fakeJwt,
      stripeKey: fakeStripeKey,
      posthogKey: fakePosthogKey,
      sentryToken: fakeSentryToken,
      apiKey: ["fixture", "key", "12345"].join("-"),
      password: ["user", "password"].join("-"),
    };

    const filtered = filterPlausibleProps(props);
    expect(filtered.authHeader).toBe("Bearer [REDACTED]");
    expect(filtered.jwt).toBe("[REDACTED_JWT]");
    expect(filtered.stripeKey).toBe("[REDACTED_STRIPE_KEY]");
    expect(filtered.posthogKey).toBe("[REDACTED_POSTHOG_KEY]");
    expect(filtered.sentryToken).toBe("[REDACTED_SENTRY_TOKEN]");
    expect(filtered.apiKey).toBe("[REDACTED]");
    expect(filtered.password).toBe("[REDACTED]");
  });

  test("redacts agent prompts, transcripts, and instruction context", () => {
    const props = {
      userPrompt: "Please analyze the financial report.",
      systemPrompt: "You are an AI assistant.",
      transcript: "User: hello, Assistant: hi",
      healLedger: "Healing step 1",
      featureName: "billing-v2",
    };

    const filtered = filterPlausibleProps(props);
    expect(filtered.featureName).toBe("billing-v2");
    expect(filtered.userPrompt).toBe("[REDACTED_PROMPT]");
    expect(filtered.systemPrompt).toBe("[REDACTED_PROMPT]");
    expect(filtered.transcript).toBe("[REDACTED_PROMPT]");
    expect(filtered.healLedger).toBe("[REDACTED_PROMPT]");
  });

  test("scrubs query parameter secrets from event URLs", () => {
    const event = {
      name: "checkout_view",
      url: "https://my-saas.com/checkout?token=secret123&apiKey=key456&plan=pro",
      props: { checkoutId: "chk_123" },
    };

    const scrubbed = scrubPlausibleEvent(event);
    expect(scrubbed.name).toBe("checkout_view");
    expect(scrubbed.url).not.toContain("secret123");
    expect(scrubbed.url).not.toContain("key456");
    expect(scrubbed.url).toContain("plan=pro");
    expect(scrubbed.props.checkoutId).toBe("chk_123");
  });
});

describe("Plausible synthetic event testing", () => {
  test("creates synthetic verification event with tags", () => {
    const synthetic = createSyntheticPlausibleEvent({
      eventName: "signup_completed",
      domain: "app.example.com",
      props: { plan: "team" },
    });

    expect(synthetic.name).toBe("signup_completed");
    expect(synthetic.domain).toBe("app.example.com");
    expect(synthetic.props.synthetic).toBe("true");
    expect(synthetic.props.verification).toBe("true");
    expect(synthetic.props.stage).toBe("verification");
    expect(synthetic.props.plan).toBe("team");
  });

  test("simulates Plausible capture payload correctly", () => {
    const event = createSyntheticPlausibleEvent({
      eventName: "feature_used",
      domain: "saas.io",
      props: { feature: "export_csv", userEmail: "test@example.com" },
    });

    const result = simulatePlausibleCapture(event, { domain: "saas.io" });
    expect(result.delivered).toBe(true);
    expect(result.eventId).toBeDefined();
    expect(result.apiEndpoint).toBe("https://plausible.io/api/event");
    expect(result.payload.name).toBe("feature_used");
    expect(result.payload.domain).toBe("saas.io");
    expect(result.payload.props.userEmail).toBe("[REDACTED_EMAIL]");
    expect(result.payload.props.feature).toBe("export_csv");
  });

  test("throws when capturing event with invalid domain", () => {
    expect(() => {
      simulatePlausibleCapture({ name: "test" }, { domain: "http://invalid-domain.com" });
    }).toThrow(/Invalid domain/);
  });
});

describe("Plausible client non-blocking behavior", () => {
  test("returns safe no-op client when unconfigured", () => {
    const client = createPlausibleClient({});
    expect(client.isInitialized()).toBe(false);
    expect(client.getConfig().enabled).toBe(false);

    const eventResult = client.trackEvent("test_event", { props: { foo: "bar" } });
    expect(eventResult.success).toBe(true);
    expect(eventResult.delivered).toBe(false);
    expect(eventResult.reason).toBe("unconfigured");

    const pageviewResult = client.trackPageview({ url: "https://example.com" });
    expect(pageviewResult.success).toBe(true);
    expect(pageviewResult.delivered).toBe(false);
    expect(pageviewResult.reason).toBe("unconfigured");
  });

  test("tracks events and pageviews when properly configured", () => {
    const client = createPlausibleClient({ domain: "my-app.com" });
    expect(client.isInitialized()).toBe(true);
    expect(client.getConfig().enabled).toBe(true);

    const eventResult = client.trackEvent("button_clicked", { props: { buttonId: "hero_cta" } });
    expect(eventResult.success).toBe(true);
    expect(eventResult.delivered).toBe(true);
    expect(eventResult.eventName).toBe("button_clicked");
    expect(eventResult.domain).toBe("my-app.com");
    expect(eventResult.props.buttonId).toBe("hero_cta");

    const pageviewResult = client.trackPageview();
    expect(pageviewResult.success).toBe(true);
    expect(pageviewResult.delivered).toBe(true);
    expect(pageviewResult.eventName).toBe("pageview");
    expect(pageviewResult.domain).toBe("my-app.com");
  });
});
