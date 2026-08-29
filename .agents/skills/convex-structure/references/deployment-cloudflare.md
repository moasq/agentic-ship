# Deploy Next.js with Cloudflare Workers

Use this path when the product brief selects `providerSelection.deployment: "cloudflare"`. Agentic Ship keeps Netlify as the default and supports Cloudflare Workers as an alternative.

This guide targets Next.js 16 with `vinext@1.0.0-beta.8` and `@vinext/cloudflare@1.0.0-beta.6`. Cloudflare recommends vinext for new Next.js Workers projects, but vinext is still beta. Run the compatibility check before changing an existing application.

## Authorize Wrangler with protected storage

Run `pnpm onboard cloudflare --host host_name`. After consent, the agent runs `pnpm provider:login cloudflare`. The login command opens Wrangler OAuth with `--use-keyring` and fails if the operating system keychain is unavailable.

Run `wrangler whoami` after login. Continue only when its output says the credential uses an encrypted file with a key in the operating system keychain. Wrangler stores OAuth credentials in plaintext by default without this option. See [Wrangler authentication](https://developers.cloudflare.com/workers/wrangler/commands/general/#login).

For Cloudflare Workers Builds, use a scoped API token instead of interactive OAuth. Set these values under **Settings > Build > Build Variables and Secrets**:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CONVEX_PROD_DEPLOY_KEY`
- `CONVEX_PREVIEW_DEPLOY_KEY`
- `CLOUDFLARE_PRODUCTION_BRANCH` as a non-secret variable

The deploy key is a build secret. Do not create it as a Worker runtime secret. The build process needs it to build against and deploy the selected Convex backend.

## Configure the selected account and Worker

The connection flow asks for a 32-character account ID and a Worker name. Worker names use lowercase letters, numbers, and internal hyphens.

The agent then runs these project commands:

```text
npx vinext@1.0.0-beta.8 check
npx vinext@1.0.0-beta.8 init --platform=cloudflare
pnpm setup:cloudflare --account-id account_id --project-name worker_name
pnpm install
```

The setup command records `account_id` and `name` in the single Wrangler JSON or JSONC file. It also pins both adapter packages and adds separate build and deploy scripts. Review compatibility findings before continuing.

Set the production and preview deploy keys in a safe CI fixture, then run `pnpm check:cloudflare-build`. This calls `convex deploy --dry-run` through the same branch-aware wrapper used by Workers Builds, so a missing branch, wrong key class, or invalid Convex build fails before a live deploy.

## Build Convex before deploying the Worker

Cloudflare Workers Builds uses separate build and deploy commands. Configure these values:

| Setting | Command |
| --- | --- |
| Build command | `pnpm build:cloudflare` |
| Deploy command | `pnpm deploy:cloudflare` |
| Non-production deploy command | `pnpm preview:cloudflare` |

`build:cloudflare` runs the portable `scripts/build-cloudflare.mjs` wrapper. The wrapper compares `WORKERS_CI_BRANCH` with `CLOUDFLARE_PRODUCTION_BRANCH`. It uses `CONVEX_PROD_DEPLOY_KEY` for the production branch and `CONVEX_PREVIEW_DEPLOY_KEY` with `convex deploy --preview-name` for every other branch. Only the selected key is forwarded to the Convex command. Both paths run the separate `pnpm build:vinext` command, so the build cannot call itself. Convex supplies `NEXT_PUBLIC_CONVEX_URL` during the build and deploys the selected backend after the build succeeds.

`deploy:cloudflare` uses `--skip-build` to deploy the existing vinext output. `preview:cloudflare` runs `wrangler versions upload` against the generated `dist/server/wrangler.json` without promoting that version to production.

This sequence is not a distributed transaction. If the Worker deploy fails after Convex succeeds, the previous Worker remains active while the new Convex functions are live. Keep backend changes compatible with the previous frontend until the Worker deployment passes.

## Keep build secrets and runtime values separate

Configure values according to their owner:

| Value | Location |
| --- | --- |
| `CONVEX_PROD_DEPLOY_KEY` | Workers Builds secret for the production Convex deployment |
| `CONVEX_PREVIEW_DEPLOY_KEY` | Workers Builds secret for Convex preview deployments |
| `CLOUDFLARE_PRODUCTION_BRANCH` | Workers Builds variable matching the selected production branch |
| `CLOUDFLARE_API_TOKEN` | Workers Builds secret |
| `CLOUDFLARE_ACCOUNT_ID` | Workers Builds variable |
| `NEXT_PUBLIC_CONVEX_URL` | Injected by `convex deploy --cmd` during build |
| `NEXT_PUBLIC_SITE_URL` | Workers Builds variable when the application needs it during build |
| `BETTER_AUTH_SECRET`, `SITE_URL` | Production Convex environment |
| Billing and email secrets | Production Convex environment |

Do not place backend secrets under Wrangler `vars`. Runtime Worker secrets are visible to Worker code and do not satisfy the build process.

## Configure domains and callbacks

A Workers development URL includes both the Worker name and the account subdomain: `https://worker_name.account_subdomain.workers.dev`. Do not use `https://worker_name.workers.dev`.

For production:

1. Attach the custom domain under **Workers & Pages > Worker > Settings > Domains & Routes**.
2. Run `pnpm setup:auth https://product.example`.
3. Verify sign-in, sign-out, session cookies, and the Better Auth callback on the production origin.
4. Keep billing and email webhooks on the production Convex HTTP endpoint.

## Check current platform limits

Cloudflare applies Worker limits by account plan. The current request-body limits are 100 MB for Free and Pro, 200 MB for Business, and 500 MB for Enterprise by default. Cloudflare does not enforce a Worker response-body limit.

The current HTTP CPU limit is 10 ms on Workers Free. Workers Paid defaults to 30s and can be configured up to 5 minutes. Check [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/) before launch because plan limits can change.

Run background processing in Convex scheduled functions or jobs. Use `ctx.waitUntil()` only for Worker tasks that may continue after the response.

## Verify preview and production

Before production, configure these non-secret live-verification values in the environment that runs preflight:

- `CLOUDFLARE_PRODUCTION_URL`: the custom production origin, not a `workers.dev` URL
- `CLOUDFLARE_PREVIEW_URL`: a deployed `<version-or-alias>-<worker>.<subdomain>.workers.dev` preview URL for the selected Worker
- `CLOUDFLARE_AUTH_CALLBACK_URL`: a configured callback on the production origin
- `NEXT_PUBLIC_CONVEX_URL`: the production Convex deployment URL
- `CLOUDFLARE_CONVEX_HEALTH_QUERY`: a public no-argument query such as `health:check`
- `CLOUDFLARE_WEBHOOK_URLS`: comma-separated billing and email webhook endpoints that answer `OPTIONS`

Then verify all of these outcomes:

1. `pnpm preflight` passes with one Wrangler config and the pinned adapter versions, and `pnpm check:cloudflare-build` passes for production and preview fixture environments.
2. `pnpm preview:cloudflare` creates a preview version and its HTTPS URL responds.
3. The preview build uses `CONVEX_PREVIEW_DEPLOY_KEY`, while the production branch uses `CONVEX_PROD_DEPLOY_KEY`.
4. Better Auth accepts the preview and production origins.
5. Convex queries, mutations, and WebSocket updates work from both origins.
6. Billing and email webhooks still reach their Convex endpoints.
7. `pnpm verify:cloudflare` passes its current-deployment, production URL, preview URL, auth session, callback, Convex query, and webhook probes.
8. `pnpm preflight --prod` passes, including the same fail-closed live Cloudflare verification and the production Convex environment audit.

## Roll back or revoke access

Use the Cloudflare dashboard under **Worker > Deployments** to roll back to a known version. A rollback changes Worker code and configuration but does not roll back D1, KV, R2, Durable Objects, or Convex data.

Run `wrangler logout` to remove the local OAuth grant and keychain entry. Revoke API tokens and Workers Builds access in the Cloudflare dashboard. Delete the Worker only when the deployment should no longer exist.

To return to Netlify or Vercel, keep only that provider's deployment file, update the product brief, and run `pnpm preflight` again.
