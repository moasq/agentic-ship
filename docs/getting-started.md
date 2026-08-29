# How do I go from empty folder to shipped product?

Copy the toolkit into a project folder, open it in your coding agent, and describe what
you want to build. The agent reads [AGENTS.md](../AGENTS.md) and follows the rules; the
gates verify what it produces; the connection handoffs pause for you exactly where a
human must consent. This article is the whole path in order, with the one command each
step turns on.

## 1. Install

Run the installer from the directory that should hold the product:

```bash
npx github:moasq/agentic-ship
```

Keep the `github:` prefix; the kit ships from GitHub, not npm. Existing files are
skipped, never overwritten. Then run `pnpm install` and open the folder in your agent.
Claude Code and Codex users can install the same repository as a plugin
instead; both paths deliver one copy of every rule.

A fresh copy verifies green before anything is connected:

```bash
pnpm verify
```

If it does not, `pnpm heal` applies the deterministic repairs (links, mirrors,
lockfile, environment) and proves the result with a health run.

## 2. Say what you want to build

Product-sized work starts with a brief, not a prompt. The `product-lifecycle` skill
turns your outcome into three things: a product brief, feature contracts with one
owner each, and a durable work queue:

```bash
pnpm agent:work init --name my-product --goal "what shipping looks like"
```

The queue survives closed laptops and switched hosts. Any agent can ask it what is
ready, what is blocked, and what waits on a person. To watch that same progress in a
tracker instead of a terminal, connect Linear; see
[How do I see what the agents are doing?](tracking.md).

## 3. Connect services as they are needed

Nothing requires an account up front. When a feature needs a backend, payments, or
email, the agent starts a resumable handoff:

```bash
pnpm onboard --host claude
pnpm connect begin convex --host claude
```

Each connection checks local state first, asks one yes/no consent question, then runs
the vendor's own OAuth flow. Secrets go through hidden-input prompts straight into the
Convex deployment environment. They never touch chat, files, or shell history. The
full model, including how to cancel and revoke, is in
[How do service connections work?](connections.md).

## 4. Build under the gates

The agent builds interfaces against the visual plan (`pnpm ui:plan init`, then
`pnpm ui:plan check`), sources components from the pinned catalogs, and wires data
through Convex functions with validators on both sides. Three commands close every
loop:

```bash
pnpm check:ui
```

```bash
pnpm test
```

```bash
pnpm verify
```

`pnpm verify` is the definition of done for every task, not a pre-release ritual. A
red gate is the work; the `testing` skill owns the repair loop, and repeated repairs
graduate into rules.

## 5. Prove it visually

Substantial interface work carries visual evidence: the declared routes and states,
captured at 320, 768, and 1440 CSS pixels in each theme, reviewed and accepted by
name:

```bash
pnpm ui:review capture --base-url http://localhost:3000
```

```bash
pnpm ui:review accept --by "your name" --reason "initial acceptance"
```

Stale or missing evidence fails `pnpm check:ui`, and no flag or environment variable
bypasses it.

## 6. Go live deliberately

The kit defaults to test-safe everywhere, so launch is a set of explicit flips gated by
one command:

```bash
pnpm preflight --prod
```

It fails when the selected billing provider uses its test environment. It also fails
when email remains in test mode without verification, when the seed backdoor flag
exists, or when `src/lib/site.ts` still carries placeholders. Deploy through the
provider selected in the product brief: Netlify by default, or Vercel or Cloudflare
Workers as an alternative. Its committed `netlify.toml`, `vercel.json`, or Wrangler
JSON file is the authoritative deployment description. Cloudflare also requires its
branch-aware Convex build wrapper and live production verification. If
production misbehaves, roll back to the last green deploy first and diagnose locally
second.

## Where to go deeper

- The reasoning behind every layer: [What is the Agentic Ship stack?](stack.md)
- How the toolkit itself is organized: [How is the toolkit put together?](architecture.md)
- The full connection model: [How do service connections work?](connections.md)
- Watching agents work: [How do I see what the agents are doing?](tracking.md)
