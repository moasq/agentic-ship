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

## 2026-08-04 comment-vs-code false positives — **third occurrence**

- cause: checks matched a pattern anywhere in a file, and documentation naming the
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
- status: **GRADUATED** — encoded in `scripts/health.mjs` and `scripts/preflight.mjs`;
  this entry is the written rule.

## 2026-08-04 useQuery throws without a provider

- cause: guarding a Convex hook with `"skip"` does not help when there is no
  `ConvexProvider` in the tree at all — the failure is the missing client, not the
  argument. Build broke at prerender.
- fix: branch in the parent component before any hook mounts; hooks live in a child
  that renders only when configured.
- prevention: rule in `AGENTS.md` (Backend rules) + the pattern in
  `convex-structure/references/example-domain.md`.
- status: GRADUATED

## 2026-08-04 hand-edited dependency broke frozen-lockfile on 3 OSes

- cause: the better-auth pin was edited in `package.json` by hand; `pnpm-lock.yaml`
  went stale; CI's `--frozen-lockfile` failed on every platform.
- fix: `pnpm install` resync; versions are only ever changed through pnpm.
- prevention: `AGENTS.md` already banned hand-editing versions; `pnpm heal` now
  detects and resyncs a stale lockfile deterministically.
- status: GRADUATED

## 2026-08-04 in-range minor broke the auth adapter's types

- cause: better-auth 1.6.25 satisfies the adapter's declared peer range yet breaks its
  types (`useSession().data` resolves to `never`).
- fix: exact pin `better-auth@1.6.15` — the version the adapter itself develops
  against.
- prevention: pin recorded with the receipt in `skills.lock.json`; only
  `upstream-sync` moves it, by building against the candidate first.
- status: GRADUATED

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
- status: **GRADUATED** — `scripts/health.mjs` ("fonts build offline"), and the licence
  rule is encoded in `scripts/fetch-font.mjs`: OFL faces are committed, Fontshare faces
  stay gitignored.

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
- status: **GRADUATED** — encoded as section 8 of `scripts/health.mjs`; this entry is
  the written rule.
