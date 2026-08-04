# Better Auth × Convex — the exact wiring

Verified against the official guide: https://labs.convex.dev/better-auth/framework-guides/next
(2026-08-03). Product-level Better Auth knowledge comes from the official
`better-auth/skills` pack — this reference covers only the ShipKit wiring.

## Requirements and pins

```bash
# convex >= 1.25.0 required by the component
pnpm add convex@latest @convex-dev/better-auth
pnpm add better-auth@~1.6.15   # EXACT-RANGE PIN — adapter lags Better Auth majors
```

## Secrets — Convex env, never Next env

```bash
pnpm secret                            # prints one random 32-byte base64 value
npx convex env set BETTER_AUTH_SECRET <paste the printed value>
npx convex env set SITE_URL http://localhost:3000
```

`.env.local` additionally needs `NEXT_PUBLIC_CONVEX_SITE_URL` (the `.convex.site` URL —
auth proxy target). `npx convex dev` writes the deployment values.

## The eight files

| File | Job |
| --- | --- |
| `convex/convex.config.ts` | `app.use(betterAuth)` — register the component |
| `convex/auth.config.ts` | declare the auth provider. **The footgun file** — missing = "works locally, 401s in prod" |
| `convex/auth.ts` | `createClient` → `authComponent`; `createAuth` → `betterAuth({...})` with the Convex adapter + convex plugin. **Organizations / 2FA / SSO are plugin toggles here** — config-only change, no rewrite |
| `convex/http.ts` | `authComponent.registerRoutes(http, createAuth)` |
| `src/lib/auth-client.ts` | `createAuthClient` + `convexClient` plugin — components call this for sign-in/out/session |
| `src/lib/auth-server.ts` | `preloadAuthQuery`, `fetchAuthMutation`, `fetchAuthAction` — the authenticated side of the data-access tree |
| `src/app/api/auth/[...all]/route.ts` | proxies `/api/auth/*` to Convex — the ONE sanctioned Next API route |
| `src/components/providers/convex-provider.tsx` | `ConvexBetterAuthProvider` replaces plain `ConvexProvider` |

## Verify

```bash
npx convex dev --once   # deploys component + schema
pnpm build              # must be green with or without a session
# then: sign-up → sign-in round trip; session visible in the Convex dashboard
```

## Provider-swap seam

Domain code never names the auth vendor — it calls `requireUser` / `requireOwner` from
`convex/lib/auth.ts`. A swap to Clerk or Convex Auth touches exactly three files:
`convex/auth.ts`, `convex/auth.config.ts`, the provider component. Keep it that way.

## Known risks (recorded in skills.lock.json)

- Better Auth joined Vercel (Jul 2026); Convex still promotes the combo — but the seam
  above is the insurance.
- The adapter lags Better Auth majors → hence the `~1.6.x` pin; `upstream-sync` flags
  majors as breaking.
- A DoS advisory was once filed against the adapter → `pnpm audit` runs in setup-health.
