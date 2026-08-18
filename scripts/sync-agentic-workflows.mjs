#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { syncAgenticWorkflows } from "./lib/agentic-workflows.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const results = syncAgenticWorkflows(root);

console.log(`Synchronized ${results.length} GitHub Agentic Workflows:`);
for (const r of results) {
  console.log(`  - ${r.id} -> ${r.yamlPath}`);
}
