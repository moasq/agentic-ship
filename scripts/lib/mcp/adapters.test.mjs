// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  generateClaudeMcpConfig,
  generateCodexConfig,
  generateCodexPluginMcp,
  generateCursorMcp,
  generateHermesConfig,
  generateOpenclawConfig,
  generateAllHostMcpConfigs,
} from "./adapters.mjs";

const roots = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "agentic-adapters-"));
  roots.push(root);
  return root;
}

function write(root, path, value) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, typeof value === "string" ? value : JSON.stringify(value), "utf8");
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Agentic Ship MCP host config adapters", () => {
  test("generates Claude Code configuration without global side effects", () => {
    const root = fixture();
    const source = {
      mcpServers: {
        "agentic-ship": {
          command: "node",
          args: ["scripts/mcp-server.mjs", "--allow-mutations"],
        },
      },
    };
    write(root, ".mcp.json", source);

    const config = generateClaudeMcpConfig(root);
    expect(config.mcpServers["agentic-ship"]).toBeDefined();
    expect(config.mcpServers["agentic-ship"].command).toBe("node");
    expect(config.mcpServers["agentic-ship"].args).toEqual(["scripts/mcp-server.mjs", "--allow-mutations"]);
  });

  test("generates Codex configuration in TOML and direct JSON map", () => {
    const root = fixture();
    const source = {
      mcpServers: {
        "agentic-ship": {
          command: "node",
          args: ["scripts/mcp-server.mjs", "--allow-mutations"],
        },
        stripe: {
          type: "http",
          url: "https://mcp.stripe.com",
        },
        linear: {
          type: "http",
          url: "https://mcp.linear.app/mcp",
          headers: {
            Authorization: "${LINEAR_API_KEY}",
          },
        },
      },
    };
    write(root, ".mcp.json", source);

    const toml = generateCodexConfig(root);
    expect(toml).toContain("[agents]\nmax_concurrent_threads_per_session = 4");
    expect(toml).toContain("[mcp_servers.workspace-agentic-ship]");
    expect(toml).toContain('command = "node"');
    expect(toml).toContain('[mcp_servers.workspace-stripe]');
    expect(toml).toContain('url = "https://mcp.stripe.com"');
    expect(toml).toContain('[mcp_servers.workspace-linear]');
    expect(toml).toContain('bearer_token_env_var = "LINEAR_API_KEY"');

    const pluginJson = generateCodexPluginMcp(root);
    const parsedPlugin = JSON.parse(pluginJson);
    expect(parsedPlugin["agentic-ship"].command).toBe("node");
    expect(parsedPlugin.stripe.url).toBe("https://mcp.stripe.com");
    expect(parsedPlugin.linear.headers.Authorization).toBe("${LINEAR_API_KEY}");
  });

  test("generates Cursor MCP mirror matching source byte structure", () => {
    const root = fixture();
    const source = {
      mcpServers: {
        "agentic-ship": { command: "node", args: ["scripts/mcp-server.mjs"] },
      },
    };
    write(root, ".mcp.json", source);

    const mirror = generateCursorMcp(root);
    expect(JSON.parse(mirror)).toEqual(source);
  });

  test("generates Hermes and OpenClaw non-secret profile configurations", () => {
    const hermes = generateHermesConfig();
    expect(hermes).toContain('cwd: "${PROJECT_ROOT}"');
    expect(hermes).toContain('- "${PROJECT_ROOT}/.agents/skills"');
    expect(hermes).toContain("orchestrator_enabled: true");
    expect(hermes).not.toMatch(/(?:sk|rk)_(?:live|test)_/);

    const openclaw = generateOpenclawConfig();
    expect(openclaw).toContain('{ id: "agentic-ship", workspace: "<PROJECT_ROOT>" }');
    expect(openclaw).toContain('extraDirs: ["<PROJECT_ROOT>/.agents/skills"]');
    expect(openclaw).not.toMatch(/(?:token|secret|password)\s*[:=]/i);
  });

  test("generateAllHostMcpConfigs returns complete map of project-scoped outputs", () => {
    const root = fixture();
    const source = {
      mcpServers: {
        "agentic-ship": { command: "node", args: ["scripts/mcp-server.mjs", "--allow-mutations"] },
      },
    };
    write(root, ".mcp.json", source);

    const bundle = generateAllHostMcpConfigs(root);
    expect(bundle.claude.path).toBe(".claude/mcp.json");
    expect(bundle.codex.path).toBe(".codex/config.toml");
    expect(bundle.codexPlugin.path).toBe(".codex-plugin/mcp.json");
    expect(bundle.cursor.path).toBe(".cursor/mcp.json");
    expect(bundle.hermes.path).toBe(".hermes/profile/config.yaml");
    expect(bundle.openclaw.path).toBe(".openclaw/config.json5");
  });
});
