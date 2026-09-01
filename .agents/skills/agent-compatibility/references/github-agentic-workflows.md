# GitHub Agentic Workflows starter bundle

Agentic Ship ships five opt-in workflows as an installable `aw.yml` package. Authored
Markdown and official `.lock.yml` compiler output live together under
`.github/workflows/`. Edit only the Markdown. `.github/agents/agentic-workflows.md` and
`.github/skills/agentic-workflows/` are owned by `gh aw init`; `pnpm sync:agents` does
not generate or replace them.

## Install and authenticate

Install the official compiler at the version recorded by the package, then initialize
the target repository for the engine it will use:

```text
gh extension install github/gh-aw --pin v0.87.10
gh aw init --engine copilot --no-mcp
gh aw add moasq/agentic-ship@<reviewed-commit-sha>
```

Copilot uses the repository's `copilot-requests: write` permission. Claude requires the
repository secret `ANTHROPIC_API_KEY`; Codex accepts `CODEX_API_KEY` or
`OPENAI_API_KEY`. The official compiler keeps these credentials in its isolated proxy
path and excludes them from the agent container. Do not add secrets to workflow
frontmatter, prompts, artifacts, or agent state.

Set the repository variable `AGENTIC_WORKFLOWS_ENABLED` to `true` only after reviewing
the compiled permissions, secrets manifest, action SHAs, container digests, budgets,
triggers, and safe outputs. Until then the five workflow jobs are disabled.

## Starter workflows

| Workflow | Engine | Output |
| --- | --- | --- |
| Issue clarification | Claude | At most one safe issue comment when contract decisions are missing |
| CI diagnosis | Codex | Read-only workflow summary for a failed main-branch CI run |
| Documentation drift | Claude | At most one safe pull-request comment |
| Upstream dependency review | Copilot | One safe COMMENT review with bounded inline comments |
| Release note draft | Claude | Read-only workflow summary after main advances or a manual run |

All five treat repository and event content as untrusted, deny general agent network
access, set time and AI-credit budgets, and give the agent read permissions only. Any
write is performed by a declared safe-output job. The ordinary `ci.yml` verification
workflow remains independent and authoritative.

## Compile, trial, and debug

Run `pnpm sync:aw` after editing a source. It calls the official compiler in strict
validation mode and refreshes `.lock.yml` files plus `.github/aw/actions-lock.json`.
CI runs `pnpm check:aw` to compile again and reject drift, then installs all five local
sources into a clean fixture with `pnpm test:aw`.

Use `gh aw trial <workflow>` before enabling a new output, `gh aw run <workflow>` for a
deliberate run, `gh aw logs <workflow>` for execution logs, and `gh aw audit <run-id>`
for the security receipt. A missing engine secret, disabled Actions permission, or
blocked network request is a configuration failure; do not weaken strict mode.

## Update or remove

Review a new `gh-aw` release before changing `min-version`, reinstall the extension at
that exact version, run `gh aw upgrade`, recompile, and inspect the lock-file manifest
diff. Update installed remote sources with `gh aw update` only when their source and
commit are still expected.

Use `gh aw disable <workflow>` for a reversible pause. Use `gh aw remove <workflow>` to
remove an installed workflow, and remove `AGENTIC_WORKFLOWS_ENABLED` plus unused engine
secrets when retiring the bundle. Removing the bundle never changes the repository's
ordinary CI gate.
