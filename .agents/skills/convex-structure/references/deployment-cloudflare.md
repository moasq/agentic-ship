# Deploy with Cloudflare

Use Cloudflare Workers / Pages when the product brief selects `providerSelection.deployment: "cloudflare"`.
Netlify remains the default. Keep one deployment adapter: a workspace with multiple deployment files (`netlify.toml`, `vercel.json`, `wrangler.json`) fails preflight.

## Connect and Authenticate

Run `pnpm onboard cloudflare --host <host>`. After consent, the agent installs the official Wrangler CLI if missing, runs `wrangler login` (opening a browser authorization page), and verifies authentication with `wrangler whoami`. The credential remains in Wrangler's machine-local store outside this repository.

In headless CI/CD environments, authenticate using OS-keychain backed credentials or environment variables:
- `CLOUDFLARE_API_TOKEN`: Scoped API token created at `dash.cloudflare.com` → My Profile → API Tokens with `Workers Scripts: Edit` and `Account Settings: Read` permissions.
- `CLOUDFLARE_ACCOUNT_ID`: 32-character hexadecimal account identifier found in the Cloudflare dashboard sidebar.

Plaintext token placeholders and tokens committed to repository files are rejected by connection and preflight gates.

## Framework Integration (Next.js on Cloudflare)

Next.js deploys to Cloudflare Workers via OpenNext (`@opennextjs/cloudflare`) or `@cloudflare/next-on-pages`.

Commit `wrangler.json` (or `wrangler.jsonc` / `wrangler.toml`) with the atomic build command:

```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "my-app",
  "main": ".open-next/worker.js",
  "compatibility_date": "2024-09-23",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  }
}
```

In `package.json`, configure the build script to deploy Convex before Next.js:

```json
{
  "scripts": {
    "build": "npx convex deploy --cmd 'pnpm build'",
    "deploy": "wrangler deploy"
  }
}
```

The atomic build command deploys production Convex functions before building the Next.js bundle, injecting the production `NEXT_PUBLIC_CONVEX_URL`. Running `pnpm build` alone without Convex deployment risks shipping frontend routes against stale backend schemas.

## Next.js Runtime Limits on Cloudflare Workers

Cloudflare Workers execute in the V8 isolate runtime. Keep the following platform constraints in mind:

1. **Node.js Compatibility**: Enable `nodejs_compat` in `compatibility_flags`. Native C++ binary modules (e.g. native `sharp`, `canvas`) are not supported; use pure JavaScript or WebAssembly libraries.
2. **Payload Size Limits**: Worker request and response body limits are 10MB (Free tier) and 50MB (Standard/Paid tier).
3. **Execution CPU Time**: Worker CPU time limits apply (50ms on Free tier, up to 30s on Paid tier). Long-running background processing belongs in Convex background jobs or scheduled functions, not within the request worker.
4. **Lifecycle Constraints**: Un-awaited background promises are terminated when response streaming finishes. Use `ctx.waitUntil()` or Convex background mutations.
5. **Streaming & Server Actions**: Next.js App Router streaming and Server Actions are supported with OpenNext; WebSocket subscriptions and real-time state are handled directly through Convex.

## Environment and Secret Ownership

| Value | Location | Why |
| --- | --- | --- |
| `CONVEX_DEPLOY_KEY` | Cloudflare secret (`wrangler secret put CONVEX_DEPLOY_KEY`) | Authorizes production Convex deployments from CI/CD |
| `NEXT_PUBLIC_CONVEX_URL` | Cloudflare Worker `vars` / env | Public client connection endpoint |
| `NEXT_PUBLIC_SITE_URL` | Cloudflare Worker `vars` / env | Public application origin |
| `NEXT_PUBLIC_POSTHOG_KEY` | Cloudflare Worker `vars` (when analytics selected) | Public analytics project key (`phc_...`) |
| `BETTER_AUTH_SECRET`, `SITE_URL` | Production Convex environment | Backend authentication signing |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Production Convex environment | Live billing keys must never reach client or edge workers |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | Production Convex environment | Email delivery credentials stay in backend environment |

Store secrets using `wrangler secret put <NAME>` or `npx convex env set --prod <NAME> <value>`. Never write secret values into `wrangler.json`, `wrangler.toml`, `.env.local`, or commit history.

## Domains and Better Auth

Cloudflare Workers provide a default `https://<worker-name>.<subdomain>.workers.dev` domain. Custom domains are configured under Workers & Pages → Settings → Domains & Routes.

1. **Attach Custom Domain**: In Cloudflare dashboard, add your custom domain or route to the Worker. Cloudflare automatically provisions SSL/TLS certificates with Universal SSL.
2. **Configure Auth Origins**:
   ```bash
   pnpm setup:auth https://yourdomain.com
   ```
   Or for `workers.dev`:
   ```bash
   pnpm setup:auth https://my-app.my-subdomain.workers.dev
   ```
3. **Verify Callback URLs**: Better Auth validates incoming OAuth and session callbacks against `SITE_URL` and trusted origins. Both `*.workers.dev` and custom domains must use HTTPS in production.
4. **Webhooks Remain on Convex**: Stripe (`https://<prod-deployment>.convex.site/stripe/webhook`) and Resend (`https://<prod-deployment>.convex.site/resend-webhook`) endpoints remain hosted on Convex and do not change when the frontend deployment provider changes.

## Deploy and Verify

1. Run preview deployments with `wrangler versions deploy` or test locally with `wrangler dev`.
2. Run production deployment: `wrangler deploy`.
3. Verify the deployment:
   - The production URL serves over HTTPS with valid SSL/TLS certificates.
   - Better Auth sign-in and session cookies operate correctly on the configured domain.
   - Convex queries and mutations load data seamlessly over WebSockets / HTTPS.
   - `pnpm preflight --prod` passes with all green checks.

## Revoke or Replace

1. `wrangler logout` unlinks the local machine session and removes credentials.
2. Delete local `.wrangler` build artifacts and state.
3. Revoke API tokens in Cloudflare Dashboard under My Profile → API Tokens.
4. Delete or disable the Worker under Workers & Pages if decommissioning.
5. To switch back to Netlify or Vercel: remove `wrangler.json`, restore `netlify.toml` or `vercel.json`, update `providerSelection.deployment` in the product brief, and run `pnpm preflight`.
