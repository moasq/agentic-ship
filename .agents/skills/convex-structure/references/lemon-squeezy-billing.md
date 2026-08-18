# Lemon Squeezy Downstream Billing Provider Reference

Lemon Squeezy serves as an alternative merchant of record (MoR) and subscription billing provider for Agentic-Ship applications.

---

## 🔐 Credentials and Environment Variables

All billing secrets and API keys must reside exclusively in Convex deployment environment variables (`npx convex env set`). Never commit secrets to repository files, frontend bundles, or `.env.local`.

| Variable | Description | Location |
|---|---|---|
| `LEMON_SQUEEZY_API_KEY` | Secret API Key for Lemon Squeezy API v1 | Convex Deployment Env |
| `LEMON_SQUEEZY_WEBHOOK_SECRET` | Signing secret used to compute and verify `X-Signature` HMAC | Convex Deployment Env |
| `LEMON_SQUEEZY_STORE_ID` | Numerical Store Identifier | Convex Deployment Env |
| `LEMON_SQUEEZY_VARIANT_<PLAN>` | Variant IDs mapped to subscription tiers (e.g. `LEMON_SQUEEZY_VARIANT_PRO`) | Convex Deployment Env |
| `SITE_URL` | Canonical application URL for checkout return and portal redirects | Convex Deployment Env |

---

## 🪝 Webhook Signature Verification (`X-Signature`)

Lemon Squeezy signs incoming webhook requests using HMAC-SHA256 with the configured `LEMON_SQUEEZY_WEBHOOK_SECRET`.

### Verification Requirements:
1. Validate against the **exact raw request body** prior to any JSON parsing.
2. Read the `X-Signature` header.
3. Compute `crypto.createHmac('sha256', secret).update(rawBody).digest('hex')`.
4. Perform timing-safe equality check (`crypto.timingSafeEqual`).
5. Reject requests with invalid signatures immediately with status `400 Bad Request`.

```typescript
import { httpAction } from "./_generated/server";

export const handleLemonSqueezyWebhook = httpAction(async (ctx, request) => {
  const signature = request.headers.get("x-signature");
  if (!signature) {
    return new Response("Missing X-Signature header", { status: 400 });
  }

  const rawBody = await request.text();
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const computed = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret + rawBody) // or HMAC-SHA256
  );
  // Verify signature ...
});
```

---

## 🔄 Subscription Lifecycle and Entitlement Invariants

Entitlement must be strictly derived from verified webhook state — never from the client checkout redirect URL or optimistic frontend state.

### Handled Events:
- `subscription_created`: Provision active workspace subscription, store `lemonSqueezySubscriptionId` and `lemonSqueezyCustomerId`.
- `subscription_updated`: Update subscription plan tier, status, renew dates, or payment details.
- `subscription_paused`: Temporarily suspend active plan benefits or fallback to free tier.
- `subscription_resumed`: Re-enable workspace subscription benefits.
- `subscription_cancelled`: Mark subscription as scheduled for termination at `ends_at`.
- `subscription_expired`: Revoke active paid entitlements and transition workspace to free tier.
- `subscription_payment_failed`: Trigger grace period notifications.
- `subscription_payment_recovered`: Restore active subscription status.
- `subscription_payment_refunded`: Audit refund event and adjust entitlements if necessary.

---

## 🛡️ Idempotency and Deduplication

Webhooks may be retried or delivered out of order by Lemon Squeezy.
- Persist handled `event_id` or timestamp in a dedicated `processed_events` table in Convex.
- Check existence prior to applying mutation; if already processed, return `200 OK` immediately without re-executing state transitions.

---

## 🌐 Test Mode vs Production Isolation

- **Test Mode**: Use test store API keys (`test_...`) and test webhook endpoints during local development and preflight verification.
- **Production Mode**: Live API keys and distinct store identifiers. Test events must never mutate live customer workspaces.
