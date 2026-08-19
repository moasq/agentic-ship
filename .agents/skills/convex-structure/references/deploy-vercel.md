# Deploy with Vercel

Use Vercel when the product brief selects `providerSelection.deployment: "vercel"`.
Netlify remains the default. Keep one deployment adapter: a workspace with both
`netlify.toml` and `vercel.json` fails preflight.

## Connect and link

Run `pnpm onboard vercel --host <host>`. After consent, the agent installs the official
CLI when needed, runs `vercel login`, and verifies the session with the read-only
`vercel whoami` command. The credential remains in Vercel's machine-local store.

Choose whether to link an existing project or create a named project. The connection
receipt records that decision before it runs `vercel project add` or `vercel link`.
Successful linking creates `.vercel/project.json`; that file is local provider state
and must stay uncommitted.

Commit this project configuration:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "npx convex deploy --cmd 'pnpm build'"
}
```

The build command deploys the production Convex functions before building Next.js.
Running only `pnpm build` can ship a frontend against stale backend functions.

## Environment ownership

| Value | Location |
| --- | --- |
| `CONVEX_DEPLOY_KEY` | Vercel project environment; add for Preview and Production as appropriate |
| `NEXT_PUBLIC_SITE_URL` | Vercel project environment for each public host |
| `NEXT_PUBLIC_POSTHOG_KEY` | Vercel project environment when analytics is selected |
| `BETTER_AUTH_SECRET`, `SITE_URL` | Production Convex environment |
| Billing and email secrets | Production Convex environment |

Use `vercel env add <NAME> <environment>` so secret values are entered through the
CLI prompt. Do not put values in `vercel.json`, chat, or connection receipts. Convex
injects its public deployment URL while running the configured build command.

## Deploy and verify

Run a preview with `vercel deploy`, inspect it with `vercel inspect <preview-url>`, and
check errors before promotion. Run production with `vercel deploy --prod`, then verify:

1. The production and preview URLs serve the expected commit over HTTPS.
2. `SITE_URL` and `NEXT_PUBLIC_SITE_URL` match the production host, and the Better Auth
   callback succeeds on that host.
3. Billing and Resend webhooks still target the production Convex site URL; changing
   the frontend host does not move those endpoints.
4. A custom domain is attached to the intended Vercel project and has a valid
   certificate before HSTS reaches users.
5. `pnpm preflight --prod` passes, followed by the selected billing, email, and auth
   production acceptance flows.

## Revoke or replace

`vercel logout` removes the local CLI session. Unlinking removes local `.vercel` state;
deleting the remote project or OAuth grant is a separate Vercel action. To return to
Netlify, remove `vercel.json`, restore the documented `netlify.toml`, update the product
brief selection, and rerun connection verification and preflight.
