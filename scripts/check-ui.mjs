#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectUiContract } from "./lib/ui-contract.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const violations = inspectUiContract(root);

if (violations.length === 0) {
  console.log("UI contract: PASS — authored components follow the dependency, naming, fixture, purity, and token rules.");
  process.exit(0);
}

console.error(`UI contract: FAIL — ${violations.length} violation(s)\n`);
for (const violation of violations) {
  console.error(`  ${violation.file}${violation.line ? `:${violation.line}` : ""} [${violation.rule}] ${violation.message}`);
}
console.error("\nRun the component-picker and ui-system skills before repairing authored UI.");
process.exit(1);
