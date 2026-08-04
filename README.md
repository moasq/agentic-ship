# ShipKit

An agent-ready Next.js frontend foundation. Design tokens that stop the generated look,
component rules your coding agent will actually follow, security headers on by default,
and seven skills — including one that keeps the bundle from going stale.

Built for people who already pay for a coding agent and would rather not also pay for a
hosted app builder.

## What this replaces

Hosted builders sell a **harness**, not a model — project scaffold, design system,
component library, deploy button, preview. This repo is that harness, built once, in a
repo you own.

| Hosted builder feature | Here |
| --- | --- |
| Project scaffold | this repo + `setup-health` |
| Design harness | `ui-system` + tokens in `globals.css` |
| Component generation | `component-picker` + shadcn / MagicUI MCP |
| Deploy button | your own host, your own repo |
| Credit meter | the coding subscription you already pay for |

**Honest version:** if you do not already pay for a coding agent, a hosted builder is
probably the better deal. This is for people who do.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 ·
shadcn/ui · MagicUI · Zustand 5 · pnpm.

## Quick start

```bash
pnpm install
pnpm setup:env
pnpm dev
```

Then check the setup:

```bash
pnpm health
```

Then, in your coding agent, run the `setup-health` skill. `pnpm health` covers what a
script can prove; the skill adds the live MCP probes, the registry checks and the build.
Both print a fallback for anything that fails.

## macOS, Linux, Windows

Every ShipKit command is a Node script behind a `pnpm` name, so all of them run the same
on all three. No WSL, no Git Bash, no admin rights, no OpenSSL.

| Command | Replaces |
| --- | --- |
| `pnpm setup:env` | `cp .env.example .env.local` |
| `pnpm link:skills` | `ln -s ../.agents/skills .claude/skills` |
| `pnpm sync:mcp` · `pnpm check:mcp` | `cp .mcp.json .cursor/mcp.json` |
| `pnpm secret` | `openssl rand -base64 32` |
| `pnpm health` | a pile of `grep -r` and `readlink` |

`pnpm install` runs `link:skills` and `sync:mcp` for you. The first matters more than it
looks: `.claude/skills` is a symlink, and a Windows `git clone` that cannot create
symlinks writes a **plain text file containing the path instead** — no error, skills
silently gone. The script detects that exact state and repairs it with a directory
junction, which needs no admin rights. Details:
`.agents/skills/setup-health/references/platform-notes.md`.

## Works with any agent

| Tool | Rules | Skills | MCP |
| --- | --- | --- | --- |
| Claude Code | `CLAUDE.md` → `@AGENTS.md` | `.claude/skills` symlink | `.mcp.json` + plugins |
| Codex | `AGENTS.md` native | same markdown files | global TOML — snippet in `references/agent-compatibility.md` |
| Cursor | `AGENTS.md` native | same markdown files | `.cursor/mcp.json` (committed mirror) |
| Windsurf / Cline / Copilot / Gemini CLI | `AGENTS.md` native | same markdown files | per-tool config, same `mcpServers` shape |

`.cursor/mcp.json` is generated from `.mcp.json` and never edited directly —
setup-health fails on drift. Claude plugins have documented non-Claude equivalents
(Convex MCP standalone + official rules; `node_modules/next/dist/docs/`; the official
`better-auth/skills` pack) in the same reference.

## Single source of truth

- `AGENTS.md` — the only place rules live. Read by Codex, Cursor, Copilot, Gemini CLI,
  Windsurf, Cline.
- `CLAUDE.md` — one line: `@AGENTS.md`. Claude Code reads the same rules.
- `.claude/skills` — a symlink to `.agents/skills`. One skills directory, both worlds.
- `.mcp.json` — all tool wiring, committed, so everyone gets the same setup on clone.
- `skills.lock.json` — provenance for every skill, server, and registry.

Instructions live in `AGENTS.md`. Procedures live in `.agents/skills/`. Tool wiring
lives in `.mcp.json`. Three kinds of file, three jobs, no overlap.

## Skills

| Skill | Use it when |
| --- | --- |
| `setup-health` | after install, after changing `.mcp.json`, or when generation misbehaves |
| `ui-system` | starting a project, changing the theme, or UI starts looking generated |
| `component-picker` | before adding any new piece of interface |
| `asset-pipeline` | adding images, illustrations, icons, or 3D |
| `frontend-security` | before shipping, after adding dependencies, after pasting code |
| `seo-blog` | writing an article or auditing a page's search surface |
| `convex-structure` | before writing backend code, adding a table, or wiring a component to data |
| `upstream-sync` | monthly, or when a tool ships a major version |

## MCP servers

| Server | Official | Notes |
| --- | --- | --- |
| [shadcn](https://ui.shadcn.com/docs/mcp) | yes | components from the official registry and any pinned registry |
| [next-devtools](https://nextjs.org/docs/app/guides/mcp) | yes | live build and runtime errors, plus version-accurate docs from `node_modules/next/dist/docs/` |
| [magicui](https://github.com/magicuidesign/mcp) | yes, MIT | animated components |
| [context7](https://github.com/upstash/context7) | yes | current docs for everything else |
| [21st](https://github.com/21st-dev/magic-mcp) | yes | **off by default** — remote server, needs an API key. Fallback: browse 21st.dev and paste the component prompt |

Every server checked by `setup-health` has a documented fallback. Nothing here strands
you because a hosted service is down.

## Official plugins

`.claude/settings.json` declares the plugin wiring, so Claude Code users get offered it
automatically when they trust the repo folder:

- **`nextjs@nextjs`** — Next.js's own plugin, shipped inside the
  [vercel/next.js repo](https://github.com/vercel/next.js/blob/canary/.claude-plugin/marketplace.json):
  Cache Components adoption, Partial Prefetching, and runtime verification against a
  running dev server.
- **`convex@claude-plugins-official`** — Convex's official plugin: the backend design
  skill, quickstart scaffolder, schema-builder, auth-setup, function-creator,
  migration-helper, the `convex-expert` subagent, a runtime-error monitor, and the
  Convex MCP server for live deployment introspection.

If the automatic offer does not appear (a known quirk), install them manually:

```
/plugin marketplace add vercel/next.js
/plugin install nextjs@nextjs
/plugin install convex@claude-plugins-official
```

Official Convex skills are **not** copied into this repo. They arrive through the
plugin and update themselves — that is `upstream-sync`'s philosophy applied by
delegation. `convex-structure` covers only what they cannot know: this repo's
conventions.

Also worth browsing in Anthropic's auto-registered `claude-plugins-official`
marketplace: the Context7 and frontend-design plugins. Optional — the `.mcp.json` in
this repo already covers the same ground without them.

shadcn, MagicUI, Tailwind, and Zustand have **no official plugins** — their official
integration is the MCP layer above. This repo does not bundle unofficial stand-ins;
that policy is recorded in `skills.lock.json`.

## Why the UI does not look AI-generated

Roughly ninety percent of the sameness in AI-built sites comes from four defaults, and
this repo overrides all four:

1. The untouched shadcn neutral palette → replaced with a deliberate one.
2. Inter, Geist, Space Grotesk, Poppins → banned as primary faces. Ships with IBM Plex.
3. `rounded-lg` everywhere → one chosen radius, `0.375rem`.
4. Violet-to-blue gradient on white → not present.

Swap the palette for your own with [tweakcn](https://tweakcn.com). Every shadcn and
MagicUI component inherits it automatically.

## Backend — Convex + Better Auth

Specced and rule-enforced; the scaffold is one command away because it needs a Convex
login, which is yours to do:

```bash
pnpm add convex@latest @convex-dev/better-auth
pnpm add better-auth@~1.6.15          # exact-range pin: the adapter lags majors
npx convex dev                         # opens a browser, creates/links the project
pnpm secret                            # prints a random secret — paste it below
npx convex env set BETTER_AUTH_SECRET <paste>
npx convex env set SITE_URL http://localhost:3000
```

Then run `setup-health` — its Convex section verifies the connection, attempts
`convex login` when it is missing, and falls back to the dashboard if that fails.

Also install Better Auth's **official skill pack** (`better-auth-best-practices`) via
the skills CLI — instructions at
[better-auth.com/docs/ai-resources/skills](https://better-auth.com/docs/ai-resources/skills).
It is not vendored here for the same reason the Convex skills aren't: official packs
stay current on their own. setup-health warns when it is missing; the exact ShipKit
wiring lives in `.agents/skills/convex-structure/references/better-auth-wiring.md`.

Why Better Auth over Convex Auth or Clerk: it is the community default, the
`@convex-dev/better-auth` bridge is first-party, organizations, 2FA and SSO ship as
plugins (so there is no later forced migration), and it is roughly 95% automatable by
an agent versus about 70% for Clerk, whose dashboard steps cannot be scripted. Convex
Auth is documented as the lighter alternative; Clerk as the choice when you want
someone else on-call for auth. Risks — the Vercel acquisition, adapter version lag, a
past DoS advisory — are recorded in `skills.lock.json` rather than glossed over.

Conventions that keep an agent from guessing: one file per domain in `convex/`,
CRUD-consistent function names, mandatory `args` and `returns` validators, identity
from the authenticated context and never from an argument, indexes over `.filter()`,
and a fixed data-access decision tree. All in
`.agents/skills/convex-structure/SKILL.md`.

## Security

Headers ship on: CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`, HSTS. Secrets rules, supply-chain rules, and the review checklist
for third-party component code are in `.agents/skills/frontend-security/SKILL.md`.

Two honest caveats are documented there: the CSP includes `'unsafe-inline'` for scripts
because Next's bootstrap requires it, and a strict CSP will break third-party embeds
until you add their origin explicitly.

## Staying current

Run the `upstream-sync` skill monthly. It diffs every vendored skill against its
upstream, checks MCP package versions, verifies registry URLs still resolve, flags
major bumps as breaking, and finishes by running `setup-health` to prove nothing broke.

A template is stale the day you download it. This one can update itself.

## License

MIT
