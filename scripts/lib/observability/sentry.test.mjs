// @vitest-environment node
import assert from "node:assert/strict";
import { describe, expect, test } from "vitest";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isValidSentryDsn,
  parseSentryDsn,
  isSensitiveSentryToken,
  assertPublicDsnNotSecret,
  getPublicSentryConfig,
  scrubString,
  scrubHeaders,
  scrubUser,
  scrubRequest,
  scrubBreadcrumbs,
  scrubSentryEvent,
  createSentryBeforeSend,
  createSyntheticVerificationEvent,
  simulateSentryCapture,
  createSentryClient,
  inspectObservabilityCoherence,
  inspectProductionObservabilityEnvironment,
} from "./sentry.mjs";
import { loadConnectionCatalog } from "../connections/catalog.mjs";
import { catalogOrigins } from "../url-allowlist.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("Sentry Public DSN & Sensitive Auth Token Validation", () => {
  const validDsn = "https://1234567890abcdef1234567890abcdef@o12345.ingest.sentry.io/67890";

  test("validates well-formed HTTPS Sentry DSNs", () => {
    expect(isValidSentryDsn(validDsn)).toBe(true);
    expect(isValidSentryDsn("https://publicKey:secretKey@sentry.example.com/123")).toBe(true);
    expect(isValidSentryDsn("https://key@sentry.io:8443/custom/path/42")).toBe(true);
  });

  test("rejects invalid, non-https, or malformed DSNs", () => {
    expect(isValidSentryDsn("http://key@sentry.io/123")).toBe(false);
    expect(isValidSentryDsn("https://sentry.io/123")).toBe(false); // missing key / username
    expect(isValidSentryDsn("https://key@sentry.io")).toBe(false); // missing project ID
    expect(isValidSentryDsn("https://key@sentry.io/not-a-number-id")).toBe(false);
    expect(isValidSentryDsn("")).toBe(false);
    expect(isValidSentryDsn(null)).toBe(false);
    expect(isValidSentryDsn(undefined)).toBe(false);
  });

  test("parses Sentry DSN constituents accurately", () => {
    const parsed = parseSentryDsn(validDsn);
    expect(parsed.protocol).toBe("https");
    expect(parsed.publicKey).toBe("1234567890abcdef1234567890abcdef");
    expect(parsed.host).toBe("o12345.ingest.sentry.io");
    expect(parsed.projectId).toBe("67890");
    expect(parsed.port).toBe("443");
  });

  test("throws when parsing invalid DSN", () => {
    expect(() => parseSentryDsn("invalid")).toThrow(/Invalid Sentry DSN/);
  });

  test("identifies sensitive Sentry auth tokens and rejects them as public DSNs", () => {
    const sensitiveToken = ["sntrys", "0123456789abcdef0123456789abcdef0123456789abcdef"].join("_");
    expect(isSensitiveSentryToken(sensitiveToken)).toBe(true);
    expect(isSensitiveSentryToken("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")).toBe(true);
    expect(isSensitiveSentryToken("public-key-short")).toBe(false);

    expect(isValidSentryDsn(`https://${sensitiveToken}@sentry.io/123`)).toBe(false);
    expect(() => assertPublicDsnNotSecret(sensitiveToken)).toThrow(/SENTRY_AUTH_TOKEN was provided where a public SENTRY_DSN was expected/);
  });

  test("produces safe client config without secret auth tokens", () => {
    const config = getPublicSentryConfig({
      dsn: validDsn,
      environment: "production",
      release: "1.0.0",
      tracesSampleRate: 0.2,
    });
    expect(config.enabled).toBe(true);
    expect(config.dsn).toBe(validDsn);
    expect(config.environment).toBe("production");
    expect(config.release).toBe("1.0.0");
    expect(config.tracesSampleRate).toBe(0.2);

    const emptyConfig = getPublicSentryConfig({});
    expect(emptyConfig.enabled).toBe(false);
    expect(emptyConfig.dsn).toBe(null);
  });
});

describe("Comprehensive Data Scrubber & Redactor", () => {
  test("scrubs sensitive auth headers", () => {
    const headers = {
      "content-type": "application/json",
      authorization: "Bearer secret-token-xyz-12345",
      "proxy-authorization": "Basic user:pass",
      "x-api-key": "secret-api-key-999",
      "x-auth-token": "tok_private_888",
      cookie: "session=sess_secret_token; uid=123",
      "set-cookie": "session=sess_new; Secure; HttpOnly",
      "x-postmark-secret": "pm_sec_12345",
      "x-webhook-secret": "whsec_stripe_key_1234567890123456",
      "stripe-signature": "t=123456,v1=abcdef1234567890",
      "x-polar-signature": "polar_sig_xyz",
      "better-auth-secret": "ba_secret_999",
      "x-sentry-token": "sntrys_0123456789abcdef0123456789abcdef",
      "x-custom-safe-header": "safe-value",
    };

    const scrubbed = scrubHeaders(headers);
    expect(scrubbed["content-type"]).toBe("application/json");
    expect(scrubbed["x-custom-safe-header"]).toBe("safe-value");
    expect(scrubbed["authorization"]).toBe("[REDACTED]");
    expect(scrubbed["proxy-authorization"]).toBe("[REDACTED]");
    expect(scrubbed["x-api-key"]).toBe("[REDACTED]");
    expect(scrubbed["x-auth-token"]).toBe("[REDACTED]");
    expect(scrubbed["cookie"]).toBe("[REDACTED]");
    expect(scrubbed["set-cookie"]).toBe("[REDACTED]");
    expect(scrubbed["x-postmark-secret"]).toBe("[REDACTED]");
    expect(scrubbed["x-webhook-secret"]).toBe("[REDACTED]");
    expect(scrubbed["stripe-signature"]).toBe("[REDACTED]");
    expect(scrubbed["x-polar-signature"]).toBe("[REDACTED]");
    expect(scrubbed["better-auth-secret"]).toBe("[REDACTED]");
    expect(scrubbed["x-sentry-token"]).toBe("[REDACTED]");
  });

  test("redacts sensitive strings, tokens, keys, and PII anywhere in text", () => {
    const fakeSentryToken = ["sntrys", "abcdef0123456789abcdef0123456789abcdef"].join("_");
    const fakeStripeKey = ["sk", "live", "sample_test_key_1234567890123456"].join("_");
    const fakeWebhookSecret = ["whsec", "testsecret1234567890123456"].join("_");
    const fakePosthogKey = ["phx", "abcdef0123456789abcdef0123456789"].join("_");
    const fakeResendKey = ["re", "abcdef0123456789abcdef0123456789"].join("_");

    const rawText = [
      "Error authenticating with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdef1234567890",
      `Sentry token ${fakeSentryToken} was leaked`,
      `Stripe key ${fakeStripeKey} and webhook ${fakeWebhookSecret}`,
      `PostHog key ${fakePosthogKey}`,
      `Resend key ${fakeResendKey}`,
      "Customer email user.name+tag@example.com purchased with card 4111 2222 3333 4444",
      "Request failed for https://api.example.com/checkout?token=secret12345&apiKey=key999&safe=true",
    ].join("\n");

    const scrubbed = scrubString(rawText);
    expect(scrubbed).not.toContain("sntrys_");
    expect(scrubbed).not.toContain("sk_live_");
    expect(scrubbed).not.toContain("phx_");
    expect(scrubbed).not.toContain("re_");
    expect(scrubbed).not.toContain("user.name+tag@example.com");
    expect(scrubbed).not.toContain("4111 2222 3333 4444");
    expect(scrubbed).not.toContain("token=secret12345");
    expect(scrubbed).toContain("Bearer [REDACTED]");
    expect(scrubbed).toContain("[REDACTED_SENTRY_TOKEN]");
    expect(scrubbed).toContain("[REDACTED_STRIPE_KEY]");
    expect(scrubbed).toContain("[REDACTED_POSTHOG_KEY]");
    expect(scrubbed).toContain("[REDACTED_RESEND_KEY]");
    expect(scrubbed).toContain("[REDACTED_EMAIL]");
    expect(scrubbed).toContain("[REDACTED_CARD]");
    expect(scrubbed).toContain("token=[REDACTED]");
    expect(scrubbed).toContain("safe=true");
  });

  test("redacts user IP address and email while keeping pseudonymous ID", () => {
    const user = {
      id: "usr_anon_99",
      email: "jane.doe@company.org",
      ip_address: "192.168.1.100",
      username: "jane_doe",
      role: "admin",
    };

    const scrubbed = scrubUser(user);
    expect(scrubbed.id).toBe("usr_anon_99");
    expect(scrubbed.role).toBe("admin");
    expect(scrubbed.ip_address).toBe("[REDACTED_IP]");
    expect(scrubbed.email).toBe("[REDACTED_EMAIL]");
  });

  test("redacts AI prompts, transcripts, instructions, and agent context", () => {
    const event = {
      message: "Agent workflow execution error",
      extra: {
        prompt: "System: You are an autonomous assistant. User: Build a landing page with credentials XYZ.",
        rawPrompt: "Translate this text...",
        transcript: "Step 1: Received user request. Step 2: Executed command...",
        conversation: [{ role: "user", content: "hello world" }],
        agentState: { activeTask: "issue-22", step: 4 },
        systemPrompt: "Strict prompt instructions",
        safeExtra: "safe metadata",
      },
      tags: {
        environment: "staging",
        prompt: "dangerous-tag",
      },
    };

    const scrubbed = scrubSentryEvent(event);
    expect(scrubbed.extra.prompt).toBe("[REDACTED_PROMPT]");
    expect(scrubbed.extra.rawPrompt).toBe("[REDACTED_PROMPT]");
    expect(scrubbed.extra.transcript).toBe("[REDACTED_PROMPT]");
    expect(scrubbed.extra.conversation).toBe("[REDACTED_PROMPT]");
    expect(scrubbed.extra.systemPrompt).toBe("[REDACTED_PROMPT]");
    expect(scrubbed.extra.agentState).toBe("[REDACTED_PROMPT]");
    expect(scrubbed.extra.safeExtra).toBe("safe metadata");
    expect(scrubbed.tags.prompt).toBe("[REDACTED_PROMPT]");
    expect(scrubbed.tags.environment).toBe("staging");
  });

  test("scrubs request body data (both JSON string and nested object)", () => {
    const requestWithObject = {
      url: "https://api.example.com/v1/auth/login?apiKey=secret_key_123",
      method: "POST",
      headers: {
        authorization: "Bearer secret_jwt",
      },
      data: {
        username: "user@test.com",
        password: "SuperSecretPassword123!",
        token: "tok_secret_abc",
        nested: {
          creditCard: "4111-2222-3333-4444",
          cvv: "123",
          safeField: "ok",
        },
      },
    };

    const scrubbedObj = scrubRequest(requestWithObject);
    expect(scrubbedObj.headers.authorization).toBe("[REDACTED]");
    expect(scrubbedObj.url).toBe("https://api.example.com/v1/auth/login?apiKey=[REDACTED]");
    expect(scrubbedObj.data.password).toBe("[REDACTED]");
    expect(scrubbedObj.data.token).toBe("[REDACTED]");
    expect(scrubbedObj.data.nested.creditCard).toBe("[REDACTED]");
    expect(scrubbedObj.data.nested.cvv).toBe("[REDACTED]");
    expect(scrubbedObj.data.nested.safeField).toBe("ok");

    const requestWithString = {
      url: "https://api.example.com/webhook",
      data: JSON.stringify({ secret: "whsec_secret", user: "dev@example.com" }),
    };
    const scrubbedStr = scrubRequest(requestWithString);
    const parsedData = JSON.parse(scrubbedStr.data);
    expect(parsedData.secret).toBe("[REDACTED]");
    expect(parsedData.user).toBe("[REDACTED_EMAIL]");
  });

  test("scrubs breadcrumbs containing sensitive messages and data", () => {
    const breadcrumbs = [
      {
        category: "auth",
        message: "Logged in user admin@example.com with password hash secret",
        data: {
          token: "secret_token_123",
          url: "https://api.example.com/auth?token=my_secret_token",
        },
      },
      {
        category: "navigation",
        message: "Navigated to /dashboard",
        data: { route: "/dashboard" },
      },
    ];

    const scrubbed = scrubBreadcrumbs(breadcrumbs);
    expect(scrubbed[0].message).toContain("[REDACTED_EMAIL]");
    expect(scrubbed[0].data.token).toBe("[REDACTED]");
    expect(scrubbed[0].data.url).toBe("https://api.example.com/auth?token=[REDACTED]");
    expect(scrubbed[1].data.route).toBe("/dashboard");
  });

  test("handles circular references and deeply nested structures safely", () => {
    const circularObj = { name: "circular", safe: true };
    circularObj.self = circularObj;
    circularObj.nested = { parent: circularObj };

    const event = {
      message: "Circular test event",
      extra: circularObj,
    };

    expect(() => scrubSentryEvent(event)).not.toThrow();
    const scrubbed = scrubSentryEvent(event);
    expect(scrubbed.extra.name).toBe("circular");
    expect(scrubbed.extra.self).toBe("[CIRCULAR_REFERENCE]");
  });

  test("createSentryBeforeSend integrates scrubber and custom filter", () => {
    let customFilterCalled = false;
    const beforeSend = createSentryBeforeSend((event) => {
      customFilterCalled = true;
      event.tags.customFiltered = "true";
      return event;
    });

    const event = {
      message: "User password reset for dev@example.com",
      tags: { initial: "true" },
    };

    const result = beforeSend(event, {});
    expect(customFilterCalled).toBe(true);
    expect(result.message).toContain("[REDACTED_EMAIL]");
    expect(result.tags.customFiltered).toBe("true");
  });
});

describe("Synthetic Error Verification Event Generator", () => {
  test("generates valid synthetic Sentry events with verification tags", () => {
    const event = createSyntheticVerificationEvent({
      message: "Test synthetic failure",
      level: "warning",
      tags: { testSuite: "unit" },
      extra: { attempt: 1 },
    });

    expect(event.event_id).toMatch(/^[a-f0-9]{32}$/);
    expect(event.platform).toBe("javascript");
    expect(event.level).toBe("warning");
    expect(event.logger).toBe("synthetic.verification");
    expect(event.tags.synthetic).toBe("true");
    expect(event.tags.verification).toBe("true");
    expect(event.tags.provider).toBe("sentry");
    expect(event.tags.testSuite).toBe("unit");
    expect(event.extra.syntheticReason).toBe("verification_test");
    expect(event.extra.attempt).toBe(1);
    expect(event.exception.values.length).toBeGreaterThanOrEqual(1);
    expect(event.breadcrumbs.length).toBeGreaterThanOrEqual(1);
  });

  test("converts native Error objects to Sentry exception frames", () => {
    const err = new TypeError("Cannot read properties of undefined (reading 'auth')");
    const event = createSyntheticVerificationEvent({ error: err });

    expect(event.exception.values[0].type).toBe("TypeError");
    expect(event.exception.values[0].value).toBe(err.message);
    expect(event.exception.values[0].stacktrace.frames.length).toBeGreaterThanOrEqual(1);
  });

  test("simulates Sentry error capture against scrubber pipeline", () => {
    const fakeToken = ["sntrys", "abcdef0123456789abcdef0123456789"].join("_");
    const sensitiveError = new Error(`Failed connect with token ${fakeToken} for user@example.com`);
    const { delivered, eventId, scrubbedEvent } = simulateSentryCapture(sensitiveError);

    expect(delivered).toBe(true);
    expect(eventId).toMatch(/^[a-f0-9]{32}$/);
    expect(scrubbedEvent.exception.values[0].value).toContain("[REDACTED_SENTRY_TOKEN]");
    expect(scrubbedEvent.exception.values[0].value).toContain("[REDACTED_EMAIL]");
  });
});

describe("Optional Sentry Client Initialization", () => {
  test("creates a no-op client when DSN is missing or enabled=false", () => {
    const noopClient = createSentryClient({ enabled: false });
    expect(noopClient.isInitialized()).toBe(false);
    expect(noopClient.getDsn()).toBe(null);
    expect(noopClient.captureException(new Error("silent error"))).toBe("");
    expect(noopClient.captureMessage("silent message")).toBe("");
    expect(() => noopClient.addBreadcrumb({ message: "test" })).not.toThrow();
    expect(() => noopClient.setUser({ id: "123" })).not.toThrow();
    expect(() => noopClient.setTag("env", "dev")).not.toThrow();
    expect(() => noopClient.setExtra("k", "v")).not.toThrow();
    expect(noopClient.getCapturedEvents()).toEqual([]);
  });

  test("creates an active client wrapper when valid DSN is provided and enabled", () => {
    const client = createSentryClient({
      dsn: "https://abcdef1234567890abcdef1234567890@o12345.ingest.sentry.io/123",
      enabled: true,
      environment: "test",
      release: "0.2.0",
    });

    expect(client.isInitialized()).toBe(true);
    expect(client.getDsn()).toBe("https://abcdef1234567890abcdef1234567890@o12345.ingest.sentry.io/123");

    client.setUser({ id: "user_42", email: "user42@test.com" });
    client.setTag("component", "billing");
    client.addBreadcrumb({ category: "api", message: "POST /checkout" });

    const testKey = ["sk", "live", "sample_test_key_1234567890123456"].join("_");
    const eventId = client.captureException(new Error(`Stripe checkout error for ${testKey}`));
    expect(eventId).toMatch(/^[a-f0-9]{32}$/);

    const captured = client.getCapturedEvents();
    expect(captured.length).toBe(1);
    expect(captured[0].user.id).toBe("user_42");
    expect(captured[0].user.email).toBe("[REDACTED_EMAIL]");
    expect(captured[0].tags.component).toBe("billing");
    expect(captured[0].exception.values[0].value).toContain("[REDACTED_STRIPE_KEY]");
  });
});

describe("Connection Catalog & Sentry Provider Registration", () => {
  test("connection catalog loads and declares Sentry under observability", () => {
    const catalog = loadConnectionCatalog({ projectRoot: repositoryRoot });
    expect(catalog.providers.sentry).toBeDefined();
    expect(catalog.providers.sentry.displayName).toBe("Sentry");
    expect(catalog.providers.sentry.capability).toBe("observability");
    expect(catalog.providers.sentry.defaultForCapability).toBe(true);
    expect(catalog.defaults.observability).toBe("sentry");
    expect(catalog.providers.sentry.agentTool).toBeUndefined(); // project-only provisioning
  });

  test("Sentry URLs are valid HTTPS and in catalog origins", () => {
    const catalog = loadConnectionCatalog({ projectRoot: repositoryRoot });
    const origins = catalogOrigins(catalog);
    expect(origins.has("https://docs.sentry.io")).toBe(true);
    expect(origins.has("https://sentry.io")).toBe(true);
  });

  test("Sentry project probes validate against catalog requirements", () => {
    const catalog = loadConnectionCatalog({ projectRoot: repositoryRoot });
    const sentry = catalog.providers.sentry;
    expect(sentry.projectProvisioning.verification.policy).toBe("machine");
    expect(sentry.projectProvisioning.verification.probes.length).toBeGreaterThanOrEqual(2);

    const dsnProbe = sentry.projectProvisioning.verification.probes.find((p) => p.id === "public-dsn");
    expect(dsnProbe).toBeDefined();
    expect(dsnProbe.type).toBe("env_file_key");
    expect(dsnProbe.key).toBe("NEXT_PUBLIC_SENTRY_DSN");
    expect(dsnProbe.allowPrefixes).toContain("https://");

    const seamProbe = sentry.projectProvisioning.verification.probes.find((p) => p.id === "observability-seam");
    expect(seamProbe).toBeDefined();
    expect(seamProbe.type).toBe("any_file_exists");
  });
});

describe("Observability Coherence & Preflight Inspections", () => {
  test("inspectObservabilityCoherence passes when unconfigured or valid", () => {
    const unconfigured = inspectObservabilityCoherence([]);
    expect(unconfigured.status).toBe("PASS");

    const configured = inspectObservabilityCoherence(["NEXT_PUBLIC_SENTRY_DSN"]);
    expect(configured.status).toBe("PASS");
  });

  test("inspectObservabilityCoherence fails if SENTRY_AUTH_TOKEN is placed in client env", () => {
    const leaked = inspectObservabilityCoherence(["NEXT_PUBLIC_SENTRY_AUTH_TOKEN"]);
    expect(leaked.status).toBe("FAIL");
    expect(leaked.detail).toContain("NEXT_PUBLIC_SENTRY_AUTH_TOKEN exposes a sensitive Sentry auth token");
  });

  test("inspectProductionObservabilityEnvironment skips when unconfigured", () => {
    const result = inspectProductionObservabilityEnvironment("");
    expect(result.status).toBe("SKIP");
  });

  test("inspectProductionObservabilityEnvironment validates production Sentry DSN", () => {
    const validProdEnv = "NEXT_PUBLIC_SENTRY_DSN=https://key@o123.ingest.sentry.io/456\n";
    const validResult = inspectProductionObservabilityEnvironment(validProdEnv);
    expect(validResult.status).toBe("PASS");

    const invalidProdEnv = "NEXT_PUBLIC_SENTRY_DSN=http://insecure@sentry.io/456\n";
    const invalidResult = inspectProductionObservabilityEnvironment(invalidProdEnv);
    expect(invalidResult.status).toBe("FAIL");
    expect(invalidResult.detail).toContain("not a valid HTTPS Sentry DSN URL");

    const leakedToken = ["sntrys", "1234567890abcdef1234567890"].join("_");
    const leakedProdEnv = `NEXT_PUBLIC_SENTRY_AUTH_TOKEN=${leakedToken}\n`;
    const leakedResult = inspectProductionObservabilityEnvironment(leakedProdEnv);
    expect(leakedResult.status).toBe("FAIL");
    expect(leakedResult.detail).toContain("NEXT_PUBLIC_SENTRY_AUTH_TOKEN was found on production environment");
  });
});
