# Observability — Sentry via Scrubber Seam

Reference for the convex-structure skill. Sentry provides real-time error tracking, exception monitoring, and release health with strict client-side data scrubbing and credential isolation.

## The pieces

| Piece | Owner | Job |
| --- | --- | --- |
| Sentry Ingestion API | Sentry (vendor) | Ingests scrubbed error events, groups issues, and tracks release health |
| `scripts/lib/observability/sentry.mjs` | this repo | Sentry integration helpers: DSN validation, comprehensive data scrubber, synthetic verification generator, and preflight gates |
| `src/lib/observability.ts` | this repo | The client/server observability seam — wraps optional Sentry client initialization with `beforeSend` scrubbing |
| Sentry CLI / Next Plugin | Build / CI | Uploads release source maps using build-time `SENTRY_AUTH_TOKEN` without embedding tokens into runtime bundles |

## Setup & Secret Requirements

Sentry separates public project keys (DSNs) from privileged management credentials (`SENTRY_AUTH_TOKEN`).

1. **Public Client DSN (`NEXT_PUBLIC_SENTRY_DSN`)**:
   - Obtain your public DSN in the Sentry dashboard under **Project Settings → Client Keys (DSN)**.
   - Format: `https://<publicKey>@<host>/<projectId>` (e.g. `https://o12345.ingest.sentry.io/67890`).
   - Store it in `.env.local` for local development or set it in your deployment provider environment:
     ```bash
     NEXT_PUBLIC_SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0
     ```
   - Public DSNs are safe for browser bundles and contain no secret tokens.
2. **Server-Side DSN (`SENTRY_DSN`)**:
   - For backend (Convex / Node.js) error capture, set `SENTRY_DSN` in the Convex deployment environment:
     ```bash
     npx convex env set SENTRY_DSN "https://examplePublicKey@o0.ingest.sentry.io/0"
     ```
3. **Source Map Auth Token (`SENTRY_AUTH_TOKEN`)**:
   - Create an organization auth token in Sentry under **Settings → Developer Settings → Custom Integrations / Auth Tokens** with `project:releases` scope.
   - Store it in your deployment environment or CI secrets (Netlify / Vercel / GitHub Actions):
     ```bash
     pnpm secret:set SENTRY_AUTH_TOKEN
     ```
   - **CRITICAL RULE**: `SENTRY_AUTH_TOKEN` must NEVER be placed in `.env.local` as a `NEXT_PUBLIC_*` variable, committed to git, or exposed to the browser.

## Comprehensive Scrubbing & Data Redaction

All Sentry events pass through `scrubSentryEvent` in `scripts/lib/observability/sentry.mjs` via `beforeSend` before leaving the application runtime:

### 1. Sensitive Request & Auth Headers
The following headers are automatically replaced with `"[REDACTED]"`:
- `Authorization`, `Proxy-Authorization`, `X-Api-Key`, `X-Auth-Token`
- `Cookie`, `Set-Cookie`, `Better-Auth-Secret`
- `X-Postmark-Secret`, `X-Webhook-Secret`, `Stripe-Signature`, `X-Polar-Signature`, `X-Signature`
- `X-Sentry-Token`, `X-Sentry-Auth`

### 2. Secrets & Credentials in Text and Values
String values, messages, breadcrumb data, stack traces, and query parameters are scanned and redacted:
- Bearer tokens: `Bearer [REDACTED]`
- JWT tokens: `[REDACTED_JWT]`
- Sentry auth tokens: `[REDACTED_SENTRY_TOKEN]`
- Stripe secret keys (`sk_live_`, `rk_live_`, `sk_test_`, `whsec_`): `[REDACTED_STRIPE_KEY]`
- PostHog personal keys (`phx_`): `[REDACTED_POSTHOG_KEY]`
- Resend API keys (`re_`): `[REDACTED_RESEND_KEY]`
- Credit card numbers: `[REDACTED_CARD]`
- Passwords and secret query parameters: `[REDACTED]`

### 3. Agent Prompts, Transcripts, and Contexts
Keys matching prompt, transcript, or AI conversation context (`prompt`, `prompts`, `rawPrompt`, `systemPrompt`, `userPrompt`, `userInput`, `transcript`, `transcripts`, `messages`, `conversation`, `instructions`, `agentState`, `healLedger`) are redacted to `"[REDACTED_PROMPT]"` or `"[REDACTED]"`.

### 4. User Data & PII
- `event.user.ip_address` is replaced with `"[REDACTED_IP]"`.
- `event.user.email` is replaced with `"[REDACTED_EMAIL]"`.
- Pseudonymous identifiers (e.g. anonymous `id`) are preserved for aggregate issue tracking.

### 5. Request Bodies & Query Strings
- `event.request.data` is parsed and recursively scrubbed for sensitive field names (`password`, `token`, `secret`, `apiKey`, `creditCard`, `cvv`, `ssn`).
- URLs have query string secrets (`token`, `key`, `secret`, `password`, `code`, `sig`) stripped.

## Synthetic Error Verification

To verify that error tracking and data scrubbing function without triggering real production errors:

1. Use `createSyntheticVerificationEvent` or `simulateSentryCapture` from `scripts/lib/observability/sentry.mjs`:
   ```javascript
   import { createSyntheticVerificationEvent, simulateSentryCapture } from "./scripts/lib/observability/sentry.mjs";

   const syntheticEvent = createSyntheticVerificationEvent({
     message: "Synthetic verification test",
     error: new Error("Test error for Sentry ingestion verification"),
     tags: { stage: "staging" },
   });

   const { delivered, eventId, scrubbedEvent } = simulateSentryCapture(syntheticEvent);
   ```
2. Verify that `synthetic: "true"` and `verification: "true"` tags are attached.
3. In Sentry Issue Stream, verify that no raw auth tokens, user emails, or prompts appear in the event detail.

## Optional Initialization Pattern

Observability is optional. If `NEXT_PUBLIC_SENTRY_DSN` is absent or unconfigured:
- `createSentryClient()` returns a safe, no-op client.
- `isInitialized()` returns `false`.
- Calls to `captureException()`, `captureMessage()`, and `addBreadcrumb()` safely no-op without throwing runtime errors or network failures.

## Going to production & Preflight Checks

Run preflight to verify observability configuration before shipping:
```bash
pnpm preflight
```
And for production deployment audit:
```bash
pnpm preflight --prod
```

Preflight enforces:
- `no sensitive Sentry auth token in client env`: flags `NEXT_PUBLIC_SENTRY_AUTH_TOKEN` as a blocking FAIL.
- `prod Sentry observability is valid`: when Sentry is configured, verifies that the production DSN uses HTTPS and is well-formed.

## Removal & Teardown

To disconnect Sentry:
1. Remove `NEXT_PUBLIC_SENTRY_DSN` from `.env.local` and your deployment environment.
2. Remove `SENTRY_DSN` from the Convex deployment environment:
   ```bash
   npx convex env remove SENTRY_DSN
   ```
3. Revoke `SENTRY_AUTH_TOKEN` in Sentry under **Settings → Developer Settings → Auth Tokens**.
4. Disable or delete the Client Key in Sentry under **Project Settings → Client Keys (DSN)**.
5. Run `pnpm verify` to confirm clean builds and passing tests.
