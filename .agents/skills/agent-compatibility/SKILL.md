---
name: agent-compatibility
description: This skill should be used when the user asks to "configure Claude, Codex, Cursor, Hermes, or OpenClaw", "sync agent adapters", "check agent portability", "add an MCP server for every host", or diagnose why rules, skills, subagents, hooks, or OAuth-backed tools behave differently across AI coding hosts.
---

# Agent compatibility

Preserve one authored system and generate only the host syntax needed to expose it.
Treat a native adapter as delivery machinery, never as a second home for doctrine.

## Keep the canonical layer singular

Use these sources as the authority:

| Concern | Canonical source |
| --- | --- |
| repository rules | `AGENTS.md` |
| procedures | `.agents/skills/*/SKILL.md` |
| dispatch roles | `.agents/agents/*.md` |
| MCP inventory | `.mcp.json` |
| product and handoff contracts | `.agents/contracts/` |

Change the canonical source first. Regenerate an adapter after the source change.
Never repair drift by editing a generated Claude plugin, Codex, Cursor, Hermes, or OpenClaw file directly.
Never restate an `AGENTS.md` rule inside an adapter or skill.

## Synchronize native adapters

Run the write pass after changing a canonical role or `.mcp.json`:

```text
pnpm sync:agents
```

Run the read-only drift check after install and before completion:

```text
pnpm check:agents
```

Run the MCP mirror check separately:

```text
pnpm check:mcp
```

Treat any generated-file drift as a local configuration defect. Re-run the matching
sync command; do not copy content by hand. Run `pnpm health` afterward to check the
rest of the static workspace contract.

## Use the native surface for each host

| Host | Rules and skills | Native roles | MCP and enforcement |
| --- | --- | --- | --- |
| Claude Code | `CLAUDE.md` imports `AGENTS.md`; `.claude/skills` resolves to `.agents/skills` | `.claude/agents` resolves to canonical roles in-project; generated top-level `agents/` ships the plugin roles | `.mcp.json`; plugin wiring and the completion hook live in `.claude/settings.json` |
| Codex | reads `AGENTS.md` and project skills | generated `.codex/agents/*.toml` | generated project-scoped `.codex/config.toml`, including direct MCP URLs |
| Cursor | reads `AGENTS.md` and Agent Skills | generated `.cursor/agents/*.md` | generated `.cursor/mcp.json`; use native hooks when a checked adapter declares them |
| Hermes | reads `AGENTS.md`; `.hermes/profile/config.yaml` adds `.agents/skills` through `skills.external_dirs` | `.hermes/profile/SOUL.md` and the generated role catalog drive `delegate_task` from canonical briefs | configure OAuth MCP in the Hermes profile or user config; keep tokens outside the repository |
| OpenClaw | reads `AGENTS.md` and discovers `.agents/skills` natively with this repository as the agent workspace; `.openclaw/config.json5` is the non-secret template for any other workspace | generated `.openclaw/roles.md` drives `sessions_spawn` from canonical briefs | configure MCP servers with the `openclaw mcp` CLI in user configuration; keep tokens outside the repository |

Claude Code, Codex, and Cursor all provide native delegated-agent surfaces. Hermes
provides delegation through its profile; OpenClaw through `sessions_spawn`. Preserve
the same role boundaries and handoff
contracts across them; adapt only the host schema.

Trust the repository before expecting a host to load project-scoped configuration.
Never make a sync script modify a user's global host configuration. When a host needs
global or profile configuration, generate a non-secret template and leave installation
or authorization to the user.

## Configure MCP without transport shims

Keep local stdio servers in `.mcp.json` as exact `command` and `args` entries. Keep
remote servers as direct HTTP entries with `type: "http"` and their HTTPS URL.

Generate Codex remote entries as native `url = "https://..."` configuration. Keep the
Cursor mirror in the shared `mcpServers` JSON shape. Let Claude Code consume the root
configuration. Configure Hermes remote servers with its native HTTP transport and
`auth: oauth` in the selected Hermes config. Configure OpenClaw servers with the
`openclaw mcp` CLI in user configuration, never in a repository file.

Do not introduce `mcp-remote` or another stdio bridge for a host that supports remote
HTTP MCP directly. Do not place OAuth tokens, authorization codes, API keys, or client
secrets in any repository adapter.

## Pause correctly for OAuth

Let the active host open the browser consent flow and own token storage. Treat the
redirect as an `input_required` boundary: present the safe host instruction, stop,
wait for the user, then verify with one read-only provider call.

Read `.agents/skills/service-connections/SKILL.md` for beginning, resuming, canceling,
and verifying that handoff. Keep agent-tool authorization distinct from application
project provisioning and from a product customer's Stripe Checkout redirect.

## Degrade by capability, not by brand

Apply these fallbacks whenever a native surface is unavailable or disabled:

| Missing surface | Fallback |
| --- | --- |
| native skill discovery | read the selected canonical `SKILL.md` directly |
| native named-agent dispatch | use the canonical agent file as a role brief and pass its input/output contract explicitly |
| native hook enforcement | apply the written completion rule and rely on `pnpm verify` plus CI |
| project-scoped MCP configuration | install the generated non-secret config through the host's supported user/profile mechanism |
| provider OAuth or MCP availability | use the provider dashboard or CLI fallback recorded by `service-connections`; do not weaken credential boundaries |

Report the degraded surface and fallback. Do not pretend a fallback supplies stronger
enforcement or remote verification than it actually does.

## Extend portability safely

To add a role, author one neutral `.agents/agents/<role>.md` dispatch brief, add its
input and output contracts, then extend the generator and run both adapter checks.

To add an MCP server, update `.mcp.json`, pin its executable or record the stable remote
URL in `skills.lock.json`, regenerate adapters and mirrors, then run the static and live
checks owned by `workspace-health` and `service-connections` respectively.

To add host enforcement, keep the rule in `AGENTS.md`, implement the smallest native
hook adapter, and preserve `pnpm verify` plus CI as the cross-host backstop.
