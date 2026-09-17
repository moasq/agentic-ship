# Plausible analytics adapter

Plausible is an optional alternative to PostHog. The product brief selects one
analytics provider; selecting Plausible must not initialize PostHog or Umami.

## Downstream contract

`src/lib/analytics.ts` is the only application seam that calls `plausible()`. It
accepts named product events and a small allowlisted property object, runs the shared
privacy scrubber, and returns without making the product wait for analytics.

The browser loads the site-specific script shown under Plausible Site Settings →
General → Site Installation. Current Plausible scripts are unique to a site and use
`plausible.init()` for options such as a custom event endpoint. Do not use the retired
generic `script.js` snippet.

## Public configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | yes | Exact production hostname registered in Plausible |
| `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL` | yes | Site-specific script URL from Plausible, or a same-origin proxy path |
| `NEXT_PUBLIC_PLAUSIBLE_EVENT_ENDPOINT` | for a proxy or self-hosted instance | Event endpoint; use `/api/event` for a same-origin proxy |
| `NEXT_PUBLIC_PLAUSIBLE_ALLOWED_ORIGINS` | yes | Comma-separated HTTPS origins allowed to serve the script or receive events |

Plausible Cloud normally allowlists `https://plausible.io`. A self-hosted deployment
uses its exact HTTPS origin. Relative proxy paths are safe because they remain on the
product origin; protocol-relative and arbitrary remote URLs are rejected.

## Events and privacy

Call `plausible("Event name", { props })` after scrubbing. Plausible accepts custom
properties in the optional `props` object. The adapter receives explicit event-name
and property-key allowlists; unlisted names do not dispatch and unlisted properties
are removed before scrubbing. A sent custom event must also be configured
as a goal in Plausible before it appears as a conversion.

Never allowlist email addresses, authentication subjects, prompts, transcripts, secrets,
payment data, unrestricted user content, or full URL query strings. Analytics events
use product-owned enums and low-cardinality properties. Plausible has no identity call
in this seam.

## Verification

The local dry run prepares and scrubs a payload only. It returns
`acceptedByAdapter: true` and `delivered: false`; it is not provider evidence.

For a real check:

1. Load the product with Plausible selected and confirm the site-specific script.
2. Send one synthetic custom event through the browser tracker.
3. Confirm the event in the Plausible dashboard and remove or exclude it from product reporting.
4. Confirm the product's consent behavior matches its published privacy policy. A
   cookie-free tracker does not by itself decide the product's legal consent duty.
5. Run `pnpm preflight --prod` with the production public variables available.

Network or tracker failure must never interrupt the product workflow.

## Removal

Delete the site in Plausible, remove all four Plausible public variables from the
deployment, select another analytics provider or none, and run `pnpm verify`.

Official references: [installation and script update](https://plausible.io/docs/script-update-guide),
[custom events](https://plausible.io/docs/custom-event-goals), and
[proxy configuration](https://plausible.io/docs/proxy/introduction).
