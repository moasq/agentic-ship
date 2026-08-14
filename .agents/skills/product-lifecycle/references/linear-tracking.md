# Mirroring the work queue into Linear

The durable queue under `.agent-state/work-items.json` coordinates agents. Linear is
where a person watches that work move. When the Linear MCP is authorized, mirror the
queue into the product's Linear project so progress is visible without opening a
terminal. The queue stays the source of truth: Linear reflects it, never drives it.

## Connect once

1. Run `pnpm connect begin linear --host <host>`. The safe probes check that the
   `linear` MCP server is declared; anything less than ready pauses on one consent
   question.
2. The user authorizes in the browser (OAuth, no key handled), then the agent makes one
   read-only call (list teams) and resumes with `pnpm connect resume <action-id>`.
3. Ask which team and project should hold the mirror, or create a project named after
   the product brief. Store only the team key, project ID, and issue IDs under
   `.agent-state/` — safe identifiers, nothing else.

Without the connection nothing changes: the queue works alone, and every step below is
skipped. Tracking is a mirror, not a dependency.

## What syncs, and when

Mirror at the moments the queue itself changes state:

| Queue event | Linear action |
| --- | --- |
| `agent:work init` | Create the project (or confirm the chosen one); one issue per seeded item |
| item added | Create an issue: title from the item, body from the feature contract summary and acceptance criteria |
| `start` | Move the issue to the workspace's in-progress status; comment which role claimed it |
| `wait` (input required) | Comment the safe action ID, what the person must do, and the exact resume command; apply the workspace's waiting label or status |
| `block` / `unblock` | Comment the reason or the resolution evidence; move status accordingly |
| `complete` | Move to done; closing comment carries the gate evidence line |

Map queue states to the workspace's own workflow statuses on first sync and reuse that
mapping; do not invent statuses in the customer's workspace. The mirror is
one-directional. If a person drags an issue in Linear, leave the queue untouched and
reconcile with a comment stating the queue's actual state.

## Content rules

An issue is a window, not a transcript:

- Titles, contract-level summaries, acceptance criteria, status, and gate evidence
  belong in issues.
- Prompts, transcripts, provider payloads, credentials, authorization codes, webhook
  secrets, payment data, and personal account details never do. The same rule that
  governs `.agent-state/` governs everything written to Linear.
- Link the GitHub PR by URL when one exists; let Linear's own GitHub integration do any
  richer linking.

## Disconnect

`pnpm connect cancel <action-id>` retires the receipt and stops mirroring. Access
itself is withdrawn in Linear under Settings, Security & access, Authorized
applications. Issues already created stay in Linear; archive them there if they should
not remain.
