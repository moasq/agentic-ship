---
id: upstream-review
name: Upstream Dependency and Security Review
engine: copilot
trigger: pull_request_target
events: [opened]
maxCostUsd: 0.2
timeoutMinutes: 20
safeOutputs: [pull_request_review]
---

# Upstream Dependency and Security Review

Audits PR diffs for secret leakage, supply chain pin violations, and unexpected network egress.

## Security & Permission Invariants
- Permissions: `{"contents":"read","pull-requests":"write"}`
- Max Budget: `$0.2`
- Timeout: `20 minutes`
