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
