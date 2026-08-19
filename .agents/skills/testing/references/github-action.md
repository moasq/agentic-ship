# GitHub verification action

Use the repository action when a downstream project needs the same offline definition
of done in GitHub Actions. Pin the action to a reviewed commit SHA, not a branch name:

```yaml
name: Verify

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<reviewed-checkout-sha>
        with:
          persist-credentials: false
      - uses: moasq/agentic-ship@<reviewed-agentic-ship-sha>
```

The action installs the package-manager release pinned by the repository, installs with the frozen
lockfile, and runs `pnpm verify` from the checked-out project. Set `audit: "true"` to
also run the fail-closed `pnpm audit:supply-chain` gate. The networked audit is never
enabled implicitly.

The default token permission is read-only. The action uploads no artifacts and writes
only a concise job summary, outputs, and error annotations. Treat annotations as
public CI output: the runner redacts recognized credentials, but project tests must
still avoid printing secrets or personal data.

Update the pin by reviewing the target Agentic Ship commit, changing only the SHA, and
running the workflow on one known-green and one intentionally failing fixture. A fork
must allow actions from this public repository. If setup fails, confirm that the
consumer has `pnpm-lock.yaml`, Node 20 or newer, and the Agentic Ship `verify` and
`audit:supply-chain` scripts.

Remove the action by deleting its workflow step. It does not create repository state,
credentials, comments, or uploaded artifacts.
