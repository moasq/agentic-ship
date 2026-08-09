#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectUiContract } from "./lib/ui-contract.mjs";
import { inspectUiEvidence } from "./lib/ui-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contractViolations = inspectUiContract(root);
const evidence = inspectUiEvidence(root);
const violations = [
  ...contractViolations,
  ...evidence.violations.map((violation) => ({
    file: ".agents/ui",
    rule: violation.rule,
    message: violation.message,
  })),
];

if (violations.length === 0) {
  if (evidence.status === "not_applicable") {
    console.log("UI contract: PASS — component rules are green; visual planning and evidence are N/A for the plain engine.");
  } else {
    console.log("UI contract: PASS — component rules, visual plan, screenshots, browser audits, and reviewed evidence are current.");
  }
  process.exit(0);
}

console.error(`UI contract: FAIL — ${violations.length} violation(s)\n`);
for (const violation of violations) {
  console.error(`  ${violation.file}${violation.line ? `:${violation.line}` : ""} [${violation.rule}] ${violation.message}`);
}
console.error("\nRun the visual-direction skill before implementation and visual-qa after repair; never accept evidence merely to silence this gate.");
process.exit(1);
