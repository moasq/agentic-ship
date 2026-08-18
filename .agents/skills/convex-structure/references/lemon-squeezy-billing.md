# Add Lemon Squeezy billing to a product

Use Lemon Squeezy as the selected billing provider when the product brief sets `providerSelection.billing` to `lemonsqueezy`. Stripe and Polar remain available, but one deployment cannot initialize more than one billing provider.

## Create checkout on the server

Install `@lemonsqueezy/lemonsqueezy.js` in the downstream product. Keep the store, product, and variant mappings in Convex deployment environment variables. The browser sends a plan key from the server-owned plan allowlist; it never sends an amount, store ID, product ID, or variant ID.

Create the checkout with the Lemon Squeezy API from a Convex action. Put the authenticated user or organization identifier in `checkout_data.custom` so Lemon Squeezy returns it under webhook `meta.custom_data`. The identifier comes from the authenticated context, not a client argument.

Use Lemon Squeezy's hosted checkout URL. The return URL confirms navigation only and never grants entitlement.

## Open the customer portal

Store the signed `urls.customer_portal` value from a verified subscription webhook. Return it only after checking the current authenticated owner. The link is provider-hosted and short-lived, so fetch or refresh it when the customer opens billing settings instead of treating it as a permanent application URL.

## Verify the exact webhook body

Register `/lemonsqueezy/webhook` in `convex/http.ts`. Read the request with `request.text()` once and keep that exact string until verification finishes. Compute HMAC-SHA256 with `LEMON_SQUEEZY_WEBHOOK_SECRET`, decode the `X-Signature` hexadecimal value, check the lengths, and compare with `crypto.timingSafeEqual`. Parse JSON only after the comparison succeeds.

Reject a missing, malformed, or mismatched signature before calling any mutation. Do not compute the digest from parsed and re-serialized JSON because whitespace and key order are part of the signed body.

Lemon Squeezy payloads do not provide a standalone event ID. After verification, derive the delivery ID from a SHA-256 digest of the raw body. Store that ID and the entitlement update in one internal Convex mutation. A retry with the same body becomes a no-op, and an older `updated_at` or `created_at` value cannot overwrite newer state.

## Apply subscription state

Use these transitions:

| Event | Entitlement action |
| --- | --- |
| `subscription_created` | Apply the verified subscription status; active and on-trial states grant access |
| `subscription_updated` | Reconcile status, plan, renewal date, cancellation date, and portal URL |
| `subscription_paused` | Suspend paid access |
| `subscription_unpaused` | Restore active access |
| `subscription_cancelled` | Keep access until `ends_at` |
| `subscription_resumed` | Clear scheduled cancellation and keep access |
| `subscription_expired` | Revoke access |
| `subscription_payment_failed` | Record past-due state and keep the current grace-period decision |
| `subscription_payment_recovered` or `subscription_payment_success` | Restore or confirm active access |
| `subscription_payment_refunded` or `order_refunded` | Record the refund; wait for verified subscription state before revoking access |

Webhook state is the entitlement truth. Product UI reads only the webhook-backed query.

## Configure each environment

Store these values in the Convex deployment environment:

| Variable | Purpose |
| --- | --- |
| `BILLING_PROVIDER=lemonsqueezy` | Select the Lemon Squeezy adapter |
| `LEMON_SQUEEZY_API_KEY` | Server-only API credential |
| `LEMON_SQUEEZY_WEBHOOK_SECRET` | `X-Signature` signing secret |
| `LEMON_SQUEEZY_STORE_ID` | Selected store |
| `LEMON_SQUEEZY_PRODUCT_ID` | Selected product |
| `LEMON_SQUEEZY_VARIANT_<PLAN>` | Server-side variant mapping for each plan key |
| `LEMON_SQUEEZY_MODE` | `test` outside production or `live` in production |
| `SITE_URL` | HTTPS checkout return origin |

Keep test and live resources isolated in their matching application deployments. Before launch, switch the Lemon Squeezy store out of test mode, provision live product and variant values, register the production webhook, and set `LEMON_SQUEEZY_MODE=live`. `pnpm preflight --prod` rejects test or unknown modes, missing store or product configuration, missing mappings, and simultaneous billing-provider secrets.

## Verify and revoke the integration

In test mode, simulate creation, update, pause, unpause, cancellation, resume, expiration, payment failure, recovery, success, and refund events. Verify that an invalid signature, duplicate delivery, and stale delivery cannot change entitlement. Exercise checkout custom data and the customer portal separately.

To revoke access, delete the API key under Lemon Squeezy Settings → API and delete the webhook under Settings → Webhooks. Remove the Lemon Squeezy Convex environment values before selecting another billing provider.

Official references: [webhook signing](https://docs.lemonsqueezy.com/help/webhooks/signing-requests), [event types](https://docs.lemonsqueezy.com/help/webhooks/event-types), [custom checkout data](https://docs.lemonsqueezy.com/help/checkout/passing-custom-data), and [testing and going live](https://docs.lemonsqueezy.com/guides/developer-guide/testing-going-live).
