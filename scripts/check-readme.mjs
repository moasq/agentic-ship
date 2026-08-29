#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConnectionCatalog } from "./lib/connections/catalog.mjs";
import { inspectReadmeProviderCatalog } from "./lib/readme-coherence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readme = readFileSync(resolve(root, "README.md"), "utf8");
const agents = readFileSync(resolve(root, "AGENTS.md"), "utf8");
const catalog = loadConnectionCatalog({ projectRoot: root });
const result = inspectReadmeProviderCatalog({ readme, agents, providers: catalog.providers });
if (result.status === "FAIL") {
  console.error("README sync: FAIL");
  for (const issue of result.issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log("README sync: PASS — supported deployment providers match the reader-facing catalog.");
