// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createAgenticShipMcpServer, MCP_TOOLS } from "./mcp-server.mjs";
import { createWorkStore } from "./work-state.mjs";

const roots = [];
const makeTempDir = () => {
  const root = mkdtempSync(join(tmpdir(), "agentic-mcp-"));
  roots.push(root);
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Agentic Ship MCP Server", () => {
  test("implements MCP protocol initialize and tools/list", async () => {
    const root = makeTempDir();
    const server = createAgenticShipMcpServer(root);

    const initRes = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });

    expect(initRes.result.serverInfo.name).toBe("agentic-ship");
    expect(initRes.result.protocolVersion).toBe("2024-11-05");

    const listRes = await server.handleRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });

    expect(listRes.result.tools).toHaveLength(MCP_TOOLS.length);
    const toolNames = listRes.result.tools.map((t) => t.name);
    expect(toolNames).toContain("get_health");
    expect(toolNames).toContain("get_work_status");
    expect(toolNames).toContain("complete_work");
  });

  test("executes read tools against workspace state", async () => {
    const root = makeTempDir();
    const store = createWorkStore(root);
    store.init({ name: "Demo Product", goal: "Test MCP Server" });
    store.add({
      id: "feature-1",
      role: "frontend-builder",
      summary: "Build login screen",
      acceptanceCriteria: ["Form submits"],
    });

    const server = createAgenticShipMcpServer(root);

    // 1. get_health
    const healthRes = await server.handleRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_health" },
    });
    const healthData = JSON.parse(healthRes.result.content[0].text);
    expect(healthData.status).toBe("healthy");
    expect(healthData.hasWorkState).toBe(true);

    // 2. get_work_status
    const workRes = await server.handleRequest({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "get_work_status" },
    });
    const workData = JSON.parse(workRes.result.content[0].text);
    expect(workData.product.name).toBe("Demo Product");
    expect(workData.items).toHaveLength(1);

    // 3. get_next_work
    const nextRes = await server.handleRequest({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "get_next_work", arguments: { role: "frontend-builder" } },
    });
    const nextData = JSON.parse(nextRes.result.content[0].text);
    expect(nextData[0].id).toBe("feature-1");
  });

  test("executes mutating tools with strict evidence and transition validation", async () => {
    const root = makeTempDir();
    const store = createWorkStore(root);
    store.init({ name: "Demo Product", goal: "Test MCP Mutations" });
    store.add({
      id: "feature-core",
      role: "backend-builder",
      summary: "Create core API",
      acceptanceCriteria: ["API passes tests"],
    });

    const server = createAgenticShipMcpServer(root);

    // 1. start_work
    const startRes = await server.handleRequest({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "start_work", arguments: { id: "feature-core" } },
    });
    expect(startRes.result.isError).toBeUndefined();

    // 2. complete_work without evidence fails
    const failCompleteRes = await server.handleRequest({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "complete_work", arguments: { id: "feature-core", evidence: [] } },
    });
    expect(failCompleteRes.result.isError).toBe(true);
    expect(failCompleteRes.result.content[0].text).toContain("complete_work requires non-empty evidence array");

    // 3. complete_work with valid gate evidence succeeds
    const successCompleteRes = await server.handleRequest({
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: {
        name: "complete_work",
        arguments: { id: "feature-core", evidence: ["npm test: all suites green"] },
      },
    });
    expect(successCompleteRes.result.isError).toBeUndefined();

    const finalState = store.load();
    expect(finalState.items[0].status).toBe("done");
  });

  test("returns JSON-RPC error on unknown methods or tools", async () => {
    const root = makeTempDir();
    const server = createAgenticShipMcpServer(root);

    const unknownMethodRes = await server.handleRequest({
      jsonrpc: "2.0",
      id: 9,
      method: "invalid/method",
    });
    expect(unknownMethodRes.error.code).toBe(-32601);

    const unknownToolRes = await server.handleRequest({
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: { name: "non_existent_tool" },
    });
    expect(unknownToolRes.error.code).toBe(-32601);
  });
});
