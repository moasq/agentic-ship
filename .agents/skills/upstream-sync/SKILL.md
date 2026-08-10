---
name: upstream-sync
description: Check every vendored skill, MCP server, registry, and version pin against its official upstream; report drift; apply clean updates; three-way merge anything patched. Run monthly, or when a tool ships a major version.
---

# Upstream Sync

> Downstream contract: paths like `src/` and `convex/` refer to the product workspace that adopts Agentic Ship, not this tool repo.

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
- Remote servers (stripe, resend, posthog, 21st) → confirm the documented URL
  and auth scheme still match what is in `.mcp.json`. Vendors do migrate; that is
  exactly how the old Magic MCP configuration went stale. For 21st, `GET
  /.well-known/oauth-protected-resource/api/mcp` must still return an authorization
  server — that metadata is what lets the host authorize by browser instead of by key,
  and losing it silently would put an API key back in the buyer's hands.

## 3. Registries

Every URL under `registries` in both `components.json` and `skills.lock.json` must
return HTTP 200. A dead registry is reported, never quietly replaced with hand-written
components.

## 3b. Vendor knowledge

The bundle can go stale in a way no version pin catches: a vendor starts publishing an
official skill, and this repo never notices because nothing was ever tracking the
question. `vendorKnowledge` in `skills.lock.json` is that tracker — one entry per
component vendor recording its live knowledge sources, whether it ships an installable
skill, and the decision taken. Each cycle:

- Re-run the discovery, do not trust the recorded answer: `21st skills catalog`,
  `npx shadcn@<pin> --help` (look for a `skills` command), and the MagicUI repo and npm
  org for a skill package.
- **A vendor that has started shipping a first-party skill is a finding.** Report it and
  propose adopting it — that is the whole reason this section exists.
- A recorded `decision` of DECLINED is re-examined against its stated reasons, not
  carried forward on authority. If the reasons no longer hold, the decision reopens.
- Update `verified` whether or not anything changed. An unchanged date is how a skipped
  check hides.

Two standing constraints when adopting any vendor skill:

- **It must not need a runtime beyond Node.** A skill that shells out to Python or Ruby
  breaks the buyer who does not have it, and AGENTS.md makes Node the only assumed
  runtime.
- **It must not restate a rule this repo already declares.** A vendor design skill that
  ships its own token, palette or typography doctrine collides with `ui-system`, which
  AGENTS.md makes the single home for that. Two homes for one rule is the bug.

Vendor skill installers generally refuse to write through `.claude/skills`, because it
is a symlink to `.agents/skills`. That is the layout working as designed, not a fault to
route around: install such a skill globally from outside the project, or not at all.

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
