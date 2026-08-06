# Deploy — Render

Reference for the service-connections, production-preflight, and convex-structure skills.

## Why Render over Railway

Both are official (`render-oss/render-plugin-claude-code`,
`railwayapp/railway-skills`), both have hosted MCPs, both pair with Convex identically.
The tiebreak is **determinism**:

- Render's `render.yaml` Blueprint declares the whole service — build, start, env var
  names, health check — in a **committed file**. It is diffable in a pull request and
  reproducible from a fork. Render's plugin also ships commands (`deploy-to-render`,
  `check-render-status`) and a `render-assistant` agent.
- Railway's `railway.json` covers build and deploy settings, but services are created
  in the dashboard or CLI. That is state the repo cannot see, which is exactly the kind
  of invisible truth this bundle exists to eliminate.

Railway remains a supported alternative: swapping is writing one file. Vercel is
excluded by decision.

## The build command — the important line

```
npx convex deploy --cmd 'pnpm build'
```

This pushes the Convex backend to the **prod** deployment and only then runs the
frontend build, injecting the prod `NEXT_PUBLIC_CONVEX_URL` into it. Running
`pnpm build` alone is the single most common way a Convex app breaks in production:
the frontend ships against a backend that never received the new functions.

## Where each secret lives

| Secret | Lives in | Why |
| --- | --- | --- |
| `CONVEX_DEPLOY_KEY` | **Render** env (`sync: false`) | it is what authorizes the deploy; nothing else needs it |
| `NEXT_PUBLIC_POSTHOG_KEY` | **Render** env | public by design, but it is per-environment |
| `BETTER_AUTH_SECRET`, `SITE_URL` | **prod Convex** env | backend-only |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` | **prod Convex** env | live keys must never exist on a dev machine (rule R7) |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM` | **prod Convex** env | backend-only |

The web service never holds a backend secret. That separation is a consequence of the
backend living in Convex, and it is worth protecting.

Convex keeps dev and prod deployments separate, so setting a live Stripe key in prod
does not put it anywhere near your laptop.

## Go-live checklist

1. Connect the repo at render.com — the Blueprint is detected; approve it.
2. Set `CONVEX_DEPLOY_KEY` (Convex dashboard → **prod** → Deploy Keys) and
   `NEXT_PUBLIC_POSTHOG_KEY` in Render.
3. Populate the prod Convex env with every backend secret above
   (`npx convex env set --prod <NAME> <value>`).
4. Point `SITE_URL` and `NEXT_PUBLIC_SITE_URL` at the real host.
5. **Move the webhooks.** In Stripe, add
   `https://<prod-deployment>.convex.site/stripe/webhook` with the documented event
   list, and set the new `whsec_` in prod Convex env. In Resend, add
   `https://<prod-deployment>.convex.site/resend-webhook`. `stripe listen` was
   development-only and does not carry over.
6. Switch Stripe to live keys, and only then flip Resend `testMode: false` +
   `requireEmailVerification: true` together.
7. Run `pnpm health`, then use service-connections for the live deployment verification
   and production-preflight for the launch gate.

## Health checks

- `render.yaml` build command contains `convex deploy` → else CRITICAL
- `render.yaml` contains no secret **values** (prefix + payload) → else CRITICAL
- `CONVEX_DEPLOY_KEY` in `.env.local` → CRITICAL, it is a full-write prod credential

Acceptance: the prod URL serves, `/api/auth/*` answers, and a Stripe test event
delivered to the prod `convex.site` webhook flips an entitlement.

## After deploy

The domain decision (Cloudflare or Namecheap) is deliberately deferred. HSTS already
ships with a two-year max-age, so the certificate must be correct on the first request
at a custom domain — take that step on purpose, not as a footnote to a deploy.
