# How do service connections work?

Check first, ask second, then act. Every external service joins the same way. Safe
local probes discover what is already connected. One yes/no consent question gates
anything that is not. On yes, the agent runs the vendor's own OAuth flow on your
behalf. Credentials never enter chat, agent state, or the repository. Every connection
leaves a receipt (a small local record of what is pending or done) and a documented
way to revoke it.

## The service providers

| Provider | Role | Authorization |
| --- | --- | --- |
| Convex | Backend and deployment env | `npx convex login` browser flow |
| Stripe | Billing (default) | CLI pairing code via `pnpm provider:login stripe` |
| Polar | Billing (alternative) | Access token via `pnpm secret:set POLAR_ACCESS_TOKEN` |
| Lemon Squeezy | Billing (alternative) | API key via `pnpm secret:set LEMON_SQUEEZY_API_KEY` |
| GitHub | Repository, PRs, CI | `gh` device flow via `pnpm provider:login github` |
| Linear | Development tracking | Hosted MCP OAuth in the AI host |
| Resend | Email | Hosted MCP OAuth, keys via hidden input |
| PostHog | Analytics | Hosted MCP OAuth, public `phc_` key only |
| Netlify | Deploy | `netlify login` browser flow |
| Vercel | Deploy (alternative) | `vercel login` device flow via `pnpm provider:login vercel` |
| Cloudflare | Deploy (alternative) | Keyring-backed Wrangler OAuth via `pnpm provider:login cloudflare` |

The catalog behind this table is
[.agents/connections/providers.json](../.agents/connections/providers.json): probes,
instructions, automation steps, and revocation paths per provider, validated by
schema, exercised by tests.

Each entry also declares its capability and whether it is the default. Product briefs
select one provider for billing, email, analytics, deployment, and tracking. A provider
without an official command-line interface (CLI) or host Model Context Protocol (MCP)
integration skips agent-tool authorization and starts at project provisioning.

Hosts bring their own integrations too. Claude Code, Codex, and Cursor all support
installable plugins and connectors for these same vendors, and the kit defers to them.
A connection the host already provides is continued as-is. A host without one falls
back to the project's pinned catalog. The kit never installs, reconfigures, or
disconnects anything at the host's plugin layer; that configuration belongs to you.

## The split between agent and human

The split is runner-based, not step-based. Every step a machine can run, the agent
runs: installing a vendor CLI, starting its login, opening the provider page,
provisioning webhooks. The human part is the consent itself, plus any dashboard work no
CLI covers. So a typical connection is: the agent asks one question, you approve once
in a browser, and the agent verifies with a read-only call before continuing.

Where a vendor issues a value only a dashboard can mint, the value moves through a
hidden-input prompt in your own terminal:

```bash
pnpm secret:set STRIPE_SECRET_KEY
```

The key is piped straight into the Convex deployment environment. It is never printed,
never stored in a file, and never pasted into chat. In test mode you do not even do
that much. `pnpm stripe:provision --test-key` copies the CLI's own sandbox key into
the deployment env for you. It refuses anything that is not a test key, and it
refuses production.

## Pauses survive anything

When a connection needs a person, the agent records a receipt under `.agent-state/`
holding only safe identifiers: an action ID, the provider, the state of verification.
Close the laptop, switch from Claude Code to Cursor, come back tomorrow; the receipt
still knows what was pending:

```bash
pnpm connect status
```

```bash
pnpm connect resume <action-id>
```

Only dependent work pauses. Independent queue items keep moving, which is why the
work queue and the connection receipts are separate systems that reference each other
by ID and nothing more.

## Everything is revocable

`pnpm connect cancel <action-id>` retires the local receipt. Every catalog entry also
names how access itself is withdrawn: `npx convex logout`, `stripe logout`,
`gh auth logout`, `netlify logout`, `vercel logout`, `wrangler logout`, or disconnecting the MCP server in the host and
revoking the grant in the provider's security settings. Canceling tracking, for
example, stops the Linear mirror immediately and leaves already-created issues to be
archived in Linear itself.

## Three kinds of connection, kept apart

The model deliberately separates concerns that look similar:

- **AI-host MCP authorization**: the host's own OAuth to a hosted tool server (Stripe,
  Resend, PostHog, Linear, 21st). Approving in the browser is the entire consent.
- **Project provisioning**: creating or linking the actual resources: a Convex project,
  a Stripe webhook endpoint, a Netlify, Vercel, or Cloudflare project, a Linear project.
- **Customer runtime**: your product's users returning from Stripe Checkout. That flow
  belongs to the product, and entitlement comes only from the webhook-backed query,
  never from a redirect.

Confusing the third with the first two is how test flows end up wired into production
money paths; the rules keep them in separate files with separate gates.

For the tracking-specific connection, read
[How do I see what the agents are doing?](tracking.md). For what happens after
everything is connected, read
[How do I go from empty folder to shipped product?](getting-started.md).
