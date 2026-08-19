# Reusable Agentic Ship Verification GitHub Action

This document specifies the pinned, reusable GitHub Action and workflow for running Agentic Ship offline verification gates across downstream projects.

---

## 🎯 Usage in Downstream Projects

Add `.github/workflows/verify.yml` to your downstream project:

```yaml
name: Verify

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  verify:
    uses: moasq/agentic-ship/.github/workflows/verify-reusable.yml@main
    with:
      node-version: "22"
      pnpm-version: "9"
      audit: false
```

Or invoke the action directly via `uses: moasq/agentic-ship@main`:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: moasq/agentic-ship@main
    with:
      audit: false
```

---

## 🛡️ Security & Privacy Guarantees

1. **Minimal Permissions**: The action and workflow operate under `permissions: { contents: read }`.
2. **Immutable Action Pinning**: All third-party action dependencies (`setup-node`, `pnpm-setup`, `checkout`) are pinned to immutable commit SHAs.
3. **Secret Redaction**: Error logs, annotations, and Step Summaries automatically redact sensitive tokens (`sk_live_`, `whsec_`, `phx_`, Bearer tokens).
4. **Offline Isolation**: Does not upload `.agent-state/`, environment files, or unencrypted artifacts.
