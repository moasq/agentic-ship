# Stripe billing — how the engine works and how to build on it

Reference for the convex-structure skill. The engine ships **wired, with no billing
UI** — you build the screens the product needs against the seams below.

## The pieces (all verified official, entries in `skills.lock.json`)

| Piece | Owner | Job |
| --- | --- | --- |
| `@convex-dev/stripe` 0.1.6 | Convex (first-party) | webhook signature verification, retries, syncing customers/subscriptions/payments/invoices into component tables |
| `stripe@claude-plugins-official` 0.4.5 | Stripe (their `stripe/ai` repo, sha-pinned by Anthropic) | `stripe-best-practices` + docs skills, remote MCP `mcp.stripe.com` (OAuth) |
| `convex/billing.ts` | this repo | the seam: plan allowlist, checkout/portal actions, `getEntitlement` |

Cross-tool: `stripe/ai` ships the same skills as providers for codex, cursor, grok and
kiro. Nothing here is Claude-only.

## How money moves

1. Browser calls `api.billing.createCheckout({ plan: "pro" })` — a **plan key**, never
   an amount, never a price ID.
2. The action resolves the price from Convex env (`STRIPE_PRICE_PRO`), gets/creates the
   Stripe customer for the authenticated user, creates a **hosted** Checkout Session,
   returns only its URL.
3. Browser redirects to Stripe's page. Card data never touches our origin (SAQ A).
4. Stripe calls `…convex.site/stripe/webhook`. The component verifies the signature,
   rejects everything unsigned, retries until a durable 200, and updates its tables.
5. `api.billing.getEntitlement` re-runs reactively; every open tab flips to `pro` with
   no reload. **The webhook-fed table is the only truth.** The `?status=success`
   redirect grants nothing — a hand-typed URL shows exactly nothing.

## Rules (each names its enforcement)

| # | Rule | Enforced by |
| --- | --- | --- |
| R1 | `STRIPE_SECRET_KEY` (prefer `rk_`), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` in Convex env only | `pnpm health` — CRITICAL if any appears in `.env.local` |
| R2 | Browser sends plan keys; prices resolve server-side | `PLANS` in `convex/billing.ts` — the only place a price env key is named |
| R3 | Fulfillment on webhook, never redirect | `getEntitlement` reads component tables only |
| R4 | Unsigned webhooks rejected | the component, upstream — add nothing in front of it |
| R5 | Entitlement server-side, per request, reactive | one query: `api.billing.getEntitlement` |
| R6 | Card data never on this origin | hosted Checkout only; Payment Element requires a `frontend-security` CSP review first |
| R7 | Test and live never mix | `pnpm health` — CRITICAL on any `sk_live`/`rk_live` in `.env.local`; live keys go in the prod deployment's Convex env |
| R8 | No money math in our code | review rule: arithmetic on an amount in `convex/` or `src/` is a defect |

## Building UI on the seam

- Render plan state from `api.billing.getEntitlement` (`useQuery` — it is reactive).
- Upgrade: `useAction(api.billing.createCheckout)` → `window.location.assign(url)`.
- Manage/cancel/change card: `useAction(api.billing.createPortal)` → same redirect.
  Stripe's portal is the management UI; do not rebuild it.
- Follow the provider-safety rule from the SKILL: branch on `isConvexConfigured`
  before any hook mounts, and give the component an honest not-connected state.

## Adding a plan

1. Create the price in Stripe (dashboard or MCP).
2. `npx convex env set STRIPE_PRICE_<NAME> price_…`
3. Add the key to `PLANS` in `convex/billing.ts` and widen the `plan` arg union.
That is the whole change — the browser still only ever names a key.

## Onboarding order (from `pnpm onboard`)

1. `stripe sandbox create` — works with **no Stripe account**; a buyer can watch a test
   payment land before signing up. While unclaimed, use the CLI, not the MCP
   (Stripe's own guidance). Live mode is a later, deliberate step.
2. `npx convex env set STRIPE_SECRET_KEY …` and `…WEBHOOK_SECRET …`
3. Local webhook: `stripe listen --forward-to <deployment>.convex.site/stripe/webhook`
   (its printed `whsec_` is the webhook secret). Prod: add the same URL in the
   dashboard instead.
4. Create the price, set `STRIPE_PRICE_PRO`, run a `4242 4242 4242 4242` checkout, and
   watch `getEntitlement` flip without a reload. That is the acceptance test.

## Version pins

Component pins Stripe API `2026-04-22.dahlia`; Stripe's current is `2026-07-29.dahlia`.
We pin what the component pins — API versions change webhook payload shapes, so only
`upstream-sync` moves this, never a blind bump.
