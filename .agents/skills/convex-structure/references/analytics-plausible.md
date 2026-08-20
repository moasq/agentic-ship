# Analytics — Plausible via Privacy-First Seam

Reference for the convex-structure and frontend-security skills. Plausible is a lightweight, cookie-free, open-source web analytics tool built for privacy compliance (GDPR, CCPA, PECR) without tracking individuals across sites or devices.

## The pieces

| Piece | Owner | Job |
| --- | --- | --- |
| Plausible Cloud / Self-Hosted | Plausible (vendor) | Ingests anonymous aggregate pageviews and custom events without cookies or persistent identifiers |
| `scripts/lib/analytics/plausible.mjs` | this repo | Plausible integration helpers: domain validation, script URL resolution, privacy data scrubbing, synthetic event generator, and preflight gates |
| `src/lib/analytics.ts` | this repo | The application analytics seam — exports typed `capture`, `trackEvent`, and `trackPageview` functions with automatic PII and secret redaction |

## Why Plausible

- **Cookie-Free & Zero Consent Banners**: Plausible does not use cookies, does not store local storage identifiers, and generates a daily rotating pseudonymous hash based on IP and User-Agent that cannot be linked back to individual visitors.
- **Lightweight Script**: The standard tracking script is under 1 KB (~45 times smaller than Google Analytics), keeping client bundle sizes and Time to Interactive (TTI) optimal.
- **Strict Privacy**: No personal data (emails, tokens, passwords, prompt content) is ever collected or stored.

## Configuration & Environment Variables

Plausible requires only the public site domain registered in your Plausible dashboard.

| Key | Shape | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | `example.com` or `app.my-site.com` | **Required**. The site domain matching your configured Plausible dashboard site |
| `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL` | `https://plausible.io/js/script.js` | Optional custom script URL (for custom domain proxies, self-hosted Plausible, or extension scripts like `script.tagged-events.outbound-links.js`) |
| `NEXT_PUBLIC_PLAUSIBLE_API_HOST` | `https://plausible.io` | Optional custom ingestion API endpoint for self-hosted instances |

Configure in `.env.local` for development and in your hosting environment (Netlify / Vercel / Convex) for production:

```bash
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=my-app.com
```

## CSP & Custom Proxying

When using Plausible Cloud:
- Add `https://plausible.io` to `script-src` and `connect-src` in `next.config.ts`, OR
- Proxy Plausible through Next.js rewrites on your own origin (`/stats/js/script.js` → `https://plausible.io/js/script.js`, `/api/event` → `https://plausible.io/api/event`) so `connect-src 'self'` and `script-src 'self'` remain untouched.

## Privacy Filters & Data Scrubbing

All events routed to Plausible pass through privacy filters before dispatch:
- **Email Redaction**: Emails in properties are replaced with `[REDACTED_EMAIL]`.
- **Token & Key Isolation**: Bearer tokens, JWTs, Stripe keys, Sentry tokens, PostHog personal keys, and Resend keys are stripped and replaced with `[REDACTED_TOKEN]` or `[REDACTED]`.
- **Agent Prompts & Transcripts**: Prompt parameters, transcript logs, system instructions, and healing ledgers are filtered out.
- **URL Query Cleansing**: URL query string secrets (`token`, `auth`, `key`, `secret`, `password`) are scrubbed before pageview tracking.

## Synthetic Event Verification

To verify that Plausible tracking and data scrubbing work without polluting production metrics:

```javascript
import { createSyntheticPlausibleEvent, simulatePlausibleCapture } from "./scripts/lib/analytics/plausible.mjs";

const syntheticEvent = createSyntheticPlausibleEvent({
  eventName: "signup_completed",
  domain: "my-app.com",
  props: { plan: "pro" },
});

const { delivered, eventId, payload, scrubbedEvent } = simulatePlausibleCapture(syntheticEvent, {
  domain: "my-app.com",
});
```

Synthetic events are tagged with `synthetic: "true"` and `verification: "true"` so they can be filtered out of dashboard reporting.

## Non-Blocking Unconfigured Behavior

Analytics is optional. If `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` is not set:
- `createPlausibleClient()` returns a safe, no-op client.
- `isInitialized()` returns `false`.
- Calls to `trackEvent()` and `trackPageview()` return non-blocking success payloads (`{ success: true, delivered: false, reason: "unconfigured" }`) without throwing errors.

## Preflight Validation

Run preflight checks to audit Plausible configuration before going live:

```bash
pnpm preflight
pnpm preflight --prod
```

Preflight verifies that:
- `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` is configured and is not `localhost` or an empty placeholder.
- If `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL` is configured, it uses HTTPS.

## Teardown & Removal

To remove Plausible:
1. Remove `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` from `.env.local` and your deployment environment.
2. Delete the site entry in the Plausible dashboard under **Site Settings → Delete Site**.
3. Run `pnpm verify` to confirm clean builds and passing tests.
