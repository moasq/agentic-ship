---
id: issue-clarification
name: Issue Clarification
engine: claude
trigger: issues
events: [opened, labeled]
maxCostUsd: 0.1
timeoutMinutes: 10
safeOutputs: [issue_comment]
---

# Issue Clarification

Evaluates newly opened issues against the feature contract and requests clarifications if requirements are underspecified.

## Security & Permission Invariants
- Permissions: `{"contents":"read","issues":"write"}`
- Max Budget: `$0.1`
- Timeout: `10 minutes`
