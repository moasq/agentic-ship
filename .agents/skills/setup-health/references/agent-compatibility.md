# Compatibility pointer — agent hosts

The canonical host matrix and adapter procedure now live at
`.agents/skills/agent-compatibility/SKILL.md`.

Load that skill for Claude Code, Codex, Cursor, Hermes, or OpenClaw configuration. In particular:

- Codex uses project-scoped `.codex/config.toml` and `.codex/agents/*.toml` adapters.
- Cursor uses native generated agent files and the generated MCP mirror.
- Remote MCP uses each host's direct HTTP transport and browser OAuth; no
  `mcp-remote` bridge is required.
- Native delegated-agent and hook capabilities are optional enforcement surfaces, not
  homes for repository doctrine. Use the canonical role brief, `pnpm verify`, and CI
  when a checked adapter does not expose one.

Keep this pointer only so older `setup-health` references continue to resolve.
