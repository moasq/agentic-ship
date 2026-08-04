---
name: setup-health
description: Verify every ShipKit connection — MCP servers, registries, version pins, design tokens, fonts, env hygiene — and print a health table with a fallback for every failure. Run after install, after changing .mcp.json, or whenever generation starts misbehaving.
---

# ShipKit Health Check

Run **every** check. Never stop at the first failure — collect all results, then print
one table at the end. A failed connection must always come with a fallback, because the
buyer must never be stranded by someone else's outage.

## 1. Toolchain and version pins

- `node -v` → need >= 20. FAIL → install via mise or nvm.
- `pnpm -v` → need >= 9. FAIL → `corepack enable`.
- Compare `package.json` majors against `skills.lock.json` → `pins`:
  `next 16.x` · `react 19.x` · `tailwindcss 4.x` · `zustand 5.x`
  Drift → run the `upstream-sync` skill. Do not hand-edit versions.
- `tailwind.config.js` or `tailwind.config.ts` must **not** exist. Tailwind v4 is
  CSS-first; a config file is a training-data fossil. Found → flag it and let the
  `ui-system` skill migrate its contents into the `@theme` block in `globals.css`.

## 2. Single source of truth

- `CLAUDE.md` must contain exactly `@AGENTS.md` (the import pattern Next.js itself
  ships), or be a symlink resolving to `AGENTS.md`. FAIL → restore it; never let the
  two files hold separate copies of the rules.
- `.claude/skills` must resolve to `../.agents/skills`.
  Check with `readlink .claude/skills`. FAIL → `ln -s ../.agents/skills .claude/skills`.
- `AGENTS.md` still contains the ShipKit rules block **and** the Next.js rules block.

## 3. MCP servers

For each entry in `.mcp.json`:

- **Listed?** `claude mcp list` (or the equivalent for the harness in use).
- **Alive?** Call one cheap, read-only tool on each:

| Server | Probe | Fallback if dead |
| --- | --- | --- |
| `shadcn` | list registries | `npx shadcn@latest add <component>` by hand |
| `next-devtools` | get build errors | read `node_modules/next/dist/docs/`; watch the dev-server terminal |
| `magicui` | list components | install through the `@magicui` registry pinned in `components.json` |
| `context7` | resolve `zustand` | open the official docs in a browser; pin exact versions in prompts |
| `21st` *(optional, off by default)* | search `button` | browse 21st.dev, copy the component's install prompt — works with zero setup |

The `21st` server is a **remote** server needing `TWENTYFIRST_API_KEY`.
Missing key or 401 → report **WARN, not FAIL**. It is optional by design.

Per-connection detail — probes, failure meanings, upstream links:
`references/connections.md`.

**Cross-tool mirror check:** `.cursor/mcp.json` must contain the same servers as
`.mcp.json` (it is a generated mirror for Cursor — same `mcpServers` shape). Drift →
regenerate the mirror from `.mcp.json`; never edit the mirror directly. Codex uses a
global TOML instead — snippet and the full per-tool matrix in
`references/agent-compatibility.md`.

## 4. Registries

- `components.json` parses as JSON.
- Every URL under `registries` returns HTTP 200 (`@magicui` by default).
- FAIL → report it and stop using that registry. **Never** silently hand-write a
  substitute component: that is exactly how a bundle drifts away from upstream.

## 5. Design system

- `src/app/globals.css` contains the `@theme` block and the ShipKit token layer.
- Fonts: `src/app/layout.tsx` loads the project faces through `next/font`.
  Banned as primary faces — Inter, Geist, Space Grotesk, Poppins. If one of these is
  the body or display face, flag it; that is the single loudest "AI generated this
  site" signal there is.
- No raw hex values or Tailwind arbitrary values (`text-[#fff]`) in `src/components`
  or `src/app`. Grep for them. Found → they must become tokens.

## 6. Environment hygiene (frontend)

- `.env.local` exists (copy from `.env.example` if not).
- `.env*` is gitignored, `.env.example` is not.
- Grep client components for `process.env`: only `NEXT_PUBLIC_*` may appear there.
  Anything else is a leaked secret — treat as CRITICAL.
- `pnpm audit --prod` reports no high or critical advisories.

## 7. Convex backend

Skip this whole section with `SKIPPED — phase 1 only` if `convex/` does not exist.

**7.1 Present**

- `convex/schema.ts` exists, and `convex/_generated/` is committed.
- `.env.local` has `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, and
  `NEXT_PUBLIC_CONVEX_SITE_URL`.

**7.2 Connected? — try to fix it, in this order**

Run `npx convex dev --once`. If it fails, attempt each step and re-test:

1. `npx convex dev --once` — writes env vars when the project already exists.
2. `npx convex login` — **this opens a browser and needs the human.** Say so out loud
   and wait. Do not spin or retry silently.
3. `npx convex dev --once` again — offers to create or link a project.

Still failing → **FALLBACK:** create or link the project by hand at
`dashboard.convex.dev`, paste the deployment name into `.env.local`, re-run step 1.
Reference: `docs.convex.dev/quickstart`.

**7.3 Convex MCP**

The Convex MCP server arrives with the `convex@claude-plugins-official` plugin. Probe
it with a cheap read (list tables).

- Plugin not installed → `/plugin install convex@claude-plugins-official`.
- Plugin present but MCP dead → **FALLBACK:** `npx convex mcp start` standalone, or use
  `dashboard.convex.dev` for introspection. Neither blocks development.

**7.4 Auth — Better Auth via `@convex-dev/better-auth`**

- `convex/auth.config.ts` exists. **Missing while auth code exists → CRITICAL**: this
  exact file is the most common cause of "works locally, 401s in production."
- `npx convex env list` shows `BETTER_AUTH_SECRET` and `SITE_URL`.
- Those two names must **not** appear in `.env.local` — the leak check runs both
  directions.
- Installed `better-auth` matches the `~1.6.x` pin in `skills.lock.json`. The adapter
  lags Better Auth majors; drift → run `upstream-sync`, never a blind bump.
- `src/app/api/auth/[...all]/route.ts` exists — without it the proxy is dead and every
  sign-in fails with no useful error.
- **Official Better Auth skills installed?** The `better-auth/skills` pack
  (`better-auth-best-practices`) should be visible to the agent. Missing → WARN with
  the install pointer: https://better-auth.com/docs/ai-resources/skills
  Fallback: https://better-auth.com/llms.txt pasted into context. Details:
  `references/connections.md` § Better Auth.

## 8. Build proof

- `pnpm build` completes. This is the only check that proves the others were real.

## Output format

Print one table, then a verdict line:

```
| check | status | fix or fallback |
|-------|--------|-----------------|
| node >= 20                | PASS |  |
| 21st MCP key              | WARN | optional — browse 21st.dev and paste the prompt |
| ...                       |      |  |
```

End with exactly one of:

- `HEALTHY — all checks passed.`
- `DEGRADED — N issues. Fallbacks listed above; the project still builds.`
- `BROKEN — N critical issues. Fix before continuing.`

Critical means: leaked secret, failed build, or missing single source of truth.
