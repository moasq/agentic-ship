# Umami analytics adapter

Umami is an optional alternative to PostHog. The product brief selects one analytics
provider; selecting Umami must not initialize PostHog or Plausible.

## Downstream contract

`src/lib/analytics.ts` is the only application seam that calls `umami.track()`. It
accepts named product events and a small allowlisted data object, runs the shared
privacy scrubber, and returns without making the product wait for analytics. The
adapter receives explicit event-name and property-key allowlists; unlisted event names
do not dispatch and unlisted properties are removed before scrubbing.

The browser tracker supports `umami.track()` for a pageview,
`umami.track(eventName)` for a custom event, and
`umami.track(eventName, data)` for event data. This seam deliberately does not expose
`umami.identify()`.

## Public configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | yes | Website UUID from the Umami dashboard |
| `NEXT_PUBLIC_UMAMI_HOST_URL` | yes | Exact HTTPS origin for Umami Cloud or the self-hosted instance |
| `NEXT_PUBLIC_UMAMI_DOMAINS` | yes | Comma-separated product hostnames allowed to send events |
| `NEXT_PUBLIC_UMAMI_SCRIPT_URL` | only when it differs from `<host>/script.js` | Exact HTTPS tracker script URL |

An empty domain list denies tracking. `*.example.com` matches a real subdomain such as
`app.example.com`; it does not match `example.com` or `badexample.com`. List the apex
hostname separately when it is allowed.

## Events and privacy

Umami event data supports strings, numbers, booleans, arrays, and objects. The shared
seam still keeps the contract small and low-cardinality. Never allowlist email addresses,
authentication subjects, prompts, transcripts, secrets, payment data, unrestricted
user content, or full URL query strings.

The tracker normally sends data to the origin that served its script. `data-host-url`
may override that destination. Both the configured host and script must use HTTPS;
the product-domain allowlist controls where the tracker may run.

## Verification

The local dry run prepares and scrubs a payload only. It returns
`acceptedByAdapter: true` and `delivered: false`; it is not provider evidence.

For a real check:

1. Load the product from an allowlisted hostname with Umami selected.
2. Send one synthetic custom event through `umami.track()`.
3. Confirm the event in the Umami dashboard and remove or exclude it from product reporting.
4. Confirm a non-allowlisted hostname does not dispatch an event.
5. Confirm the product's consent behavior matches its published privacy policy. A
   cookie-free tracker does not by itself decide the product's legal consent duty.
6. Run `pnpm preflight --prod` with the production public variables available.

Network or tracker failure must never interrupt the product workflow.

## Removal

Delete or disable the website in Umami, remove all Umami public variables from the
deployment, select another analytics provider or none, and run `pnpm verify`.

Official references: [tracker configuration](https://docs.umami.is/docs/tracker-configuration),
[tracker functions](https://docs.umami.is/docs/tracker-functions), and
[event data](https://docs.umami.is/docs/event-data).
