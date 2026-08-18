# Add Polar billing to a product

Use Polar as the selected billing provider when the product brief sets `providerSelection.billing` to `polar`. Stripe remains available, but one deployment cannot initialize both providers.

## Wire the official adapter

Install `@polar-sh/better-auth` and `@polar-sh/sdk` in the downstream product. Add the server plugins in `convex/auth.ts`:

```typescript
import { checkout, polar, portal, webhooks } from "@polar-sh/better-auth";
import { Polar } from "@polar-sh/sdk";

const polarSdk = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN,
  server: process.env.POLAR_SERVER,
});

polar({
  client: polarSdk,
  createCustomerOnSignUp: true,
  use: [checkout({ products: PLANS, authenticatedUsersOnly: true }), portal(), webhooks({ secret: process.env.POLAR_WEBHOOK_SECRET })],
});
```

Add `polarClient()` to `src/lib/auth-client.ts`. The server and client plugins must ship together. Register the webhook in Polar at `/api/auth/polar/webhooks`; the Better Auth proxy forwards that route to the configured auth server.

## Start checkout from authenticated context

The browser sends a plan key from the server-owned `PLANS` allowlist:

```typescript
await authClient.checkout({
  slug: "pro",
  referenceId: organizationId,
});
```

Use the authenticated user's subject when the product has no organization. Never accept an arbitrary user or organization ID as authorization. Polar stores `referenceId` on checkout, order, and subscription records for reconciliation.

The return URL confirms navigation only. It never grants entitlement.

## Open the customer portal

Call `authClient.customer.portal()` after session truth confirms an authenticated customer. Polar returns and hosts the portal URL. Card data and portal controls never touch the application origin.

## Verify webhooks before changing entitlement

Prefer the Better Auth `webhooks()` plugin because it verifies Polar's Standard Webhooks signature. A custom handler must call `validateEvent` from `@polar-sh/sdk/webhooks` with the unmodified body and request headers. Do not replace it with a raw hexadecimal HMAC helper.

Pass only verified events to one internal mutation. The mutation records the Standard Webhooks delivery ID and updates entitlement in the same transaction. A duplicate delivery becomes a no-op, and an older timestamp cannot overwrite newer subscription state.

## Apply subscription state

Use these transitions:

| Event | Entitlement action |
| --- | --- |
| `subscription.created` | Record pending state; do not grant access |
| `subscription.active` | Grant access, including payment recovery |
| `subscription.updated` | Apply the verified current status and period dates |
| `subscription.past_due` | Keep current access during Polar's recovery period |
| `subscription.canceled` | Keep access until Polar revokes the subscription |
| `subscription.uncanceled` | Clear scheduled cancellation and keep access |
| `subscription.revoked` | Revoke access |
| `customer.state_changed` | Reconcile from the verified active-subscription list |
| `order.paid` | Record renewal; do not create a second entitlement |
| `order.refunded` | Record the refund; wait for subscription or customer state before changing access |

## Configure each environment

Store these values in the Convex deployment environment:

| Variable | Purpose |
| --- | --- |
| `BILLING_PROVIDER=polar` | Select the Polar adapter |
| `POLAR_ACCESS_TOKEN` | Organization Access Token for the selected environment |
| `POLAR_WEBHOOK_SECRET` | Secret for the registered webhook endpoint |
| `POLAR_PRODUCT_<PLAN>` | Server-side product mapping for each plan key |
| `POLAR_SERVER` | `sandbox` during development or `production` in production |
| `SITE_URL` | HTTPS checkout and portal return origin |

Create sandbox and production tokens, products, and webhooks separately. `pnpm preflight --prod` rejects `POLAR_SERVER=sandbox`, unknown values, missing mappings, and simultaneous billing-provider secrets.

## Verify and revoke the integration

Test checkout, activation, renewal, scheduled cancellation, uncanceling, payment recovery, revocation, duplicate delivery, stale delivery, and refund behavior in Polar's sandbox. Invalid signatures must not reach the entitlement mutation.

To revoke access, remove the Organization Access Token in Polar settings and delete the registered webhook. Remove Polar's Convex environment values before selecting another billing provider.
