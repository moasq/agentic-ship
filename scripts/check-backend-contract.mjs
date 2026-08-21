#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectBackendContract } from "./lib/backend-contract.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = inspectBackendContract(root);

if (!result.applicable) {
  console.log("Backend contract: PASS — N/A for the plain engine; no downstream Convex backend exists.");
  process.exit(0);
}

if (result.violations.length === 0) {
  console.log("Backend contract: PASS — billing authority and owned-document boundaries are statically enforced.");
  process.exit(0);
}

console.error(`Backend contract: FAIL — ${result.violations.length} violation(s)\n`);
for (const violation of result.violations) {
  console.error(`- ${violation.file}:${violation.line} [${violation.rule}] ${violation.message}`);
}
process.exit(1);
