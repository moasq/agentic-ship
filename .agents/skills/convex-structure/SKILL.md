---
name: convex-structure
description: How Convex is structured inside ShipKit — file layout, function shape, naming, the data-access decision tree, and the auth seam. Use before writing any backend code, adding a table, or wiring a component to data.
---

# Convex Structure

Official Convex skills (from the `convex` plugin) teach Convex. This skill teaches
**Convex inside this repo** — the conventions that let an agent open a cold codebase and
know exactly where everything goes without reading it all first.

Every rule here is deterministic. If you find yourself deciding, you have missed a rule.

## 1. File layout — one domain per file

```
convex/
  schema.ts              every table, every index. Nothing exists unless declared here.
  convex.config.ts       component registration (Better Auth, and later others)
  auth.config.ts         auth provider declaration
  auth.ts                createAuth + authComponent. Plugins toggle here.
  http.ts                httpRouter: auth routes + inbound webhooks. Nothing else.
  <domain>.ts            the entire public API of one domain, e.g. waitlist.ts
  lib/
    auth.ts              requireUser / requireOwner helpers
    validators.ts        shared validator fragments
  _generated/            committed, never edited by hand
```

Rules:

- **A domain gets its own file the moment it owns a table.** `users.ts`, `posts.ts`,
  `waitlist.ts`. Never a `utils.ts` dumping ground, never a `functions.ts`.
- **Domain names are plural nouns matching the table name.** Table `posts` → file
  `convex/posts.ts` → frontend feature folder `src/components/features/posts/`.
  One word, three places, no translation needed.
- **Cross-domain reads go through the owning domain's file.** If `posts.ts` needs a
  user, it calls a helper from `lib/auth.ts` — it does not query the users table
  directly. One writer per table.

## 2. Function shape — the only accepted template

Every function, without exception:

```ts
export const create = mutation({
  args: { title: v.string() },              // ALWAYS present
  returns: v.id("posts"),                   // ALWAYS present
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);    // identity from ctx, never from args
    return await ctx.db.insert("posts", { title: args.title, userId: user._id });
  },
});
```

- **Object syntax only.** Never the bare-function form.
- **`args` and `returns` validators are mandatory.** A function without both is a
  defect, not a draft. `returns: v.null()` when nothing is returned.
- **Naming is CRUD-consistent across every domain**, so a reader never guesses:
  `list` · `get` · `create` · `update` · `remove` · `paginate`.
  Anything else gets a verb phrase: `markComplete`, `sendInvite`.
- **Public vs internal is a security boundary, not a style choice.**
  `query` / `mutation` / `action` are the browser's contract.
  `internalQuery` / `internalMutation` / `internalAction` are for crons, scheduled
  jobs, other functions, and webhook handlers. If the browser must not call it, it is
  internal. There is no third option.

## 3. Identity and ownership — the rule that outlives every auth vendor

```ts
// convex/lib/auth.ts
export async function requireUser(ctx) { /* throws if unauthenticated */ }
export async function requireOwner(ctx, doc) { /* throws if doc.userId !== user._id */ }
```

- **Identity comes from the authenticated context inside the function.** Never from an
  argument. A function that accepts `userId` and trusts it for authorization is an
  impersonation hole — this is the single largest defect class in AI-generated Convex
  backends.
- **Ownership is checked per document, on every read and every write.** Fetching by an
  id the client supplied is not authorization.
- Public queries returning anything user-specific must call `requireUser` first, even
  when it feels redundant.

## 4. Schema and query discipline

- Every table declared in `schema.ts` with explicit validators.
- **Indexes are named after their fields:** `by_user`, `by_user_and_created`. An index
  used by a query must exist before the query is written.
- **`.withIndex()`, never `.filter()`** for anything that narrows rows.
- **Unbounded `.collect()` is banned** on any table a user can grow. Use `.take(n)` or
  `paginate`. If you cannot state the upper bound out loud, paginate.

## 5. The data-access decision tree — no judgement calls

```
Where is the data needed?
│
├─ Client component, must stay live
│    → useQuery(api.<domain>.<fn>)                    ← the default
│
├─ Server-rendered page that stays live after hydration
│    → preloadQuery() in the RSC → usePreloadedQuery() in the client child
│    (authenticated variant: preloadAuthQuery from src/lib/auth-server.ts)
│
├─ Server-only read: metadata, sitemap, OG image, route handler
│    → fetchQuery()   ← requires a one-line comment saying why it is not reactive
│
├─ Write from a form or Server Action
│    → fetchAuthMutation() server-side, or useMutation() client-side
│
└─ External service calling us
     → convex/http.ts httpAction. Never a Next route handler.
```

`fetchQuery` outside a server-only surface is the most common way AI-generated Convex
apps silently throw away reactivity. Hence the comment requirement — it forces the
choice to be deliberate.

## 6. The frontend seam — phase 1 rules still hold

- `components/blocks/` stay **stateless**. Props in, JSX out. They never call `useQuery`.
- Convex hooks live in `components/features/<domain>/` and in routes.
- A route loads data and passes it down; a block renders it. That is what keeps blocks
  standalone-renderable with mock props.
- The provider mounts once, in `src/app/providers.tsx`, rendered by the root layout.

**Function references come from `src/lib/convex-api.ts` and nowhere else.** That file is
the whole reason a fresh clone builds with no Convex account: until `npx convex dev` has
run, `convex/_generated/` does not exist and the seam exports `anyApi` (a public export
of `convex/server`) — correct at runtime, untyped. After the buyer connects, one line
there switches to the generated `api` and every argument and return value is checked.

**A component that calls a Convex hook must not render without a `ConvexProvider` in the
tree.** `useQuery` throws on a missing client, and passing `"skip"` does not save you —
the failure is the absent provider, not the argument. Branch in the parent:

```tsx
export function WaitlistPanel() {
  if (!isConvexConfigured) return <WaitlistForm count={null} state="not-connected" action={() => {}} />;
  return <WaitlistLive />;   // hooks live in here, called unconditionally
}
```

Every Convex-backed component needs an honest **not-connected** state. "The backend is
not wired up yet" is a real thing to render; a crash is not.

Reference implementation in this repo: `convex/waitlist.ts` →
`src/components/features/waitlist/waitlist-panel.tsx` → `blocks/waitlist-form.tsx`.

## 7. Auth seam

Better Auth via `@convex-dev/better-auth`. Config lives in `convex/auth.ts`; features
like organizations and 2FA are **plugin toggles there**, not rewrites.

Swapping providers touches exactly three files — `convex/auth.ts`, `convex/auth.config.ts`,
and the provider component. Nothing in a domain file references the auth vendor; domain
code only ever calls `requireUser`. Keep it that way.

## 8. Secrets

Action secrets (API keys) live in **Convex env**: `npx convex env set NAME value`.
Never in `.env.local`, never in Next's env. The only Convex values Next sees are
`NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` — both URLs, both public by
design.

## 9. Adding a feature — the fixed sequence

1. Table + indexes in `schema.ts`
2. `convex/<domain>.ts` with validated functions, `requireUser` where relevant
3. `npx convex dev --once` — types regenerate
4. Feature component in `src/components/features/<domain>/` using the hooks
5. Route composes feature + blocks
6. Run `setup-health`, then `pnpm build`

Deviating from this order is what produces the half-wired states agents get lost in.

## 10. Pre-ship checklist

- [ ] Every function has `args` and `returns` validators
- [ ] No public function returns user data without `requireUser`
- [ ] No `userId` accepted as an argument for authorization
- [ ] No `.filter()` where an index belongs; no unbounded `.collect()`
- [ ] Every `fetchQuery` outside a server-only surface has its why-comment
- [ ] Blocks still stateless; no `useQuery` under `components/blocks/`
- [ ] Secrets in Convex env, absent from `.env.local`
- [ ] `npx convex dev --once` clean, `pnpm build` green
