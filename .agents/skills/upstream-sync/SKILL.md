---
name: upstream-sync
description: Check every vendored skill, MCP server, registry, and version pin against its official upstream; report drift; apply clean updates; three-way merge anything patched. Run monthly, or when a tool ships a major version.
---

# Upstream Sync

A bundle is only worth what it was worth on the day it was downloaded — unless it can
update itself. This skill is the difference between a template and a maintained tool.

`skills.lock.json` is the manifest. Nothing enters the bundle without an entry there.

## 1. Skills

For each entry under `skills`:

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

- `npm view <package> version` versus the pin.
- Patch and minor bumps → fine, note them.
- **Major bumps → flag as breaking.** Read the upstream changelog before updating, and
  say what changed in the report.
- Remote servers (the 21st MCP) → confirm the documented URL and auth scheme still
  match what is in `.mcp.json`. Vendors do migrate; that is exactly how the old
  Magic MCP configuration went stale.

## 3. Registries

Every URL under `registries` in both `components.json` and `skills.lock.json` must
return HTTP 200. A dead registry is reported, never quietly replaced with hand-written
components.

## 4. Framework pins

Compare `package.json` against `pins` in the lockfile. For Next.js specifically, read
`node_modules/next/dist/docs/` after any major bump — that directory always matches the
installed version, unlike anything a model remembers.

## 5. Output

Print a drift table:

```
| item | type | pinned | upstream | action |
|------|------|--------|----------|--------|
```

Then a changelog block suitable for pasting into the bundle's release notes.

Finish by running the `setup-health` skill. A sync that leaves the project broken is
worse than no sync at all, and the health check is the proof it did not.

## Cadence

Monthly is enough. Also run it when a tool announces a major version, and always before
publishing a new bundle release.
