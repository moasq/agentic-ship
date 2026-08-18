# How do I mirror the queue to GitHub?

The local queue in `.agent-state/work-items.json` remains authoritative. GitHub Issues
make that work visible without adding another service. A GitHub Project is optional.

## Configure the mirror

Use the existing authenticated GitHub CLI connection:

`pnpm provider:login github`

GitHub Projects also require the CLI's `project` scope. Check the current connection
with `gh auth status`. If that scope is missing and you choose to use a Project, grant
it through GitHub's browser consent with `gh auth refresh -s project`. Issues-only mode
does not need this extra scope.

Mirror queue items to Issues:

`pnpm agent:work mirror-github`

Add the issues to a GitHub Project and update its `Status` field:

`pnpm agent:work mirror-github --project <number>`

The repository owner is used by default. For an organization-owned Project, add
`--project-owner <login>`. The Project must have a single-select field named `Status`
with `Todo`, `In Progress`, `Blocked`, and `Done` options.

## Understand the mapping

| Queue status | Issue label | Project status | Issue state |
| --- | --- | --- | --- |
| `ready` | `status:ready` | `Todo` | Open |
| `in_progress` | `status:in-progress` | `In Progress` | Open |
| `input_required` | `status:input-required` | `Blocked` | Open |
| `blocked` | `status:blocked` | `Blocked` | Open |
| `done` | `status:done` | `Done` | Closed |

The mirror creates its `agentic-work`, `role:*`, and `status:*` labels before creating
issues. It preserves unrelated labels and comments. If someone edits a mirrored title,
body, queue-owned label, or issue state on GitHub, the next run restores the local queue
value. Make the intended change in the queue instead.

## Know what is published

An issue contains only the work item ID, role, summary, acceptance criteria,
dependencies, status, safe action ID, safe reason, and completion evidence. The mirror
redacts recognized credentials and email addresses as a final safeguard. Do not put
prompts, transcripts, provider payloads, credentials, authorization codes, payment
data, or personal details in queue metadata.

The local mirror file stores issue and Project identifiers only. Stable hidden markers
in issue bodies and mirror-owned comments let a later run recover after a lost local
mapping or a partial failure without posting duplicates.

## Recover or stop

Run the same command again after a network failure, missing Project field, or partially
completed update. Issue mirroring continues when only the optional Project update fails.
If GitHub access is missing or revoked, the command reports `unavailable`; local queue
commands continue to work.

There is no background process to cancel. Stop running `mirror-github` to stop future
updates. Existing issues remain on GitHub until a repository owner archives or removes
them. Cancel an unfinished connection receipt with
`pnpm connect cancel <action-id>`. Run `gh auth logout` and revoke the grant in GitHub's
account settings when the CLI connection itself should be removed.
