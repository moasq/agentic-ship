/**
 * Privacy filters and data redaction utilities for analytics providers.
 *
 * Enforces zero-PII and zero-secret data leakage across all analytics events.
 * Strips or redacts:
 *  - Email addresses
 *  - Sensitive auth tokens, API keys, secret keys, passwords, session tokens
 *  - Agent prompts, transcripts, system messages, instructions
 *  - Financial data (credit cards, CVVs, SSNs)
 *  - Sensitive URL query parameters
 */

export const SENSITIVE_KEY_PATTERNS = [
  // Credentials & Tokens
  /^(?:password|pass|secret|token|apiKey|api_key|authToken|auth_token|accessToken|access_token|refreshToken|refresh_token|privateKey|private_key|credential|credentials|authorization|cookie|session|sessionId|session_token|whsec|sk_live|rk_live)$/i,
  // Financial & PII
  /^(?:creditCard|credit_card|cardNumber|card_number|cvv|cvc|ssn|socialSecurityNumber|social_security_number|pan|pin|email|userEmail|user_email|user_name|username)$/i,
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
  // UUID tokens / Postmark tokens
  { pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, replacement: "[REDACTED_TOKEN_UUID]" },
  // Email addresses
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: "[REDACTED_EMAIL]" },
  // Credit card numbers
  { pattern: /\b(?:\d{4}[ -]?){3,4}\d{1,4}\b/g, replacement: "[REDACTED_CARD]" },
  // Query parameter secrets
  { pattern: /(?<=[?&](?:token|auth|key|secret|password|code|sig|signature|apiKey|api_key|email)=)[^& \t\r\n]+/gi, replacement: "[REDACTED]" },
];

/**
 * Redact sensitive patterns from a string.
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
 * Check whether a key is sensitive.
 *
 * @param {string} key
 * @returns {boolean}
 */
export function isSensitiveKey(key) {
  if (typeof key !== "string") return false;
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Clean a URL by stripping sensitive query parameters.
 *
 * @param {string} urlString
 * @returns {string}
 */
export function scrubUrl(urlString) {
  if (typeof urlString !== "string" || urlString.length === 0) return urlString;
  try {
    const parsed = new URL(urlString, "https://agentic-ship.local");
    const sensitiveParams = [
      "token", "auth", "key", "apiKey", "api_key", "secret", "password",
      "code", "sig", "signature", "email", "user", "access_token", "refresh_token",
      "session_id", "session_token", "prompt",
    ];
    let mutated = false;
    for (const param of sensitiveParams) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, "[REDACTED]");
        mutated = true;
      }
    }
    if (urlString.startsWith("http://") || urlString.startsWith("https://")) {
      return parsed.toString();
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return scrubString(urlString);
  }
}

/**
 * Recursively scrub an arbitrary value, object, or array.
 * Drops or redacts sensitive keys and values.
 *
 * @param {any} value
 * @param {WeakSet<object>} [seen]
 * @param {number} [depth]
 * @returns {any}
 */
export function scrubObject(value, seen = new WeakSet(), depth = 0) {
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
    return value.map((item) => scrubObject(item, seen, depth + 1));
  }

  if (typeof value === "object") {
    if (seen.has(value)) return "[CIRCULAR_REFERENCE]";
    seen.add(value);

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
        } else if (/email/i.test(k)) {
          scrubbed[k] = "[REDACTED_EMAIL]";
        } else {
          scrubbed[k] = "[REDACTED]";
        }
      } else {
        scrubbed[k] = scrubObject(v, seen, depth + 1);
      }
    }
    return scrubbed;
  }

  return String(value);
}
