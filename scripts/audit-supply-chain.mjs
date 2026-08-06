#!/usr/bin/env node
/**
 * Networked production-dependency audit. This stays separate from `pnpm health`,
 * whose contract is to work offline, while giving CI and preflight one stable,
 * cross-platform command to call.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync("pnpm audit --prod --json", {
  cwd: root,
  shell: true,
  encoding: "utf8",
  timeout: 60_000,
  maxBuffer: 10 * 1024 * 1024,
});

let report;
try {
  report = JSON.parse(result.stdout || "{}");
} catch {
  console.error("\nSUPPLY CHAIN AUDIT FAILED — pnpm did not return a JSON report.\n");
  console.error((result.stderr || result.stdout || result.error?.message || "unknown pnpm audit failure").trim());
  process.exit(1);
}

const counts = report.metadata?.vulnerabilities;
if (!counts || typeof counts !== "object") {
  console.error("\nSUPPLY CHAIN AUDIT FAILED — the audit report has no vulnerability summary.\n");
  console.error((result.stderr || result.stdout || result.error?.message || "unknown pnpm audit failure").trim());
  process.exit(1);
}

const severities = ["critical", "high", "moderate", "low", "info"];
const total = severities.reduce((sum, severity) => sum + Number(counts[severity] || 0), 0);
const summary = severities.map((severity) => `${severity} ${Number(counts[severity] || 0)}`).join(" · ");

if (result.status !== 0 || total > 0) {
  console.error(`\nSUPPLY CHAIN AUDIT FAILED — ${summary}.\n`);
  for (const advisory of Object.values(report.advisories || {})) {
    console.error(`- ${advisory.module_name || advisory.name || "dependency"}: ${advisory.title || "security advisory"}`);
    if (advisory.url) console.error(`  ${advisory.url}`);
  }
  process.exit(1);
}

console.log(`\nSUPPLY CHAIN AUDIT PASS — ${summary}.`);
console.log(`Production dependencies checked: ${Number(report.metadata.dependencies || 0)}.\n`);
