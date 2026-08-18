# GitHub Work Queue Mirror Reference

This reference describes how Agentic Ship mirrors its host-neutral, durable local work queue (`.agent-state/work-items.json`) to GitHub Issues and Projects.

---

## 🎯 Architecture & Invariants

1. **Local Queue is the Source of Truth**: The local queue in `.agent-state/work-items.json` remains authoritative. GitHub acts solely as a zero-extra-service visibility and coordination surface.
2. **Issue Mapping**: Each work item in the durable queue maps 1:1 to a GitHub issue labeled `agentic-work`, `role:<role>`, and `status:<status>`.
3. **Idempotency**: Mirror operations are strictly idempotent. Re-running `pnpm agent:work mirror-github` checks `.agent-state/github-mirror.json` and creates zero duplicate issues or duplicate comments.
4. **Evidence & Lifecycle**:
   - When a work item reaches `done`, the mirror automatically attaches all gate evidence in a completion comment and closes the issue.
   - When a work item reaches `input_required`, a notification comment specifies the human-action reason.
5. **Security & Privacy**:
   - Credentials matching secret shapes (`sk_live_...`, `whsec_...`, `phx_...`) are automatically redacted to `[REDACTED_CREDENTIAL]`.
   - Prompts, raw transcripts, and private environment variables are never transmitted.
6. **Resilience**:
   - If the `gh` CLI is missing, unauthenticated, or fails, the local work queue continues execution without interruption.

---

## 💻 CLI Usage

```bash
# Mirror local work items to GitHub Issues
pnpm agent:work mirror-github

# Mirror local work items to GitHub Issues and link to a GitHub Project
pnpm agent:work mirror-github --project 1

# Output machine-readable JSON sync summary
pnpm agent:work mirror-github --json
```

---

## 📊 Status to Label Mapping

| Queue Status | GitHub Issue Label | GitHub Project Column | Issue State |
|---|---|---|---|
| `ready` | `status:ready` | `Todo` | `open` |
| `in_progress` | `status:in-progress` | `In Progress` | `open` |
| `input_required` | `status:input-required` | `Blocked` | `open` |
| `blocked` | `status:blocked` | `Blocked` | `open` |
| `done` | `status:done` | `Done` | `closed` |
