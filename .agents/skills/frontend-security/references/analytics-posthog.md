# Analytics — PostHog, without opening the CSP

Reference for the frontend-security and setup-health skills. Analytics is the one layer
that normally forces a security compromise. This setup does not make one.

## Why PostHog

Checked against the official marketplace on 2026-08-04: PostHog and Amplitude ship
official plugins; Plausible, Umami and Mixpanel ship none. PostHog wins on the only test
that matters here — **the agent can read the product data back**. Its hosted MCP
(`mcp.posthog.com`, OAuth) exposes insights, funnels, feature flags, experiments and
replays, so the agent that shipped a feature can check whether it worked. Everything
else in the field is write-only from the agent's point of view.

## The CSP question — solved by a proxy, not an exception

The browser never talks to PostHog. `instrumentation-client.ts` sets
`api_host: "/ingest"`, and `next.config.ts` rewrites `/ingest/*` to PostHog server-side.

Two consequences, both good:

- **`connect-src 'self'` stays closed.** No analytics origin is added to the policy. The
  usual "add these three hostnames to your CSP" step never happens.
- **Ad blockers do not silently delete your data.** Requests go to your own domain. For
  a technical audience this is the difference between measuring most people and
  measuring the half who do not block trackers.

This is PostHog's own recommended setup, not a trick. `skipTrailingSlashRedirect: true`
is required alongside it.

`posthog-js` is an npm dependency bundled by Next, so there is no third-party
`<script>` tag either — `script-src` is untouched.

## Keys

| Key | Shape | Where it belongs |
| --- | --- | --- |
| Project key | `phc_…` | **public by design** — `NEXT_PUBLIC_POSTHOG_KEY` in `.env.local` and in the host env |
| Personal API key | `phx_…` | a full-access credential. **Never** in this repo, never in a host env for the web service. `pnpm health` treats a `phx_` followed by a payload as CRITICAL |

The health check matches prefix **plus payload**, so documentation that names `phx_`
does not trip it — an earlier version flagged its own warning text.

## Privacy defaults (set in `instrumentation-client.ts`)

- `person_profiles: "identified_only"` — anonymous visitors get no person profile.
- `autocapture: false` — every event is named on purpose. A click firehose is
  unreadable in six months and collects things nobody agreed to.
- `session_recording.maskAllInputs: true` — what people type is never recorded.
- `maskTextSelector: "[data-private]"` — put that attribute on anything sensitive that
  renders as text.
- No key → `posthog.init` never runs. A fresh clone sends nothing.

## The seam

`src/lib/analytics.ts` is the only file that imports `posthog-js`. It exports
`capture`, `identify`, `resetIdentity`, and a typed `AnalyticsEvent` union — adding an
event means adding it to that union first. That review step is what stops three
spellings of the same funnel step.

Rules:

- `identify(userId)` with the **auth subject**, never an email or display name. Emails
  are person properties, not identities.
- `resetIdentity()` on sign-out, or the next person on that browser inherits the last
  one's identity.
- Never pass tokens, emails, or anything read out of a URL as event properties.

## Health checks

- `phx_` + payload anywhere in `src/` or env → CRITICAL
- key configured but `/ingest` proxy missing → FAIL (requests would be blocked)
- key absent → WARN, analytics is a no-op

Acceptance: a local sign-up produces one `signup_completed` event in PostHog, and the
network tab shows the request going to your own origin at `/ingest`.

## MCP

The `posthog@claude-plugins-official` plugin provides the MCP over OAuth — authorize
once via `/mcp`. Their README also documents opt-in LLM analytics for Claude Code
sessions themselves; that is a separate, personal choice and is not wired here.
