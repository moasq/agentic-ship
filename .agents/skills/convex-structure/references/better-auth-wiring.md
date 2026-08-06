# Better Auth × Convex — the wiring, as implemented

Status: **implemented in this repo** (2026-08-06), verified against the official
example at `get-convex/better-auth/examples/next` — not against memory. Product-level
Better Auth knowledge comes from the official `better-auth/skills` pack; this reference
covers only the Agentic Ship wiring.

## Pins — exact, with the receipt

```bash
pnpm add @convex-dev/better-auth        # 0.12.5 installed
pnpm add better-auth@1.6.26             # EXACT, security-patched — see below
pnpm add zod@^4.4.3                     # direct: better-call requires the Zod 4 peer
```

**Why exact and not a range:** versions before `1.6.22` are affected by
GHSA-qq9h-g4jm-xgf3. Patched `1.6.26` is inside the adapter's declared peer range
(`>=1.6.11 <1.7.0`), but `@convex-dev/better-auth@0.12.5` still builds its exported
`AuthClient` alias in a way that resolves `useSession().data` to `never`. The runtime
contract is unchanged. `src/lib/auth-client.ts` therefore preserves the exact inferred
Better Auth client for application code and narrows a cast to the provider boundary,
after compile-checking the configured provider's session, token and request methods.
`src/lib/auth-client.test.ts` guards the session, email sign-in, Convex token and bridge
identity surfaces. Only `upstream-sync` moves the exact pin, after audit, typecheck and
the full gates.

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
| `src/lib/auth-client.ts` | `createAuthClient` + `convexClient()` plugin with Better Auth's exact inferred type; one compile-checked provider-only bridge isolates the adapter's stale `AuthClient` declaration |
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
- The adapter's public client alias remains stale on patched Better Auth → keep the
  bridge isolated and remove it when upstream fixes the alias.
- Production dependency drift → `pnpm audit:supply-chain` runs as the networked gate.
