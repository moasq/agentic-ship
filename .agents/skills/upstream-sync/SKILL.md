---
name: upstream-sync
description: Check every vendored skill, MCP server, registry, and version pin against its official upstream; report drift; apply clean updates; three-way merge anything patched. Run monthly, or when a tool ships a major version.
---

# Upstream Sync

A bundle is only worth what it was worth on the day it was downloaded — unless it can
update itself. This skill is the difference between a template and a maintained tool.

`skills.lock.json` is the manifest. Nothing enters the bundle without an entry there.

## 1. Skills

For each entry under `skills` — an entry covers the SKILL.md **and** the files listed
in its `references` array; they sync as one unit, never separately:

- `upstream: "original"` → authored here. Nothing to sync; note it and move on.
- Otherwise, fetch the upstream at its latest release or ref.
  - **No local patches** (`patched: false`) → diff against the vendored copy. If it
    changed, replace it and bump `ref` and `lastSync`.
  - **Local patches** (`patched: true`) → three-way diff between the base ref, upstream
    latest, and the local copy. Show the diff, re-apply the local patch on top, and
    ask before committing. **Never silently overwrite a patched file.**
  - **Upstream archived, moved, or deleted** → report CRITICAL, propose a replacement,
    change nothing.

## 2. MCP servers

For each entry under `mcp`:

- `pnpm view <package> version` versus the pin.
- Patch and minor bumps → fine, note them.
- **Major bumps → flag as breaking.** Read the upstream changelog before updating, and
  say what changed in the report.
- Remote servers (stripe, resend, posthog, render — and 21st when enabled) → confirm
  the documented URL and auth scheme still match what is in `.mcp.json`. Vendors do
  migrate; that is exactly how the old Magic MCP configuration went stale.

## 3. Registries

Every URL under `registries` in both `components.json` and `skills.lock.json` must
return HTTP 200. A dead registry is reported, never quietly replaced with hand-written
components.

## 4. Framework pins

Compare `package.json` against `pins` in the lockfile. For Next.js specifically, read
`node_modules/next/dist/docs/` after any major bump — that directory always matches the
installed version, unlike anything a model remembers.

## 5. Output

Print a drift table — one row per checked item, `none` action included, so absence of
drift is visible rather than assumed:

```
| item | type | pinned | upstream | action |
|------|------|--------|----------|--------|
| next | pin | 16.x | 16.3.2 | none — inside pin |
| better-auth | pin (exact) | 1.6.26 | 1.6.26 | none — patched candidate passed audit, typecheck and full gates |
| @magicui registry | registry | url | HTTP 200 | none |
```

Update each checked entry's `lastSync` (and the top-level one) to the run date — the
dates are only worth anything if the run that writes them actually checked the entry.

Then a changelog block suitable for pasting into the bundle's release notes.

Finish by running `pnpm health`, then the `workspace-health` skill. A sync that leaves the
project broken is worse than no sync at all, and the health check is the proof it did
not.

## 6. Scripts

`scripts/` is the cross-platform layer — it is what lets the bundle work on Windows.
Anything you add there must stay pure Node: no shelling out to `cp`, `ln`, `grep` or
`openssl`, and no assumption of a POSIX shell. Rules and the substitution table:
`.agents/skills/workspace-health/references/platform-notes.md`.

## Cadence

Monthly is enough. Also run it when a tool announces a major version, and always before
publishing a new bundle release.
