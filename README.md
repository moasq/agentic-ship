# Agentic Ship

[![CI](https://github.com/moasq/agentic-ship/actions/workflows/ci.yml/badge.svg)](https://github.com/moasq/agentic-ship/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

<p align="center">
  <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/hosts/claude-code-dark.svg"><img alt="Claude Code" src=".github/assets/hosts/claude-code-light.svg" height="30"></picture>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/hosts/codex-dark.svg"><img alt="Codex" src=".github/assets/hosts/codex-light.svg" height="30"></picture>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/hosts/cursor-dark.svg"><img alt="Cursor" src=".github/assets/hosts/cursor-light.svg" height="30"></picture>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/hosts/hermes-dark.svg"><img alt="Hermes" src=".github/assets/hosts/hermes-light.svg" height="30"></picture>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/hosts/openclaw-dark.svg"><img alt="OpenClaw" src=".github/assets/hosts/openclaw-light.svg" height="30"></picture>
</p>

Stop paying for Lovable, Bolt, v0 and Replit. Hosted builders sell the **setup around
the AI** — rules, design and backend conventions, connection and go-live gates. Agentic
Ship is that setup as a toolkit you own and drop into your own workspace, driven by the
coding agent you already pay for. No app is bundled to delete — the kit **directs and
verifies** the one your agent builds.

## Install

Run it from the project directory you want to adopt it in:

```bash
npx github:moasq/agentic-ship
```

Keep the `github:` prefix — it ships from GitHub, not npm. That copies the toolkit into
the current folder (existing files are skipped, never clobbered); then `pnpm install` and
open the folder in your agent. That's it. Say what you want to build; it reads
[AGENTS.md](AGENTS.md) and follows the rules there. Flags: `--force` overwrites,
`--merge` folds the `pnpm` scripts into an existing `package.json`, `--dry-run` previews.

**As a plugin.** In Claude Code or Codex the same repo installs as a plugin — canonical
skills and the pinned MCP catalog, one copy of every rule:

```text
/plugin marketplace add moasq/agentic-ship
/plugin install agentic-ship@agentic-ship
```

**From source**, to develop the toolkit itself:

```bash
git clone https://github.com/moasq/agentic-ship.git
cd agentic-ship && pnpm install && pnpm verify
```

## What's inside

A **tool-only** repository — no web app, database, deployment, or demo content. What it
delivers is the layer that makes an agent build those correctly:

- **One rule set** — [AGENTS.md](AGENTS.md) declares every rule; hosts that read it natively follow it directly.
- **Skills** — procedures in [.agents/skills](.agents/skills): product lifecycle, connections, UI, visual QA, backend, security, testing, launch.
- **Role briefs** — five specialist agents in [.agents/agents](.agents/agents), plus the vendor-generated Playwright trio.
- **A pinned MCP catalog** — [.mcp.json](.mcp.json): shadcn, MagicUI, and 21st.dev discovery, wired for every host.
- **Gates and connection handoffs** — Node scripts behind every `pnpm` command; credentials never enter chat, state, or the repo.
- **Generated host adapters** for Claude Code, Codex, Cursor, Hermes, and OpenClaw, synced from the one authored source.

A fresh copy verifies green with nothing connected; providers connect one at a time
through resumable handoffs.

## Commands

| Command | Does |
| --- | --- |
| `pnpm verify` | the offline definition of done — health + contracts + lint + build |
| `pnpm verify:full` | release gates: audit, unit tests, production browser suite |
| `pnpm test` | unit gate (vitest, in-memory) |
| `pnpm health` | is anything wrong — including what only the connected deployment knows |
| `pnpm heal` | deterministic repairs (links, mirrors, lockfile), with proof |
| `pnpm onboard --host <host>` | which provider this product still needs, or the next step |
| `pnpm connect` | begin, inspect, resume, or cancel safe service-connection receipts |
| `pnpm provider:login <cli>` | authorize a vendor through its own browser OAuth |
| `pnpm agent:work` | durable, dependency-aware work queue shared across hosts |
| `pnpm ui:plan <init\|check>` | create or validate the visual-direction contract |
| `pnpm ui:review <capture\|accept\|check>` | capture, accept, or verify visual evidence |
| `pnpm check:ui` | authored component boundaries, tokens, and visual evidence |
| `pnpm sync:mcp` · `pnpm check:mcp` | write / verify the `.cursor/mcp.json` mirror |
| `pnpm sync:agents` · `pnpm check:agents` | write / verify native host adapters |

## Works with any agent

Claude Code, Codex (plugins + native adapters), Cursor (generated agents, MCP mirror,
hooks), Hermes (installable profile), and OpenClaw (repo as agent workspace). Windsurf,
Cline, Copilot and Gemini CLI read [AGENTS.md](AGENTS.md) and the plain-markdown skills
directly. One authored rule set, generated adapters per host.

Host marks above are vendored, not hotlinked — provenance in
[.github/assets/hosts/credits.md](.github/assets/hosts/credits.md).

## Documentation

- [AGENTS.md](AGENTS.md) — every rule, in one file
- [.agents/skills/](.agents/skills) — procedures: product lifecycle, connections, UI, backend, security, testing, launch
- [.agents/agents/](.agents/agents) — five specialist role briefs, plus the vendor-generated Playwright trio
- Visual direction — the planning procedure in
  [.agents/skills/visual-direction/SKILL.md](.agents/skills/visual-direction/SKILL.md), its
  [anti-slop rubric](.agents/skills/visual-direction/references/anti-slop-rubric.md),
  [reference sources](.agents/skills/visual-direction/references/sources.md) and
  [real-site gallery](.agents/skills/visual-direction/references/real-site-gallery.md), with
  [.agents/ui/plan.example.json](.agents/ui/plan.example.json) as the worked plan
- Visual review — the acceptance policy in
  [.agents/skills/visual-qa/references/review-policy.md](.agents/skills/visual-qa/references/review-policy.md)

## License

[MIT](LICENSE) — built by [@moasq](https://github.com/moasq).
