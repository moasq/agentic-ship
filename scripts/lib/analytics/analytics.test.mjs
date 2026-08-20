// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  ANALYTICS_PROVIDERS,
  createAnalyticsClient,
  inspectProductionAnalyticsEnvironment,
} from "./index.mjs";

describe("Analytics multi-provider mutual exclusivity and factory", () => {
  test("supported analytics providers list includes posthog, plausible, and umami", () => {
    expect(ANALYTICS_PROVIDERS).toContain("posthog");
    expect(ANALYTICS_PROVIDERS).toContain("plausible");
    expect(ANALYTICS_PROVIDERS).toContain("umami");
  });

  test("selecting Plausible initializes Plausible only and never PostHog or Umami", () => {
    const client = createAnalyticsClient("plausible", {
      domain: "app.acme.com",
    });

    expect(client.provider).toBe("plausible");
    expect(client.isInitialized()).toBe(true);
    expect(client.getConfig().domain).toBe("app.acme.com");
    // Ensure Umami and PostHog properties/methods are not active
    expect(client.getConfig().websiteId).toBeUndefined();
    expect(client.getConfig().apiKey).toBeUndefined();
  });

  test("selecting Umami initializes Umami only and never PostHog or Plausible", () => {
    const client = createAnalyticsClient("umami", {
      websiteId: "12345678-1234-1234-1234-123456789abc",
      hostUrl: "https://cloud.umami.is",
    });

    expect(client.provider).toBe("umami");
    expect(client.isInitialized()).toBe(true);
    expect(client.getConfig().websiteId).toBe("12345678-1234-1234-1234-123456789abc");
    expect(client.getConfig().hostUrl).toBe("https://cloud.umami.is");
    // Ensure Plausible and PostHog properties/methods are not active
    expect(client.getConfig().domain).toBeUndefined();
    expect(client.getConfig().apiKey).toBeUndefined();
  });

  test("selecting PostHog initializes PostHog only and never Plausible or Umami", () => {
    const client = createAnalyticsClient("posthog", {
      apiKey: "phc_test_project_key_123",
    });

    expect(client.provider).toBe("posthog");
    expect(client.isInitialized()).toBe(true);
    expect(client.getConfig().apiKey).toBe("phc_test_project_key_123");
    // Ensure Plausible and Umami properties/methods are not active
    expect(client.getConfig().domain).toBeUndefined();
    expect(client.getConfig().websiteId).toBeUndefined();
  });

  test("unconfigured provider returns safe no-op client without throwing", () => {
    const client = createAnalyticsClient("none");
    expect(client.isInitialized()).toBe(false);
    expect(client.getConfig().enabled).toBe(false);

    expect(() => client.track()).not.toThrow();
    expect(() => client.trackEvent()).not.toThrow();
    expect(() => client.trackPageview()).not.toThrow();
    expect(() => client.capture()).not.toThrow();
    expect(() => client.identify()).not.toThrow();
  });
});

describe("Production analytics preflight inspection", () => {
  test("skips audit when analytics is completely unconfigured", () => {
    const result = inspectProductionAnalyticsEnvironment("");
    expect(result.status).toBe("SKIP");
  });

  test("passes for valid Plausible production configuration", () => {
    const env = "NEXT_PUBLIC_PLAUSIBLE_DOMAIN=my-production-domain.com\n";
    const result = inspectProductionAnalyticsEnvironment(env, { selectedProvider: "plausible" });
    expect(result.status).toBe("PASS");
    expect(result.provider).toBe("plausible");
    expect(result.providerDisplayName).toBe("Plausible");
  });

  test("fails for invalid or localhost Plausible production domain", () => {
    const envLocalhost = "NEXT_PUBLIC_PLAUSIBLE_DOMAIN=localhost\n";
    const resultLocalhost = inspectProductionAnalyticsEnvironment(envLocalhost, { selectedProvider: "plausible" });
    expect(resultLocalhost.status).toBe("FAIL");
    expect(resultLocalhost.detail).toContain("not a valid production domain");

    const envMissing = "ANALYTICS_PROVIDER=plausible\n";
    const resultMissing = inspectProductionAnalyticsEnvironment(envMissing, { selectedProvider: "plausible" });
    expect(resultMissing.status).toBe("FAIL");
    expect(resultMissing.detail).toContain("NEXT_PUBLIC_PLAUSIBLE_DOMAIN is not set");
  });

  test("passes for valid Umami production configuration", () => {
    const env = [
      "NEXT_PUBLIC_UMAMI_WEBSITE_ID=9420c944-2450-48e0-bb15-84e0c460a80e",
      "NEXT_PUBLIC_UMAMI_HOST_URL=https://cloud.umami.is",
    ].join("\n");

    const result = inspectProductionAnalyticsEnvironment(env, { selectedProvider: "umami" });
    expect(result.status).toBe("PASS");
    expect(result.provider).toBe("umami");
    expect(result.providerDisplayName).toBe("Umami");
  });

  test("fails for invalid Umami Website ID or insecure Host URL", () => {
    const envInvalidId = [
      "NEXT_PUBLIC_UMAMI_WEBSITE_ID=not-a-uuid",
      "NEXT_PUBLIC_UMAMI_HOST_URL=https://cloud.umami.is",
    ].join("\n");
    const resultInvalidId = inspectProductionAnalyticsEnvironment(envInvalidId, { selectedProvider: "umami" });
    expect(resultInvalidId.status).toBe("FAIL");
    expect(resultInvalidId.detail).toContain("not a valid UUID");

    const envInsecureHost = [
      "NEXT_PUBLIC_UMAMI_WEBSITE_ID=9420c944-2450-48e0-bb15-84e0c460a80e",
      "NEXT_PUBLIC_UMAMI_HOST_URL=http://insecure-umami.com",
    ].join("\n");
    const resultInsecureHost = inspectProductionAnalyticsEnvironment(envInsecureHost, { selectedProvider: "umami" });
    expect(resultInsecureHost.status).toBe("FAIL");
    expect(resultInsecureHost.detail).toContain("must be a valid HTTPS URL");
  });

  test("fails if personal PostHog phx_ key leaks into client env", () => {
    const env = "NEXT_PUBLIC_POSTHOG_KEY=phx_personal_secret_token_12345\n";
    const result = inspectProductionAnalyticsEnvironment(env);
    expect(result.status).toBe("FAIL");
    expect(result.detail).toContain("contains a personal phx_ key");
  });

  test("passes for valid PostHog public phc_ key", () => {
    const env = "NEXT_PUBLIC_POSTHOG_KEY=phc_public_project_key_12345\n";
    const result = inspectProductionAnalyticsEnvironment(env, { selectedProvider: "posthog" });
    expect(result.status).toBe("PASS");
    expect(result.provider).toBe("posthog");
  });
});
