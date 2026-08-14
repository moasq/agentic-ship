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
- **Skills** — procedures in [.agents/skills](.agents/skills): product lifecycle, connections, UI, visual QA, backend, security, testing, writing, launch.
- **Role briefs** — five specialist agents in [.agents/agents](.agents/agents), plus the vendor-generated Playwright trio.
- **A pinned MCP catalog** — [.mcp.json](.mcp.json): shadcn, MagicUI, and 21st.dev discovery plus Linear tracking, wired for every host.
- **Gates and connection handoffs** — Node scripts behind every `pnpm` command; credentials never enter chat, state, or the repo.
- **Generated host adapters** for Claude Code, Codex, Cursor, Hermes, and OpenClaw, synced from the one authored source.

A fresh copy verifies green with nothing connected; providers connect one at a time
through resumable handoffs.

## The agentic development stack

Every layer is chosen, pinned in [skills.lock.json](skills.lock.json), and verified by
gates. The kit's job is making an agent use them correctly together. The full
reasoning behind each pick lives in [docs/stack.md](docs/stack.md).

| Layer | Choice |
| --- | --- |
| Runtime | <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/stack/nodedotjs-dark.svg"><img alt="" src=".github/assets/stack/nodedotjs-light.svg" height="14"></picture> <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/stack/pnpm-dark.svg"><img alt="" src=".github/assets/stack/pnpm-light.svg" height="14"></picture> Node 20+ · pnpm — the only runtime any script assumes |
| Framework | <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/stack/nextdotjs-dark.svg"><img alt="" src=".github/assets/stack/nextdotjs-light.svg" height="14"></picture> <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/stack/react-dark.svg"><img alt="" src=".github/assets/stack/react-light.svg" height="14"></picture> <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/stack/typescript-dark.svg"><img alt="" src=".github/assets/stack/typescript-light.svg" height="14"></picture> Next.js 16 · React 19 · TypeScript |
| Styling | <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/stack/tailwindcss-dark.svg"><img alt="" src=".github/assets/stack/tailwindcss-light.svg" height="14"></picture> Tailwind v4, CSS-first — tokens in `globals.css`, no config file |
| Components | <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/stack/shadcnui-dark.svg"><img alt="" src=".github/assets/stack/shadcnui-light.svg" height="14"></picture> <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/stack/lucide-dark.svg"><img alt="" src=".github/assets/stack/lucide-light.svg" height="14"></picture> shadcn/ui structure · MagicUI motion · Aceternity primitives · 21st.dev sections · Lucide icons |
| State | RSC props first, then URL state, then Zustand 5 |
| Backend | <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/stack/convex-dark.svg"><img alt="" src=".github/assets/stack/convex-light.svg" height="14"></picture> Convex — schema, reactive functions, crons, file storage; functions are the API |
| Auth | <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/stack/betterauth-dark.svg"><img alt="" src=".github/assets/stack/betterauth-light.svg" height="14"></picture> Better Auth (exact-pinned) through the Convex adapter |
| Billing | <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/stack/stripe-dark.svg"><img alt="" src=".github/assets/stack/stripe-light.svg" height="14"></picture> Stripe through `@convex-dev/stripe` — hosted checkout, webhook-backed entitlement |
| Email | <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/stack/resend-dark.svg"><img alt="" src=".github/assets/stack/resend-light.svg" height="14"></picture> Resend through `@convex-dev/resend` — test-mode by default |
| Analytics | <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/stack/posthog-dark.svg"><img alt="" src=".github/assets/stack/posthog-light.svg" height="14"></picture> PostHog behind a first-party `/ingest` proxy; the CSP stays closed |
| Fonts | Self-hosted OFL faces, fetched by `pnpm font`, committed |
| Gates | <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/stack/vitest-dark.svg"><img alt="" src=".github/assets/stack/vitest-light.svg" height="14"></picture> Vitest contracts · Playwright capture · deterministic Node checks |
| Deploy | <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/stack/netlify-dark.svg"><img alt="" src=".github/assets/stack/netlify-light.svg" height="14"></picture> Netlify — the whole path is the terminal, `netlify.toml` is authoritative |
| Delivery | <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/stack/github-dark.svg"><img alt="" src=".github/assets/stack/github-light.svg" height="14"></picture> GitHub — `gh` CLI device-flow OAuth for repo, PRs, and CI |
| Tracking | <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/stack/linear-dark.svg"><img alt="" src=".github/assets/stack/linear-light.svg" height="14"></picture> Linear — hosted MCP mirrors the work queue so people watch progress |
| AI hosts | <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/hosts/claude-code-dark.svg"><img alt="" src=".github/assets/hosts/claude-code-light.svg" height="14"></picture> <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/hosts/codex-dark.svg"><img alt="" src=".github/assets/hosts/codex-light.svg" height="14"></picture> <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/hosts/cursor-dark.svg"><img alt="" src=".github/assets/hosts/cursor-light.svg" height="14"></picture> <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/hosts/hermes-dark.svg"><img alt="" src=".github/assets/hosts/hermes-light.svg" height="14"></picture> <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/hosts/openclaw-dark.svg"><img alt="" src=".github/assets/hosts/openclaw-light.svg" height="14"></picture> Claude Code · Codex · Cursor · Windsurf · Cline · Copilot · Gemini CLI · Hermes · OpenClaw |
| Tool catalog | 11 pinned MCP servers in [.mcp.json](.mcp.json), mirrored per host |
| Writing | Vendored docs handbook, humanizer pass, ADR doctrine — docs are gated prose |

Stack marks are vendored, not hotlinked — provenance in
[.github/assets/stack/credits.md](.github/assets/stack/credits.md). Zustand and
Playwright ship no mark in that set, so their rows stay text-only.

- ✅ **Pinned** — every version, registry, and MCP server locked in [skills.lock.json](skills.lock.json)
- ✅ **Gated** — `pnpm verify` is the definition of done on every completion, not a release ritual
- ✅ **Consent-first** — services connect through the vendor's own OAuth, and every connection is revocable
- ✅ **Offline-first** — a fresh copy verifies green with nothing connected

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

The wiki lives in [docs/](docs/) — one article per question:

- [What is the Agentic Ship stack?](docs/stack.md) — every layer and why it was picked
- [How do I go from empty folder to shipped product?](docs/getting-started.md)
- [How is the toolkit put together?](docs/architecture.md) — one rule, one home
- [How do service connections work?](docs/connections.md) — consent, receipts, revocation
- [How do I see what the agents are doing?](docs/tracking.md) — the work queue, Linear, GitHub
- [How are these docs written?](docs/writing.md) — the writing skills behind the prose

Reference material:

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
