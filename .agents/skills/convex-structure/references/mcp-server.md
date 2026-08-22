# Agentic Ship Project MCP Server

Reference for the convex-structure skill and AI agent engineering workflows. The Agentic Ship Model Context Protocol (MCP) server exposes workspace health, verification results, provider connection status, durable work queue management, UI planning, and visual evidence validation through a local, stdio-based JSON-RPC protocol interface.

## Installation

The MCP server is implemented natively in Node.js and executes locally over stdio with zero open network ports.

- **Entrypoint**: `scripts/mcp-server.mjs`
- **Implementation**: `scripts/lib/mcp/server.mjs`
- **Host Config Adapters**: `scripts/lib/mcp/adapters.mjs`
- **Execution**: `node scripts/mcp-server.mjs [--allow-mutations]`

When launched without `--allow-mutations`, the server operates in strict read-only mode, rejecting any state transitions or queue mutations.

## Configuration across Hosts

Agentic Ship supports generating project-scoped MCP configurations across supported AI coding hosts without altering global user configuration directories.

### 1. Claude Code
Declared in `.mcp.json` at the repository root and mirrored in `.claude/mcp.json`:
```json
{
  "mcpServers": {
    "agentic-ship": {
      "command": "node",
      "args": ["scripts/mcp-server.mjs", "--allow-mutations"]
    }
  }
}
```

### 2. OpenAI Codex
Generated in `.codex/config.toml` and `.codex-plugin/mcp.json`:
```toml
[mcp_servers.workspace-agentic-ship]
command = "node"
args = ["scripts/mcp-server.mjs", "--allow-mutations"]
```

### 3. Cursor
Generated in `.cursor/mcp.json` via `pnpm sync:mcp`:
```json
{
  "mcpServers": {
    "agentic-ship": {
      "command": "node",
      "args": ["scripts/mcp-server.mjs", "--allow-mutations"]
    }
  }
}
```

### 4. Hermes
Configured in `.hermes/profile/config.yaml` using project-scoped discovery:
```yaml
terminal:
  cwd: "${PROJECT_ROOT}"
skills:
  external_dirs:
    - "${PROJECT_ROOT}/.agents/skills"
```

### 5. OpenClaw
Template provided in `.openclaw/config.json5`:
```json5
{
  agents: {
    list: [
      { id: "agentic-ship", workspace: "<PROJECT_ROOT>" }
    ]
  },
  skills: {
    load: {
      extraDirs: ["<PROJECT_ROOT>/.agents/skills"]
    }
  }
}
```

Synchronize all host adapters and mirrors with:
```text
pnpm sync:mcp
pnpm sync:agents
```

## Verification

Verify server integrity, protocol contracts, and host mirrors using the standard gates:

```text
pnpm verify
```

To run the complete gate suite including supply chain verification:
```text
pnpm verify:full
```

To test unit and contract specifications directly:
```text
pnpm test
```

### Direct Protocol Verification
A client initializes the server via JSON-RPC 2.0 handshake on stdio:
```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","clientInfo":{"name":"test-client","version":"1.0"},"capabilities":{}}}
```
Server responds with negotiated protocol version `2025-06-18` and capability metadata.

## Tool Catalog

All tools return a versioned JSON envelope (`schemaVersion: 1`) containing the tool name and validated result data.

### Read-Only Tools

| Tool | Purpose | Arguments | Return Data |
| --- | --- | --- | --- |
| `get_health` | Runs workspace health check (`pnpm health`) | `{}` | `{ status: "pass" \| "fail", exitCode: number, output: string[] }` |
| `get_verification_results` | Runs offline definition-of-done gate (`pnpm verify`) | `{}` | `{ status: "pass" \| "fail", exitCode: number, output: string[] }` |
| `get_connections` | Reads provider connections and actions | `{ provider?: string }` | `{ type: "connection_status", providers: [...], actions: [...] }` |
| `get_work_status` | Reads the durable work queue | `{}` | Queue state containing all items, roles, and status |
| `get_next_work` | Reads ready work for a specific role | `{ role: string }` | Array of ready work items matching role |
| `get_ui_plan` | Reads `.agents/ui/plan.json` | `{}` | Parsed UI plan or `{ status: "not_configured" }` |
| `get_ui_evidence` | Inspects screenshot captures and review manifest | `{}` | `{ inspection: {...}, manifest: {...} }` |

### Mutation Tools (Enabled with `--allow-mutations`)

| Tool | Purpose | Arguments | Transition / Effect |
| --- | --- | --- | --- |
| `start_work` | Starts a ready queue item | `{ id: string }` | `ready` &rarr; `in_progress` |
| `wait_work` | Pauses work for human action / OAuth | `{ id: string, actionId: string, reason: string }` | `in_progress` &rarr; `input_required` |
| `resume_work` | Resumes work after human step | `{ id: string, evidence: string }` | `input_required` &rarr; `ready` |
| `block_work` | Marks work blocked by dependency | `{ id: string, reason: string }` | `in_progress` &rarr; `blocked` |
| `unblock_work` | Unblocks work with evidence | `{ id: string, evidence: string }` | `blocked` &rarr; `ready` |
| `complete_work` | Completes work with gate evidence | `{ id: string, evidence: string[] }` | `in_progress` &rarr; `done` |

## Example Workflows

### 1. Autonomous Triage & Queue Dispatch
```json
// 1. Query ready tasks for the backend-builder role
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_next_work","arguments":{"role":"backend-builder"}}}

// 2. Claim and start the first task
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"start_work","arguments":{"id":"convex-schema-init"}}}
```

### 2. Human In the Loop (OAuth / Service Provisioning)
```json
// When an external service requires user interaction in the browser:
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"wait_work","arguments":{"id":"stripe-provisioning","actionId":"stripe_connect","reason":"Waiting for user to authenticate Stripe account in dashboard"}}}

// Once the user completes the action:
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"resume_work","arguments":{"id":"stripe-provisioning","evidence":"Stripe webhook and secret keys verified in Convex environment"}}}
```

### 3. Verification-Gated Completion
```json
// Check definition-of-done before completion:
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"get_verification_results","arguments":{}}}

// Complete the work item with required gate evidence:
{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"complete_work","arguments":{"id":"convex-schema-init","evidence":["pnpm verify pass","convex schema validated"]}}}
```

## Security & Revocation

### Secret and Data Sanitization
- All tool outputs and error messages are filtered through strict regex sanitizers that redact API keys (`sk_`, `rk_`, `ghp_`, `github_pat_`), webhook secrets (`whsec_`), bearer tokens, and credentials with `[REDACTED]`.
- Personal data (email addresses, phone numbers, payment card patterns) and internal transcripts/prompts are stripped.
- Mutation inputs containing private tokens or secrets are immediately rejected with schema errors.

### Access Revocation & Removal
1. **Revoke Mutation Access**:
   Remove `--allow-mutations` from `.mcp.json` under `agentic-ship.args` and run `pnpm sync:mcp` and `pnpm sync:agents`.
2. **Complete Removal**:
   Delete the `agentic-ship` server block from `.mcp.json`, run `pnpm sync:mcp` and `pnpm sync:agents`, and verify with `pnpm verify`.
