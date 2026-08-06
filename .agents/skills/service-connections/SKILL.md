---
name: service-connections
description: Use when connecting, authorizing, provisioning, resuming, verifying, canceling, or diagnosing an external service such as Convex, Stripe, Resend, PostHog, or Render, especially when browser consent or another human-only step must pause an agent running in Claude Code, Codex, Cursor, Hermes, or OpenClaw.
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

## Operate the connection CLI

Inspect state first:

```text
pnpm --silent connect status --json
```

Begin one provider and host pair:

```text
pnpm --silent connect begin <provider> --host <host> --json
```

When the result type is `input_required`:

1. Present the title, safe browser URL or host-owned login instruction, expiry, and
   action ID to the user.
2. State explicitly that credentials, authorization codes, API keys, and webhook
   secrets must not be pasted into chat or the resume command.
3. Stop automation. Do not poll, invent a callback, open a browser, approve consent,
   or edit global host configuration.
4. Resume only after the user reports completion and the requested read-only host
   probe succeeds.

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

Cancellation stops only the local handoff. Revoke already-granted access through the
host or provider controls.

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
