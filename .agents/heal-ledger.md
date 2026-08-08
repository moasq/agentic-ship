# Heal ledger

Every non-trivial repair gets one entry: **cause → fix → prevention**. A bug healed
twice is a missing rule — on recurrence, the prevention graduates into `AGENTS.md`, a
health check, or a skill, and the entry is marked GRADUATED. Committed on purpose:
buyers inherit the healed knowledge; it is part of the product.

Format:

```
## YYYY-MM-DD short-name
- cause: what was actually wrong (not the symptom)
- fix: what changed
- prevention: the rule/check that makes recurrence impossible
- status: open | GRADUATED (where)
```

---

## 2026-08-07 render-login-succeeded-and-reported-failure

- cause: two bugs in `scripts/provider-login.mjs`'s render entry, both invisible until
  someone actually logged in. Its `pairedFile` pointed at `.config/render/config.json`
  while the CLI writes `$HOME/.render/cli.yaml`, so the fallback pairing check could
  never find a paired install. And it had no `verify` command, which mattered more than
  it looks: `render login` saves a token but leaves the CLI with NO active workspace, and
  every command except `whoami` and `workspaces` then fails with "no workspace set". So
  the browser consent completed, the token was saved, and the script ended in
  "login finished but a read-only verification call still fails" — the worst kind of
  wrong, because the honest-looking failure message says to rerun, and rerunning does
  the same thing forever.
- fix: corrected the paired path; added `verify: render services` so the probe is a
  command that genuinely needs a workspace; and added an `afterLogin` hook that selects
  the workspace when there is exactly ONE. With several it prints them and stops —
  which workspace a project deploys into is the user's decision, not a coin flip.
- prevention: the `afterLogin` hook is general, so the next provider whose credential
  needs a machine-local follow-up step has somewhere to put it. The deeper rule is the
  one the ledger keeps relearning: a provider is not connected because a file exists or
  a token was saved, only because a read-only call that needs the credential SUCCEEDS —
  the same lesson as `configured-is-not-booted` and `pairing-file-is-not-authentication`,
  now with a third instance.
- status: GRADUATED (scripts/provider-login.mjs)

## 2026-08-07 gate-g3-was-flaky-under-its-own-default-parallelism

- cause: Playwright defaults to half the cores, so gate G3 ran five Chromium instances
  at once. The landing page carries a continuously animating canvas plus scroll-driven
  motion, and several instances rendering it together starve each other's main thread —
  `page.goto` then waits past 30s for a `load` event the server had already answered in
  about 20ms. The signature is unmistakable once seen: the FIRST N landing tests fail
  together, N being the worker count, while the same tests pass one at a time. It reads
  as a product bug and is a machine one, which is exactly how suites end up with retries
  bolted on.
- fix: `workers: 3` in `playwright.config.ts`. Measured rather than guessed — green at
  load average 40 on ten cores, where five failed repeatedly across runs. The suite
  still finishes in about ninety seconds.
- prevention: none needed beyond the cap, but recorded because the diagnosis is the
  valuable part. Before treating a browser-gate failure as a regression, check whether
  the count of failures equals the worker count, and time the server's own response —
  20ms from the server against a 30s `goto` timeout means the browser starved, not the
  app. `retries` stays at 0 locally on purpose: flaky gets fixed, not retried.
- status: GRADUATED (playwright.config.ts)

## 2026-08-07 the-command-palette-had-no-command-root

- cause: `components/ui/command.tsx`'s `CommandDialog` rendered `{children}` straight
  into `DialogContent` with no `<Command>` root around them. Every cmdk part — Input,
  List, Group, Item — reads its store from the context that root provides, so the store
  resolved `undefined` and clicking "Find a book" threw
  `Cannot read properties of undefined (reading 'subscribe')`. The dialog never opened
  and nothing else changed on screen: no crash page, no message, just a button that did
  nothing. Same shape as the account-menu bug — a context-bound vendor part composed
  without its parent — but one level lower, inside `ui/` itself, so the
  `vendor-context-part` check could not see it: the missing root is in the primitive, not
  at the call site.
- fix: wrapped the dialog's children in `<Command>`. Upstream shadcn wraps here, so this
  restores the file toward the registry rather than customising away from it — which is
  why editing a vendor-owned file was the right call instead of working around it in
  `book-palette.tsx` and leaving the primitive broken for the next consumer.
- prevention: `e2e/app-flow.spec.ts` now opens the palette, asserts it renders options,
  types an author, asserts it filters to the expected book, and selects it. Opening it is
  half the assertion — the old failure was invisible to anything that only checked the
  trigger existed.
- status: GRADUATED (e2e gate G3)

## 2026-08-07 react-dev-needs-eval-production-must-not

- cause: the CSP shipped `script-src 'self' 'unsafe-inline'` with no `'unsafe-eval'`, and
  React's DEVELOPMENT build calls `eval()` to reconstruct a callstack that crossed the
  server/client boundary. Every dev session logged "eval() is not supported in this
  environment", and the React error overlay lost its stack traces — the debugging tool
  you most want when something is already wrong.
- fix: `next.config.ts` adds `'unsafe-eval'` only when `NODE_ENV === "development"`.
  `next build` sets NODE_ENV=production, so the shipped policy is unchanged. Verified by
  reading the actual response header on both: dev serves
  `script-src 'self' 'unsafe-inline' 'unsafe-eval'`, a production build serves the same
  line without it.
- prevention: `pnpm preflight` asserts the `unsafe-eval` occurrence in `next.config.ts`
  is still inside the development guard. The guard IS the safety property — `unsafe-eval`
  in a shipped policy is what lets an injected string execute — and the tempting way to
  silence a CSP warning is to delete the condition, which nothing downstream would
  notice. `frontend-security/SKILL.md` records the reasoning and the two-command check.
- status: GRADUATED (pnpm preflight, frontend-security/SKILL.md)

## 2026-08-07 the-stat-tile-never-reached-its-number

- cause: `NumberTicker` wrote whatever its spring emitted, and a spring APPROACHES its
  target rather than arriving. With MagicUI's shipped damping of 60 against stiffness
  100 the tail is very slow, so a large figure sat visibly short for seconds — the shelf
  showed "11,649" in PAGES READ while the workspace header two lines above printed the
  true 11,651, and the same screen contradicted itself. Small counts hid it entirely,
  because rounding closed the gap; it only became visible once a shelf had enough books
  to make the number big, which is exactly when a demo is being shown.
- fix: the change handler snaps to the exact target once the remaining distance is below
  what the configured decimal places can display. Verified against a 66-book shelf:
  11,417 at two seconds, 11,651 by five, and stable after that.
- prevention: none beyond the fix — this is vendor motion code, which AGENTS.md already
  treats as authored precisely because it arrives needing work. Recorded because the
  failure mode generalises: an animated counter is a rendering of a number, and it has
  to be checked against the number, not against whether the animation looks smooth.
- status: open

## 2026-08-07 the-checkout-gate-had-never-run

- cause: with Stripe finally live in test mode, `e2e/app-flow.spec.ts` could take the
  hosted-checkout path for the first time — and every part of it was wrong, because
  nothing had ever executed it. `upgradeTo` chose its branch by reading `page.url()`
  straight after the click (always still `/settings`, since checkout is a round trip
  through an action before `location.assign`), then by `count()` on a button that does
  not exist until `billing.status` resolves. `completeStripeCheckout` never filled
  `email`, never filled the billing ZIP, and targeted a "Cardholder name" label that
  hosted Checkout does not render. Stripe reports none of this: the offending input just
  renders `invalid` and the Subscribe button spins forever. The 30s default test timeout
  could not cover a real payment either. Separately, `convex/billing.ts` built its return
  URL from `SITE_URL` alone, so a completed payment sent the browser to port 3000 while
  gate G3 serves on 3100 — the auth seam had already solved that with `E2E_ORIGIN` and
  billing had not.
- fix: the helper branches on the BUTTON LABEL, which is rendered from `billing.status`,
  after waiting for either button to exist. The card fields are targeted by the ids
  Stripe renders in the top-level document (the iframes there are the Apple Pay / Link
  express section), every optional field is filled by presence, and the address is
  located by accessible name because those ids are not stable. Payment tests get a
  180s budget, and both navigations wait on `domcontentloaded` rather than Playwright's
  default `load` — Stripe keeps fetching after the form is interactive, so waiting for a
  quiet `load` timed out on a page that was already usable. `siteUrlOrThrow` reads `E2E_ORIGIN` first, mirroring `trustedOrigins` in
  `convex/auth.ts`, and still never accepts an origin from an argument — a
  browser-nameable return URL is an open redirect.
- prevention: `references/stripe-billing.md` records the three non-obvious facts that
  cost the time — card form is not in an iframe, a missing required field fails silently,
  and a real payment needs a minutes-long budget — plus the `E2E_ORIGIN` rule for return
  URLs. Two real test purchases now run in gate G3 on every full pass, so the path cannot
  rot unexercised again.
- status: GRADUATED (e2e gate G3, convex-structure/references/stripe-billing.md)

## 2026-08-07 half-configured-billing-is-silently-off

- cause: the dev deployment carried `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO` and
  `STRIPE_PRICE_TEAM` but no `STRIPE_SECRET_KEY`, so `billingIsLive()` was false and
  checkout refused while the env read as configured. Nothing reported it. Every Stripe
  key is individually valid, the damage is in the COMBINATION, and by rule R1 none of it
  lives in the repository — the keys are in Convex env, so no file check could ever have
  seen it. `pnpm health` read only `.env.local` and graded the deployment on secrets it
  could not see.
- fix: `scripts/lib/billing-coherence.mjs` grades the combination from env NAMES only —
  values are dropped by `envNamesFrom` and never reach any output. `pnpm health` asks
  the connected deployment; `pnpm preflight --prod` reads the same module instead of
  keeping a second copy of the rule. The e2e `upgradeTo` helper was fixed at the same
  time: it decided between the checkout and direct-switch paths by reading `page.url()`
  immediately after the click, which is always still `/settings` because the Stripe path
  is a round trip through an action before `location.assign`. It now branches on the
  button label, which is rendered from `billing.status` — so the checkout path will
  actually be exercised the moment a secret key exists, rather than silently skipped.
- prevention: AGENTS.md Billing rules declare that billing is all of its keys or none.
  Severity follows whether a card can be charged: secret-without-webhook is CRITICAL
  because the customer pays and gets nothing; the states where checkout throws before
  reaching Stripe are FAIL; and any deployment WITHOUT a secret key is a WARN however
  much else is set, because checkout is unreachable and it behaves exactly like no
  Stripe at all. The first cut of this check graded that last state FAIL, which red-
  gated `pnpm verify` on the exact state `pnpm stripe:provision` deliberately ends in —
  a gate that fails its own documented onboarding, and the reason the not-yet-connected
  rule exists. Report unfinished setup; never fail it.
  `scripts/lib/billing-coherence.test.mjs` pins the ordering, and the check SKIPs when
  no deployment is reachable so a fresh clone and an offline machine stay green.
- status: GRADUATED (pnpm health billing coherence, AGENTS.md Billing rules)

## 2026-08-07 the-logout-menu-crashed-the-page

- cause: `UserMenu` and `WorkspaceSwitcher` placed `DropdownMenuLabel` directly inside
  `DropdownMenuContent`. These primitives wrap **Base UI**, not Radix: the label is
  `Menu.GroupLabel`, it reads its group from context, and it throws
  `MenuGroupContext is missing` with no `DropdownMenuGroup` above it. Opening the
  account menu replaced the whole page with Next's "This page couldn't load" — so
  sign-out was unreachable everywhere it existed, including inside the app shell. Every
  static gate was green: valid TSX, correct types, clean lint, successful build. The
  crash needs a click, and nothing clicked.
- fix: both menus now wrap the label and the items it names in `DropdownMenuGroup`.
  `components/ui/dropdown-menu.tsx` was not touched — it is vendor-owned and correct;
  the call sites were carrying Radix muscle memory.
- prevention: `scripts/lib/ui-contract.mjs` gained a `vendor-context-part` rule, so
  `pnpm check:ui` fails when a context-bound part is composed without its parent —
  `DropdownMenuLabel`, `DropdownMenuRadioItem` and the submenu parts. AGENTS.md
  Component rules declare it. `e2e/app-flow.spec.ts` opens the menu and clicks Sign out,
  which is what caught this: the assertion that a control exists never proves it works.
- status: GRADUATED (pnpm check:ui vendor-context-part, AGENTS.md Component rules)

## 2026-08-07 a-static-header-cannot-know-you-signed-in

- cause: the marketing header took `cta` and `secondary` as static link props, so `/`
  and `/blog` printed "Sign in" to a reader who had just signed in. The auth wiring was
  never at fault — session, cookie, provider and `/app` were all correct — the public
  half of the product simply never subscribed to `api.auth.getCurrentUser`. No gate
  could have caught it: a hardcoded link is valid TSX, the block was correctly pure, and
  no rule said a public surface had to read the session at all. The session-aware
  component already existed (`UserMenu`) and was mounted only inside the app shell.
- fix: `SiteHeader` gained an `auth` slot; `src/components/features/auth/header-auth.tsx`
  renders the three session states — placeholder, signed-out actions, account menu
  carrying sign-out — from one `getCurrentUser` subscription, with the
  `isConvexConfigured` branch in the parent so a fresh clone still renders static links.
  Both public routes compose it. The account-menu trigger also gained an `aria-label`;
  its accessible name had been the bare initials.
- prevention: AGENTS.md Auth rules now declare that every surface which can offer
  "Sign in" renders from session truth, that the pending state is not the signed-out
  state, and that session UI is a client feature composed into a block through a slot.
  `convex-structure/references/better-auth-wiring.md` carries the procedure and the
  provider-gate trap; `e2e/app-flow.spec.ts` asserts the signed-in header and the
  sign-out round trip, `e2e/marketing.spec.ts` the signed-out half — so the next
  regression fails gate G3 instead of waiting for a person to notice.
- status: GRADUATED (AGENTS.md Auth rules, convex-structure skill, e2e gate G3)

## 2026-08-07 configured-is-not-booted

- cause: the magicui MCP server was dead on this machine with
  `ERR_MODULE_NOT_FOUND` — a partially-extracted npx cache entry (`.d.ts` and
  `.js.map` files present, `.js` files missing) under `~/.npm/_npx/<hash>/`. Every
  static check stayed green: `.mcp.json` was correct, the pin was exact, the mirror
  matched. Each AI host just silently lost the server's tools; nothing surfaced the
  loss.
- fix: removed the corrupt cache entry (derived state — npx refetches it) and
  verified the server answers a JSON-RPC `initialize` handshake.
- prevention: `pnpm heal` now runs `scripts/probe-mcp.mjs`, which handshake-probes
  every stdio server in `.mcp.json` in parallel and applies the one provable repair:
  a module error pointing inside an `_npx` cache directory clears that entry and
  retries. Configuration checks can never claim a server is alive; only a handshake
  can.
- status: GRADUATED (pnpm heal, scripts/probe-mcp.mjs)

## 2026-08-06 pairing-file-is-not-authentication

- cause: `provider:login` declared Stripe "authenticated" because
  `~/.config/stripe/config.toml` existed — but headless `stripe login` writes that
  file *before* the browser approval, while emitting a JSON split flow
  (confirmation URL + one-time completion URL) that nothing consumed. The completion
  URL is a secret and was nearly logged as ordinary output.
- fix: the script now always runs `stripe login` piped (so the split flow is the one
  deterministic path), parses the JSON without printing it, opens the confirmation
  page through the origin-allowlisted opener, polls `stripe login --complete` until
  approved, and only claims success after a **read-only API call** exits zero.
- prevention: a login flow is verified by a read-only provider call, never by the
  existence of the file the login was supposed to create — the file also exists when
  the login is half-done. `home_file_exists` probes stay a cheap *signal*;
  `provider-login.mjs` `verify` argvs are the *truth*.
- status: open

## 2026-08-04 comment-vs-code-false-positives

- cause: **third occurrence** of the class — checks matched a pattern anywhere in a file, and documentation naming the
  pattern satisfied the check. Three separate hits: (1) the banned-font check flagged
  the comment explaining why fonts are banned; (2) the `phx_`/secret scans flagged the
  comments warning against those keys; (3) preflight's `testMode: false` check passed
  while testMode was true, because a comment said "set testMode: false here".
- fix: match **loaded/effective code only** — font check parses `next/font` imports;
  secret scans require prefix **plus payload**; flag checks anchor to line starts
  (`/^\s*testMode:\s*false/m`).
- prevention: rule for every future text check — *a check must be able to tell the
  code from the documentation of the code*. Prefer parsing what is loaded; else anchor
  to line structure; else require the payload, not the name.
- status: GRADUATED (scripts/health.mjs + scripts/preflight.mjs; this entry is the written rule)

## 2026-08-04 useQuery throws without a provider

- cause: guarding a Convex hook with `"skip"` does not help when there is no
  `ConvexProvider` in the tree at all — the failure is the missing client, not the
  argument. Build broke at prerender.
- fix: branch in the parent component before any hook mounts; hooks live in a child
  that renders only when configured.
- prevention: rule in `AGENTS.md` (Backend rules) + the pattern in
  `convex-structure/references/example-domain.md`.
- status: GRADUATED (AGENTS.md Backend rules + example-domain.md)

## 2026-08-04 hand-edited dependency broke frozen-lockfile on 3 OSes

- cause: the better-auth pin was edited in `package.json` by hand; `pnpm-lock.yaml`
  went stale; CI's `--frozen-lockfile` failed on every platform.
- fix: `pnpm install` resync; versions are only ever changed through pnpm.
- prevention: `AGENTS.md` already banned hand-editing versions; `pnpm heal` now
  detects and resyncs a stale lockfile deterministically.
- status: GRADUATED (AGENTS.md pin rule + scripts/heal.mjs lockfile repair)

## 2026-08-04 in-range minor broke the auth adapter's types

- cause: better-auth 1.6.25 satisfies the adapter's declared peer range yet breaks its
  types (`useSession().data` resolves to `never`).
- fix: exact pin `better-auth@1.6.15` — the version the adapter itself develops
  against.
- prevention: pin recorded with the receipt in `skills.lock.json`; only
  `upstream-sync` moves it, by building against the candidate first.
- status: GRADUATED (skills.lock.json pins — machine-enforced exact by scripts/health.mjs since 2026-08-06)

## 2026-08-04 next/font needs the network, the CI runner has none

- cause: `next/font` fetches IBM Plex Sans/Mono from Google Fonts **at build time**. The
  GitHub Actions runner cannot reach `fonts.googleapis.com`, so any CI job that builds
  inside Playwright's `webServer` dies with "Failed to fetch IBM Plex Mono from Google
  Fonts". The plain `pnpm build` step in the `verify` job succeeds — it runs before and
  without that constraint — which is why the failure looked like an e2e defect rather
  than a font one.
- fix: self-hosted the fonts. `pnpm font --ofl "<Family>" <weights>` downloads the OFL
  woff2 files into `src/fonts/ofl/` (committed — OFL is redistributable, and the licence
  ships beside them); `layout.tsx` loads them with `next/font/local`. The `e2e` job in
  `.github/workflows/ci.yml` is enabled again.
- prevention: `pnpm health` has a `fonts build offline` check that WARNs the moment
  `src/app/layout.tsx` imports `next/font/google` again, naming the self-host command in
  its fix column. The banned-font check was widened in the same pass — it only parsed
  the `next/font/google` named-import shape, so switching to `next/font/local` would
  have let a banned face straight through the `src:` paths it does not read.
- status: GRADUATED (scripts/health.mjs "fonts build offline"; licence rule encoded in scripts/fetch-font.mjs)

## 2026-08-05 secret scans skipped the repos most likely to need them

- cause: the live-Stripe-key, misplaced-backend-secret and `phx_` personal-key scans in
  `pnpm health` were nested inside `if (convex/schema.ts exists)` and
  `if (src/lib/analytics.ts exists)`. Deleting either seam silently disabled the
  corresponding secret scan — and reported PASS. A repo that had drifted from the
  shipped layout got *less* checking than one that had not, which is exactly backwards.
- fix: secret placement is now its own unconditional section in `scripts/health.mjs`,
  run before and independent of any seam-existence branch.
- prevention: rule for every future check — *gate a check on the thing it measures,
  never on a seam that happens to be nearby*. Reporting the state of a seam (connected,
  not connected) is conditional; scanning for a credential in the wrong file is not.
- status: GRADUATED (scripts/health.mjs section 8; this entry is the written rule)

## 2026-08-06 fonts referenced by layout.tsx were never tracked

- cause: the self-hosted-fonts fix committed everything EXCEPT the fonts — src/fonts/
  sat untracked while layout.tsx, CI comments and this ledger all said "committed".
  One `git commit -a` away from breaking every fresh clone's build; the offline-fonts
  health check could not see it because it only greps for the remote loader.
- fix: `git add src/fonts` landed with the layout change, in one commit.
- prevention: `pnpm health` now resolves every `next/font/local` path in layout.tsx
  against the disk ("local font files exist" — FAIL when missing), so CI's fresh
  checkout catches an untracked font forever.
- status: GRADUATED (scripts/health.mjs "local font files exist")

## 2026-08-06 variable font committed four times under four weight names

- cause: Google's css2 endpoint returns the SAME variable file for every requested
  weight of a variable family; per-weight download wrote four byte-identical IBM Plex
  Sans files. 137KB of duplication, and a false "one file per weight" mental model in
  the loader comments.
- fix: one committed `ibm-plex-sans-variable.woff2` with a single weight-range entry
  (`weight: "400 700"`); static families (IBM Plex Mono) stay per-weight.
- prevention: `scripts/fetch-font.mjs` hashes every download and collapses identical
  content into one file with a range snippet before anything is written.
- status: GRADUATED (scripts/fetch-font.mjs content-hash dedupe)

## 2026-08-06 onboarding hardcoded six steps as never-done

- cause: steps whose truth lives in Convex env were written as `done: false` literals,
  so `pnpm onboard` jammed at "Auth secrets" forever — including against a fully live
  backend — and the "fully connected" branch was unreachable dead code. The most-run
  buyer-facing script lied on every invocation past step five.
- fix: secret steps verify by NAME against one `npx convex env list` call (timeout,
  names only — values never leave the process); steps with no local signal are marked
  `manual` and listed as the buyer's own verifications instead of blocking.
- prevention: rule for every status surface — *never hardcode the state of something
  machine-checkable; when it truly is not checkable, say `manual`, never `false`*.
- status: GRADUATED (scripts/onboard.mjs; the rule is this entry)

## 2026-08-06 vulnerable auth pin hidden by green gates

- cause: the exact `better-auth@1.6.15` compatibility pin was vulnerable to
  GHSA-qq9h-g4jm-xgf3, while the offline definition-of-done gates did not run the
  networked production audit. Patched Better Auth exposed a separate stale type in
  `@convex-dev/better-auth@0.12.5`: its exported client alias inferred session data as
  `never`, even though the provider's runtime contract was unchanged. The upgrade also
  let `better-call` bind to shadcn's Zod 3 instead of its required Zod 4 peer.
- fix: upgraded to exact `better-auth@1.6.26`, declared Zod 4 directly, preserved the
  application client's inferred Better Auth type, and isolated one documented cast at
  the stale adapter boundary after compile-checking the configured provider's session,
  token and request operations. `pnpm audit:supply-chain` now provides a fail-closed
  networked audit command.
- prevention: `src/lib/auth-client.test.ts` guards non-`never` session data, email
  sign-in, the Convex token plugin and bridge identity; `skills.lock.json` records the
  patched exact pin and adapter caveat; supply-chain checks call the dedicated Node
  command rather than relying on the offline health gate.
- status: GRADUATED (auth client regression test + skills.lock.json +
  scripts/audit-supply-chain.mjs)

## 2026-08-06 keyboard check assumed seeded blog content

- cause: the new keyboard e2e gate assumed `/blog` always contained an article link,
  but the engine deliberately ships with zero demo articles and therefore no focusable
  control on that route.
- fix: verify keyboard focus whenever a visible control exists; when none exists,
  require the intentional empty state instead of inventing demo content for the test.
- prevention: UI browser gates must derive their assertion from the shipped surface and
  test both its valid empty state and its interactive state, never smuggle seed-data
  assumptions into the plain engine.
- status: GRADUATED (e2e/ui-quality.spec.ts empty and interactive branches)

## 2026-08-06 durable queue had no crash or blocked-state recovery

- cause: initialization wrote outside the mutation lock, lock ownership was not
  recorded, and `blocked` had no outbound transition. Two hosts could race the first
  write, a crashed process could strand the queue permanently, and a resolved blocker
  still forced an unsafe manual state edit.
- fix: initialization now uses the same bounded cross-process lock as every mutation;
  locks carry an owner token and PID, dead or abandoned partial locks recover through a
  serialized recovery guard, and releases only remove their own token. An
  evidence-required `unblock` transition returns resolved work to `ready`.
- prevention: focused work-state tests cover initialization contention, dead-lock
  recovery without stealing an aged live lock, abandoned partial locks, and the full
  block-to-unblock lifecycle; the product-lifecycle skill documents retry and recovery.
- status: GRADUATED (scripts/lib/work-state.test.mjs + product-lifecycle skill)

## 2026-08-06 plugin install succeeded while shipping zero agents

- cause: manifest validation accepted Claude agent paths under `.agents/`, but Claude's
  installed component inventory discovered agents only from the plugin-root `agents/`
  delivery directory. The Codex marketplace also used obsolete lowercase policy values,
  so a real install failed even though the JSON parsed.
- fix: generate neutral Claude plugin agents from the canonical role briefs, use current
  Codex marketplace enums with lazy `ON_USE` authorization, and test both hosts in
  isolated config homes.
- prevention: `pnpm check:agents` byte-checks the Claude delivery files, `pnpm health`
  checks both plugin wiring contracts, and distribution provenance records the actual
  installed component counts and host versions.
- status: GRADUATED (sync-agent-config + health plugin distribution wiring)

## 2026-08-06 provider handoff printed the wrong Codex MCP name

- cause: Codex project MCP servers are deliberately generated with a `workspace-`
  prefix to avoid global transport collisions, but the human OAuth handoff printed the
  canonical unprefixed server name.
- fix: the Codex instruction now prints `workspace-<provider>`, matching the generated
  TOML exactly.
- prevention: the connection service test asserts the rendered Stripe login command,
  not merely the canonical catalog key.
- status: GRADUATED (scripts/lib/connections/service.test.mjs)

## 2026-08-06 component layer check missed relative imports

- cause: the block dependency gate recognized aliased paths such as
  `@/components/blocks/...` but not a sibling import such as `./other-block`, allowing a
  forbidden block-to-block edge to bypass the architecture rule.
- fix: resolve relative imports against the authored file before classifying component,
  store, and Convex-seam dependencies.
- prevention: the UI contract suite contains a relative block import regression case.
- status: GRADUATED (scripts/lib/ui-contract.test.mjs)
