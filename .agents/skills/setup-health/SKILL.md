---
name: setup-health
description: Verify every ShipKit connection — MCP servers, registries, version pins, design tokens, fonts, env hygiene — and print a health table with a fallback for every failure. Starts with `pnpm health`, which runs identically on macOS, Linux and Windows. Run after install, after changing .mcp.json, or whenever generation starts misbehaving.
---

# ShipKit Health Check

Run **every** check. Never stop at the first failure — collect all results, then print
one table at the end. A failed connection must always come with a fallback, because the
buyer must never be stranded by someone else's outage.

## 0. Run the machine checks first

```bash
pnpm health
```

That one command covers sections 1, 2, 5 and 6 below and prints them in the output
format at the bottom of this file. It is a Node script, so it behaves identically on
macOS, Linux and Windows.

**Never substitute a shell command for it.** `readlink`, `grep`, `cp` and `openssl` do
not exist on a stock Windows machine, and a check that silently no-ops there is worse
than no check. Sections 1, 2, 5 and 6 document what `pnpm health` verifies, so you can
read a failure without reading the script. The command table for every platform:
`references/platform-notes.md`.

Sections 3, 4, 7 and 8 need judgment or a network, so you run them yourself.

## 1. Toolchain and version pins — `pnpm health`

- Node >= 20. FAIL → install via mise, nvm, fnm, or nvm-windows.
- pnpm >= 9. FAIL → `corepack enable`.
- `package.json` majors against `skills.lock.json` → `pins`:
  `next 16.x` · `react 19.x` · `tailwindcss 4.x` · `zustand 5.x`
  Drift → run the `upstream-sync` skill. Do not hand-edit versions.
- `tailwind.config.*` must **not** exist. Tailwind v4 is CSS-first; a config file is a
  training-data fossil. Found → let the `ui-system` skill migrate its contents into the
  `@theme` block in `globals.css`.

## 2. Single source of truth — `pnpm health`

- `CLAUDE.md` contains exactly `@AGENTS.md` (the import pattern Next.js itself ships).
  FAIL → restore it; never let the two files hold separate copies of the rules.
- `.claude/skills` resolves to `.agents/skills`. FAIL → `pnpm link:skills`.
  On Windows this is created as a **directory junction**, not a symlink — junctions need
  no admin rights. A `git clone` there can also leave a plain text file where the link
  should be; `pnpm link:skills` detects that exact case and repairs it. Why it happens:
  `references/platform-notes.md`.
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
| `convex` | status | needs a connected deployment — before `npx convex dev` this is a STAGE, not a failure. Fallback: dashboard.convex.dev |
| `stripe` *(remote, OAuth)* | list products | Stripe dashboard; the CLI on an unclaimed sandbox — Stripe's own guidance |
| `resend` *(remote, OAuth)* | list domains | Resend dashboard |
| `posthog` *(remote, OAuth)* | list projects | PostHog dashboard |
| `render` *(remote, OAuth)* | list services | Render dashboard + `render.yaml` is the truth anyway |

Remote servers authenticate with a browser OAuth on first use — that is a **human step**;
say so and wait. In Claude Code the vendor plugins carry namespaced copies of these same
servers; seeing both is expected, not drift.

The `21st` server is a **remote** server needing `TWENTYFIRST_API_KEY`.
Missing key or 401 → report **WARN, not FAIL**. It is optional by design.

Per-connection detail — probes, failure meanings, upstream links:
`references/connections.md`.

**Cross-tool mirror check:** `pnpm check:mcp` — `.cursor/mcp.json` must be byte-identical
to `.mcp.json` (it is a generated mirror for Cursor, same `mcpServers` shape). Drift →
`pnpm sync:mcp`; never edit the mirror directly. Codex uses a global TOML instead —
snippet and the full per-tool matrix in `references/agent-compatibility.md`.

**On Windows**, a server that is listed but never connects is usually the `npx` launcher,
not the server. Fix and caveats: `references/platform-notes.md`.

## 4. Registries

- `components.json` parses as JSON.
- Every URL under `registries` returns HTTP 200 (`@magicui` by default).
- FAIL → report it and stop using that registry. **Never** silently hand-write a
  substitute component: that is exactly how a bundle drifts away from upstream.

## 5. Design system — `pnpm health`

- `src/app/globals.css` contains the `@theme` block and the ShipKit token layer.
- Fonts: `src/app/layout.tsx` loads the project faces through `next/font/local`, from
  files committed under `src/fonts/ofl/`. Banned as primary faces — Inter, Geist,
  Space Grotesk, Poppins. Only what is actually **loaded** counts; naming one in a
  comment is not a violation. The check reads both shapes — `next/font/google` named
  imports and the `src:` paths of a local font — because a face can arrive either way.
  A banned face is the single loudest "AI generated this site" signal there is.
- `next/font/google` in `layout.tsx` is a WARN, not a style opinion: it fetches the face
  during `next build`, so the build fails on any host without egress. Self-host with
  `pnpm font --ofl "<Family>" <weights>`. See `references/font-pairings.md` in
  `ui-system` for the licence split (OFL committed, Fontshare gitignored).
- No raw hex values or Tailwind arbitrary values (`text-[#fff]`) in `src/` or `content/`,
  outside vendor-owned `components/ui/`. Found → they must become tokens.

Then judge by eye what a script cannot: does the page look like every other AI-built
site? That question belongs to the `ui-system` skill.

## 6. Environment hygiene (frontend) — `pnpm health`

- `.env.local` exists. Missing → `pnpm setup:env`.
- `.env*` is gitignored, `.env.example` is not.
- Client components (`"use client"`) may reference only `NEXT_PUBLIC_*` under
  `process.env`. Anything else is a leaked secret — CRITICAL.

Secret **placement** is checked unconditionally — backend secrets in `.env.local`, any
`sk_live`/`rk_live` there, and any `phx_` PostHog personal key anywhere in the repo, all
CRITICAL. These used to be nested under the Convex and analytics sections, which meant
deleting a seam silently disabled the corresponding scan and still reported PASS. Gate a
check on the thing it measures, never on a seam that happens to sit near it: reporting
whether a service is connected is conditional; scanning for a credential in the wrong
file never is.

Run separately, because it needs the network:

- `pnpm audit --prod` reports no high or critical advisories.

## 7. Convex backend — `pnpm health`, then `pnpm onboard`

Skip this whole section with `SKIPPED — frontend only` if `convex/` does not exist.

**7.1 Not connected is a STAGE, not a failure**

The backend ships as source. `convex/_generated/` does not, because only
`npx convex dev` can produce it and that command opens a browser. Connecting is the
buyer's manual step.

So on a fresh clone, all of this is expected and must be reported as **WARN**:

- `CONVEX_DEPLOYMENT` / `NEXT_PUBLIC_CONVEX_URL` missing from `.env.local`
- `convex/_generated/` missing
- `src/lib/convex-api.ts` still exporting `anyApi` instead of the generated `api`

`pnpm build` must still be green in that state. If it is not, that is the real bug.

**7.2 Onboard the human — never attempt the login yourself**

`pnpm onboard` prints the sequence, marks where they are, and gives the one next
command. Read it out and stop at the human step:

1. `pnpm add convex@latest`
2. backend source — ships with ShipKit
3. **`npx convex dev`** — opens a browser, creates or links the project, writes the env
   vars, generates `_generated/`. **Say out loud that this one needs them. Then wait.**
   Do not spin, do not retry, do not try `convex login` on their behalf.
4. commit `convex/_generated/`
5. swap the one line in `src/lib/convex-api.ts` to the generated `api`

Login failing → **FALLBACK:** create or link the project by hand at
`dashboard.convex.dev`, paste the deployment name into `.env.local`, re-run step 3.
Reference: `docs.convex.dev/quickstart`.

**Never** fabricate, stub, or hand-write `convex/_generated/` to make a check pass. A
stub typechecks and then lies about the shape of every function.

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
- Installed `better-auth` is **exactly `1.6.15`** — the pin in `skills.lock.json` is
  exact, not a range: 1.6.25 sits inside `~1.6.15` and still breaks the adapter's
  types (proven, heal-ledger.md). `pnpm health` enforces it; drift → run
  `upstream-sync`, never a blind bump.
- `src/app/api/auth/[...all]/route.ts` exists — without it the proxy is dead and every
  sign-in fails with no useful error.
- **Official Better Auth skills installed?** The `better-auth/skills` pack
  (`better-auth-best-practices`) should be visible to the agent. Missing → WARN with
  the install pointer: https://better-auth.com/docs/ai-resources/skills
  Fallback: https://better-auth.com/llms.txt pasted into context. Details:
  `references/connections.md` § Better Auth.

**7.5 Billing — Stripe via `@convex-dev/stripe`**

Full flow, rules R1–R8, and the acceptance test:
`.agents/skills/convex-structure/references/stripe-billing.md`.

- `pnpm health` covers the static half: Stripe secrets or `STRIPE_PRICE_*` in
  `.env.local` → CRITICAL; any `sk_live`/`rk_live` there → CRITICAL.
- `npx convex env list` shows `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and one
  `STRIPE_PRICE_*` per plan in `convex/billing.ts` → else WARN with the `pnpm onboard`
  pointer. Not-configured is a stage, not a failure.
- The webhook endpoint is the component's: `<deployment>.convex.site/stripe/webhook`.
  Local testing goes through `stripe listen --forward-to` that URL — never a
  hand-rolled receiver.
- **Stripe plugin** (`stripe@claude-plugins-official`) declared in
  `.claude/settings.json`; its MCP is remote OAuth (`mcp.stripe.com`) — no key check
  applies. On an unclaimed `stripe sandbox create` environment, probe the CLI
  (`stripe whoami --format json`), not the MCP — Stripe's own guidance.
- Acceptance: a `4242 4242 4242 4242` checkout flips `api.billing.getEntitlement`
  with no reload. Anything else is not a working billing setup.

## 8. Build proof

- `pnpm verify` — health, lint and build in one command. This is the only check that
  proves the others were real, and it is the same command the Claude Code `Stop` hook
  runs before allowing a task to be called complete.

## References

- `references/platform-notes.md` — **read before writing any command.** macOS / Linux /
  Windows differences, and the one-to-one table of what to write instead of `cp`, `ln`,
  `readlink`, `grep` and `openssl`.
- `references/connections.md` — per-connection probes, failure meanings, fallbacks.
- `references/agent-compatibility.md` — per-tool matrix, Codex TOML, plugin equivalents.

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
