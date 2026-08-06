---
name: setup-health
description: This compatibility skill should be used when the user asks to "run setup health", "check every connection", "verify Agentic Ship setup", or invokes the former all-in-one health workflow; it routes the request to workspace-health, agent-compatibility, service-connections, upstream-sync, or production-preflight without duplicating their procedures.
---

# Setup health compatibility router

Preserve this skill as the stable entry point for older prompts and installations.
Delegate each concern to its current owner. Do not add new checks, host instructions,
or provider workflows here.

## Route by concern

| Requested concern | Load and follow |
| --- | --- |
| local setup, pins, links, env placement, generated drift, UI structure, or buildability | `.agents/skills/workspace-health/SKILL.md` |
| Claude Code, Codex, Cursor, Hermes, or OpenClaw roles, hooks, skill discovery, MCP adapters, or portability | `.agents/skills/agent-compatibility/SKILL.md` |
| browser OAuth, provider authorization, project provisioning, pause/resume, or revocation | `.agents/skills/service-connections/SKILL.md` |
| live upstream versions, registry availability, vendored skill drift, or remote MCP URL drift | `.agents/skills/upstream-sync/SKILL.md` |
| production Stripe, email, auth, deployment, or launch readiness | `.agents/skills/production-preflight/SKILL.md` |

For a broad setup audit, run the workspace-health procedure first. Load
agent-compatibility only when a host adapter or MCP delivery surface is in scope. Run
service-connections last for each capability that needs a human-owned browser or
provider step, because a local declaration is not proof of authorization.

Keep the networked dependency audit separate from offline health. The Better Auth
security pin and Convex adapter compatibility procedure live in
`.agents/skills/workspace-health/references/supply-chain.md`.

## Compatibility references

- `references/platform-notes.md` points to the canonical cross-platform command rules.
- `references/agent-compatibility.md` points to the canonical host matrix and adapter
  procedure.
- `references/connections.md` points to the resumable provider workflow and retains
  only migration guidance for older references.

Treat these pointers as migration aids, not parallel documentation. Update the
destination skill when a procedure changes.
