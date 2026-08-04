import posthog from "posthog-js";

/**
 * The analytics seam. Components import from here, never from `posthog-js`, so:
 *   - swapping vendors is one file
 *   - event names are a typed union, not free-form strings that drift into three
 *     spellings of the same funnel step
 *   - with no key configured every call is a no-op, so nothing throws in a fresh clone
 *
 * Rules: never pass an email, a token, or anything from a URL as a property. Analytics
 * is a product-measurement tool, not a log sink.
 */

export const isAnalyticsConfigured = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);

/**
 * The whole event vocabulary. Adding an event means adding it here first — that review
 * step is what keeps a funnel readable a year later.
 */
export type AnalyticsEvent =
  | "signup_started"
  | "signup_completed"
  | "checkout_started"
  | "entitlement_active";

export function capture(event: AnalyticsEvent, properties?: Record<string, string | number | boolean>) {
  if (!isAnalyticsConfigured) return;
  posthog.capture(event, properties);
}

/**
 * Call after sign-in with the auth subject — a stable opaque id.
 * Never an email or a display name: those are person properties, not identities.
 */
export function identify(userId: string, traits?: Record<string, string | number | boolean>) {
  if (!isAnalyticsConfigured) return;
  posthog.identify(userId, traits);
}

/** Call on sign-out, so the next person on this browser is not merged into the last one. */
export function resetIdentity() {
  if (!isAnalyticsConfigured) return;
  posthog.reset();
}
