# Agentic Ship

Agentic Ship is a tool-only repository for directing and verifying AI-assisted product
work. It intentionally contains **no web application, product routes, database,
deployment configuration, demo content, or screenshots**.

Use it as a plugin or copy its guidance into the product repository you are building.
The tool provides one canonical set of rules, skills, contracts, agent briefs, MCP
wiring, visual-direction and visual-QA procedures, durable work coordination, and
connection handoffs across Codex, Claude Code, Cursor, Hermes, and OpenClaw.

## Use

```bash
pnpm install
pnpm verify
```

For a product workspace, use the relevant skills before changing it:

```bash
pnpm agent:work
pnpm connect status
pnpm ui:plan init
pnpm ui:review capture --base-url <local-url>
```

The UI commands are project-targeted: they become applicable only when a downstream
product contains authored UI and an approved visual plan. A tool-only checkout reports
them as not applicable rather than inventing an example application.

## What remains here

- [AGENTS.md](AGENTS.md): canonical cross-host doctrine.
- [.agents/skills](.agents/skills): implementation, security, product, visual, and QA procedures.
- [.agents/contracts](.agents/contracts): product, feature, input, visual-plan, and visual-review schemas.
- [.agents/agents](.agents/agents): canonical role briefs; generated adapters live in the host folders.
- [scripts](scripts): Node-only health, verification, synchronization, connection, and review tools.
- [.mcp.json](.mcp.json): pinned component and research-tool catalog.
- [visual direction](.agents/skills/visual-direction/SKILL.md), [anti-slop rubric](.agents/skills/visual-direction/references/anti-slop-rubric.md), [research sources](.agents/skills/visual-direction/references/sources.md), and [real-site gallery](.agents/skills/visual-direction/references/real-site-gallery.md): project-facing UI guidance.
- [visual-plan example](.agents/ui/plan.example.json) and [visual-QA policy](.agents/skills/visual-qa/references/review-policy.md): portable plan and review evidence formats.

## Verification

```bash
pnpm health
pnpm check:agents
pnpm check:mcp
pnpm check:ui
pnpm verify
pnpm verify:full
```

`pnpm verify` proves the tool itself is coherent. It deliberately does not start,
build, deploy, or test a website because none is bundled here.
