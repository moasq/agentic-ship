import { execSync } from "node:child_process";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SECRET_PATTERNS = [
  /sk_live_[0-9a-zA-Z]{24,}/g,
  /whsec_[0-9a-zA-Z]{24,}/g,
  /phx_[0-9a-zA-Z]{24,}/g,
  /bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi,
];

export function sanitizeText(text) {
  if (typeof text !== "string") return "";
  let out = text;
  for (const pat of SECRET_PATTERNS) {
    out = out.replace(pat, "[REDACTED_SECRET]");
  }
  return out;
}

export function formatStepSummary(gates, auditResult = null) {
  const lines = [
    "## 🚢 Agentic Ship Offline Verification Summary",
    "",
    "| Gate | Name | Status | Details |",
    "| :--- | :--- | :---: | :--- |",
  ];

  for (const g of gates) {
    const icon = g.passed ? "✅" : "❌";
    const details = sanitizeText(g.details || (g.passed ? "Passed cleanly" : "Failed"));
    lines.push(`| Gate ${g.id} | ${g.name} | ${icon} | ${details} |`);
  }

  if (auditResult) {
    lines.push("");
    lines.push("### 🛡️ Dependency Security Audit");
    lines.push(
      auditResult.passed
        ? "✅ No high or critical vulnerabilities found."
        : `⚠️ Audit reported vulnerabilities: ${sanitizeText(auditResult.summary)}`
    );
  }

  lines.push("");
  lines.push(`*Generated at ${new Date().toISOString()} by Agentic Ship Verification Action*`);
  return lines.join("\n");
}

export function formatGitHubAnnotation(gate) {
  if (gate.passed) return null;
  const message = sanitizeText(gate.details || `Verification Gate ${gate.id} (${gate.name}) failed.`);
  return `::error title=Gate ${gate.id} Failed (${gate.name})::${message}`;
}

export async function runVerificationGates(options = {}) {
  const { audit = false, failOnWarnings = false } = options;
  const gates = [
    { id: 1, name: "Lint & Code Quality", command: "pnpm lint", passed: true, details: "" },
    { id: 2, name: "Typecheck & Schema Validation", command: "pnpm typecheck", passed: true, details: "" },
    { id: 3, name: "Unit & Integration Tests", command: "pnpm test", passed: true, details: "" },
    { id: 4, name: "Agent Skills & Contracts", command: "node scripts/verify-skills.mjs", passed: true, details: "" },
    { id: 5, name: "Connections & Providers", command: "node scripts/verify-connections.mjs", passed: true, details: "" },
    { id: 6, name: "Work Queue & State Integrity", command: "node scripts/verify-work-queue.mjs", passed: true, details: "" },
  ];

  let allPassed = true;

  for (const gate of gates) {
    try {
      execSync(gate.command, { stdio: "pipe", encoding: "utf8" });
      gate.passed = true;
      gate.details = "Gate passed cleanly";
    } catch (err) {
      gate.passed = false;
      const stderr = err.stderr || err.stdout || err.message || "Execution error";
      gate.details = stderr.trim().split("\n")[0] || "Command failed with non-zero exit code";
      allPassed = false;
    }
  }

  let auditResult = null;
  if (audit) {
    try {
      execSync("pnpm audit --prod", { stdio: "pipe", encoding: "utf8" });
      auditResult = { passed: true, summary: "No production vulnerabilities" };
    } catch (err) {
      const summary = err.stdout || err.stderr || "Vulnerabilities detected";
      auditResult = { passed: false, summary: summary.trim().split("\n")[0] };
      if (failOnWarnings) {
        allPassed = false;
      }
    }
  }

  return { gates, allPassed, auditResult };
}

export async function main() {
  const audit = process.env.INPUT_AUDIT === "true";
  const failOnWarnings = process.env.INPUT_FAIL_ON_WARNINGS === "true";

  console.log("🚢 Running Agentic Ship Verification Gates...");
  const { gates, allPassed, auditResult } = await runVerificationGates({ audit, failOnWarnings });

  for (const gate of gates) {
    if (!gate.passed) {
      const ann = formatGitHubAnnotation(gate);
      if (ann) console.log(ann);
    }
  }

  const summaryMarkdown = formatStepSummary(gates, auditResult);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown + "\n", "utf8");
  }

  const passedCount = gates.filter((g) => g.passed).length;
  const totalCount = gates.length;

  if (process.env.GITHUB_OUTPUT) {
    const outputLines = [
      `passed=${allPassed ? "true" : "false"}`,
      `gates-passed=${passedCount}`,
      `gates-total=${totalCount}`,
    ].join("\n");
    appendFileSync(process.env.GITHUB_OUTPUT, outputLines + "\n", "utf8");
  }

  console.log(`\nVerification Result: ${passedCount}/${totalCount} gates passed.`);

  if (!allPassed) {
    console.error("❌ Agentic Ship Verification Failed.");
    process.exit(1);
  }

  console.log("✅ All Agentic Ship Verification Gates Passed!");
}

if (process.argv[1] && process.argv[1].endsWith("action-verify-runner.mjs")) {
  main().catch((err) => {
    console.error("Fatal action error:", err);
    process.exit(1);
  });
}
