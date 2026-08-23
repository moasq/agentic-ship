// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createAgenticShipMcpServer, MCP_PROTOCOL_VERSION, MCP_TOOLS } from "./mcp-server.mjs";
import { createWorkStore, WORK_ROLES } from "./work-state.mjs";

const roots = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "agentic-mcp-"));
  roots.push(root);
  return root;
}

function write(root, path, value) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, typeof value === "string" ? value : JSON.stringify(value), "utf8");
}

async function initialize(server, protocolVersion = MCP_PROTOCOL_VERSION) {
  return server.handleRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion, clientInfo: { name: "test", version: "1" }, capabilities: {} },
  });
}

async function call(server, name, args = {}, id = 2) {
  return server.handleRequest({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Agentic Ship MCP server", () => {
  test("negotiates the current protocol and declares read versus mutation tools", async () => {
    const server = createAgenticShipMcpServer(fixture());
    const initialized = await initialize(server, "2024-11-05");
    expect(initialized.result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);

    const listed = await server.handleRequest({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    expect(listed.result.tools).toHaveLength(MCP_TOOLS.length);
    expect(listed.result.tools.find((item) => item.name === "get_health").annotations.readOnlyHint).toBe(true);
    expect(listed.result.tools.find((item) => item.name === "complete_work").annotations.readOnlyHint).toBe(false);
    expect(listed.result.tools.every((item) => item.outputSchema)).toBe(true);
  });

  test("runs real health and verification services instead of hardcoding success", async () => {
    const runScript = vi
      .fn()
      .mockReturnValueOnce({ status: 1, stdout: "", stderr: "health failed" })
      .mockReturnValueOnce({ status: 0, stdout: "verified", stderr: "" });
    const server = createAgenticShipMcpServer(fixture(), { runScript });
    await initialize(server);

    const health = await call(server, "get_health");
    const verify = await call(server, "get_verification_results");
    expect(health.result.structuredContent.data.status).toBe("fail");
    expect(verify.result.structuredContent.data.status).toBe("pass");
    expect(runScript.mock.calls).toEqual([["health.mjs"], ["verify.mjs", ["--quiet"]]]);
  });

  test("reads canonical work, UI plan, evidence, and filtered connection status", async () => {
    const root = fixture();
    const store = createWorkStore(root);
    store.init({ name: "Demo", goal: "Verify MCP" });
    store.add({ id: "feature-one", role: "frontend-builder", summary: "Build", acceptanceCriteria: ["Pass"] });
    write(root, ".agents/ui/plan.json", { schemaVersion: 1, product: { name: "Demo" } });
    const connectionService = {
      status: () => ({
        type: "connection_status",
        providers: [{ id: "stripe" }, { id: "github" }],
        actions: [{ actionId: "conn_one", provider: "stripe" }, { actionId: "conn_two", provider: "github" }],
      }),
    };
    const server = createAgenticShipMcpServer(root, { connectionService });
    await initialize(server);

    expect((await call(server, "get_next_work", { role: "frontend-builder" })).result.structuredContent.data[0].id).toBe("feature-one");
    expect((await call(server, "get_ui_plan")).result.structuredContent.data.product.name).toBe("Demo");
    expect((await call(server, "get_ui_evidence")).result.structuredContent.data.inspection.status).toBe("not_applicable");
    const connections = (await call(server, "get_connections", { provider: "stripe" })).result.structuredContent.data;
    expect(connections.providers).toEqual([{ id: "stripe" }]);
    expect(connections.actions).toEqual([{ actionId: "conn_one", provider: "stripe" }]);
  });

  test("requires explicit mutation capability and required action identifiers", async () => {
    const root = fixture();
    const store = createWorkStore(root);
    store.init({ name: "Demo", goal: "Verify MCP" });
    store.add({ id: "backend", role: "backend-builder", summary: "Build", acceptanceCriteria: ["Pass"] });

    const readOnly = createAgenticShipMcpServer(root);
    await initialize(readOnly);
    expect((await call(readOnly, "start_work", { id: "backend" })).result.isError).toBe(true);

    const writable = createAgenticShipMcpServer(root, { allowMutations: true });
    await initialize(writable);
    expect((await call(writable, "wait_work", { id: "backend", reason: "Consent" })).result.isError).toBe(true);
    expect((await call(writable, "start_work", { id: "backend" })).result.isError).toBeUndefined();
  });

  test("rejects unsupported keys, roles, credentials, and personal data", async () => {
    const root = fixture();
    const store = createWorkStore(root);
    store.init({ name: "Demo", goal: "Verify MCP" });
    store.add({ id: "backend", role: "backend-builder", summary: "Build", acceptanceCriteria: ["Pass"] });
    const server = createAgenticShipMcpServer(root, { allowMutations: true });
    await initialize(server);

    expect((await call(server, "get_next_work", { role: "invented" })).result.isError).toBe(true);
    expect((await call(server, "start_work", { id: "backend", extra: true })).result.isError).toBe(true);
    await call(server, "start_work", { id: "backend" });
    const privateReason = await call(server, "block_work", { id: "backend", reason: "Contact person@example.com with github_pat_ABC12345678901234567890" });
    expect(privateReason.result.isError).toBe(true);
    expect(privateReason.result.content[0].text).not.toContain("person@example.com");
    expect(privateReason.result.content[0].text).not.toContain("github_pat_");
    const opaqueCredential = ["opaque", "private", "value"].join("-");
    const encodedCredential = await call(server, "block_work", {
      id: "backend",
      reason: JSON.stringify({ access_token: opaqueCredential }),
    });
    expect(encodedCredential.result.isError).toBe(true);
    expect(encodedCredential.result.content[0].text).not.toContain(opaqueCredential);
  });

  test("sanitizes every secret occurrence in tool output", async () => {
    const secrets = [`github_${"pat"}_${"A".repeat(30)}`, `sk_${"live"}_${"B".repeat(24)}`];
    const server = createAgenticShipMcpServer(fixture(), {
      runScript: () => ({ status: 1, stdout: secrets.join(" "), stderr: secrets.join(" ") }),
    });
    await initialize(server);
    const response = await call(server, "get_health");
    const serialized = JSON.stringify(response);
    for (const secret of secrets) expect(serialized).not.toContain(secret);
    expect(serialized.match(/\[REDACTED\]/g).length).toBeGreaterThan(1);
  });

  test("redacts secret-bearing keys and encoded JSON without hiding safe status metadata", async () => {
    const secrets = Array.from({ length: 15 }, (_, index) => `private-value-${index + 1}`);
    const connectionService = {
      status: () => ({
        type: "connection_status",
        status: "ready",
        tokenConfigured: true,
        secretConfigured: false,
        tokenType: "oauth",
        tokenBudget: 1200,
        tokenUsage: 300,
        accessTokenExpiresAt: "2026-08-23T00:00:00.000Z",
        apiKeyName: "deployment key",
        secretName: "CONVEX_DEPLOY_KEY",
        authorizationStatus: "verified",
        credentialSource: "cli",
        providers: [],
        actions: [],
        nested: {
          token: secrets[0],
          api_key: secrets[1],
          accessToken: secrets[2],
          refresh_token: secrets[3],
          clientSecret: secrets[4],
          webhook_secret: secrets[5],
          password: secrets[6],
          passphrase: secrets[7],
          private_key: secrets[8],
          provider_payload: { value: secrets[9] },
          token_value: secrets[12],
          apiKeyValue: secrets[13],
          credential_data: secrets[14],
        },
        encoded: JSON.stringify({
          status: "pending",
          authorization_code: secrets[10],
          nested: { deployKey: secrets[11] },
        }),
      }),
    };
    const server = createAgenticShipMcpServer(fixture(), { connectionService });
    await initialize(server);

    const response = await call(server, "get_connections");
    const data = response.result.structuredContent.data;
    expect(data).toMatchObject({
      type: "connection_status",
      status: "ready",
      tokenConfigured: true,
      secretConfigured: false,
      tokenType: "oauth",
      tokenBudget: 1200,
      tokenUsage: 300,
      accessTokenExpiresAt: "2026-08-23T00:00:00.000Z",
      apiKeyName: "deployment key",
      secretName: "CONVEX_DEPLOY_KEY",
      authorizationStatus: "verified",
      credentialSource: "cli",
    });
    expect(Object.values(data.nested)).toEqual(Array(13).fill("[REDACTED]"));
    expect(JSON.parse(data.encoded)).toEqual({
      status: "pending",
      authorization_code: "[REDACTED]",
      nested: { deployKey: "[REDACTED]" },
    });
    const serialized = JSON.stringify(response);
    for (const secret of secrets) expect(serialized).not.toContain(secret);
  });

  test("returns protocol errors for malformed lifecycle and unknown calls", async () => {
    const server = createAgenticShipMcpServer(fixture());
    expect((await server.handleRequest({ jsonrpc: "1.0", id: 1, method: "tools/list" })).error.code).toBe(-32600);
    expect((await server.handleRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" })).error.code).toBe(-32002);
    await initialize(server);
    expect(await server.handleRequest({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    expect((await call(server, "missing")).error.code).toBe(-32602);
    expect((await server.handleRequest({ jsonrpc: "2.0", id: 3, method: "missing" })).error.code).toBe(-32601);
  });

  test("keeps the role contract synchronized", () => {
    expect(MCP_TOOLS.find((item) => item.name === "get_next_work").inputSchema.properties.role.enum).toEqual(WORK_ROLES);
  });
});
