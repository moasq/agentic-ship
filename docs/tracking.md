# How do I see what the agents are doing?

The durable work queue under `.agent-state/` coordinates the agents. GitHub Issues and
Projects can mirror it through the existing `gh` connection. Linear is another optional
tracking window through its hosted MCP. GitHub also carries pull requests and CI. The
queue remains the single source of truth whichever window you choose.

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

## GitHub can be the tracking window

After GitHub is authenticated, mirror each queue item to one issue:

```bash
pnpm agent:work mirror-github
```

To add those issues to a GitHub Project and map queue states onto its `Status` field,
pass the Project number. Add its owner when the Project belongs to another organization:

```bash
pnpm agent:work mirror-github --project 1 --project-owner my-organization
```

The command creates its labels, reconciles manual changes back to queue truth, and
posts safe action details or completion evidence. Repeating it recovers partial updates
without duplicating issues or mirror-owned comments. A missing or revoked GitHub
connection reports an unavailable mirror but never blocks local queue work.

The full configuration, state mapping, privacy, retry, cancellation, and revocation
rules live in the `product-lifecycle` skill's
[GitHub tracking reference](../.agents/skills/product-lifecycle/references/github-tracking.md).

## Linear is another tracking window

Connect Linear once and the agent mirrors queue transitions into your Linear project
through the hosted Linear MCP:

```bash
pnpm connect begin linear --host claude
```

Authorization is Linear's own OAuth in the browser; no API key exists anywhere in the
flow. If your host already carries Linear through an installed plugin or connector,
the agent continues on that connection instead and asks for nothing.

After that, the mirror follows the queue's own events. Each work item becomes an
issue. Starting work moves the issue's status. Work that waits on a person gets a
comment with the exact resume command. Completing an item closes the issue with a
comment carrying the gate evidence.

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

That is GitHub's device flow. The browser shows a one-time code, approving it is the
whole consent, and the token lives in the system keyring. From there the repository,
branches, pull requests, and CI are ordinary `gh` and `git` operations. CI runs the
same `pnpm verify` the agents run locally, which makes it the backstop for any host
that cannot enforce a stop hook.

The hosted GitHub MCP server was evaluated and declined: it authenticates with a
hand-held personal access token, which the credential rules reject when a
zero-touch OAuth path exists. The decision and its reasoning are recorded in
[skills.lock.json](../skills.lock.json).

## What you see, end to end

Take a feature called "team billing". A GitHub or Linear issue mirrors its feature
contract, then moves to in progress when the backend role starts. While a provider
waits for consent, the issue carries the safe action ID and resume command. A pull
request lands on GitHub when the code is wired, CI goes green on `pnpm verify`, and
the mirrored issue closes with the recorded evidence. Every step is inspectable. None
of it depends on a chat window staying open, and all connections are revocable through
the model described in
[How do service connections work?](connections.md).
