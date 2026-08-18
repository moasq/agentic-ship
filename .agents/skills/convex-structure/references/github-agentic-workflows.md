# GitHub Agentic Workflows (`gh aw`) Reference

This reference details the native GitHub Agentic Workflows integration in Agentic Ship, providing automated issue clarification, CI failure diagnosis, documentation drift detection, upstream PR reviews, and release note drafting.

---

## 🎯 Architecture & Invariants

1. **Deterministic CI Backstop**: Traditional CI runs independently as the definition-of-done backstop. Agentic workflows complement CI without overriding verification gates.
2. **Multi-Engine Support**: Workflows support `codex`, `claude`, and `copilot` engines.
3. **Least Privilege Permissions**:
   - `contents: read` is enforced across all workflows (`contents: write` is strictly forbidden).
   - Mutations are allowed only through declared safe outputs (`issue_comment`, `pull_request_comment`, `pull_request_review`, `workflow_summary`, `check_annotation`).
4. **Cost & Timeout Guardrails**:
   - Every workflow carries an explicit `maxCostUsd` budget (e.g. `$0.05` to `$0.20`) and `timeoutMinutes` ceiling.
5. **Secret Isolation**: Secrets are kept completely out of the agent runtime.

---

## 📦 Starter Workflows

| ID | Name | Engine | Trigger | Safe Outputs |
|---|---|---|---|---|
| `issue-clarification` | Issue Clarification | `claude` | `issues: [opened, labeled]` | `issue_comment` |
| `ci-diagnosis` | CI Failure Diagnosis | `codex` | `workflow_run: [completed]` | `issue_comment`, `workflow_summary` |
| `documentation-drift` | Documentation Drift | `claude` | `pull_request: [opened, synchronize]` | `pull_request_comment` |
| `upstream-review` | Upstream PR Review | `copilot` | `pull_request_target: [opened]` | `pull_request_review` |
| `release-notes` | Release Note Drafting | `claude` | `push: [main]` | `workflow_summary` |

---

## 💻 Synchronization Command

```bash
# Synchronize and compile all authored workflows in .github/aw/ to .github/workflows/
pnpm sync:aw
```
