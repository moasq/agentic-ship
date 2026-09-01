# Agentic Ship project MCP server

The local stdio server exposes the toolkit's existing health, verification,
connections, work-queue, UI-plan, and visual-evidence services as validated MCP tools.
It listens on no port and resolves state from the current project directory.

## Install and verify

The canonical declaration is the `agentic-ship` entry in `.mcp.json`. Run
`pnpm sync:mcp` and `pnpm sync:agents` after changing it; Cursor, Codex, and the Codex
plugin receive generated project-scoped mirrors. Claude reads `.mcp.json` directly.
Hermes and OpenClaw keep their user profiles outside the repository, so follow their
generated project guidance without editing a global host configuration on the user's
behalf.

The committed server enables mutation tools with `--allow-mutations`. Remove that
argument in a consumer that should be read-only. Without it, mutation calls return a
tool error and cannot change queue state.

Run `pnpm verify` to validate configuration mirrors and contract tests. A direct MCP
client should initialize with a supported protocol version, send
`notifications/initialized`, list tools, then call `get_health`. The result is a
versioned JSON envelope in both `structuredContent` and the text fallback.

## Read tools

- `get_health` runs the real workspace health gate.
- `get_verification_results` runs the offline definition-of-done gate.
- `get_connections` reads safe connection status and may filter by validated provider
  and host IDs.
- `get_work_status` returns at most 100 queue items with offset, limit, total, and
  `hasMore` page metadata. `get_next_work` requires a validated role and returns at
  most 100 ready items.
- `get_ui_plan` reads `.agents/ui/plan.json`.
- `get_ui_evidence` inspects `.agents/ui/evidence/manifest.json` and current captures.

## Mutation tools

`start_work`, `wait_work`, `resume_work`, `block_work`, `unblock_work`, and
`complete_work` reuse the queue transition service and its lock. IDs, roles, action
IDs, reasons, and evidence are schema-validated before dispatch. `wait_work` requires
the safe connection action ID as well as its reason; completion requires at least one
gate-evidence entry.

## Safety and removal

Tool output removes recognized credentials, authorization codes, email addresses,
phone-like values, payment-card-like values, prompts, transcripts, and provider
payloads. Mutation input containing those shapes is rejected rather than stored.
Every successful result is checked against its advertised output schema before it is
returned. The server returns no project path and never reads credential file contents.

To revoke mutation access, remove `--allow-mutations` from the project server args and
regenerate mirrors. To remove the server, delete only its canonical `.mcp.json` entry,
run both synchronizers, and remove its internal inventory entry from `skills.lock.json`
in the same reviewed change.
