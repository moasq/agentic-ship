# Email — Postmark via Convex Seam

Reference for the convex-structure skill. Postmark provides high-deliverability transactional email delivery, webhook tracking for delivery events, bounces, and spam complaints, and server token secret isolation.

## The pieces

| Piece | Owner | Job |
| --- | --- | --- |
| Postmark API | Postmark (vendor) | Transactional email delivery, bounce classification, reputation monitoring |
| `convex/email.ts` | this repo | The email seam — wraps email dispatch and test-mode safety gates |
| `convex/http.ts` | this repo | Mounts `/postmark/webhook` endpoint with constant-time webhook signature verification |

## Setup & Secret Requirements

Postmark uses Server API Tokens to authenticate outbound requests and custom webhook headers / HTTP Basic Auth to authenticate inbound webhooks.

1. **Select Postmark**: Set `providerSelection.email` to `"postmark"` in the product brief.
2. **Server API Token**:
   - Obtain your Server API Token in the Postmark Dashboard under **Server → API Tokens**.
   - Store it securely in the Convex deployment environment:
     ```bash
     pnpm secret:set POSTMARK_SERVER_TOKEN
     ```
   - Hidden input pipes the token straight into the Convex environment — never into chat, git, or `.env.local`.
3. **Register Webhook**:
   - In the Postmark Dashboard under **Server → Webhooks**, register the endpoint:
     `https://<deployment>.convex.site/postmark/webhook`
   - Select event triggers: **Delivery**, **Bounce**, and **Spam Complaint**.
   - Configure a webhook secret header (e.g. `X-Postmark-Secret`) or HTTP Basic Auth credentials.
   - Store the secret in the Convex deployment environment:
     ```bash
     pnpm secret:set POSTMARK_WEBHOOK_SECRET
     ```

## Non-production verification mode

`convex/email.ts` maintains `testMode: true` during local development:
- In test mode, email dispatch uses Postmark's test token (`POSTMARK_API_TEST`) or routes only to allowlisted recipient sinks.
- In test mode, `requireEmailVerification` in `convex/auth.ts` remains `false`.
- Turning on `requireEmailVerification` while `testMode: true` is active will lock out real signups, which `pnpm health` flags as a critical configuration defect.

## Going to production

1. **Verify Sending Domain**: Set up DKIM and custom Return-Path DNS records in the Postmark dashboard under **Sender Signatures / Domains**.
2. **Set Sender Address**:
   - Set `EMAIL_FROM` to an address on your verified domain:
     ```bash
     npx convex env set EMAIL_FROM "Your App <support@yourdomain.com>"
     ```
3. **Flip Live Gates**:
   - In `convex/email.ts`, set `testMode: false`.
   - In `convex/auth.ts`, set `requireEmailVerification: true`.
   - Both flags flip together for production go-live.
4. **Preflight Gate**: Run `pnpm preflight` (and `pnpm preflight --prod`) to verify the configuration before deployment.

## Webhook verification

`convex/http.ts` mounts `/postmark/webhook`.
- The webhook endpoint extracts the authentication secret from incoming headers (`X-Postmark-Secret`, `X-Webhook-Secret`, or `Authorization: Bearer <secret>`).
- Webhook verification uses `crypto.timingSafeEqual` over buffer representations to prevent timing attacks.
- Missing, mismatched, or unauthenticated requests return 401/403 immediately before invoking internal mutations.

## Bounce & complaint handling

Postmark categorizes email lifecycle events into distinct record types:

| Event Type | Postmark RecordType | Delivery Action |
| --- | --- | --- |
| **Delivery** | `Delivery` | Records delivery confirmation and timestamp for message tracking. |
| **Hard Bounce** | `Bounce` (TypeCode 1) | Automatically flags recipient email as `inactive: true` to prevent sender reputation degradation. |
| **Soft Bounce** | `Bounce` (TypeCode 512) | Records temporary bounce failure without permanently deactivating the recipient. |
| **Spam Complaint** | `SpamComplaint` | Flags recipient as `inactive: true`, unsubscribes recipient, and flags notification. |

All webhook handlers process events idempotently by tracking `MessageID` / `deliveryId` in internal tables. Retried webhooks are safely acknowledged without duplicate side effects.

## Provider replacement (Resend ↔ Postmark)

To replace Resend with Postmark or vice versa:
1. Update `providerSelection.email` in the product brief.
2. Replace the SDK / dispatch implementation in `convex/email.ts`.
3. Mount `/postmark/webhook` in `convex/http.ts`.
4. Store `POSTMARK_SERVER_TOKEN` and `POSTMARK_WEBHOOK_SECRET` with `pnpm secret:set`.
5. Remove unused Resend secrets (`RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`) from the Convex environment to prevent conflicting provider secrets.
6. Verify with `pnpm verify`.
