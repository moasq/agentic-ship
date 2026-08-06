---
name: workspace-health
description: This skill should be used when the user asks to "check workspace health", "verify the local setup", "diagnose generated configuration drift", "check MCP or agent mirrors", "audit component structure", or investigate a failing deterministic repository gate without authorizing or provisioning an external service.
---

# Workspace health

Inspect the repository's static, local, and reproducible contract. Keep this procedure
offline-capable. Route live provider authorization and provisioning to
`service-connections`, and route host-adapter design changes to `agent-compatibility`.

## Run the deterministic checks

Start with the aggregate machine check:

```text
pnpm health
```

Run the focused drift checks when their surfaces changed or when `health` identifies
them:

```text
pnpm check:agents
pnpm check:mcp
pnpm check:ui
```

Collect every result before repairing anything. Preserve warnings that represent an
intentional stage, such as an unconnected Convex deployment on a fresh clone.

## Keep check ownership explicit

| Surface | Deterministic owner | Expected evidence |
| --- | --- | --- |
| runtime and dependency pins | `pnpm health` | supported Node/pnpm versions and package pins matching `skills.lock.json` |
| rules, skill links, and authored sources | `pnpm health` | one `AGENTS.md`, a one-line `CLAUDE.md`, and valid canonical `.agents` links |
| generated host adapters | `pnpm check:agents` | neutral canonical roles and byte-stable Claude plugin, Codex, Cursor, Hermes, and OpenClaw outputs |
| MCP inventory and Cursor mirror | `pnpm check:mcp` | valid `.mcp.json` and an exact generated mirror |
| authored UI boundaries | `pnpm check:ui` | token-safe styles, valid component layering, and standalone block fixtures |
| environment placement | `pnpm health` | no browser-exposed or misplaced secrets; expected public values only |
| backend readiness | `pnpm health` | either a connected Convex seam or an explicit staged warning |
| buildability | `pnpm verify` | health, lint, and the production build all green |

Treat a scanner as the authority only for its named surface. Do not make a credential
placement scan conditional on whether the related provider seam exists. Do not turn an
unconfigured optional or buyer-owned service into a build failure.

## Separate offline health from live assurance

Keep `pnpm health` free of network requirements. Use the following adjacent procedures
instead of hiding live checks inside local health:

- Run `pnpm audit:supply-chain` after dependency changes and before shipping. Read
  `references/supply-chain.md` for its fail-closed contract.
- Run `upstream-sync` to compare executable pins, registry URLs, skills, and remote MCP
  endpoints with their official upstreams.
- Run `service-connections` to begin or resume browser OAuth, project provisioning, or
  provider verification.
- Run `production-preflight` for production-only secrets, deployment state, email
  safety, live payments, and launch identity.

## Interpret severity consistently

Use these meanings:

- **PASS** — the deterministic predicate is satisfied.
- **WARN** — the repository remains buildable, but an optional capability, expected
  onboarding stage, or fallback is active.
- **CRITICAL** — a secret is exposed or misplaced, a single source of truth is broken,
  generated configuration lies about its canonical source, or the build cannot pass.

Include the responsible command and a safe fallback for each warning or critical
result. Never report a remote service as connected based only on a local declaration.

## Repair without masking evidence

Apply only a deterministic repair whose target is known. Use `pnpm heal` for the repair
classes it owns, then re-run the original failing check. Use the relevant sync command
for a generated adapter or mirror. Change a canonical source only when the generated
output correctly reflects it and the source itself is wrong.

Escalate a repeated tier-2 repair through the testing skill and heal ledger. Never
weaken a validator, delete a warning, fabricate generated backend files, or mark a
human-owned service ready to make health green.

## Finish with build proof

Run:

```text
pnpm verify
```

Report one table with the check, status, evidence, and repair or fallback. End with one
verdict:

- `HEALTHY — all checks passed.`
- `DEGRADED — N issues. Fallbacks listed; the project still builds.`
- `BROKEN — N critical issues. Fix before continuing.`

## References

- `references/platform-notes.md` — read before publishing any cross-platform command.
- `references/tool-probes.md` — cheap read-only probes and local fallbacks for component,
  framework, testing, and backend MCP tools.
- `references/supply-chain.md` — exact-pin, advisory, and Better Auth compatibility
  procedure.
- `.agents/skills/agent-compatibility/SKILL.md` — canonical sources and native adapter
  generation.
- `.agents/skills/service-connections/SKILL.md` — resumable human authorization and
  provider provisioning.
