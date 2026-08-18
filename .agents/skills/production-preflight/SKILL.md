---
name: production-preflight
description: The go-live gate. Verify the selected billing provider is live, email leaves testMode with verification on, URLs are real, and no test-seed backdoor exists. Run before the first deploy and after any money, email, or auth change.
---

# Production preflight

> Downstream contract: paths like `src/` and `convex/` refer to the product workspace that adopts Agentic Ship, not this tool repo.

`pnpm health` asks *"is development sound?"*. This skill asks the launch question:
**"is production real?"** — because the default state of this kit is deliberately
test-safe, and every one of those safety defaults must be flipped on purpose before
real users arrive. A launch that skips this ships one of three incidents: it takes
test payments, it sends no email, or it leaves a seed backdoor open.

## The command

```bash
pnpm preflight            # code + files — runs anywhere, no login
pnpm preflight --prod     # ALSO audits the prod Convex deployment's env (needs login)
```

Exit 1 on any FAIL. Run `--prod` before every launch; the plain form on every deploy.

## What the script proves (machine half)

| Check | Incident it prevents |
| --- | --- |
| `testMode: false` in `convex/email.ts` (line-anchored — a comment cannot pass it) | production sends no email at all |
| `requireEmailVerification: true` in `convex/auth.ts` | unverified addresses sign up |
| the two above flip **together** | either alone is broken — `pnpm health` enforces the pair in dev too |
| `src/lib/site.ts` has no scaffold placeholders | "My App" as your `<title>`, OG card and llms.txt |
| selected billing adapter passes its production checks | production uses test payments or the wrong provider environment |
| selected billing webhook secret is set | payments succeed but entitlements never flip |
| selected billing plan mappings exist | checkout cannot resolve any plan |
| prod `RESEND_API_KEY` + `EMAIL_FROM` on a verified domain (not `resend.dev`) | email dies silently after launch |
| prod `SITE_URL` is https and not localhost | auth callbacks and email links point at your laptop |
| prod `BETTER_AUTH_SECRET` set | sessions cannot be issued |
| **`ALLOW_TEST_SEED` absent from prod** | anyone-callable seeding of production data |
| no live key in `.env.local` | a live credential one `git add` from public |
| `netlify.toml` still runs `npx convex deploy --cmd 'pnpm build'` | frontend ships against a stale backend |
| `pnpm verify` + `pnpm test` green | launching a build that does not build |

## The judgment half (yours, or the agent's — not scriptable)

1. **Webhooks point at prod.** Register the selected billing adapter's production
   endpoint and events. Development listener secrets do not carry over. Register
   Resend at `/resend-webhook`. Send a test event from each provider dashboard.
2. **Acceptance test on prod:** complete one live checkout with a real payment method,
   then refund it. Entitlement must update without a reload. Sandbox simulations cover
   renewals, but only a live transaction proves the production pipeline.
3. **Email round trip on prod:** sign up with a real address, receive the
   verification, complete it.
4. **Rollback story:** know the last green deploy in Netlify before you need it.
   Prod incidents get a rollback first, diagnosis second — never a patch loop on prod.
5. **Convex prod is its own deployment** with its own env — confirm you set values with
   `--prod` and not into dev. `npx convex env list --prod` is the receipt.

## Order of flips (do not improvise)

Same order as deploy-netlify's go-live checklist — the two documents deliberately agree:

1. Verify the sending domain in Resend → set prod `EMAIL_FROM`. Preparation only —
   nothing sends yet while `testMode` holds.
2. Select the billing provider, then set its production credentials, webhook, and plan mappings in **prod Convex env**
3. Only then: `testMode: false` + `requireEmailVerification: true`, one commit —
   real mail invites real users, so money goes real before mail does
4. `SITE_URL` / `NEXT_PUBLIC_SITE_URL` to the real host
5. `pnpm preflight --prod` → all green
6. Deploy, then the acceptance tests above

Deep references, all under `convex-structure/references/`: `deploy-netlify.md` (env
matrix, go-live checklist) · `email-resend.md` (the 3-step email flip) ·
`stripe-billing.md` (rules R1–R8).
