# Lemon Squeezy Downstream Billing Provider Reference

Lemon Squeezy serves as an alternative merchant of record (MoR) and subscription billing provider for Agentic-Ship applications.

---

## 🔐 Credentials and Environment Variables

All billing secrets and API keys must reside exclusively in Convex deployment environment variables (`pnpm secret:set`). Never commit secrets to repository files, frontend bundles, or `.env.local`.

| Variable | Description | Location |
|---|---|---|
| `LEMON_SQUEEZY_API_KEY` | Secret API Key for Lemon Squeezy API v1 | Convex Deployment Env |
| `LEMON_SQUEEZY_WEBHOOK_SECRET` | Signing secret used to compute and verify `X-Signature` HMAC | Convex Deployment Env |
| `LEMON_SQUEEZY_STORE_ID` | Numerical Store Identifier | Convex Deployment Env |
| `LEMON_SQUEEZY_MODE` | Explicit deployment mode: `live` or `test` | Convex Deployment Env |
| `LEMON_SQUEEZY_VARIANT_<PLAN>` | Variant IDs mapped to subscription tiers (e.g. `LEMON_SQUEEZY_VARIANT_PRO`) | Convex Deployment Env |
| `SITE_URL` | Canonical application URL for checkout return and portal redirects | Convex Deployment Env |

---

## 🪝 Webhook Signature Verification (`X-Signature`)

Lemon Squeezy signs incoming webhook requests using HMAC-SHA256 with the configured `LEMON_SQUEEZY_WEBHOOK_SECRET`.

### Verification Requirements:
1. Validate against the **exact raw request body string** prior to any JSON parsing.
2. Read the `X-Signature` header.
3. Compute `crypto.createHmac("sha256", secret).update(rawBody).digest("hex")`.
4. Compare digest and header using `crypto.timingSafeEqual` with equal-length Buffer allocations.
5. Parse the JSON payload **only after** signature verification succeeds.
6. Reject requests with invalid signatures immediately with status `400 Bad Request`.

```typescript
import crypto from "node:crypto";
import { httpAction } from "./_generated/server";

export const handleLemonSqueezyWebhook = httpAction(async (ctx, request) => {
  const signatureHeader = request.headers.get("x-signature");
  if (!signatureHeader) {
    return new Response("Missing X-Signature header", { status: 400 });
  }

  const rawBody = await request.text();
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("Webhook secret not configured", { status: 500 });
  }

  // Compute HMAC-SHA256 over exact raw body
  const hmac = crypto.createHmac("sha256", secret);
  const computedHex = hmac.update(rawBody).digest("hex");

  const digestBuffer = Buffer.from(computedHex, "utf8");
  const signatureBuffer = Buffer.from(signatureHeader, "utf8");

  if (
    digestBuffer.length !== signatureBuffer.length ||
    !crypto.timingSafeEqual(digestBuffer, signatureBuffer)
  ) {
    return new Response("Invalid signature", { status: 400 });
  }

  // Parse payload ONLY after signature verification succeeds
  const payload = JSON.parse(rawBody);
  const eventName = payload.meta?.event_name;
  const data = payload.data;

  // Process verified lifecycle event...
  return new Response("OK", { status: 200 });
});
```

---

## 🔄 Subscription Lifecycle and Entitlement Invariants

Entitlement must be strictly derived from verified webhook state — never from client checkout redirect URLs or optimistic frontend state.

### Lifecycle Events & Entitlement Transitions:
- `subscription_created`: Record customer ID, subscription ID, and variant ID in pending state. Grant entitlement once subscription status is confirmed `active`.
- `subscription_updated`: Update subscription plan tier, renew dates, or billing cycle details.
- `subscription_paused`: Temporarily suspend active plan benefits or fallback to free tier.
- `subscription_unpaused`: **Restores a previously paused subscription** to active status and reinstates workspace entitlement.
- `subscription_cancelled`: Mark subscription as scheduled for termination at `ends_at`; retain access during remaining paid period.
- `subscription_resumed`: **Restores a cancelled subscription** before expiration, resetting cancellation schedule.
- `subscription_expired`: Revoke active paid entitlements and transition workspace to free tier.
- `subscription_payment_failed`: Mark status as `past_due` and initiate payment grace period.
- `subscription_payment_recovered`: Restore active subscription status upon successful retry.
- `subscription_payment_refunded`: Audit refund event and revoke corresponding plan entitlement.

---

## 🛡️ Idempotency and Deduplication

Lemon Squeezy webhook payloads do not include a standalone unique `event_id`.
- Define a deterministic idempotency key from verified payload fields:
  ```typescript
  const deduplicationKey = `${eventName}_${data.id}_${data.attributes?.updated_at ?? data.attributes?.created_at}`;
  ```
- Alternatively, compute a SHA-256 digest of the verified raw request body.
- Record the deduplication key in the same atomic database transaction as the entitlement mutation, returning `200 OK` immediately if previously processed.

---

## 🌐 Test Mode vs Production Isolation

Lemon Squeezy defines test or live mode by store settings and where API keys/resources were created.
- Set explicit `LEMON_SQUEEZY_MODE=live` for production environments.
- Set `LEMON_SQUEEZY_MODE=test` for preview/staging environments.
- Production preflight rejects deployments where `LEMON_SQUEEZY_MODE` is unset or set to `test`.
