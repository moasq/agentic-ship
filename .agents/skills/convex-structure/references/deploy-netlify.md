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

## Custom domain — Hostinger

The domain is the one step that is human-owned end to end: it costs money, and no
registrar lets a machine buy or point one safely. The agent's part is everything after
the DNS exists. Hostinger is the documented registrar because its DNS zone editor is
plain and the same panel later holds the email records; any registrar with A and CNAME
records works identically.

**1. Buy the domain (human, at hostinger.com).**
Search the name, buy the domain alone — no hosting plan, no email upsell, nothing else
from the checkout. Check the renewal price, not just the first-year price. WHOIS
privacy is included; leave it on.

**2. Point DNS at Netlify (human, in hPanel → Domains → DNS Zone).**
Delete the parking records Hostinger pre-fills (the A records pointing at its parking
page), then add:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `75.2.60.5` |
| CNAME | `www` | `<your-site>.netlify.app` |

Netlify's recommended apex record is an ALIAS/flattened CNAME to
`apex-loadbalancer.netlify.com`, but Hostinger does not offer ALIAS at the apex, so
the documented A-record fallback is the right choice there. The alternative — moving
the nameservers to Netlify DNS — also works, but keeping DNS at Hostinger means the
deploy records and the later email records live in one panel.

**3. Attach the domain in Netlify.**
Site configuration → Domain management → Add a domain, enter the apex; Netlify adds
`www` alongside it. This is the one Netlify step with no CLI equivalent — the CLI has
no domains command — and it is acceptable here because the whole domain step is
already human-paced.

**4. Wait for the certificate before telling anyone the URL.**
Propagation takes minutes to hours. Netlify then provisions the Let's Encrypt
certificate itself. Do not announce, link, or test-market the domain until Domain
management shows the certificate as issued: `next.config.ts` ships HSTS with a
two-year `max-age`, so the very first response a browser sees at this domain must
already be valid HTTPS.

**5. Re-point the application at the real name (agent, terminal).**

```bash
pnpm setup:auth https://yourdomain.com
```

```bash
netlify env:set NEXT_PUBLIC_SITE_URL https://yourdomain.com
```

Update the identity in `src/lib/site.ts` (title, URL — it feeds metadata, the OG
card, and llms.txt), then `netlify deploy --prod`. The Stripe and Resend webhooks do
not move: they live on `<prod-deployment>.convex.site`, which is unaffected by the
frontend's domain.

**6. Same panel, next unlock: email.**
The sending domain for Resend is verified by adding the records Resend shows
(one DKIM TXT, one SPF TXT, one MX on its `send` subdomain — the values are
per-account, copy them from Resend's dashboard) into the same Hostinger DNS zone.
That verification is the precondition for the `testMode: false` +
`requireEmailVerification: true` flip described in `email-resend.md`.

`pnpm preflight --prod` remains the last word after any of this changes.

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
