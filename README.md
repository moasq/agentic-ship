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
the AI** — a configured project, design system, database, auth, payments, deploy.
Agentic Ship is that setup in a repo you own, driven by the coding agent you already pay for.

## Quick start

```bash
npx github:moasq/create-agentic-ship my-app
cd my-app
pnpm dev
```

Keep the `github:` prefix — the installer ships from GitHub, not npm. Open the folder in
your coding agent and say what you want to build; it reads [AGENTS.md](AGENTS.md) and
follows the rules there. No demo app to delete.

## Install as a plugin

In Claude Code or Codex, the same repo installs as a plugin — canonical skills and a
pinned MCP catalog, one copy of every rule:

```text
/plugin marketplace add moasq/agentic-ship
/plugin install agentic-ship@agentic-ship
```

## What's wired

| You want | Ships with | You do |
| --- | --- | --- |
| A website | Next.js 16 · React 19 · Tailwind v4 · shadcn/ui · MagicUI | nothing |
| A database | Convex | run `npx convex dev` once |
| Sign in | Better Auth, wired — email + password, Google and GitHub, no screens | connect Convex |
| Payments | Stripe hosted checkout, webhook entitlement | `pnpm provider:login stripe`, then provision |
| Email | Resend | authorize, secrets only in Convex |
| Analytics | PostHog, proxied on your own origin | add the public key |
| Deploy | Netlify (`netlify.toml`) | `netlify init` then `netlify deploy --prod` |
| A blog that ranks | MDX + sitemap + metadata + OG image | write the article |

A fresh clone builds green with nothing connected. Providers connect one at a time
through resumable handoffs; credentials never enter chat, state, or the repo.

## Commands

| Command | Answers |
| --- | --- |
| `pnpm health` | is anything wrong — including what only the deployment knows, like a Stripe secret key with no webhook secret behind it |
| `pnpm verify` | is my work actually finished |
| `pnpm verify:full` | release gates: audit, unit tests, production browser suite |
| `pnpm heal` | can it fix itself (links, mirrors, lockfile), with proof |
| `pnpm onboard --host <host>` | which provider does this product still need |
| `pnpm provider:login <cli>` | authorize a vendor through its own browser OAuth |
| `pnpm preflight --prod` | am I actually ready to launch |

Provider keys are graded as **combinations**, not one at a time, because that is where
the damage lives: each key is individually valid while a secret key with no webhook
secret means the customer pays and never gets the plan. The checks read env *names* from
the connected deployment — never a value.

## Works with any agent

Claude Code, Codex (plugins + native adapters), Cursor (generated agents, MCP mirror,
hooks), Hermes (installable profile), and OpenClaw (repo as agent workspace; non-secret
template in `.openclaw/`). Windsurf, Cline, Copilot and Gemini CLI read `AGENTS.md` and
the plain-markdown skills directly. One authored rule set, generated adapters per host.

Host marks above are vendored, not hotlinked — provenance in
[.github/assets/hosts/credits.md](.github/assets/hosts/credits.md).

## Documentation

- [AGENTS.md](AGENTS.md) — every rule, in one file
- [.agents/skills/](.agents/skills) — procedures: product lifecycle, connections, UI, backend, security, testing, launch
- [.agents/agents/](.agents/agents) — five specialist role briefs, plus the vendor-generated Playwright trio

## License

[MIT](LICENSE) — built by [@moasq](https://github.com/moasq).
