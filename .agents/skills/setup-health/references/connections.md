# Compatibility pointer — service connections

The canonical authorization and provisioning workflow now lives at
`.agents/skills/service-connections/SKILL.md`.

Load its protocol reference plus the selected records in:

- `.agents/connections/providers.json` for provider phases, safe browser destinations,
  and verification predicates.
- `.agents/connections/hosts.json` for Claude Code, Codex, Cursor, Hermes, and OpenClaw consent
  instructions and read-only verification handoffs.

Use the resumable connection workflow for Convex, Stripe, Resend, PostHog, Netlify, and Vercel.
Keep these distinctions explicit:

1. Host authorization grants the active AI tool access to a provider MCP or CLI.
2. Project provisioning configures the provider resources and application environment.
3. Product runtime sends an application customer through a surface such as Stripe
   Checkout and is not an agent authorization receipt.

Do not infer any one phase from another. Browser consent is a human-owned pause, and
the host owns OAuth token storage.

Route adjacent checks to their current owners:

| Concern | Canonical owner |
| --- | --- |
| local MCP declaration, env placement, links, and generated drift | `workspace-health` |
| read-only local tool probes and development fallbacks | `workspace-health/references/tool-probes.md` |
| executable pins, registry availability, and remote endpoint drift | `upstream-sync` |
| Better Auth advisory and adapter compatibility pin | `workspace-health/references/supply-chain.md` |
| production payment, email, auth, and deployment readiness | `production-preflight` |

Keep this pointer only so older `setup-health` references continue to resolve. Add new
provider behavior to the service-connections skill and provider catalog, never here.
