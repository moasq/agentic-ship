#!/usr/bin/env node
/** Offline health gate for the tool repository itself, not a hosted product. */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "AGENTS.md",
  "README.md",
  ".mcp.json",
  "skills.lock.json",
  ".agents/skills",
  ".agents/agents",
  ".agents/contracts/product-brief.schema.json",
  ".agents/contracts/feature-contract.schema.json",
  ".agents/contracts/input-required.schema.json",
  ".agents/contracts/ui-plan.schema.json",
  ".agents/contracts/ui-review.schema.json",
];
const missing = required.filter((path) => !existsSync(resolve(root, path)));
const agents = existsSync(resolve(root, "AGENTS.md")) ? readFileSync(resolve(root, "AGENTS.md"), "utf8") : "";
const appPaths = ["src", "convex", "public", "e2e", "next.config.ts", "netlify.toml"];
const remainingApp = appPaths.filter((path) => existsSync(resolve(root, path)));
const nodeMajor = Number(process.versions.node.split(".")[0]);
const failures = [
  ...(nodeMajor >= 20 ? [] : [`Node ${process.versions.node}; Node 20+ is required`]),
  ...missing.map((path) => `missing tool asset: ${path}`),
  ...(agents.includes("# Agentic Ship") ? [] : ["AGENTS.md no longer declares Agentic Ship"]),
  ...remainingApp.map((path) => `application residue remains: ${path}`),
];
if (failures.length) {
  console.error("Tool health: FAIL\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Tool health: PASS — skills, contracts, adapters, MCP catalog, and Node runtime are ready; no web application is bundled.");
