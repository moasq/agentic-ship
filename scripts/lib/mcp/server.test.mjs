// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createAgenticShipMcpServer, MCP_PROTOCOL_VERSION, MCP_TOOLS } from "./server.mjs";
import { createWorkStore, WORK_ROLES } from "../work-state.mjs";

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
    expect(listed.result.tools.find((item) => item.name === "get_verification_results").annotations.readOnlyHint).toBe(true);
    expect(listed.result.tools.find((item) => item.name === "get_connections").annotations.readOnlyHint).toBe(true);
    expect(listed.result.tools.find((item) => item.name === "get_work_status").annotations.readOnlyHint).toBe(true);
    expect(listed.result.tools.find((item) => item.name === "get_next_work").annotations.readOnlyHint).toBe(true);
    expect(listed.result.tools.find((item) => item.name === "get_ui_plan").annotations.readOnlyHint).toBe(true);
    expect(listed.result.tools.find((item) => item.name === "get_ui_evidence").annotations.readOnlyHint).toBe(true);
    expect(listed.result.tools.find((item) => item.name === "start_work").annotations.readOnlyHint).toBe(false);
    expect(listed.result.tools.find((item) => item.name === "wait_work").annotations.readOnlyHint).toBe(false);
    expect(listed.result.tools.find((item) => item.name === "resume_work").annotations.readOnlyHint).toBe(false);
    expect(listed.result.tools.find((item) => item.name === "block_work").annotations.readOnlyHint).toBe(false);
    expect(listed.result.tools.find((item) => item.name === "unblock_work").annotations.readOnlyHint).toBe(false);
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
    expect(health.result.structuredContent.data.exitCode).toBe(1);
    expect(verify.result.structuredContent.data.status).toBe("pass");
    expect(verify.result.structuredContent.data.exitCode).toBe(0);
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

    expect((await call(server, "get_work_status")).result.structuredContent.data.items).toHaveLength(1);
    expect((await call(server, "get_next_work", { role: "frontend-builder" })).result.structuredContent.data[0].id).toBe("feature-one");
    expect((await call(server, "get_ui_plan")).result.structuredContent.data.product.name).toBe("Demo");
    expect((await call(server, "get_ui_evidence")).result.structuredContent.data.inspection.status).toBe("not_applicable");
    const connections = (await call(server, "get_connections", { provider: "stripe" })).result.structuredContent.data;
    expect(connections.providers).toEqual([{ id: "stripe" }]);
    expect(connections.actions).toEqual([{ actionId: "conn_one", provider: "stripe" }]);
  });

  test("returns default when ui plan is missing", async () => {
    const root = fixture();
    const server = createAgenticShipMcpServer(root);
    await initialize(server);
    const plan = await call(server, "get_ui_plan");
    expect(plan.result.structuredContent.data).toEqual({ status: "not_configured" });
  });

  test("requires explicit mutation capability and executes complete mutation lifecycle", async () => {
    const root = fixture();
    const store = createWorkStore(root);
    store.init({ name: "Demo", goal: "Verify MCP" });
    store.add({ id: "backend", role: "backend-builder", summary: "Build", acceptanceCriteria: ["Pass"] });

    const readOnly = createAgenticShipMcpServer(root);
    await initialize(readOnly);
    expect((await call(readOnly, "start_work", { id: "backend" })).result.isError).toBe(true);

    const writable = createAgenticShipMcpServer(root, { allowMutations: true });
    await initialize(writable);
    
    // start work
    const startRes = await call(writable, "start_work", { id: "backend" });
    expect(startRes.result.isError).toBeUndefined();
    expect(startRes.result.structuredContent.data.status).toBe("in_progress");

    // wait work
    const waitRes = await call(writable, "wait_work", { id: "backend", actionId: "conn_setup", reason: "Need auth configuration" });
    expect(waitRes.result.isError).toBeUndefined();
    expect(waitRes.result.structuredContent.data.status).toBe("input_required");

    // resume work -> returns to ready
    const resumeRes = await call(writable, "resume_work", { id: "backend", evidence: "Auth configured" });
    expect(resumeRes.result.isError).toBeUndefined();
    expect(resumeRes.result.structuredContent.data.status).toBe("ready");

    // block work
    const blockRes = await call(writable, "block_work", { id: "backend", reason: "Dependency failure" });
    expect(blockRes.result.isError).toBeUndefined();
    expect(blockRes.result.structuredContent.data.status).toBe("blocked");

    // unblock work -> returns to ready
    const unblockRes = await call(writable, "unblock_work", { id: "backend", evidence: "Dependency resolved" });
    expect(unblockRes.result.isError).toBeUndefined();
    expect(unblockRes.result.structuredContent.data.status).toBe("ready");

    // restart work before complete
    await call(writable, "start_work", { id: "backend" });

    // complete work
    const completeRes = await call(writable, "complete_work", { id: "backend", evidence: ["Verification gate pass"] });
    expect(completeRes.result.isError).toBeUndefined();
    expect(completeRes.result.structuredContent.data.status).toBe("done");
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
