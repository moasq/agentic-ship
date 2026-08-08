# Deploy — Netlify

Reference for the service-connections, production-preflight, and convex-structure skills.

## Why Netlify

The deciding property is that **a site can be created, configured and deployed entirely
from the terminal**. `netlify init` creates the site and links the repo, `netlify env:set`
pushes configuration, `netlify deploy --prod` ships — no dashboard step stands between a
fresh clone and a live URL. That is the difference from Render, which is otherwise a fine
host: `render deploys create` needs an existing `serviceID`, and `render blueprints` can
only *validate*, never apply, so the first service must be created by clicking.

Determinism is preserved the same way it was on Render: `netlify.toml` is committed, and
Netlify treats it as authoritative — settings in the file **override** the UI, so a
dashboard edit cannot silently win. The topology stays diffable in a pull request and
reproducible from a fork.

Netlify is one of the two hosts Convex documents for Next.js. Its Next.js adapter is
applied automatically and supports the App Router, Server Components, streaming, and the
Full Route Cache. Render remains a supported alternative — swapping is writing one file.

## The build command — the important line

```
npx convex deploy --cmd 'pnpm build'
```

This pushes the Convex backend to the **prod** deployment and only then runs the frontend
build, injecting the prod `NEXT_PUBLIC_CONVEX_URL` into it. Running `pnpm build` alone is
the single most common way a Convex app breaks in production: the frontend ships against a
backend that never received the new functions.

## Where each secret lives

| Secret | Lives in | Why |
| --- | --- | --- |
| `CONVEX_DEPLOY_KEY` | **Netlify** env (`--secret`) | it is what authorizes the deploy; nothing else needs it |
| `NEXT_PUBLIC_POSTHOG_KEY` | **Netlify** env | public by design, but it is per-environment |
| `BETTER_AUTH_SECRET`, `SITE_URL` | **prod Convex** env | backend-only |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` | **prod Convex** env | live keys must never exist on a dev machine (rule R7) |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM` | **prod Convex** env | backend-only |

The web host never holds a backend secret. That separation is a consequence of the backend
living in Convex, and it is worth protecting. Convex keeps dev and prod deployments
separate, so setting a live Stripe key in prod does not put it anywhere near your laptop.

## Go-live, from the terminal

```bash
pnpm provider:login netlify         # browser consent, once
netlify init                        # creates the site and links this repo
netlify env:set CONVEX_DEPLOY_KEY --secret   # prompts; value never echoed
netlify deploy --prod               # ships
```

Then, and none of these are optional:

1. Populate the prod Convex env with every backend secret above
   (`npx convex env set --prod <NAME> <value>`).
2. Point `SITE_URL` (prod Convex) and `NEXT_PUBLIC_SITE_URL` (Netlify) at the real host.
3. **Move the webhooks.** In Stripe, add
   `https://<prod-deployment>.convex.site/stripe/webhook` and set the new `whsec_` in prod
   Convex env. In Resend, add `https://<prod-deployment>.convex.site/resend-webhook`.
   `stripe listen` and any dev endpoint were development-only and do not carry over.
4. Switch Stripe to live keys, and only then flip Resend `testMode: false` +
   `requireEmailVerification: true` together.
5. `pnpm preflight --prod` is the gate. It audits the real prod deployment.

## Health checks

- `netlify.toml` build command contains `convex deploy` → else CRITICAL
- `netlify.toml` contains no secret **values** → else CRITICAL
- `CONVEX_DEPLOY_KEY` in `.env.local` → CRITICAL, it is a full-write prod credential

Acceptance: the prod URL serves, `/api/auth/*` answers, and a Stripe test event delivered
to the prod `convex.site` webhook flips an entitlement.

## Deploy previews

`[context.deploy-preview]` runs the same build command. Convex decides prod-vs-preview
from the deploy key type, so a pull request gets its own backend and can never write to
production data — provided the key you set is a preview key where you intend previews.

## After deploy

The domain decision is deliberately deferred. HSTS already ships with a two-year
max-age, so the certificate must be correct on the first request at a custom domain —
take that step on purpose, not as a footnote to a deploy.
