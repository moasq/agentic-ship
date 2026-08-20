import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConnectionCatalog } from "../connections/catalog.mjs";

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export const SENTRY_PUBLIC_DSN_ENV = "NEXT_PUBLIC_SENTRY_DSN";
export const SENTRY_SERVER_DSN_ENV = "SENTRY_DSN";
export const SENTRY_AUTH_TOKEN_ENV = "SENTRY_AUTH_TOKEN";
export const OBSERVABILITY_PROVIDER_ENV = "OBSERVABILITY_PROVIDER";

// ── 1. Public DSN & Sensitive Auth Token Validation ─────────────────────────────

const SENTRY_DSN_REGEX = /^https:\/\/[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)?@[A-Za-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9._~-]*)*\/\d+$/;
const SENTRY_AUTH_TOKEN_REGEX = /^sntrys_[A-Za-z0-9_-]{20,}$/;

/**
 * Validate whether a candidate string is a well-formed Sentry DSN over HTTPS.
 * Ensures the DSN contains no sensitive auth tokens.
 *
 * @param {string} dsn
 * @returns {boolean}
 */
export function isValidSentryDsn(dsn) {
  if (typeof dsn !== "string" || !dsn.trim()) return false;
  const trimmed = dsn.trim();
  if (!trimmed.startsWith("https://")) return false;
  if (!SENTRY_DSN_REGEX.test(trimmed)) return false;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return false;
    if (!url.username) return false;
    // DSN must not carry a Sentry auth token
    if (isSensitiveSentryToken(url.username) || (url.password && isSensitiveSentryToken(url.password))) {
      return false;
    }
    const pathSegments = url.pathname.split("/").filter(Boolean);
    if (pathSegments.length === 0) return false;
    const projectId = pathSegments[pathSegments.length - 1];
    return /^\d+$/.test(projectId);
  } catch {
    return false;
  }
}

/**
 * Parse a Sentry DSN into its constituent parts.
 *
 * @param {string} dsn
 * @returns {{ protocol: string, publicKey: string, secretKey: string|null, host: string, port: string, path: string, projectId: string }}
 */
export function parseSentryDsn(dsn) {
  if (!isValidSentryDsn(dsn)) {
    throw new Error(`Invalid Sentry DSN: "${dsn}". Expected format: https://<publicKey>@<host>/<projectId>`);
  }
  const url = new URL(dsn.trim());
  const pathSegments = url.pathname.split("/").filter(Boolean);
  const projectId = pathSegments[pathSegments.length - 1];
  const basePath = pathSegments.slice(0, -1).join("/");

  return {
    protocol: url.protocol.replace(":", ""),
    publicKey: url.username,
    secretKey: url.password || null,
    host: url.hostname,
    port: url.port || (url.protocol === "https:" ? "443" : "80"),
    path: basePath ? `/${basePath}` : "",
    projectId,
  };
}

/**
 * Check if a token matches sensitive Sentry auth token patterns.
 *
 * @param {string} token
 * @returns {boolean}
 */
export function isSensitiveSentryToken(token) {
  if (typeof token !== "string" || !token.trim()) return false;
  const trimmed = token.trim();
  return SENTRY_AUTH_TOKEN_REGEX.test(trimmed) || (/^[a-f0-9]{64}$/i.test(trimmed) && !trimmed.startsWith("0000"));
}

/**
 * Ensure a DSN does not contain sensitive auth tokens.
 *
 * @param {string} dsn
 */
export function assertPublicDsnNotSecret(dsn) {
  if (typeof dsn === "string" && isSensitiveSentryToken(dsn)) {
    throw new Error("SENTRY_AUTH_TOKEN was provided where a public SENTRY_DSN was expected. DSNs are public project keys; auth tokens are build-time secrets.");
  }
  if (!isValidSentryDsn(dsn)) {
    throw new Error(`Invalid Sentry DSN: "${dsn}". Expected public DSN (https://<key>@<host>/<project>).`);
  }
}

/**
 * Produce a safe, client-bundleable public Sentry configuration object.
 *
 * @param {{ dsn?: string, environment?: string, release?: string, tracesSampleRate?: number, sampleRate?: number }} options
 * @returns {{ enabled: boolean, dsn: string|null, environment: string, release: string, tracesSampleRate: number, sampleRate: number }}
 */
export function getPublicSentryConfig({
  dsn,
  environment = "development",
  release = "0.1.0",
  tracesSampleRate = 0.1,
  sampleRate = 1.0,
} = {}) {
  const validDsn = typeof dsn === "string" && isValidSentryDsn(dsn) ? dsn.trim() : null;
  return {
    enabled: Boolean(validDsn),
    dsn: validDsn,
    environment,
    release,
    tracesSampleRate: typeof tracesSampleRate === "number" ? tracesSampleRate : 0.1,
    sampleRate: typeof sampleRate === "number" ? sampleRate : 1.0,
  };
}

// ── 2. Comprehensive Data Scrubber & Redactor ────────────────────────────────────

export const SENSITIVE_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "x-api-key",
  "x-auth-token",
  "cookie",
  "set-cookie",
  "x-postmark-secret",
  "x-webhook-secret",
  "stripe-signature",
  "x-polar-signature",
  "x-signature",
  "x-hub-signature-256",
  "better-auth-secret",
  "x-sentry-token",
  "x-sentry-auth",
  "secret",
  "api-key",
]);

export const SENSITIVE_KEY_PATTERNS = [
  // Credentials & Tokens
  /^(?:password|pass|secret|token|apiKey|api_key|authToken|auth_token|accessToken|access_token|refreshToken|refresh_token|privateKey|private_key|credential|credentials|authorization|cookie|session|sessionId|session_token|whsec|sk_live|rk_live)$/i,
  // Financial & PII
  /^(?:creditCard|credit_card|cardNumber|card_number|cvv|cvc|ssn|socialSecurityNumber|social_security_number|pan|pin)$/i,
  // Agent Prompts, Transcripts, Contexts
  /^(?:prompt|prompts|rawPrompt|raw_prompt|systemPrompt|system_prompt|userPrompt|user_prompt|userInput|user_input|transcript|transcripts|conversation|messages|instructions|instruction|agentState|agent_state|healLedger|heal_ledger)$/i,
];

export const STRING_REDACTION_RULES = [
  // Bearer tokens
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, replacement: "Bearer [REDACTED]" },
  // JWT tokens
  { pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\b/g, replacement: "[REDACTED_JWT]" },
  // Sentry auth tokens
  { pattern: /\bsntrys_[A-Za-z0-9_-]{20,}\b/g, replacement: "[REDACTED_SENTRY_TOKEN]" },
  // Stripe secret keys
  { pattern: /\b(?:sk_live_|rk_live_|sk_test_|rk_test_|whsec_)[A-Za-z0-9_]{16,}\b/g, replacement: "[REDACTED_STRIPE_KEY]" },
  // PostHog personal keys
  { pattern: /\bphx_[A-Za-z0-9_-]{20,}\b/g, replacement: "[REDACTED_POSTHOG_KEY]" },
  // Resend keys
  { pattern: /\bre_[A-Za-z0-9_]{20,}\b/g, replacement: "[REDACTED_RESEND_KEY]" },
  // Postmark tokens / UUID tokens
  { pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, replacement: "[REDACTED_TOKEN_UUID]" },
  // Email addresses
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: "[REDACTED_EMAIL]" },
  // Credit card numbers (13 to 19 digits formatted or unformatted)
  { pattern: /\b(?:\d{4}[ -]?){3,4}\d{1,4}\b/g, replacement: "[REDACTED_CARD]" },
  // Query parameter secrets
  { pattern: /(?<=[?&](?:token|auth|key|secret|password|code|sig|signature|apiKey|api_key)=)[^& \t\r\n]+/gi, replacement: "[REDACTED]" },
];

/**
 * Redact sensitive patterns inside a string value.
 *
 * @param {string} value
 * @returns {string}
 */
export function scrubString(value) {
  if (typeof value !== "string" || value.length === 0) return value;
  let result = value;
  for (const { pattern, replacement } of STRING_REDACTION_RULES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Check if an object key name is considered sensitive and must be redacted.
 *
 * @param {string} key
 * @returns {boolean}
 */
export function isSensitiveKey(key) {
  if (typeof key !== "string") return false;
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Recursively scrub an arbitrary JavaScript value or object structure.
 * Handles circular references safely using a WeakSet.
 *
 * @param {any} value
 * @param {WeakSet<object>} [seen]
 * @param {number} [depth]
 * @returns {any}
 */
export function scrubValue(value, seen = new WeakSet(), depth = 0) {
  if (depth > 20) return "[MAX_DEPTH_REACHED]";
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return scrubString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return "[CIRCULAR_REFERENCE]";
    seen.add(value);
    return value.map((item) => scrubValue(item, seen, depth + 1));
  }

  if (typeof value === "object") {
    if (seen.has(value)) return "[CIRCULAR_REFERENCE]";
    seen.add(value);

    // Handle Buffer, Date, RegExp, Error
    if (value instanceof Date) return value.toISOString();
    if (value instanceof RegExp) return value.toString();
    if (value instanceof Error) {
      return {
        name: value.name,
        message: scrubString(value.message),
        stack: scrubString(value.stack || ""),
      };
    }

    const scrubbed = {};
    for (const [k, v] of Object.entries(value)) {
      if (isSensitiveKey(k)) {
        if (/prompt|transcript|conversation|messages|instructions|instruction|userInput|user_input|agentState|agent_state|healLedger|heal_ledger/i.test(k)) {
          scrubbed[k] = "[REDACTED_PROMPT]";
        } else {
          scrubbed[k] = "[REDACTED]";
        }
      } else {
        scrubbed[k] = scrubValue(v, seen, depth + 1);
      }
    }
    return scrubbed;
  }

  return String(value);
}

/**
 * Scrub HTTP headers dictionary.
 *
 * @param {Record<string, string>} headers
 * @returns {Record<string, string>}
 */
export function scrubHeaders(headers) {
  if (!headers || typeof headers !== "object") return headers;
  const result = {};
  for (const [key, val] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = typeof val === "string" ? scrubString(val) : String(val);
    }
  }
  return result;
}

/**
 * Scrub Sentry User context.
 *
 * @param {object} user
 * @returns {object}
 */
export function scrubUser(user) {
  if (!user || typeof user !== "object") return user;
  const scrubbed = { ...user };
  if (scrubbed.ip_address) {
    scrubbed.ip_address = "[REDACTED_IP]";
  }
  if (scrubbed.email) {
    scrubbed.email = "[REDACTED_EMAIL]";
  }
  if (scrubbed.username) {
    scrubbed.username = scrubString(String(scrubbed.username));
  }
  return scrubValue(scrubbed);
}

/**
 * Scrub Sentry Request context.
 *
 * @param {object} request
 * @returns {object}
 */
export function scrubRequest(request) {
  if (!request || typeof request !== "object") return request;
  const scrubbed = { ...request };
  if (scrubbed.headers) {
    scrubbed.headers = scrubHeaders(scrubbed.headers);
  }
  if (scrubbed.url) {
    scrubbed.url = scrubString(scrubbed.url);
  }
  if (scrubbed.cookies) {
    scrubbed.cookies = "[REDACTED]";
  }
  if (scrubbed.data !== undefined) {
    if (typeof scrubbed.data === "string") {
      try {
        const parsed = JSON.parse(scrubbed.data);
        scrubbed.data = JSON.stringify(scrubValue(parsed));
      } catch {
        scrubbed.data = scrubString(scrubbed.data);
      }
    } else {
      scrubbed.data = scrubValue(scrubbed.data);
    }
  }
  return scrubbed;
}

/**
 * Scrub Sentry Breadcrumbs.
 *
 * @param {Array<object>} breadcrumbs
 * @returns {Array<object>}
 */
export function scrubBreadcrumbs(breadcrumbs) {
  if (!Array.isArray(breadcrumbs)) return breadcrumbs;
  return breadcrumbs.map((crumb) => {
    if (!crumb || typeof crumb !== "object") return crumb;
    const scrubbed = { ...crumb };
    if (scrubbed.message) scrubbed.message = scrubString(scrubbed.message);
    if (scrubbed.data) scrubbed.data = scrubValue(scrubbed.data);
    return scrubbed;
  });
}

/**
 * Comprehensive Sentry event scrubber.
 * Redacts user data, auth headers, tokens, prompts, transcripts, and request bodies.
 *
 * @param {object} event Sentry event payload
 * @param {{ dropIfInvalid?: boolean }} [options]
 * @returns {object|null}
 */
export function scrubSentryEvent(event, { dropIfInvalid = false } = {}) {
  if (!event || typeof event !== "object") {
    return dropIfInvalid ? null : event;
  }

  const seen = new WeakSet();
  const scrubbed = { ...event };

  if (scrubbed.message) {
    scrubbed.message = scrubString(scrubbed.message);
  }

  if (scrubbed.request) {
    scrubbed.request = scrubRequest(scrubbed.request);
  }

  if (scrubbed.user) {
    scrubbed.user = scrubUser(scrubbed.user);
  }

  if (scrubbed.breadcrumbs) {
    if (Array.isArray(scrubbed.breadcrumbs)) {
      scrubbed.breadcrumbs = scrubBreadcrumbs(scrubbed.breadcrumbs);
    } else if (Array.isArray(scrubbed.breadcrumbs.values)) {
      scrubbed.breadcrumbs = {
        ...scrubbed.breadcrumbs,
        values: scrubBreadcrumbs(scrubbed.breadcrumbs.values),
      };
    }
  }

  if (scrubbed.extra) {
    scrubbed.extra = scrubValue(scrubbed.extra, seen);
  }

  if (scrubbed.contexts) {
    scrubbed.contexts = scrubValue(scrubbed.contexts, seen);
  }

  if (scrubbed.tags) {
    scrubbed.tags = scrubValue(scrubbed.tags, seen);
  }

  if (scrubbed.exception?.values) {
    scrubbed.exception = {
      ...scrubbed.exception,
      values: scrubbed.exception.values.map((exc) => ({
        ...exc,
        value: scrubString(exc.value || ""),
        stacktrace: exc.stacktrace ? scrubValue(exc.stacktrace, seen) : undefined,
      })),
    };
  }

  return scrubbed;
}

/**
 * Creates a Sentry beforeSend hook that scrubs all outgoing events.
 *
 * @param {Function} [customFilter] Optional additional filter (returns event or null)
 * @returns {Function}
 */
export function createSentryBeforeSend(customFilter) {
  return (event, hint) => {
    const scrubbed = scrubSentryEvent(event);
    if (typeof customFilter === "function") {
      return customFilter(scrubbed, hint);
    }
    return scrubbed;
  };
}

// ── 3. Synthetic Error Verification Event Generator ──────────────────────────────

/**
 * Generate a synthetic Sentry verification event for testing pipeline delivery and redaction.
 *
 * @param {{
 *   message?: string,
 *   error?: Error|string,
 *   level?: "fatal"|"error"|"warning"|"info"|"debug",
 *   tags?: Record<string, string>,
 *   extra?: Record<string, any>,
 *   user?: object,
 *   request?: object,
 *   breadcrumbs?: Array<object>,
 *   environment?: string,
 *   release?: string,
 * }} [options]
 * @returns {object} A well-formed Sentry event
 */
export function createSyntheticVerificationEvent({
  message = "Synthetic verification event",
  error,
  level = "error",
  tags = {},
  extra = {},
  user,
  request,
  breadcrumbs = [],
  environment = "development",
  release = "0.1.0",
} = {}) {
  const eventId = randomBytes(16).toString("hex");
  const timestamp = new Date().toISOString();

  let exceptionValues = [];
  if (error) {
    const errObj = typeof error === "string" ? new Error(error) : error;
    exceptionValues = [
      {
        type: errObj.name || "Error",
        value: errObj.message || String(error),
        stacktrace: {
          frames: (errObj.stack || "")
            .split("\n")
            .slice(1)
            .map((line) => {
              const match = /at (?:(.+?)\s+\()?(?:(.+?):(\d+):(\d+)\)?)/.exec(line.trim());
              return {
                function: match?.[1] || "?",
                filename: match?.[2] || "synthetic.mjs",
                lineno: match?.[3] ? Number(match[3]) : 1,
                colno: match?.[4] ? Number(match[4]) : 1,
                in_app: true,
              };
            }),
        },
      },
    ];
  } else {
    exceptionValues = [
      {
        type: "SyntheticVerificationError",
        value: message,
        stacktrace: {
          frames: [
            {
              function: "createSyntheticVerificationEvent",
              filename: "scripts/lib/observability/sentry.mjs",
              lineno: 1,
              colno: 1,
              in_app: true,
            },
          ],
        },
      },
    ];
  }

  return {
    event_id: eventId,
    timestamp,
    platform: "javascript",
    level,
    logger: "synthetic.verification",
    environment,
    release,
    message,
    tags: {
      synthetic: "true",
      verification: "true",
      provider: "sentry",
      ...tags,
    },
    extra: {
      syntheticReason: "verification_test",
      ...extra,
    },
    user: user || { id: "synthetic_anon_001" },
    request: request || {
      url: "https://localhost:3000/api/synthetic-test",
      method: "POST",
      headers: {
        "user-agent": "agentic-ship-synthetic-verifier/1.0",
      },
    },
    breadcrumbs: [
      {
        timestamp,
        category: "synthetic",
        message: "Initiated synthetic error verification",
        level: "info",
      },
      ...breadcrumbs,
    ],
    exception: {
      values: exceptionValues,
    },
  };
}

/**
 * Simulate Sentry error capture against a scrubber pipeline.
 *
 * @param {object|Error|string} eventOrError
 * @param {{ dsn?: string, beforeSend?: Function }} [options]
 * @returns {{ delivered: boolean, eventId: string, scrubbedEvent: object }}
 */
export function simulateSentryCapture(eventOrError, { dsn, beforeSend } = {}) {
  let event;
  if (eventOrError && typeof eventOrError === "object" && "event_id" in eventOrError) {
    event = eventOrError;
  } else {
    event = createSyntheticVerificationEvent({ error: eventOrError });
  }

  const hook = beforeSend || createSentryBeforeSend();
  const processed = hook(event, {});

  return {
    delivered: Boolean(processed),
    eventId: event.event_id,
    scrubbedEvent: processed,
  };
}

// ── 4. Optional Sentry Client Wrapper ───────────────────────────────────────────

/**
 * Create a safe, optional Sentry client.
 * Returns a no-op client if DSN is absent or enabled=false; returns an active client wrapper if DSN is valid.
 *
 * @param {{ dsn?: string, enabled?: boolean, environment?: string, release?: string, beforeSend?: Function }} options
 */
export function createSentryClient(options = {}) {
  const { dsn, enabled = true, environment = "development", release = "0.1.0", beforeSend } = options;
  const isEnabled = Boolean(enabled && dsn && isValidSentryDsn(dsn));
  const hook = beforeSend || createSentryBeforeSend();

  const capturedEvents = [];
  const breadcrumbs = [];
  let currentUser = null;
  const currentTags = {};
  const currentExtra = {};

  return {
    isInitialized() {
      return isEnabled;
    },
    getDsn() {
      return isEnabled ? dsn : null;
    },
    captureException(error, hint = {}) {
      if (!isEnabled) return "";
      const event = createSyntheticVerificationEvent({
        error,
        tags: currentTags,
        extra: currentExtra,
        user: currentUser,
        breadcrumbs,
        environment,
        release,
      });
      const scrubbed = hook(event, hint);
      if (scrubbed) {
        capturedEvents.push(scrubbed);
        return scrubbed.event_id;
      }
      return "";
    },
    captureMessage(message, level = "info", hint = {}) {
      if (!isEnabled) return "";
      const event = createSyntheticVerificationEvent({
        message,
        level,
        tags: currentTags,
        extra: currentExtra,
        user: currentUser,
        breadcrumbs,
        environment,
        release,
      });
      const scrubbed = hook(event, hint);
      if (scrubbed) {
        capturedEvents.push(scrubbed);
        return scrubbed.event_id;
      }
      return "";
    },
    addBreadcrumb(crumb) {
      if (crumb && typeof crumb === "object") {
        breadcrumbs.push(scrubValue(crumb));
      }
    },
    setUser(user) {
      currentUser = user ? scrubUser(user) : null;
    },
    setTag(key, value) {
      if (key && typeof key === "string") {
        currentTags[key] = scrubString(String(value));
      }
    },
    setExtra(key, value) {
      if (key && typeof key === "string") {
        currentExtra[key] = scrubValue(value);
      }
    },
    getCapturedEvents() {
      return [...capturedEvents];
    },
    async flush() {
      return true;
    },
    async close() {
      return true;
    },
  };
}

// ── 5. Environment & Coherence Inspection ───────────────────────────────────────

function parseEnv(stdout) {
  const values = new Map();
  for (const line of (stdout ?? "").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match) values.set(match[1], match[2].trim());
  }
  return values;
}

/**
 * Check whether observability environment variables are coherent.
 *
 * @param {Iterable<string>} envNames
 * @param {{ selectedProvider?: string, catalogDirectory?: string }} [options]
 * @returns {{ status: "PASS"|"WARN"|"FAIL", detail: string, provider: string }}
 */
export function inspectObservabilityCoherence(envNames, { selectedProvider, catalogDirectory } = {}) {
  const names = new Set(envNames ?? []);
  const has = (name) => names.has(name);

  // Check for forbidden placement: SENTRY_AUTH_TOKEN must never be in client-side NEXT_PUBLIC_
  if (has("NEXT_PUBLIC_SENTRY_AUTH_TOKEN")) {
    return {
      status: "FAIL",
      provider: "sentry",
      detail: "NEXT_PUBLIC_SENTRY_AUTH_TOKEN exposes a sensitive Sentry auth token to the browser bundle. Auth tokens belong in CI or deployment build environments, never public env.",
    };
  }

  const hasPublicDsn = has(SENTRY_PUBLIC_DSN_ENV);
  const hasServerDsn = has(SENTRY_SERVER_DSN_ENV);
  const hasAuthToken = has(SENTRY_AUTH_TOKEN_ENV);
  const hasAnySentry = hasPublicDsn || hasServerDsn || hasAuthToken;

  const provider = selectedProvider || "sentry";

  if (!hasAnySentry) {
    return {
      status: "PASS",
      provider,
      detail: "Observability is unconfigured (optional).",
    };
  }

  return {
    status: "PASS",
    provider: "sentry",
    detail: "Sentry observability configuration is intact.",
  };
}

/**
 * Audit production deployment environment for Sentry / Observability.
 *
 * @param {string|Map<string, string>} stdout
 * @param {{ catalogDirectory?: string }} [options]
 * @returns {{ status: "PASS"|"WARN"|"FAIL"|"SKIP", detail: string, provider: string }}
 */
export function inspectProductionObservabilityEnvironment(stdout, { catalogDirectory } = {}) {
  const values = typeof stdout === "string" ? parseEnv(stdout) : stdout;
  const has = (k) => values.has(k) && (values.get(k) ?? "").trim().length > 0;
  const val = (k) => (values.get(k) ?? "").trim();

  // Check public leak of Sentry auth token
  if (has("NEXT_PUBLIC_SENTRY_AUTH_TOKEN")) {
    return {
      status: "FAIL",
      provider: "sentry",
      detail: "NEXT_PUBLIC_SENTRY_AUTH_TOKEN was found on production environment. Sentry auth tokens must never be exposed as public client variables.",
    };
  }

  const dsn = val(SENTRY_PUBLIC_DSN_ENV) || val(SENTRY_SERVER_DSN_ENV);
  const hasSentry = has(SENTRY_PUBLIC_DSN_ENV) || has(SENTRY_SERVER_DSN_ENV) || val(OBSERVABILITY_PROVIDER_ENV) === "sentry";

  if (!hasSentry) {
    return {
      status: "SKIP",
      provider: "sentry",
      detail: "Sentry is not configured for production (observability is optional).",
    };
  }

  if (dsn) {
    if (!isValidSentryDsn(dsn)) {
      return {
        status: "FAIL",
        provider: "sentry",
        detail: `Production Sentry DSN "${dsn}" is not a valid HTTPS Sentry DSN URL.`,
      };
    }
    return {
      status: "PASS",
      provider: "sentry",
      detail: "Production Sentry DSN is valid and auth token is properly isolated.",
    };
  }

  return {
    status: "WARN",
    provider: "sentry",
    detail: "Sentry provider selected but SENTRY_DSN is not set.",
  };
}
