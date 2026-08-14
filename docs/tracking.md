# How do I see what the agents are doing?

Three surfaces, one source of truth. The durable work queue under `.agent-state/`
coordinates the agents; Linear mirrors that queue into a project a person can watch;
GitHub carries the actual deliveries as pull requests with CI as the backstop. You can
ignore the terminal entirely and still know what is ready, what is in progress, what
waits on you, and what shipped with which evidence.

## The queue is the truth

Every product starts with `pnpm agent:work init`, which turns the product brief into
dependency-aware work items, each with one owner role and acceptance criteria. Agents
claim, pause, block, and complete items through the same command, and completion always
carries gate evidence:

```bash
pnpm agent:work status
```

The queue is host-agnostic on purpose. A Claude Code session can start a feature, a
Cursor session can finish it, and neither needs the other's chat history, because the
handoff is repository state, not context. Only safe metadata lives there: titles,
statuses, dependencies, action IDs. Never prompts, transcripts, or credentials.

## Linear is the window

Connect Linear once and the agent mirrors queue transitions into your Linear project
through the hosted Linear MCP:

```bash
pnpm connect begin linear --host claude
```

Authorization is Linear's own OAuth in the browser; no API key exists anywhere in the
flow. If your host already carries Linear through an installed plugin or connector,
the agent continues on that connection instead and asks for nothing.

After that, the mirror follows the queue's own events: an issue per work item, a
status move when a role starts, a comment with the exact resume command when work
waits on a person, and a closing comment carrying the gate evidence when an item
completes.

Three rules keep the mirror trustworthy:

- **One direction.** The queue drives Linear, never the reverse. Dragging an issue in
  Linear does not move the queue; the agent reconciles with a comment stating the
  queue's actual state.
- **Contract-level content only.** Issue titles and bodies carry summaries, acceptance
  criteria, status, and evidence. The same safety rule that governs `.agent-state/`
  governs everything written to Linear, so prompts, transcripts, and secrets never
  appear in an issue.
- **Optional by construction.** An unconnected Linear changes nothing. The queue works
  alone, and every mirror step is skipped.

The full procedure, including the state-mapping table, lives in the
`product-lifecycle` skill's
[linear-tracking reference](../.agents/skills/product-lifecycle/references/linear-tracking.md).

## GitHub is the delivery

Delivery runs through the authenticated `gh` CLI:

```bash
pnpm provider:login github
```

That is GitHub's device flow: the browser shows a one-time code, approving it is the
whole consent, and the token lives in the system keyring. From there the repository,
branches, pull requests, and CI are ordinary `gh` and `git` operations, and CI runs
the same `pnpm verify` the agents run locally, which makes it the backstop for any
host that cannot enforce a stop hook.

The hosted GitHub MCP server was evaluated and declined: it authenticates with a
hand-held personal access token, which the credential rules reject when a
zero-touch OAuth path exists. The decision and its reasoning are recorded in
[skills.lock.json](../skills.lock.json).

## What you see, end to end

For a feature called "team billing", the visible trail is: a Linear issue created from
the feature contract, moved to in progress when the backend role starts, a comment
with a resume command while Stripe waits for your consent, a pull request on GitHub
when the seams are wired, CI green on `pnpm verify`, and the Linear issue closed with
the evidence line from `pnpm agent:work complete`. Every step is inspectable, none of
it depends on a chat window staying open, and all of it is revocable through the
connection model described in [How do service connections work?](connections.md).
