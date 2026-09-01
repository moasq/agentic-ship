import { describe, expect, it } from "vitest";
import { inspectReadmeProviderCatalog } from "./readme-coherence.mjs";

const providers = {
  netlify: { capability: "deployment", displayName: "Netlify" },
  cloudflare: {
    capability: "deployment",
    displayName: "Cloudflare",
    agentTool: { automation: { run: [{ command: "pnpm provider:login cloudflare" }] } },
  },
  stripe: { capability: "billing", displayName: "Stripe" },
};

describe("README provider catalog sync", () => {
  it("passes when each supported deployment provider is onboarded", () => {
    const result = inspectReadmeProviderCatalog({
      providers,
      agents: "| `pnpm provider:login <cli>` | install (cloudflare) |",
      readme: "pnpm onboard netlify --host codex\npnpm onboard cloudflare --host codex\n### Not wired yet, and what a swap costs\n| Want instead | Wired today |",
    });
    expect(result).toEqual({ status: "PASS", issues: [] });
  });

  it("rejects a missing command and a supported provider listed as unwired", () => {
    const result = inspectReadmeProviderCatalog({
      providers,
      agents: "| `pnpm provider:login <cli>` | install (cloudflare) |",
      readme: "pnpm onboard netlify --host codex\n### Not wired yet, and what a swap costs\n| Cloudflare | Netlify |",
    });
    expect(result.status).toBe("FAIL");
    expect(result.issues).toHaveLength(2);
  });

  it("rejects a catalog login provider missing from the AGENTS command row", () => {
    const result = inspectReadmeProviderCatalog({
      providers,
      agents: "| `pnpm provider:login <cli>` | install (netlify) |",
      readme: "pnpm onboard netlify --host codex\npnpm onboard cloudflare --host codex",
    });
    expect(result.issues).toEqual(["AGENTS.md provider:login row is missing cloudflare"]);
  });

  it("checks the installer and MCP count against canonical project data", () => {
    const result = inspectReadmeProviderCatalog({
      providers: {},
      readme: "Run npx github:moasq/agentic-ship with 2 pinned MCP servers.",
      packageJson: { bin: { "agentic-ship": "bin/cli.js" } },
      lockfile: {
        installer: { command: "npx github:moasq/agentic-ship" },
        distribution: { scaffold: { install: "npx github:moasq/agentic-ship" } },
      },
      mcpServers: { one: {}, two: {} },
    });
    expect(result).toEqual({ status: "PASS", issues: [] });
  });

  it("rejects installer and MCP count drift", () => {
    const result = inspectReadmeProviderCatalog({
      providers: {},
      readme: "Run the old installer with 3 pinned MCP servers.",
      packageJson: { bin: { "agentic-ship": "old.js" } },
      lockfile: {
        installer: { command: "old installer" },
        distribution: { scaffold: { install: "old installer" } },
      },
      mcpServers: { one: {}, two: {} },
    });
    expect(result.status).toBe("FAIL");
    expect(result.issues).toHaveLength(5);
  });
});
