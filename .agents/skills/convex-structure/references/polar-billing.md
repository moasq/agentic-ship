# Polar billing — how the engine works and how to build on it

Reference for the convex-structure skill. The engine supports **Polar** as an alternative downstream billing provider through the common provider-adapter contract.

## The pieces

| Piece | Owner | Job |
| --- | --- | --- |
| `@polar-sh/better-auth` / `@polar-sh/sdk` | Polar | Official adapter linking Better Auth user/org identities to Polar customer accounts |
| `convex/billing.ts` | this repo | The common seam: plan allowlist, checkout/portal actions, and reactive `getEntitlement` query |
| `convex/http.ts` | this repo | `/polar/webhook` endpoint verifying incoming Standard Webhooks HMAC signatures |

## How money moves

1. Browser calls `api.billing.createCheckout({ plan: "pro" })` — a **plan key**, never an amount or raw price.
2. The server-side action maps the plan key to the corresponding Polar Product ID (`POLAR_PRODUCT_PRO`), initializes checkout with the authenticated user ID / organization ID as `metadata.userId`, and returns the hosted Polar Checkout URL.
3. The browser redirects to the hosted Polar checkout page. Card and payment data never touch the application backend.
4. Polar delivers webhook events to `…convex.site/polar/webhook`. The endpoint cryptographically verifies the signature (`POLAR_WEBHOOK_SECRET`) using standard HMAC headers (`webhook-id`, `webhook-timestamp`, `webhook-signature`), updates customer and subscription state, and returns HTTP 200.
5. `api.billing.getEntitlement` updates reactively across all active client sessions. **Fulfillment is driven exclusively by verified webhook events, never by return URL parameters.**

## Lifecycle events handled

| Event | Action Taken |
| --- | --- |
| `subscription.created` | Record customer ID and subscription metadata in pending state (**do not grant active plan yet; first payment may still be processing**) |
| `subscription.active` | Provision active workspace entitlement, grant plan benefits, record `current_period_end` |
| `subscription.updated` | Update plan tier and billing cycle dates on upgrade/downgrade |
| `subscription.past_due` | Retain access during grace period; mark status as `past_due` and notify customer |
| `subscription.canceled` | Retain access until `current_period_end`; schedule revocation at termination date |
| `subscription.uncanceled` | Restore subscription to normal renewing status |
| `subscription.revoked` | Revoke entitlement immediately upon terminal payment failure, dispute, or end of cancellation period |
| `order.created` | Record one-time purchase or initial invoice receipt |
| `order.refunded` | Revoke product entitlement associated with the refunded order |

## Customer Portal

Polar provides built-in customer portal access. Calling `api.billing.createPortalSession()` creates an authenticated customer portal session via `polar.customerSessions.create({ customerId })` and returns the destination portal URL.

## Configuration & Environment Variables

All Polar secrets must be stored in Convex deployment environment variables:

| Variable | Scope | Purpose |
| --- | --- | --- |
| `POLAR_ACCESS_TOKEN` | Convex Env | Server-side API token created in Polar settings |
| `POLAR_WEBHOOK_SECRET` | Convex Env | HMAC signing secret for webhook verification |
| `POLAR_PRODUCT_<PLAN>` | Convex Env | Product ID mapped to specific plan keys (e.g. `POLAR_PRODUCT_PRO`) |
| `POLAR_SERVER` | Convex Env | `sandbox` (for test mode) or `production` |
| `SITE_URL` | Convex Env | Fully qualified return URL for checkout flows |

`POLAR_ACCESS_TOKEN` and `POLAR_WEBHOOK_SECRET` must **never** appear in `.env.local` or repository files.
