# Email — Resend via `@convex-dev/resend`

Reference for the convex-structure skill. The engine ships email **wired and
test-safe**; no email UI, no templates beyond the two auth messages.

## The pieces (verified 2026-08-04)

| Piece | Owner | Job |
| --- | --- | --- |
| `@convex-dev/resend` 0.2.7 | Convex (first-party) | durable send queue (bundles workpool + rate-limiter), delivery webhook handling, `deliveryEvents` table |
| `resend@claude-plugins-official` | Resend (their `resend/resend-skills` repo) | skills + hosted MCP `mcp.resend.com`; ships `.codex-plugin` / `.cursor-plugin` / `.grok-plugin` too |
| `convex/email.ts` | this repo | the seam — the only file that imports the Resend SDK |

## Why a queue matters

`resend.sendEmail(ctx, …)` enqueues **inside the transaction** that called it. If the
mutation rolls back, the email is never sent; if the send fails, the component retries.
Neither behaviour is something to hand-roll, and both are why the component is used
instead of calling the Resend API directly from an action.

## testMode — the safety default

`convex/email.ts` sets `testMode: true`. In that mode Resend accepts **only** its own
test inboxes (`delivered@resend.dev`, `bounced@resend.dev`, `complained@resend.dev`,
and `label+…` variants). A wrong address in development cannot reach a real person.

Consequence: `requireEmailVerification` in `convex/auth.ts` is **false**. Turning it on
while testMode is true locks out every genuine signup, because the verification mail is
refused. `pnpm health` fails CRITICAL on that combination, and WARNs on the reverse.

## Going to production — three steps, in order

1. **Verify a sending domain** in the Resend dashboard (DNS records). Until this exists,
   real sends are rejected no matter what the code says.
2. `npx convex env set EMAIL_FROM "You <hello@yourdomain.com>"` — an address at that
   verified domain.
3. In `convex/email.ts` set `testMode: false`, and in `convex/auth.ts` set
   `requireEmailVerification: true`. **Both together**, or health fails.

## Webhook

`convex/http.ts` mounts `/resend-webhook`. Register that URL
(`https://<deployment>.convex.site/resend-webhook`) in the Resend dashboard with all
`email.*` events. The component verifies the signature (svix) — never parse the body
yourself. Without the webhook, sending still works but bounces and spam complaints are
invisible, which is how a sender reputation dies quietly.

## Adding an email

1. Add a function to `convex/email.ts`. It takes `ActionCtx` and returns `void`.
2. Call it from the domain function that should trigger it.
3. Never import `@convex-dev/resend` anywhere else — the seam is the swap point.

Upgrade path for templates: React Email (`@react-email/components` + `render`) works,
but it needs a `"use node"` action boundary and pulls a render dependency. The engine
ships plain HTML strings for the two auth emails; adopt React Email when a product
actually needs designed mail, not before.

## Health checks

- `RESEND_API_KEY` / `RESEND_WEBHOOK_SECRET` in `.env.local` → **CRITICAL** (Convex env only)
- testMode ↔ requireEmailVerification interlock, both directions
- `/resend-webhook` route present → else WARN

Acceptance: a signup produces a verification email visible in the component's
`deliveryEvents` table, with a `delivered` event from the webhook.
