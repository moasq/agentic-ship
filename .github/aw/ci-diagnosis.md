---
id: ci-diagnosis
name: CI Failure Diagnosis
engine: codex
trigger: workflow_run
events: [completed]
maxCostUsd: 0.15
timeoutMinutes: 15
safeOutputs: [issue_comment, workflow_summary]
---

# CI Failure Diagnosis

Inspects failed workflow runs, identifies the failing verify gate, and pinpoints root cause and proposed fix.

## Security & Permission Invariants
- Permissions: `{"contents":"read","actions":"read","issues":"write"}`
- Max Budget: `$0.15`
- Timeout: `15 minutes`
