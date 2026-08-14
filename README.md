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

## Features

A **tool-only** repository: no web app, database, deployment, or demo content is
bundled. What ships is the layer that makes your agent build those correctly — declared
rules, procedures, role briefs, and gates, with every integration below wired as a seam
the product code consumes. No provider is required to start: a fresh copy verifies
green with nothing connected, and each service joins later through its vendor's own
OAuth, one resumable handoff at a time.

| Integration | Provider | What ships |
| --- | --- | --- |
| Backend | Convex | schema, reactive queries, crons, file storage; functions are the API |
| Auth | Better Auth | email + password wired; Google and GitHub sign-in switch on when both of a provider's keys land |
| Billing | Stripe | hosted checkout, webhook-backed entitlement, test-mode provisioning from the CLI |
| Email | Resend | transactional sends enqueued inside the calling transaction; test-mode by default |
| Analytics | PostHog | typed events behind a first-party `/ingest` proxy; the CSP stays closed |
| Deploy | Netlify | the whole path in the terminal: init, env, deploy; `netlify.toml` is authoritative |
| Delivery | GitHub | repo, PRs, and CI through `gh` device-flow OAuth |
| Tracking | Linear | optional hosted MCP mirrors the work queue into a project people can watch |
| Components | shadcn/ui · MagicUI · Aceternity · 21st.dev · Lucide | shadcn, MagicUI, and Aceternity are keyless; 21st.dev is a free OAuth; discovery runs through pinned MCP servers |
| Fonts | OFL faces | self-hosted, fetched and committed by `pnpm font`; no build-time Google Fonts egress |
| SEO / AEO | — | metadata from one identity file, sitemap, llms.txt, OG image as code, MDX blog pipeline |
| Design system | — | visual-direction plan (`pnpm ui:plan`), design tokens, motion budget, fail-closed visual evidence (`pnpm ui:review`) |
| Testing | Vitest · Playwright | unit contracts, e2e smoke, browser capture, CI workflow; `pnpm check:ui` guards component boundaries |
| Security | — | closed CSP, secret-handling rules, production preflight; `pnpm verify:full` adds the fail-closed dependency audit before a release |
| Agents | 5 roles · 9 hosts | role briefs plus the Playwright trio; generated adapters for Claude Code, Codex, Cursor, Hermes, OpenClaw; AGENTS.md for the rest |
| Writing | — | vendored docs handbook, humanizer pass, README doctrine, plain-language audit |

- ✅ **Pinned** — every version, registry, and MCP server locked in [skills.lock.json](skills.lock.json)
- ✅ **Gated** — `pnpm verify` is the definition of done on every completion, not a release ritual
- ✅ **Consent-first** — services connect through the vendor's own OAuth, and every connection is revocable
- ✅ **Offline-first** — a fresh copy verifies green with nothing connected

Why each layer was picked: [docs/stack.md](docs/stack.md).

### Not wired yet, and what a swap costs

Opinionated does not mean stuck. Every provider sits behind a seam you own, so the
honest question is not "is it supported" but how much code a swap touches:

| Want instead | Wired today | Swap cost |
| --- | --- | --- |
| Vercel, Cloudflare | Netlify | small — the deploy seam is `netlify.toml`, one build command, one doc; product code never names the host |
| Plausible, Umami | PostHog | small — `src/lib/analytics.ts` is the only file that imports the SDK |
| Postmark, SendGrid | Resend | medium — `convex/email.ts` is the only sender, but the Convex component and its webhook go with it |
| Polar, Lemon Squeezy | Stripe | medium — checkout and portal are one seam; entitlement rides the `@convex-dev/stripe` component |
| Clerk, Auth.js | Better Auth | medium — session truth is one query behind `requireUser`, but the Convex adapter is load-bearing |
| Supabase, Postgres + Prisma | Convex | large — Convex is the spine; the auth, billing, and email components all ride it. Swapping it means rebuilding those seams |

That last row is this kit's own lock-in, stated plainly. The difference from a hosted
builder: all of it is MIT-licensed code in your repo, so the exit is a refactor you can
run, not an export you buy.

## How it compares

Hosted builders are real products, and the running app they put in a browser tab within
minutes is a real advantage. The table shows what that convenience costs, and what a
toolkit in your own repo does that a rented builder cannot.

Compared against the shipping versions as of August 2026: Lovable with Lovable Cloud
and Build mode, Bolt V2 with Bolt Cloud, the rebuilt v0 platform (February 2026),
Base44 under Wix, and Replit Agent 3. Where they improved, the table says so. Marks
come from each vendor's public docs and product pages; if a cell is wrong or stale,
open an issue — the table only works if it stays true.

✅ yes · ⚠️ partial · ❌ no

| | Agentic Ship | Lovable | Bolt.new | v0 | Base44 | Replit |
| --- | --- | --- | --- | --- | --- | --- |
| Open source | ✅ MIT | ❌ | ❌ | ❌ | ❌ | ❌ |
| Cost | ✅ $0 forever — MIT, drives the agent subscription you already have | ⚠️ free daily credits, then paid credit plans | ⚠️ free monthly tokens, then paid token plans | ⚠️ free monthly credits, then paid plans | ⚠️ free messages, then paid plans; export needs one | ⚠️ free starter credits, then paid credit plans |
| Bring your own coding agent | ✅ any of nine hosts, swap anytime | ❌ built-in agent | ⚠️ pick the model (Claude, GPT, Gemini); the agent is theirs | ❌ built-in agent and model | ❌ built-in agent | ❌ built-in agent |
| Code lives in your git repo | ✅ from the first commit, no platform copy | ✅ two-way GitHub sync | ⚠️ one-way export to GitHub | ✅ native GitHub: branches, PRs, existing repos | ❌ one-way push, on a paid tier | ⚠️ export to GitHub |
| Take everything with you when you leave | ✅ nothing to leave; the repo is the product | ⚠️ code exports; Lovable Cloud Postgres and auth migrate by hand | ⚠️ code exports; Bolt Cloud DB, auth, and hosting are rebuilt elsewhere | ⚠️ standard Next.js exports clean; previews and deploys assume Vercel | ❌ front end exports on a paid tier; the backend stays behind their SDK | ⚠️ code exports; DB, auth, and hosting are Replit services you rebuild |
| Self-host anywhere | ✅ any Node host | ⚠️ after export | ⚠️ after export | ⚠️ after export | ❌ their runtime only | ⚠️ after export |
| Backend built from parts you can hire for | ✅ Convex · Better Auth · Stripe, named and pinned in your repo | ⚠️ Supabase, run by them | ⚠️ Postgres via Bolt Cloud, run by them | ⚠️ your own integrations | ❌ proprietary | ⚠️ Postgres and auth, run by them |
| Definition of done you own | ✅ `pnpm verify` in your repo and CI: contracts, tests, visual evidence | ❌ checks run in their pipeline | ❌ checks run in their pipeline | ❌ checks run in their pipeline | ❌ checks run in their pipeline | ⚠️ Agent 3 self-tests in a real browser — thorough, but in their pipeline |
| Security gates before going live | ✅ dependency audit, closed CSP, production preflight | ✅ auto scan on publish, deep scan on demand | ❌ | ❌ | ❌ | ❌ |
| Enforced design direction per product | ✅ written plan, tokens, review gates | ⚠️ polished house style, no per-product contract | ❌ | ⚠️ strong defaults, one recognizable look | ❌ | ❌ |
| Secrets stay between you and the vendor | ✅ vendor OAuth, hidden terminal input | ⚠️ encrypted, held on their platform | ⚠️ encrypted, held on their platform | ⚠️ encrypted, held on their platform | ⚠️ encrypted, held on their platform | ⚠️ encrypted, held on their platform |
| Zero install, runs in a browser | ❌ needs a terminal | ✅ | ✅ | ✅ | ✅ | ✅ |
| Shareable hosted preview in minutes | ❌ you deploy it | ✅ | ✅ | ✅ | ✅ | ✅ |
| Built for non-developers | ❌ assumes a coding agent | ✅ | ✅ | ✅ | ✅ | ✅ |
| Native mobile output | ❌ web only | ❌ web only | ✅ Expo | ❌ web only | ✅ iOS builds | ⚠️ Expo via templates |

Two fairness notes on cost. The free tiers are real, and fine for a weekend test — but
building a product burns through them, and that is where the paid plans begin. And
hosted credits include the model usage, so a builder is only a second subscription when
an agent subscription already exists — which is exactly who this kit is for. The last
four rows are a real recommendation: if
you will never open a terminal, or you want a phone app from a single prompt, a hosted
builder is the better buy. This kit is for the other case — a coding agent is already
open, and the product has to outlive the demo with owned code, a portable backend, and
a definition of done you can run yourself.

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

- [AGENTS.md](AGENTS.md) — every rule and every `pnpm` command, in one file
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
