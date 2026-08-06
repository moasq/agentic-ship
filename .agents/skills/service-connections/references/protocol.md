# Connection protocol

## Commands

| Command | Purpose | Mutates remote state |
| --- | --- | --- |
| `status --json` | Read catalog, local probes, and receipts | No |
| `begin <provider> --host <host> --json` | Create or return an idempotent handoff | No |
| `resume <actionId> --json` | Record explicit completion and run safe local probes | No |
| `cancel <actionId> --json` | Stop an unfinished local handoff | No |

The script never launches a browser, invokes a provider API, writes credentials, or
changes global Claude Code, Codex, Cursor, Hermes, or OpenClaw configuration.

## States

```text
unconfigured
  -> waiting_for_user (agent_tool_authorization)
  -> waiting_for_user (project_provisioning)
  -> verifying
  -> ready
```

Side states are `failed_retryable`, `blocked_manual`, `expired`, and `canceled`.
`verifying` is a synchronous transition recorded in receipt history; command output
normally observes its result rather than the transient state.

`begin` returns an existing active or ready receipt for the same provider/host pair.
`resume` and `cancel` are idempotent for terminal receipts. An active receipt expires
at the catalog-defined time. Each failed project probe increments the bounded retry
counter. Mutating commands hold a short-lived cross-process lock so two active agents
cannot create or advance the same receipt concurrently. A `connection_busy` error is
safe to retry after the other command finishes; never delete the lock while an agent is
still running. Abandoned locks age out automatically.

## JSON output

Every result carries `schemaVersion`, `type`, and either an `action` or status
collection. `input_required` additionally carries:

- `requestedFrom`: always `user`
- `kind`: browser authorization, provider login, or project provisioning
- `browserUrl`: a safe provider setup URL, or `null` when the host owns the OAuth URL
- `urlSource`: `host_managed` for host OAuth
- `instructions`: safe actions with no credential values
- `verification`: boolean probe results and safe summaries only
- `sensitiveInputAllowed`: always `false`
- exact resume and cancel commands

Do not extend this object with raw MCP responses, URLs containing authorization codes,
environment values, account email addresses, organization names, or provider object
payloads.

## Adding a provider

Add a provider entry to `.agents/connections/providers.json`. Declare both
`agentTool` and `projectProvisioning`, even when one is minimal. Use only the supported
local probe types:

- `mcp_server`
- `file_exists`
- `any_file_exists`
- `file_contains`
- `env_file_key`

Choose `machine` only when local, non-secret signals prove readiness. Choose
`probe_and_attestation` when provider dashboard state cannot be inspected safely. Add
tests for the new policy and run the catalog validator through the connection service.
