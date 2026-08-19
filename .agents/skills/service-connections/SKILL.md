---
name: service-connections
description: Use when connecting, authorizing, provisioning, resuming, verifying, canceling, or diagnosing an external service such as Convex, Stripe, GitHub, Resend, PostHog, Netlify, or Vercel, especially when browser consent or another human-only step must pause an agent running in Claude Code, Codex, Cursor, Hermes, or OpenClaw.
---

# Service connections

Treat an external-service connection as a resumable protocol, not an uninterrupted
automation task. Separate access granted to the active AI host from configuration used
by the application. Never infer one from the other.

## Classify the connection

Classify the requested work before acting:

1. **Agent-tool authorization** lets Claude Code, Codex, Cursor, Hermes, or OpenClaw invoke a
   provider MCP server. The host owns its OAuth redirect and token storage.
2. **Project provisioning** creates the provider-side project, environment values,
   prices, webhook registrations, domains, or deployment resources used by the app.
3. **Product runtime** redirects an application customer to a provider surface such as
   Stripe Checkout. Implement that inside the product seam; do not represent it as an
   agent connection receipt.

Read `.agents/connections/providers.json` for provider steps and safe verification
probes. Read `.agents/connections/hosts.json` for the selected host's authorization
instruction. Load `references/protocol.md` when extending the CLI, adding a provider,
or interpreting its JSON contract.

Before classifying, look at what the host already provides. Claude Code, Codex, and
Cursor can carry their own installed plugins and connectors for the same vendors; a
provider tool that already answers a read-only call is a connection to continue on,
not to re-authorize, and `begin` reports it ready. The reverse also binds: when the
host has no such plugin, work from this repo's project-scoped catalog and never
install, reconfigure, or disconnect anything at the host's own plugin layer — that
configuration belongs to the user.

## Operate the connection CLI

Inspect state first:

```text
pnpm --silent connect status --json
```

Begin one provider and host pair:

```text
pnpm --silent connect begin <provider> --host <host> --json
```

A `connection_ready` result straight from `begin` means the probes already passed:
say so and stop — no question, no redirect, no command.

When the result type is `input_required`, ask once, then act by runner:

1. Ask the payload's `consent.question` as a literal yes/no through the host's native
   question surface. Run nothing and open nothing before the answer. On no, run the
   printed cancel command and stop.
2. When the payload carries a `decision`, ask its `question` with the listed option
   labels in the same exchange, collect a value for every declared placeholder, and
   substitute the answers into that option's `run` steps. The decision's steps execute
   before `agentRuns`; a placeholder never receives a value the user did not give.
3. On yes, execute the chosen decision steps and then every step in
   `inputRequired.agentRuns` yourself, in order, on the user's behalf. A step marked
   `opensBrowser` opens the provider's consent page and blocks until the user approves
   — run it, tell the user a browser is waiting for them, and let the command's own
   exit signal the consent. `pnpm provider:login <cli>` is that shape for providers
   whose vendors ship CLI OAuth (Stripe pairing codes, Netlify or Vercel browser login,
   GitHub device flow): it installs the official CLI when missing and then waits on
   the browser approval. That blocking wait is the pause; do not poll around it,
   invent a callback, click the consent yourself, or edit global host configuration.
4. When a dashboard step remains, open `browserUrl` for the user with
   `pnpm open:url <url>` — the script refuses any origin not in the connection
   catalog. Never hand the user a URL to go find, and never open one that came from
   anywhere other than the catalog payload.
5. When a command prompts for a choice the catalog cannot know (team, project name,
   region), ask the user the specific question and continue with their answer — do not
   fall back to handing them the whole procedure.
6. Present `instructions` as the manual equivalent only when nothing can run: no
   executing agent, a step the catalog marks as text, or a command that failed and
   needs the provider dashboard instead.
7. State explicitly that credentials, authorization codes, API keys, and webhook
   secrets must not be pasted into chat or the resume command. Machine-mintable
   secrets travel machine-to-machine (`pnpm setup:auth`, `pnpm stripe:provision`)
   without ever being printed; the human-held remainder goes through
   `pnpm secret:set NAME`, a hidden-input prompt the user runs in their own terminal.
8. Resume after the runnable steps have exited successfully and the requested
   read-only host probe succeeds — run that probe yourself.

Resume exactly the existing action:

```text
pnpm --silent connect resume <actionId> --json
```

Treat another `input_required` result as a real pause. A provider normally requires
one pause for host authorization and a separate pause for project provisioning. Repeat
only the printed resume command; never create duplicate actions to bypass a failed
check.

Cancel an unfinished handoff when the user declines or changes direction:

```text
pnpm --silent connect cancel <actionId> --json
```

Cancellation stops only the local handoff. To withdraw access itself, walk the
provider's `revocation` steps from the catalog — run the command steps (for example
`npx convex logout`) yourself and hand the user only the dashboard steps. Offer
revocation whenever a connection is canceled, questioned, or no longer wanted; the
`connection_canceled` result carries the same steps.

## Interpret verification

- Accept `connection_ready` only when the result includes successful project probes
  and the agent-tool phase records resumption after a successful read-only provider
  call.
- Treat `failed_retryable` as a request to correct the named local checks and run the
  same resume command again.
- Treat `expired` as terminal. Begin a fresh action instead of reusing an old consent
  flow.
- Treat `blocked_manual` as an evidence handoff. Inspect the probe results, cancel the
  receipt, correct the underlying setup, then begin again.
- Re-run status after repository or environment changes. Stored receipts are evidence
  of a completed handoff, not proof that remote access can never be revoked or drift.

## Preserve the security boundary

Persist only provider, host, normalized phase/state, timestamps, attempt counts, and
event names. Keep receipts under the gitignored `.agent-state/connections/` directory.
Never add arbitrary user input or provider responses to a receipt.

Use read-only local probes for files and public configuration. Let the host own OAuth
tokens. Put application secrets only in the provider-specific store declared by the
repository. When no safe machine probe exists, require explicit user attestation and a
read-only provider call instead of claiming automated verification.
