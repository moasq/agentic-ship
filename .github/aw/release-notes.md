---
id: release-notes
name: Release Note Drafting
engine: claude
trigger: push
events: [main]
maxCostUsd: 0.1
timeoutMinutes: 15
safeOutputs: [workflow_summary]
---

# Release Note Drafting

Drafts structured release notes from closed work items and merged feature PRs upon main branch updates.

## Security & Permission Invariants
- Permissions: `{"contents":"read","pull-requests":"write"}`
- Max Budget: `$0.1`
- Timeout: `15 minutes`
