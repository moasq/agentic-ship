# Supply-chain verification

Keep local pin validation and live advisory lookup separate so workspace health remains
deterministic offline without weakening the release gate.

## Local pin contract

Let `pnpm health` compare `package.json` with `skills.lock.json`. Treat an exact
`x.y.z` pin as exact in the package manifest: no range prefix and no floating tag.
Record every executable used through `npx`, every registry, every vendored skill, and
every framework compatibility pin in `skills.lock.json`.

Move a pin only through the `upstream-sync` procedure. Build and test against the
candidate before recording it as verified.

## Network advisory gate

Run:

```text
pnpm audit:supply-chain
```

Require a successful, parseable production-dependency audit with no advisory at the
configured failure threshold. Treat an unavailable registry, malformed report, or
nonzero audit result as a failed release gate. Do not place this networked operation
inside `pnpm health`.

## Better Auth compatibility pin

Keep `better-auth` pinned exactly to `1.6.26`. This version contains the fix for
GHSA-qq9h-g4jm-xgf3 and has been verified in this repository with
`@convex-dev/better-auth@0.12.5`.

Preserve the application client's inferred Better Auth type in
`src/lib/auth-client.ts`. Isolate the adapter's stale exported client alias at the
provider bridge and keep that bridge compile-checked. Run
`src/lib/auth-client.test.ts` after either dependency changes.

Before accepting a new Better Auth version:

1. Confirm the advisory remains fixed.
2. Confirm the Convex adapter peer range and runtime behavior.
3. Run the auth client contract test and type/build gates.
4. Run `pnpm audit:supply-chain`.
5. Run `pnpm verify:full`.
6. Update the package pin and provenance together only after every gate passes.

Never reintroduce a known-vulnerable version to avoid an adapter type mismatch. Fix or
isolate the compatibility seam and preserve the security patch.
