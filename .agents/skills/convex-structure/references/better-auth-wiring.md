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

## The account cluster — every surface that can say "Sign in"

AGENTS.md declares it: a surface that can offer "Sign in" renders from session truth,
never from static copy. This is the procedure, and it is the **first** auth UI to build
— before a single screen, because the header is what every visitor sees.

The failure it prevents is not exotic. A marketing header takes `cta` and `secondary`
as props, the route passes `{ label: "Sign in", href: "/sign-in" }`, and the page is
correct forever — including for the reader who signed in thirty seconds ago. Nothing is
broken enough to fail a build: the session works, the cookie is set, `/app` opens. The
public half of the product simply never asked.

### Shape

```
src/components/blocks/site-header.tsx      block: props in, JSX out, `auth?: ReactNode` slot
src/components/features/auth/header-auth.tsx  feature: the subscription and the 3 states
src/app/page.tsx, src/app/blog/layout.tsx  route: composes the island into the slot
```

The block never grows a hook — `pnpm check:ui` fails `block-purity` if it does, and the
block's fixture must keep rendering standalone with no provider in the tree. So the
block gets a slot, and the route hands it a client feature. Same move as `ThemeToggle`.

### The three states, from one subscription

```tsx
const user = useQuery(api.auth.getCurrentUser);

if (user === undefined) return <Placeholder />;        // same footprint, not "Sign in"
if (user === null) return <SignedOut />;               // sign-in + sign-up actions
return <><Link href="/app">Open your shelf</Link><UserMenu /></>;
```

- **`undefined` is not signed out.** Rendering the signed-out actions while the session
  resolves shows a signed-in reader a "Sign in" button that then vanishes — the same
  lie as hardcoding it. A placeholder of roughly the resolved width also keeps the
  header from jumping.
- **Size the placeholder UNDER the narrowest resolved cluster, never over it.** A
  header row has very little slack at the tablet breakpoint, and a placeholder wider
  than what replaces it makes the whole document scroll sideways for one frame —
  `e2e/ui-quality.spec.ts` fails on exactly that, and it is a real defect on a touch
  device, not a test artefact.
- **Swap the call to action too.** "Start free" is as wrong for a signed-in reader as
  "Sign in" is. The signed-in cluster points into the app.
- **`UserMenu` reads the same query**, so it is one subscription, not two — Convex
  dedupes by function + args. Sign-out is `authClient.signOut()` then
  `router.refresh()`; the reactive query empties on its own, the refresh drops any
  server-rendered remnant.

### The trap: the provider gate must be in the PARENT

```tsx
export function HeaderAuth(props) {
  if (!isConvexConfigured) return <SignedOut {...props} />;  // returns BEFORE the hook mounts
  return <Session {...props} />;                             // useQuery lives in here
}
```

`useQuery` throws without a `ConvexProvider`, and `providers.tsx` renders none without
`NEXT_PUBLIC_CONVEX_URL`. `"skip"` does not save you — the failure is a missing client,
not a missing argument — and a hook cannot be called conditionally, so the branch has
to be a component boundary. On a fresh clone the static links render and the page is
green.

### Static pages keep the session in the browser

The landing page and the blog are prerendered. The island hydrates and the session
resolves client-side, which costs one placeholder frame and keeps CDN delivery. A
surface that genuinely cannot afford that frame renders on the server with
`preloadAuthQuery` and pays for it by going dynamic — a deliberate trade, not the
default for marketing.

### Proof

`e2e/app-flow.spec.ts` signs in, navigates to `/`, and asserts the account menu is
there and "Sign in" is not. `e2e/marketing.spec.ts` asserts the signed-out half in the
same header. A regression fails gate G3 rather than waiting for a person to notice.

## Social sign-in (Google, GitHub)

Wired, and enabled per provider by the presence of its credential pair. Adding one is
the plugin-toggle rule in practice: a line in `convex/auth.ts` and a credential pair in
Convex env. No endpoint, no callback route, no token handled on this origin — Better
Auth owns the entire redirect.

```bash
pnpm secret:set GOOGLE_CLIENT_ID       # Google Cloud Console → Credentials
pnpm secret:set GOOGLE_CLIENT_SECRET
pnpm secret:set GITHUB_CLIENT_ID       # GitHub → Settings → Developer settings → OAuth Apps
pnpm secret:set GITHUB_CLIENT_SECRET
```

Redirect URL to register with each provider — the Convex **site** origin, not the app's:

```
https://<deployment>.convex.site/api/auth/callback/google
https://<deployment>.convex.site/api/auth/callback/github
```

**Both halves of a pair, or neither.** Better Auth will register a provider that has a
client id and no secret, and the failure then lands on the CUSTOMER as a broken redirect
at Google's own domain — after they have already clicked the button. `convex/auth.ts`
therefore treats a half-set pair as absent, and `pnpm health` reports the discrepancy as
`social sign-in coherence` rather than letting it ship quietly.

**The sign-in screen renders from the server**, never from a hardcoded list:
`api.auth.enabledSocialProviders` returns only the providers with a complete pair, so a
button cannot exist for one this deployment could not finish. The hook lives in an
unexported child behind the `isConvexConfigured` branch, because a fresh clone with no
backend still has to render `/sign-in`.

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
