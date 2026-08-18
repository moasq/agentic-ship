---
id: documentation-drift
name: Documentation Drift Detection
engine: claude
trigger: pull_request
events: [opened, synchronize]
maxCostUsd: 0.05
timeoutMinutes: 10
safeOutputs: [pull_request_comment]
---

# Documentation Drift Detection

Checks PR changes for script or command additions that are missing from README.md or docs/.

## Security & Permission Invariants
- Permissions: `{"contents":"read","pull-requests":"write"}`
- Max Budget: `$0.05`
- Timeout: `10 minutes`
