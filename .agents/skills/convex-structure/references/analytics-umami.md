# Analytics — Umami via Privacy-First Seam

Reference for the convex-structure and frontend-security skills. Umami is an open-source, privacy-focused alternative to Google Analytics that provides full data ownership, cookieless tracking, and multi-domain analytics with zero PII collection.

## The pieces

| Piece | Owner | Job |
| --- | --- | --- |
| Umami Cloud / Self-Hosted | Umami (vendor / self-hosted) | Collects privacy-preserving website traffic metrics, pageviews, and custom event data |
| `scripts/lib/analytics/umami.mjs` | this repo | Umami integration helpers: website ID validation, host URL verification, origin allowlisting, data scrubber, synthetic event testing, and preflight gates |
| `src/lib/analytics.ts` | this repo | The application analytics seam — exports typed `track`, `trackPageview`, and `identify` methods with automatic scrubbing |

## Why Umami

- **Cookieless & Privacy-First**: Umami does not track users across the web, does not use cookies, and collects no personally identifiable information (PII). All metric collection is compliant with GDPR, CCPA, and PECR.
- **Data Ownership**: Available via Umami Cloud or full self-hosting on your own infrastructure (PostgreSQL / MySQL).
- **Custom Event Tracking**: Supports typed event payloads with nested event data properties for funnels, button clicks, and feature usage without vendor lock-in.

## Configuration & Environment Variables

Umami requires your public Website ID (UUID) and your Umami instance Host URL.

| Key | Shape | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | `9420c944-2450-48e0-bb15-84e0c460a80e` | **Required**. The website UUID generated in your Umami dashboard |
| `NEXT_PUBLIC_UMAMI_HOST_URL` | `https://cloud.umami.is` or `https://analytics.my-domain.com` | **Required**. The HTTPS endpoint of your Umami instance |
| `NEXT_PUBLIC_UMAMI_DOMAINS` | `example.com, app.example.com` | Optional comma-separated list of allowed domains where tracking should execute |
| `NEXT_PUBLIC_UMAMI_SCRIPT_URL` | `https://cloud.umami.is/script.js` | Optional custom tracker script URL |

Set these variables in `.env.local` for local development and in your production deployment environment (Netlify / Vercel / Convex):

```bash
NEXT_PUBLIC_UMAMI_WEBSITE_ID=9420c944-2450-48e0-bb15-84e0c460a80e
NEXT_PUBLIC_UMAMI_HOST_URL=https://cloud.umami.is
```

## CSP & Allowed Origins

When loading Umami:
- Add your Umami host URL (e.g. `https://cloud.umami.is`) to `script-src` and `connect-src` in `next.config.ts`, OR
- Use Next.js rewrites to proxy `/umami/script.js` and `/umami/api/send` through your own origin to preserve strict `script-src 'self'` and `connect-src 'self'`.

## Privacy Filters & Data Scrubbing

All custom events and pageviews pass through `filterUmamiData` and `scrubUmamiEvent`:
- **Email Redaction**: Email addresses inside event payloads are replaced with `[REDACTED_EMAIL]`.
- **Token & Credential Scrubbing**: Bearer tokens, JWTs, Stripe keys, Sentry tokens, PostHog personal keys, and API secrets are automatically redacted to `[REDACTED_TOKEN]` or `[REDACTED]`.
- **Prompt & Transcript Scrubbing**: Prompt content, conversation transcripts, system prompts, and debugging ledgers are stripped.
- **URL Sanitization**: Tracking URLs are stripped of sensitive query parameters (`token`, `auth`, `key`, `secret`, `password`, `email`).

## Synthetic Event Verification

To verify that Umami event ingestion is functional without distorting analytics data:

```javascript
import { createSyntheticUmamiEvent, simulateUmamiCapture } from "./scripts/lib/analytics/umami.mjs";

const syntheticEvent = createSyntheticUmamiEvent({
  eventName: "checkout_completed",
  websiteId: "9420c944-2450-48e0-bb15-84e0c460a80e",
  hostUrl: "https://cloud.umami.is",
  data: { plan: "pro" },
});

const { delivered, eventId, payload, scrubbedEvent } = simulateUmamiCapture(syntheticEvent, {
  websiteId: "9420c944-2450-48e0-bb15-84e0c460a80e",
  hostUrl: "https://cloud.umami.is",
});
```

Synthetic events include `synthetic: "true"` and `verification: "true"` in their payload data.

## Non-Blocking Unconfigured Behavior

Analytics is optional. If `NEXT_PUBLIC_UMAMI_WEBSITE_ID` or `NEXT_PUBLIC_UMAMI_HOST_URL` is missing:
- `createUmamiClient()` returns a safe, no-op client.
- `isInitialized()` returns `false`.
- Calls to `track()`, `trackPageview()`, and `identify()` return `{ success: true, delivered: false, reason: "unconfigured" }` without throwing errors.

## Preflight Validation

Run preflight checks to audit Umami configuration before production launch:

```bash
pnpm preflight
pnpm preflight --prod
```

Preflight enforces:
- `NEXT_PUBLIC_UMAMI_WEBSITE_ID` is a valid UUID string.
- `NEXT_PUBLIC_UMAMI_HOST_URL` uses HTTPS and is a well-formed URL.

## Teardown & Removal

To disconnect Umami:
1. Remove `NEXT_PUBLIC_UMAMI_WEBSITE_ID` and `NEXT_PUBLIC_UMAMI_HOST_URL` from `.env.local` and your deployment environment.
2. In the Umami dashboard, delete or disable the website under **Settings → Websites**.
3. Run `pnpm verify` to confirm clean builds and passing tests.
