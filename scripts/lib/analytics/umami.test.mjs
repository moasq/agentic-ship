// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  createSyntheticUmamiEvent,
  createUmamiClient,
  filterUmamiData,
  getPublicUmamiConfig,
  getUmamiScriptUrl,
  isUmamiOriginAllowed,
  isValidUmamiHostUrl,
  isValidUmamiWebsiteId,
  parseUmamiDomains,
  scrubUmamiEvent,
  simulateUmamiCapture,
} from "./umami.mjs";

describe("Umami Website ID and Host URL validation", () => {
  test("accepts valid UUID Website IDs", () => {
    expect(isValidUmamiWebsiteId("9420c944-2450-48e0-bb15-84e0c460a80e")).toBe(true);
    expect(isValidUmamiWebsiteId("00000000-0000-0000-0000-000000000000")).toBe(true);
    expect(isValidUmamiWebsiteId("A1B2C3D4-E5F6-7A8B-9C0D-E1F2A3B4C5D6")).toBe(true);
  });

  test("rejects invalid Website ID formats", () => {
    expect(isValidUmamiWebsiteId("")).toBe(false);
    expect(isValidUmamiWebsiteId("   ")).toBe(false);
    expect(isValidUmamiWebsiteId("not-a-uuid")).toBe(false);
    expect(isValidUmamiWebsiteId("9420c944-2450-48e0-bb15")).toBe(false);
    expect(isValidUmamiWebsiteId("phc_1234567890abcdef")).toBe(false);
    expect(isValidUmamiWebsiteId(null)).toBe(false);
    expect(isValidUmamiWebsiteId(undefined)).toBe(false);
  });

  test("validates Host URL must be HTTPS", () => {
    expect(isValidUmamiHostUrl("https://cloud.umami.is")).toBe(true);
    expect(isValidUmamiHostUrl("https://analytics.example.com")).toBe(true);
    expect(isValidUmamiHostUrl("https://eu.umami.is/custom-path")).toBe(true);
    expect(isValidUmamiHostUrl("http://insecure.com")).toBe(false);
    expect(isValidUmamiHostUrl("not-a-url")).toBe(false);
    expect(isValidUmamiHostUrl("")).toBe(false);
  });
});

describe("Umami allowed origins and script URLs", () => {
  test("parses domains from comma-separated string or array", () => {
    expect(parseUmamiDomains("example.com, app.example.com")).toEqual(["example.com", "app.example.com"]);
    expect(parseUmamiDomains(["MY-SITE.COM", "TEST.ORG"])).toEqual(["my-site.com", "test.org"]);
    expect(parseUmamiDomains("")).toEqual([]);
    expect(parseUmamiDomains(null)).toEqual([]);
  });

  test("validates allowed origins against configured domains", () => {
    const domains = "my-saas.com, *.my-saas.com, partner.org";
    expect(isUmamiOriginAllowed("my-saas.com", domains)).toBe(true);
    expect(isUmamiOriginAllowed("https://app.my-saas.com", domains)).toBe(true);
    expect(isUmamiOriginAllowed("partner.org", domains)).toBe(true);
    expect(isUmamiOriginAllowed("unauthorized.com", domains)).toBe(false);
    expect(isUmamiOriginAllowed("other-site.org", domains)).toBe(false);

    // If no domains are configured, all origins are allowed
    expect(isUmamiOriginAllowed("any-site.com", "")).toBe(true);
  });

  test("derives standard and custom script URLs", () => {
    expect(getUmamiScriptUrl("https://cloud.umami.is")).toBe("https://cloud.umami.is/script.js");
    expect(getUmamiScriptUrl("https://cloud.umami.is/", "https://custom.cdn.com/umami.js")).toBe("https://custom.cdn.com/umami.js");
    expect(getUmamiScriptUrl("http://invalid.com")).toBeNull();
  });
});

describe("Umami public configuration", () => {
  test("generates disabled config when unconfigured", () => {
    const config = getPublicUmamiConfig({});
    expect(config.enabled).toBe(false);
    expect(config.websiteId).toBeNull();
    expect(config.hostUrl).toBeNull();
    expect(config.provider).toBe("umami");
  });

  test("generates enabled config with valid website ID and host URL", () => {
    const config = getPublicUmamiConfig({
      websiteId: "9420c944-2450-48e0-bb15-84e0c460a80e",
      hostUrl: "https://cloud.umami.is",
      domains: "example.com, app.example.com",
      autoTrack: true,
      doNotTrack: false,
    });
    expect(config.enabled).toBe(true);
    expect(config.websiteId).toBe("9420c944-2450-48e0-bb15-84e0c460a80e");
    expect(config.hostUrl).toBe("https://cloud.umami.is");
    expect(config.scriptUrl).toBe("https://cloud.umami.is/script.js");
    expect(config.domains).toEqual(["example.com", "app.example.com"]);
    expect(config.autoTrack).toBe(true);
    expect(config.doNotTrack).toBe(false);
  });
});

describe("Umami privacy filtering and data scrubbing", () => {
  test("redacts emails from event data", () => {
    const data = {
      plan: "team",
      email: "user@example.com",
      nested: { contact: "sales@vendor.com" },
    };
    const filtered = filterUmamiData(data);
    expect(filtered.plan).toBe("team");
    expect(filtered.email).toBe("[REDACTED_EMAIL]");
    expect(filtered.nested).toContain("[REDACTED_EMAIL]");
  });

  test("redacts sensitive tokens and credentials", () => {
    const fakeBearer = ["Bearer", "abcdef0123456789abcdef"].join(" ");
    const fakeJwt = ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", "doNotLeakThisSignature"].join(".");
    const fakeStripeKey = ["sk", "live", "0123456789abcdef0123456789"].join("_");
    const fakePosthogKey = ["phx", "0123456789abcdef0123456789"].join("_");

    const data = {
      auth: fakeBearer,
      jwt: fakeJwt,
      stripe: fakeStripeKey,
      posthog: fakePosthogKey,
      apiKey: ["fixture", "api", "key"].join("-"),
      password: "pass",
    };

    const filtered = filterUmamiData(data);
    expect(filtered.auth).toBe("Bearer [REDACTED]");
    expect(filtered.jwt).toBe("[REDACTED_JWT]");
    expect(filtered.stripe).toBe("[REDACTED_STRIPE_KEY]");
    expect(filtered.posthog).toBe("[REDACTED_POSTHOG_KEY]");
    expect(filtered.apiKey).toBe("[REDACTED]");
    expect(filtered.password).toBe("[REDACTED]");
  });

  test("redacts agent prompts, transcripts, and instruction context", () => {
    const data = {
      userPrompt: "Build an analytics adapter.",
      transcript: "Step 1: read requirements. Step 2: code.",
      systemPrompt: "System instruction.",
      feature: "analytics-migration",
    };

    const filtered = filterUmamiData(data);
    expect(filtered.feature).toBe("analytics-migration");
    expect(filtered.userPrompt).toBe("[REDACTED_PROMPT]");
    expect(filtered.transcript).toBe("[REDACTED_PROMPT]");
    expect(filtered.systemPrompt).toBe("[REDACTED_PROMPT]");
  });

  test("scrubs query parameter secrets from event URLs", () => {
    const event = {
      name: "pricing_click",
      url: "https://my-saas.com/pricing?token=secret123&plan=enterprise",
      data: { plan: "enterprise" },
    };

    const scrubbed = scrubUmamiEvent(event);
    expect(scrubbed.name).toBe("pricing_click");
    expect(scrubbed.url).not.toContain("secret123");
    expect(scrubbed.url).toContain("plan=enterprise");
    expect(scrubbed.data.plan).toBe("enterprise");
  });
});

describe("Umami synthetic event testing", () => {
  test("creates synthetic verification event with tags", () => {
    const synthetic = createSyntheticUmamiEvent({
      eventName: "checkout_completed",
      websiteId: "9420c944-2450-48e0-bb15-84e0c460a80e",
      hostUrl: "https://cloud.umami.is",
      data: { amount: "49.00", currency: "USD" },
    });

    expect(synthetic.name).toBe("checkout_completed");
    expect(synthetic.websiteId).toBe("9420c944-2450-48e0-bb15-84e0c460a80e");
    expect(synthetic.hostUrl).toBe("https://cloud.umami.is");
    expect(synthetic.data.synthetic).toBe("true");
    expect(synthetic.data.verification).toBe("true");
    expect(synthetic.data.stage).toBe("verification");
    expect(synthetic.data.amount).toBe("49.00");
  });

  test("simulates Umami capture payload correctly", () => {
    const event = createSyntheticUmamiEvent({
      eventName: "sign_in",
      websiteId: "9420c944-2450-48e0-bb15-84e0c460a80e",
      hostUrl: "https://analytics.company.com",
      url: "https://app.company.com/login",
      data: { method: "oauth_google", userEmail: "test@company.com" },
    });

    const result = simulateUmamiCapture(event, {
      websiteId: "9420c944-2450-48e0-bb15-84e0c460a80e",
      hostUrl: "https://analytics.company.com",
    });

    expect(result.delivered).toBe(true);
    expect(result.eventId).toBeDefined();
    expect(result.apiEndpoint).toBe("https://analytics.company.com/api/send");
    expect(result.payload.type).toBe("event");
    expect(result.payload.payload.website).toBe("9420c944-2450-48e0-bb15-84e0c460a80e");
    expect(result.payload.payload.name).toBe("sign_in");
    expect(result.payload.payload.data.userEmail).toBe("[REDACTED_EMAIL]");
    expect(result.payload.payload.data.method).toBe("oauth_google");
  });

  test("throws when capturing event with invalid website ID or host URL", () => {
    expect(() => {
      simulateUmamiCapture({ name: "test" }, { websiteId: "invalid-id", hostUrl: "https://cloud.umami.is" });
    }).toThrow(/Invalid Website ID/);

    expect(() => {
      simulateUmamiCapture(
        { name: "test" },
        { websiteId: "9420c944-2450-48e0-bb15-84e0c460a80e", hostUrl: "http://insecure.com" },
      );
    }).toThrow(/Invalid Host URL/);
  });
});

describe("Umami client non-blocking behavior", () => {
  test("returns safe no-op client when unconfigured", () => {
    const client = createUmamiClient({});
    expect(client.isInitialized()).toBe(false);
    expect(client.getConfig().enabled).toBe(false);

    const trackResult = client.track("nav_click", { target: "features" });
    expect(trackResult.success).toBe(true);
    expect(trackResult.delivered).toBe(false);
    expect(trackResult.reason).toBe("unconfigured");

    const pageviewResult = client.trackPageview({ page: "/pricing" });
    expect(pageviewResult.success).toBe(true);
    expect(pageviewResult.delivered).toBe(false);
    expect(pageviewResult.reason).toBe("unconfigured");

    const identifyResult = client.identify({ role: "admin" });
    expect(identifyResult.success).toBe(true);
    expect(identifyResult.delivered).toBe(false);
    expect(identifyResult.reason).toBe("unconfigured");
  });

  test("tracks events and pageviews when properly configured", () => {
    const client = createUmamiClient({
      websiteId: "9420c944-2450-48e0-bb15-84e0c460a80e",
      hostUrl: "https://cloud.umami.is",
    });

    expect(client.isInitialized()).toBe(true);
    expect(client.getConfig().enabled).toBe(true);

    const trackResult = client.track("cta_click", { button: "try_free" });
    expect(trackResult.success).toBe(true);
    expect(trackResult.delivered).toBe(true);
    expect(trackResult.eventName).toBe("cta_click");
    expect(trackResult.websiteId).toBe("9420c944-2450-48e0-bb15-84e0c460a80e");
    expect(trackResult.data.button).toBe("try_free");

    const pageviewResult = client.trackPageview();
    expect(pageviewResult.success).toBe(true);
    expect(pageviewResult.delivered).toBe(true);
    expect(pageviewResult.eventName).toBe("pageview");
  });
});
