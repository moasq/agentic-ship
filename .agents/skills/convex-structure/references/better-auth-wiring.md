# Better Auth × Convex — the wiring, as implemented

Status: **implemented in this repo** (2026-08-04), verified against the official
example at `get-convex/better-auth/examples/next` — not against memory. Product-level
Better Auth knowledge comes from the official `better-auth/skills` pack; this reference
covers only the ShipKit wiring.

## Pins — exact, with the receipt

```bash
pnpm add @convex-dev/better-auth        # 0.12.5 installed
pnpm add better-auth@1.6.15             # EXACT — see below
```

**Why exact and not a range:** better-auth `1.6.25` sits *inside* the adapter's declared
peer range (`>=1.6.11 <1.7.0`) and still breaks the adapter's types — `AuthClient`'s
`useSession().data` resolves to `never` and the build fails. Proven in this repo on
2026-08-04, recorded in `skills.lock.json`. `1.6.15` is what the adapter repo itself
develops against. Only `upstream-sync` moves this pin, by building against the candidate.

## Secrets — Convex env, never Next env

```bash
pnpm secret                            # prints one random 32-byte base64 value
npx convex env set BETTER_AUTH_SECRET <paste the printed value>
npx convex env set SITE_URL http://localhost:3000
```

`pnpm health` CRITICALs if either name appears in `.env.local`.
`npx convex dev` writes the deployment values (`NEXT_PUBLIC_CONVEX_URL`,
`NEXT_PUBLIC_CONVEX_SITE_URL`) into `.env.local` itself — both URLs, public by design.

## The eight files — all present

| File | Job |
| --- | --- |
| `convex/convex.config.ts` | `app.use(betterAuth)` + `app.use(stripe)` — component registry |
| `convex/auth.config.ts` | `getAuthConfigProvider()`. **The footgun file** — missing = "works locally, 401s in prod". `pnpm health` checks it |
| `convex/auth.ts` | `createClient` → `authComponent`; `createAuthOptions` → email+password, `requireEmailVerification: false` until an email sender exists (Resend phase); `convex({ authConfig })` plugin. **Magic links / 2FA / orgs / SSO are plugin toggles here** — config, not rewrites |
| `convex/http.ts` | `authComponent.registerRoutes(http, createAuth)` + the Stripe webhook |
| `src/lib/auth-client.ts` | `createAuthClient` + `convexClient()` plugin, annotated with the adapter's own `AuthClient` type so plugin mismatches fail at the definition, not as an unreadable generic error at the provider |
| `src/lib/auth-server.ts` | `convexBetterAuthNextJs(...)` → `handler`, `preloadAuthQuery`, `fetchAuthMutation`, … Pre-login it exports a 503 stub handler so a fresh clone builds green |
| `src/app/api/auth/[...all]/route.ts` | `export const { GET, POST } = handler` — the ONE sanctioned Next API route |
| `src/app/providers.tsx` | `ConvexBetterAuthProvider(client, authClient)`; renders plain children when no `NEXT_PUBLIC_CONVEX_URL` |

Plugin symmetry rule: enabling an auth method touches **exactly two files** —
`convex/auth.ts` (server plugin) and `src/lib/auth-client.ts` (client plugin). Anything
more is being done wrong.

## Session truth for UI (the engine ships no auth UI)

- `api.auth.getCurrentUser` — reactive query, `null` when signed out, never throws.
- `authClient.signUp.email / signIn.email / signOut` — the client actions.
- Server side: `preloadAuthQuery` / `fetchAuthMutation` from `src/lib/auth-server.ts`.
- Build screens when the product needs them, under the provider-safety rule in the
  SKILL (branch on `isConvexConfigured` before hooks mount).

## Verify (after the buyer's `npx convex dev`)

```bash
npx convex dev --once   # deploys components + schema, generates types
pnpm build              # must be green with or without a session
# then: sign-up → sign-in round trip; session visible in the Convex dashboard
```

## Provider-swap seam

Domain code never names the auth vendor — it calls `requireUser` / `requireOwner` from
`convex/lib/auth.ts`. A swap to Clerk or Convex Auth touches `convex/auth.ts`,
`convex/auth.config.ts`, and `src/app/providers.tsx`. Keep it that way.

## Known risks (recorded in skills.lock.json)

- Better Auth joined Vercel (Jul 2026); Convex still promotes the combo — the seam
  above is the insurance.
- In-range minor bumps can break the adapter's types (proven, above) → exact pin.
- A DoS advisory was once filed against the adapter → `pnpm audit` runs in setup-health.
