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
- `consent`: the single yes/no gate — `question`, `onYes`, `onNo`. Nothing runs and
  nothing opens before the user answers; "no" maps to the cancel command
- `decision` (project payloads, when the catalog declares one): a user choice the
  catalog cannot make — `question` plus `options`, each with `value`, `label`,
  `placeholders`, and `run` steps whose `{placeholder}` tokens are validated against
  the declaration at load time. The chosen option's steps run before `agentRuns`,
  with the user's answers substituted. Convex uses this for new-vs-existing project
- `agentRuns`: catalog `automation.run` steps the agent executes on the user's behalf —
  `command`, `why`, and `opensBrowser` when the command blocks on browser consent.
  `pnpm provider:login <cli>` steps install the vendor's official CLI when missing and
  wait on its browser OAuth (Stripe pairing, Render confirmation, GitHub device flow)
- `instructions`: the manual equivalent, safe actions with no credential values
- `verification`: boolean probe results and safe summaries only
- `sensitiveInputAllowed`: always `false`
- exact resume and cancel commands

`connection_canceled` and each provider's `status` entry additionally carry
`revocation`: the catalog steps that withdraw access itself (CLI logout, host MCP
disconnect, provider dashboard). Command steps are the agent's to run; text steps are
the user's.

`begin` checks before it asks: when the agent-tool probe and a machine-policy project
verification already pass, the receipt is created directly in `ready` with a
`verified_preexisting` history event and the agent-tool basis
`preexisting_local_configuration` — no consent question, no redirect, no commands.

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
- `home_file_exists` — existence of a home-relative file only, never its contents;
  this is how CLI OAuth pairing is detected (`.config/stripe/config.toml`,
  `.config/gh/hosts.yml`, `.config/render/config.json`) without reading the
  credential the pairing produced

Choose `machine` only when local, non-secret signals prove readiness. Choose
`probe_and_attestation` when provider dashboard state cannot be inspected safely. Add
tests for the new policy and run the catalog validator through the connection service.
