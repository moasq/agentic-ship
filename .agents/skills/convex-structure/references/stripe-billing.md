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

## Coherence — the states a deployment can be in

Billing is all of its keys or none of them. Each key is individually valid, so nothing
looks wrong until a customer tries to pay, and **none of it lives in the repository** —
by R1 the keys are in Convex env, so no file check can see any of this. `pnpm health`
asks the connected deployment (names only, never a value) and grades the combination:

| Deployment state | Grade | What actually happens |
| --- | --- | --- |
| no `STRIPE_*` at all | WARN | billing off, plans switch directly. A real pre-launch stage |
| secret + webhook + price + `SITE_URL` | PASS | checkout works, webhook grants the plan |
| secret, **no webhook secret** | CRITICAL | checkout completes, the webhook is rejected unsigned, entitlement never arrives — **the customer pays and gets nothing** |
| secret, no `STRIPE_PRICE_*` | FAIL | every checkout throws before reaching Stripe; no money moves |
| secret, no `SITE_URL` | FAIL | `createCheckout` throws — Stripe needs a return URL that exists |
| webhook and/or prices, **no secret key** | WARN | billing is off despite looking configured. Checkout is unreachable, so this behaves exactly like no Stripe at all — unfinished setup, not a broken build |

Severity follows **whether a card can be charged**, not how broken the env looks. That
is the whole ordering: the money-losing row is CRITICAL, the rows where checkout throws
before reaching Stripe are FAIL, and a deployment with no secret key is a WARN no matter
how much else is present.

That last row matters more than it reads. `pnpm stripe:provision` creates the webhook
endpoint and the prices, then deliberately stops and prints the one human step — so the
documented onboarding path passes straight through it. A check that graded it red would
turn the engine's own instructions into a failing gate between two commands. Report
unfinished setup; never fail it. It is the same not-yet-connected rule that keeps
`pnpm build` green with no backend.

The rules live once, in `scripts/lib/billing-coherence.mjs`; `pnpm health` and
`pnpm preflight --prod` both read them from there, and
`scripts/lib/billing-coherence.test.mjs` pins the ordering — including the WARN/CRITICAL
pair whose only difference is a reachable checkout.

The check is guarded on both sides: it runs only when a deployment is connected, and a
deployment it cannot reach is a SKIP, never a red gate. A fresh clone and an offline
machine both stay green.

### Who sets what

`pnpm stripe:provision` does everything the paired CLI can do — creates the webhook
endpoint and pipes its signing secret straight into Convex env without printing it,
creates the product and monthly price, stores `STRIPE_PRICE_<KEY>`. Idempotent through
Stripe's own `lookup_key`, so reruns reuse rather than duplicate.

`pnpm stripe:provision --test-key` finishes a sandbox: the paired CLI already holds a
`sk_test_` key, so it is copied into Convex env over stdin, never printed and never
written here. That is what lets a buyer watch a real 4242 payment land before they have
touched a dashboard. It is hard-limited three ways — it reads only `test_mode_api_key`,
refuses any value that is not `sk_test`/`rk_test`, and refuses `--prod` — because
`live_mode_api_key` sits in the very same file and must never be reachable by
automation.

A **live** key stays the human's step, through `pnpm secret:set STRIPE_SECRET_KEY` —
hidden input in their own terminal, piped into Convex env, printed nowhere and written
to no file. An agent must never ask for a key in chat, and never accept one pasted
there.

### Proving it end to end

The acceptance test is a real payment, and `e2e/app-flow.spec.ts` runs one. Two things
about hosted Checkout cost an afternoon to learn, so they are written down here:

- **The card form is in the top-level document**, not an iframe — the iframes on that
  page are the Apple Pay / Link express section. Target `#cardNumber`, `#cardExpiry`,
  `#cardCvc`, and submit `[data-testid="hosted-payment-submit-button"]`.
- **Every required field must be filled or Subscribe silently spins.** There is no error
  toast: the offending input just renders `invalid`. `email` is required, and a session
  created against an existing customer also collects a billing address — fill ZIP by its
  accessible name, since the ids there are not stable.

Budget the test at minutes, not seconds: hosted page load, submit, redirect, and only
then the webhook flip. And `SITE_URL` decides where the customer lands, so gate G3 reads
`E2E_ORIGIN` first — the production build runs on port 3100 while the deployment's
SITE_URL names 3000, and without that a completed payment returns the browser to a port
nothing is listening on.

`pnpm stripe:provision --status` prints booleans only — paired, webhook registered,
which env names exist — and is the right thing to run before diagnosing anything.

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
