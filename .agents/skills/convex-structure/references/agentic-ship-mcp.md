# Agentic Ship Project MCP Server Reference

This document describes the native project-scoped Model Context Protocol (MCP) server exposed by Agentic Ship (`scripts/mcp-server.mjs`).

---

## 🎯 Architecture & Capabilities

The Agentic Ship MCP server allows any supported AI coding agent (Claude Code, Cursor, Codex, OpenClaw, Hermes) to programmatically inspect and mutate the local development environment through structured tools.

### Read-Only Tools
- `get_health`: Reads workspace health check and provider readiness status without running modifying mutations.
- `get_connections`: Reads provider connections status and active connection receipts.
- `get_work_status`: Reads the durable work queue state, product goals, and all work item statuses.
- `get_next_work`: Queries ready, unblocked work items eligible for execution by the specified role.
- `get_ui_plan`: Reads the UI plan and component topology specification.
- `get_ui_evidence`: Reads the UI visual evidence checklist and verification status.

### Mutating Tools
- `start_work`: Transitions a ready work item to `in_progress`.
- `wait_work`: Transitions a work item to `input_required` pending a connection action or human input.
- `resume_work`: Resumes a work item from `input_required` back to `ready`.
- `block_work`: Marks a work item as `blocked` due to an unexpected impediment.
- `unblock_work`: Unblocks a work item with resolution evidence.
- `complete_work`: Completes a work item with required gate evidence verifying acceptance criteria.

---

## 🔐 Security Invariants
- **Credential Protection**: Automatic sanitization strips secret shapes (`sk_live_...`, `whsec_...`, `phx_...`) from all tool outputs.
- **Evidence Enforcement**: `complete_work` strictly rejects attempts without non-empty gate verification evidence.
- **Local Isolation**: Runs strictly as a local stdio process without exposing ports or remote endpoints.
