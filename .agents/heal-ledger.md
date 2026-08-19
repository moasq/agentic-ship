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

## 2026-08-14 nanoid-advisory-tripped-the-fail-closed-audit
- cause: GHSA-2v37-7h3g-55p8 (nanoid < 3.3.18, custom generators loop forever on
  size 0) was published after the last dependency change, and the transitive
  nanoid@3.3.17 under postcss/vite sat inside its range. Nothing in this repo
  regressed; the audit is fail-closed on the whole tree by design, so a fresh
  upstream advisory reddens `pnpm verify:full` on a tree that was green yesterday.
- fix: `pnpm up nanoid` — postcss's `^3.3.x` range already admitted the patched
  3.3.18, so one lockfile bump cleared it. Audit back to zero across 106 packages.
- prevention: none to add — this is the audit working as designed, and the repair
  is the documented one-command path. Recorded so the next fresh-advisory red is
  recognized as external drift, not a regression: check the advisory's patched
  version first; a semver-compatible bump via `pnpm up <pkg>` is the whole fix
  when the parent range admits it.
- status: open

## 2026-08-11 visual-capture-hung-on-a-lazy-image
- cause: `captureUiEvidence` awaited `image.decode()` on every image whose
  `complete` was false, with no bound. A below-the-fold `next/image` is lazy by
  default and never loads while the page sits at scroll 0, so its `decode()`
  never settles and the capture hung forever — 30 minutes at 0.0% CPU, with all
  twelve screenshots already written. It read as slowness, not as a hang, which
  cost two further runs: one was killed mid-teardown and turned a passing run
  into a FAIL. A second, quieter half: even without the hang, that image was
  never loaded, so its `fullPage` screenshot would have been silently blank —
  accepted evidence showing an empty section.
- fix: during capture, flip every `loading="lazy"` image to eager so the
  evidence actually contains it, then race each `decode()` against a 3s timeout
  so no single image can stall the run. Capture went from unbounded to ~45s.
- prevention: the timeout is the structural guard — an unbounded wait on a
  browser promise is the defect class, and no product-side discipline can
  prevent a downstream author adding a below-the-fold image. Also worth knowing:
  0% CPU over minutes distinguishes a hang from slow work, and is the first
  thing to measure before killing anything.
- status: open

## 2026-08-11 recharts-overflowed-for-one-frame-at-320px
- cause: recharts' `ResponsiveContainer` paints one frame at an intrinsic width
  before it measures its parent. At a 320px viewport that frame was 340px wide
  and pushed the document into horizontal scroll. Every static check passed,
  because it is gone by ~150ms; only the evidence gate's audit, which samples
  immediately after the marker appears, caught it.
- fix: `overflow-hidden min-w-0` on the chart container. A chart should never
  exceed its own box, so clipping costs nothing and removes a real flash of
  sideways scroll on a phone.
- prevention: none needed beyond the existing gate — the browser audit already
  catches it, and it caught it here. Recorded so the next person who sees a
  transient overflow they cannot reproduce by hand knows to sample at t=0 rather
  than after a settle delay.
- status: open

## 2026-08-10 tool-only-pivot-stripped-code-not-prose

- cause: the tool-only pivot (commit bb295a0) deleted the bundled application but left
  the prose that described it. AGENTS.md, `.claude/settings.json`, `skills.lock.json`,
  and the skills drifted out of agreement with `package.json` and `scripts/`: the
  Commands table promised `pnpm` names that were never wired (`preflight`,
  `stripe:provision`, `secret:set`, `setup:auth`, `setup:env`, `font`, `asset`,
  `component:list`, `component:place`) though their scripts existed; it also sold
  commands this tool repo does not own (`build`, `lint`, `test:e2e`) as if they were
  local. `pnpm verify`/`pnpm health` were described doing far more than `verify.mjs`/
  `health.mjs` actually run. `scripts/seed.mjs` and `scripts/demo.mjs` were Marginalia
  product residue targeting a `convex/` that no longer exists here. `skills.lock.json`
  violated its own completeness rule (visual-direction and visual-qa unlisted, a phantom
  `better-auth-best-practices` entry, wrong skill/server counts, a fiction that
  `health.mjs` enforces the version pins) and still pinned Render after the Netlify
  migration. AGENTS.md State rules were truncated mid-sentence.
- fix: one reconciliation pass. Wired the nine real scripts into `package.json`; deleted
  the two Marginalia scripts and every stale reference; honest-downed the `verify`,
  `verify:full`, and `health` descriptions to what the scripts do; reframed `build`/
  `test:e2e` as downstream-product commands; added a one-line "downstream contract"
  marker to every product-voice skill; reconciled `skills.lock.json` to disk (added the
  two visual skills, removed the phantom entry, fixed counts, removed the pin-enforcement
  fiction, removed all Render vendor entries and made Netlify the deploy target);
  matched the settings.json allowlist to wired reality; restored the truncated sentence;
  added the `setup-health` row to the Skills table.
- prevention: a `check:commands` gate (added in parallel — `scripts/check-commands.mjs`,
  run by `pnpm verify`) asserts that every `pnpm <name>` named in AGENTS.md and the
  skills resolves to a real `package.json` script or sits in explicitly downstream-marked
  prose, so prose and wiring can never silently diverge again.
- status: GRADUATED (scripts/check-commands.mjs + verify)

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

## 2026-08-10 render-pivot-left-derived-layers-behind

- cause: the deploy host moved from Render to Netlify (AGENTS.md Deploy rules; commit
  8b4bc6a dropped render from `scripts/provider-login.mjs`), but the derived
  configuration never followed. `.agents/connections/providers.json` still shipped a
  `render` provider whose agent-tool step dispatched `pnpm provider:login render` — which
  now exits 1, because that CLI target no longer exists — and shipped NO `netlify`
  provider at all, so the one host the whole go-live path depends on could not be
  connected through `pnpm connect`/`pnpm onboard`. In parallel, `.mcp.json` still declared
  the `render` MCP server and `.claude/settings.json` still enabled the `render`
  plugin, and `.agents/agents/connection-guide.md` still named Render as an example
  provider. A rule declared in one place (Deploy rules) had drifted from every layer that
  applies it. The split was invisible to static gates because a catalog entry pointing at
  a deleted CLI is still valid JSON.
- fix: replaced the `render` provider in `providers.json` with a `netlify` provider that
  matches the catalog's existing shape — CLI browser-login agent-tool step
  (`pnpm provider:login netlify`), a `home_file_exists` configuration probe, runner-based
  `netlify init` / `netlify env:set --secret` / `netlify deploy --prod` provisioning
  steps, `probe_and_attestation` verification on `netlify.toml` + the atomic
  `npx convex deploy --cmd 'pnpm build'` build command, and `netlify logout` +
  dashboard revocation. Removed the `render` MCP server from `.mcp.json` and the `render`
  plugin from `.claude/settings.json` (no Netlify MCP server exists in the repo's pins,
  so none was added in its place), then regenerated `.cursor/mcp.json`, the Claude/Codex/
  Cursor/Hermes/OpenClaw agent adapters, and the Codex MCP mirror from source. Updated the
  connection-guide brief to name Netlify.
- prevention: the deeper rule is that a vendor pivot is not done until every derived layer
  that names the old vendor is regenerated — the connection catalog, `.mcp.json`, plugin
  wiring, and the agent briefs are all downstream of one Deploy-rules decision, and none of
  them is caught by a JSON or build gate. A catalog `mcpServer`/CLI target that no longer
  resolves should ideally be validated against `.mcp.json` and `scripts/provider-login.mjs`
  at load time; today only `pnpm connect status` exercising the catalog reveals it.
- status: open (residual render references remain in files outside this change's ownership
  — see report: `scripts/connect.mjs` usage text, `scripts/lib/connections/service.test.mjs`
  fixtures, and `skills.lock.json` pins/provider list still name render)

## 2026-08-10 auth-secret-was-set-through-argv

- cause: `scripts/setup-auth-env.mjs` generated `BETTER_AUTH_SECRET` and passed it as the
  final argv element of `npx convex env set NAME VALUE`. A value in argv is visible to
  `ps` and every process listing for the life of the child process, so the freshly minted
  secret leaked to any local process — while the script's own docblock claimed the value
  "never enters a transcript, chat, or agent state". The sibling `scripts/set-secret.mjs`
  already did this correctly, piping the value over stdin.
- fix: `setEnv` now spawns `convex env set NAME` with no value argument and feeds the
  value over stdin (`input`, `stdio: ["pipe", ...]`), the officially documented no-leak
  path. The docblock was corrected to describe stdin, not argv.
- prevention: the rule — a secret is moved into Convex env over stdin, never as an argv
  element — now has two call sites (`set-secret.mjs`, `setup-auth-env.mjs`) and
  `stripe-provision.mjs`'s `convexEnvSet` following it identically. A future health check
  could grep scripts for `env", "set", ...,` with a trailing value argument.
- status: open

## 2026-08-10 supply-chain-audit-checked-zero-packages

- cause: `scripts/audit-supply-chain.mjs` ran `pnpm audit --prod`, but `package.json`'s
  `dependencies` is `{}` — every real package (vitest, typescript, @playwright/test,
  @types/node) is a devDependency. A `--prod`-scoped audit therefore inspected zero
  packages while printing "Production dependencies checked" and passing, and it is wired
  into `verify:full` as the "fail-closed production dependency audit". A vulnerable dev
  dependency would never have been seen.
- fix: dropped `--prod` so the audit covers the whole tree (prod + dev), which is the only
  scope that exists in this repo. Fail-closed semantics preserved (any advisory of any
  severity, or a non-zero pnpm exit, fails). Header and pass-line comments now state the
  real scope.
- prevention: the header records WHY the scope is the whole tree (all deps here are dev),
  so a future reader does not "restore" `--prod` and silently disable the audit again. The
  pass line prints the checked-dependency count, which is now non-zero — a zero there is
  the tell that the scope is wrong.
- status: open

## 2026-08-10 ci-narrated-an-app-that-no-longer-exists

- cause: `.github/workflows/ci.yml` had four defects. (1) An `e2e` job installed Chromium,
  ran `pnpm verify:full`, and uploaded `playwright-report/`, but the repo ships no
  Playwright config and no specs — the tool-only pivot removed the app — so it ran zero
  browser tests while claiming to be the release proof. (2) `pnpm/action-setup` was pinned
  to the mutable `@v4` tag, a supply-chain foothold. (3) There was no `permissions:` block,
  so jobs ran with the default (broad) token scope. (4) `pnpm test` ran twice per verify
  job — once inside `pnpm verify` (its `unit` step) and once as a standalone step. Comments
  narrated `src/fonts/ofl/`, lint and build, and the Windows rationale cited a
  `.claude/skills resolves` health check that `scripts/health.mjs` no longer contains.
- fix: deleted the `e2e` job; pinned `pnpm/action-setup` to the full commit SHA of the v4
  tag (`f40ffcd…`, annotated `# v4`); added top-level `permissions: contents: read`;
  removed the duplicate standalone `pnpm test` step (verify already runs it); rewrote the
  comments to match what the jobs do, and restated the Windows rationale as the real one
  (cross-platform link/junction repair + CLI-spawn behavior under cmd/PowerShell). Added a
  single-OS `audit` job running `pnpm audit:supply-chain`, so the fail-closed networked
  audit — previously reachable only through the deleted `verify:full` job — still runs in
  CI without a fake browser gate.
- prevention: pin GitHub Actions by SHA, not tag; declare least-privilege `permissions`;
  never install a browser or upload a report for tests that do not exist. A workflow that
  builds/tests an application this repo no longer contains is drift from the tool-only
  pivot — the same class as the render-pivot entry above.
- status: open

## 2026-08-10 heal-env-repair-failed-forever-and-proof-went-silent-when-red

- cause: two defects in `scripts/heal.mjs`. (1) The `env scaffold` repair runs
  `scripts/init-env.mjs`, which FAILS when `.env.example` is missing — and the file had
  been deleted in the tool-only pivot even though `.gitignore` still un-ignores it
  (`!.env.example`) and `pnpm setup:env` is documented against it — so that repair reported
  FAILED on every heal. (2) The "proof" section ran `pnpm health` and wrote only
  `health.stdout`, but `scripts/health.mjs` prints its PASS line to stdout and every
  FAILURE to stderr, so the proof block was empty exactly when health was red — the one
  time the receipt matters.
- fix: recreated a minimal, honest `.env.example` (names only, no values) documenting only
  the variables this tool-only repo's own scripts read — the two public `NEXT_PUBLIC_CONVEX_*`
  URLs, optional `STRIPE_PROFILE`, optional `TWENTYFIRST_API_KEY` — with an explicit note
  that real secrets live in Convex env via `pnpm secret:set`. `heal.mjs` now writes both
  `health.stdout` and `health.stderr` in the proof block.
- prevention: `.gitignore`'s `!.env.example` already declares the file is meant to exist
  and be committed; deleting it should be caught. A "capture both streams when a script's
  failures go to stderr" rule now applies wherever heal-style proof re-runs a checker.
- status: open

## 2026-08-10 windows-provider-login-and-stripe-config-were-posix-only

- cause: `scripts/provider-login.mjs` spawned vendor CLIs (npm, gh, scoop, winget,
  netlify, stripe, 21st) with `spawnSync(cmd, args)` and no shell — dead on win32, where
  those targets are `.cmd`/`.ps1` batch shims that cannot be exec'd directly, so every
  provider login failed before doing anything. Separately, `scripts/stripe-provision.mjs`
  resolved the Stripe CLI config as `homedir()/.config/stripe/config.toml` but ignored
  `XDG_CONFIG_HOME`, so a user who relocated their config was wrongly reported unpaired.
- fix: added `const WIN = process.platform === "win32"` and `shell: WIN` to every external-
  CLI `spawnSync` in `provider-login.mjs` — safe because every command/arg is a static
  literal from the PROVIDERS catalog and no user input is interpolated (same pattern as
  `scripts/probe-mcp.mjs`). In `stripe-provision.mjs` the config path now honors
  `XDG_CONFIG_HOME` and falls back to `homedir()/.config` (which on Windows is
  `%USERPROFILE%\.config\stripe\config.toml`, exactly where the Windows CLI writes it), so
  both platforms and a relocated config resolve correctly.
- prevention: the "bundle works on macOS, Linux AND Windows" claim needs the Windows CI
  matrix job to actually exercise these paths; the reusable rule is `shell: WIN` for static-
  arg vendor spawns, never `shell:true` with interpolated caller text.
- status: open

## 2026-08-10 probe-mcp-deleted-a-path-parsed-from-untrusted-stderr

- cause: `scripts/probe-mcp.mjs` extracted a filesystem path from an MCP server's stderr
  (untrusted output) with a regex and passed it straight to `rmSync(..., { recursive:
  true, force: true })`. The regex constrained the path to `_npx/<hex>`, but a crafted or
  malformed stderr line could still steer the deletion outside the intended npx cache
  entry.
- fix: added `safeNpxCacheEntry`, which resolves the candidate and refuses unless it is
  exactly `<something>/_npx/<hex>` — parent directory literally named `_npx`, own name a
  non-empty lowercase-hex string with no separators or `..`, reconstruction from validated
  parts reproduces the resolved path byte-for-byte, and the directory actually exists as a
  directory. `rmSync` runs only on the returned safe path; anything else is refused and
  nothing is removed.
- prevention: a path parsed out of untrusted output is never a delete target until it has
  been re-validated to the narrowest shape that makes the repair provable — the same
  "validate the thing you act on, not the pattern near it" lesson as the comment-vs-code
  false-positive entries.
- status: open

## 2026-08-10 security-critical-url-gates-had-zero-tests

- cause: the two allowlists that stand between the agent and the open web —
  `scripts/open-url.mjs` (only catalog origins may be opened) and `scripts/fetch-asset.mjs`
  (only allowlisted image hosts, re-checked on every redirect hop) — had no unit coverage,
  so a regression such as origin/host confusion, an http downgrade, or a redirect off the
  allowlist would ship green.
- fix: minimally extracted the pure decision logic into `scripts/lib/url-allowlist.mjs`
  (`catalogOrigins`, `classifyOpenUrl`) and `scripts/lib/asset-allowlist.mjs`
  (`ALLOWED_IMAGE_HOSTS`, `checkAssetUrl`), imported by the two scripts with byte-identical
  output and exit behavior (verified by end-to-end smoke runs). Added
  `url-allowlist.test.mjs` (userinfo `@` smuggling, look-alike subdomain, explicit-port
  origin, http-before-origin, non-https schemes, unparseable) and `asset-allowlist.test.mjs`
  (allowed host, disallowed host, http downgrade, unparseable, and per-hop redirect
  re-validation including scheme-relative and multi-hop chains).
- prevention: the allowlist logic now lives in one tested module per script, so the check
  cannot silently drift from its test; a future host or origin change updates one place and
  the suite guards the confusion cases.
- status: open

## 2026-08-18 github-work-mirror-tested-only-the-happy-path

- cause: the first GitHub queue mirror assumed its labels already existed, treated a
  local cache as the idempotency authority, returned before handling an initially
  completed item, read wait and block reasons from the wrong fields, and added Project
  items without resolving their owner or updating the `Status` field. Its five tests
  mocked every unrecognized GitHub command as success, so partial failures, lost state,
  revoked access, manual edits, and the real Project contract stayed green.
- fix: the mirror now provisions labels, reconciles remote issues through stable
  markers, preserves unrelated GitHub content, uses the queue's actual human-action and
  block fields, makes comments retry-safe, closes initially completed work, and maps
  Project status through resolved owner, project, field, item, and option IDs. Safe
  identifiers remain in a mode-0600 local map where POSIX file modes apply; recognized
  credentials and email addresses are redacted before publication.
- prevention: stateful boundary tests now cover label bootstrap, issues-only operation,
  remote and corrupt-state recovery, manual-edit reconciliation, comment-success plus
  close-failure retry, initial terminal and wait states, global redaction, Project field
  mapping, revoked access, and live-lock refusal. The product-lifecycle declaration and
  reference now own the procedure.
- status: open

## 2026-08-19 reusable-action-called-nonexistent-gates

- cause: the first reusable verification action reported six friendly gate names but
  invoked four scripts and two package commands the repository does not provide. Its
  tests exercised Markdown formatting only, so the action stayed green while every
  real consumer would fail.
- fix: the action now invokes the canonical `pnpm verify` command and, only when
  requested, the existing fail-closed `pnpm audit:supply-chain` command. The runner
  resolves from the action directory while executing in the consumer workspace,
  escapes GitHub annotations and Markdown, and globally redacts current credential
  shapes.
- prevention: contract tests assert the exact pnpm commands, opt-in audit behavior,
  failure propagation, output escaping, and multi-secret redaction. Documentation now
  requires immutable consumer pins and read-only permissions.
- status: open
