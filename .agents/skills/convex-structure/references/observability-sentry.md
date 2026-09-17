# Sentry observability

Use Sentry only when the product brief selects `providerSelection.observability` as
`sentry`. Observability is optional: a downstream product with no Sentry files or
environment values must still install, build, and verify successfully.

## Ownership

The official `@sentry/nextjs` SDK owns browser, server, and edge reporting. The product
owns one `src/lib/observability.ts` seam with `scrubSentryEvent`; every Sentry
initialization passes that function as `beforeSend`. Do not use the in-memory test
harness in `scripts/lib/observability/sentry.mjs` as a runtime client.

Convex exceptions use Convex's built-in Sentry integration. Enable it from the
production deployment's Dashboard under Settings → Integrations and choose a Node.js
Sentry project. Do not import a Sentry SDK into Convex functions. Convex currently
offers this integration on paid deployments and owns the exception transport.

## Runtime files

The downstream product needs all of these surfaces:

- `instrumentation-client.ts` for browser initialization;
- `sentry.server.config.ts` for the Node.js server runtime;
- `sentry.edge.config.ts` for the edge runtime;
- `src/lib/observability.ts` for the shared scrubber;
- `next.config.ts` wrapped with `withSentryConfig` for release and source-map upload.

Each initialization sets `environment`, `release`, and `beforeSend`. Keep
`sendDefaultPii` false. Browser initialization must set `enabled` so development stays
quiet unless `SENTRY_ENABLE_DEV=true` is intentionally present.

## Environment boundary

`NEXT_PUBLIC_SENTRY_DSN` is a public client key and may enter the browser bundle.
These build values are not public:

- `SENTRY_AUTH_TOKEN` — organization token with the `org:ci` permission;
- `SENTRY_ORG` — organization slug;
- `SENTRY_PROJECT` — project slug;
- `SENTRY_RELEASE` — immutable release identifier shared by uploads and events.

Keep those four values in the deployment or CI build environment. Never create
`NEXT_PUBLIC_SENTRY_AUTH_TOKEN`. The Next.js config reads them from `process.env` and
passes them to `withSentryConfig`; source maps are uploaded during the production
build and are not a runtime credential.

## Privacy contract

The shared scrubber removes authorization and cookie headers, request bodies,
passwords, provider credentials, payment-card values, emails, IP addresses, prompts,
transcripts, messages, and agent state before an event leaves the runtime. Apply the
same scrubber to browser, server, and edge events. Keep Sentry's server-side data
scrubbing and IP-address scrubbing enabled as a second layer.

Set error and trace sampling deliberately for the product's traffic and budget. Record
the chosen retention period and region in the product's privacy documentation. Do not
attach screenshots, request bodies, provider payloads, prompts, or transcripts.

## Verification

Run:

```bash
pnpm onboard sentry --host codex
pnpm preflight --prod
```

The machine probe rejects an incomplete SDK dependency, missing browser/server/edge
initialization, absent scrubber, development noise, public auth token, or missing
release/source-map build values.

Then send one synthetic exception through the official SDK. Use fixed non-personal
text, set `synthetic=true`, and confirm in Sentry that the event has the expected
environment and `SENTRY_RELEASE`. Also attest that the Convex dashboard integration is
active. The helper `simulateSentryCapture` verifies local scrubbing only; it does not
claim remote delivery.

## Removal or replacement

Remove the three runtime initialization files and `withSentryConfig`, remove the SDK,
delete the Sentry environment values from the deployment provider, disable the Convex
dashboard integration, and revoke the organization token in Sentry. Disable or rotate
the client key to stop ingestion. Run `pnpm verify` and `pnpm preflight --prod` after
the replacement is wired.
