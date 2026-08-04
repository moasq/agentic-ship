import posthog from "posthog-js";

/**
 * PostHog init. Next.js runs this file before the app renders — the official
 * integration point, no provider component needed.
 *
 * Two deliberate choices:
 *
 * 1. `api_host: "/ingest"` — every request goes to OUR origin and is rewritten to
 *    PostHog in next.config.ts. That means the CSP stays `connect-src 'self'` with no
 *    third-party origin added, and ad blockers do not silently delete the analytics of
 *    the people most likely to be technical. Loosening the CSP was the alternative;
 *    this is strictly better.
 *
 * 2. No key, no PostHog. An unconfigured clone loads no analytics at all and captures
 *    nothing — same not-connected contract as Convex and Stripe.
 */
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (key) {
  posthog.init(key, {
    api_host: "/ingest",
    // Points "view recording"-style links at the real dashboard even though ingest is proxied.
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.posthog.com",
    defaults: "2026-05-30",
    // Privacy posture, applied before a single event is sent:
    person_profiles: "identified_only", // no person profile for anonymous visitors
    autocapture: false, // capture named events on purpose, never a firehose of clicks
    session_recording: {
      maskAllInputs: true, // never record what someone typed
      maskTextSelector: "[data-private]", // opt-in masking for anything sensitive on screen
    },
  });
}
