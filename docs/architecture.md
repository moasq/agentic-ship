# How is the toolkit put together?

One rule, one home. Every rule is declared exactly once in
[AGENTS.md](../AGENTS.md); skills elaborate declared rules into procedure; role briefs
dispatch work to the right skill; scripts make the rules checkable; generated adapters
deliver all of it to each AI host. When two layers disagree, the declaration wins, and
the disagreement is a bug by definition. That single design decision explains almost
everything else in the repository.

## The layers

| Layer | Location | Job |
| --- | --- | --- |
| Declarations | `AGENTS.md` | Every rule, stated once |
| Procedures | `.agents/skills/` | How to carry out a declared rule |
| Roles | `.agents/agents/` | Who owns which seam; dispatch, not doctrine |
| Contracts | `.agents/contracts/` | JSON Schemas for briefs, features, and human pauses |
| Connections | `.agents/connections/` | The provider and host catalogs behind `pnpm connect` |
| Scripts | `scripts/` | Node implementations of every `pnpm` command and gate |
| Provenance | `skills.lock.json` | Upstream, commit, and license for everything vendored or pinned |
| Runtime state | `.agent-state/` | Gitignored queue and receipts; safe identifiers only |

A rule that appears in a skill but not in AGENTS.md is a defect, and so is a skill that
restates a rule differently. This is what keeps nine different AI hosts from drifting
apart: they all read elaborations of the same declarations.

## Generated adapters

The authored sources are `.agents/` and [.mcp.json](../.mcp.json). Everything
host-native is generated from them and never edited by hand:

- `.claude/skills` and `.claude/agents` link to the canonical directories.
- `agents/` at the top level is the Claude plugin's generated role layer.
- `.codex/` gets project-scoped TOML, agents, and hooks; `.codex-plugin/mcp.json`
  carries the converted MCP map.
- `.cursor/` gets a byte-identical MCP mirror, native agents, and a bounded stop hook.
- `.hermes/` and `.openclaw/` get non-secret profiles and delegation catalogs.

`pnpm sync:agents` and `pnpm sync:mcp` write these; `pnpm check:agents` and
`pnpm check:mcp` fail the build when a generated file drifts from its source. Editing a
generated file directly is always wrong: the next sync erases the edit.

## The gate chain

`pnpm verify` is the offline definition of done. It runs repository health, the
generated-adapter checks, the command-and-lock reconciliation, the authored UI
contract, and the unit gate. `pnpm verify:full` adds the fail-closed production
dependency audit for anything that ships. Two details make the chain trustworthy:

- **Prose is gated.** `pnpm check:commands` extracts every `pnpm <name>` from
  AGENTS.md, the README, this wiki, the skills, and the connection catalog, and fails
  if any name does not resolve to a real script. Documentation cannot promise a
  command that does not exist.
- **Vendored content is reconciled.** The same gate fails if a skill directory exists
  without a lock entry, or a lock entry without a directory, in either direction, for
  skills and MCP servers both.

Repairs have memory: every non-trivial fix lands in `.agents/heal-ledger.md` with its
cause, fix, and prevention, and a bug healed twice must graduate into a rule, a health
check, or a skill.

## Tool repo versus product workspace

This repository is tool-only. It contains no `src/`, no `convex/` application code, no
deployment, and nothing a buyer must delete. The product stack rules in AGENTS.md bind
the downstream workspace that adopts the kit, where `src/` and `convex/` actually
exist. That split is why the health gate reports missing product surfaces as
not-applicable rather than failing: not-yet-connected is a warning, never an error.

## Where the vendored knowledge comes from

Third-party procedure enters through exactly one door: a shallow clone, a full content
review, a copied license, and an entry in [skills.lock.json](../skills.lock.json)
recording upstream, commit, and license. Skills whose vendors ship official plugins
(Convex, Stripe, Resend, PostHog) are not vendored at all; the plugins update
themselves, and the lockfile records that decision too, alongside every alternative
that was evaluated and declined. The monthly `upstream-sync` skill diffs all of it
against upstream.

For how work flows through this machinery day to day, read
[How do I see what the agents are doing?](tracking.md); for the service side, read
[How do service connections work?](connections.md).
