import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SECRET_PATTERNS = [
  /(?:sk|rk)_(?:live|test)_[A-Za-z0-9_\-]{16,}/g,
  /whsec_[A-Za-z0-9_\-]{16,}/g,
  /phx_[A-Za-z0-9_\-]{16,}/g,
  /github_pat_[A-Za-z0-9_]+/g,
  /gh[pousr]_[A-Za-z0-9_]{20,}/g,
  /bearer\s+[A-Za-z0-9._\-]{20,}/gi,
];

export function sanitizeText(value) {
  let result = typeof value === "string" ? value : "";
  for (const pattern of SECRET_PATTERNS) result = result.replace(pattern, "[REDACTED_SECRET]");
  return result;
}

function conciseOutput(result) {
  return sanitizeText(`${result.stdout ?? ""}${result.stderr ?? ""}`)
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-12)
    .join(" · ");
}

function runPnpm(args, cwd) {
  return spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
}

export function formatGitHubAnnotation(gate) {
  if (gate.passed) return null;
  const title = sanitizeText(gate.name).replace(/[\r\n,]/g, " ");
  const message = sanitizeText(gate.details || `${gate.name} failed`)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
  return `::error title=${title}::${message}`;
}

function markdownCell(value) {
  return sanitizeText(String(value)).replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

export function formatStepSummary(gates) {
  const lines = [
    "## Agentic Ship verification",
    "",
    "| Gate | Result | Details |",
    "| --- | --- | --- |",
  ];
  for (const gate of gates) {
    lines.push(`| ${markdownCell(gate.name)} | ${gate.passed ? "Passed" : "Failed"} | ${markdownCell(gate.details)} |`);
  }
  return lines.join("\n");
}

export function runVerificationGates({ audit = false, cwd = process.cwd(), runner = runPnpm } = {}) {
  const definitions = [
    { name: "Offline verification", args: ["verify"] },
    ...(audit ? [{ name: "Supply-chain audit", args: ["audit:supply-chain"] }] : []),
  ];

  const gates = definitions.map((definition) => {
    const result = runner(definition.args, cwd);
    const passed = result.status === 0 && !result.error;
    return {
      name: definition.name,
      passed,
      details: passed ? "Passed" : conciseOutput(result) || sanitizeText(result.error?.message) || "Command failed",
    };
  });
  return { gates, allPassed: gates.every((gate) => gate.passed) };
}

export function main() {
  const audit = process.env.INPUT_AUDIT === "true";
  const { gates, allPassed } = runVerificationGates({ audit });

  for (const gate of gates) {
    const annotation = formatGitHubAnnotation(gate);
    if (annotation) process.stdout.write(`${annotation}\n`);
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${formatStepSummary(gates)}\n`, "utf8");
  }

  const passedCount = gates.filter((gate) => gate.passed).length;
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `passed=${allPassed}\ngates-passed=${passedCount}\ngates-total=${gates.length}\n`,
      "utf8",
    );
  }

  process.stdout.write(`Agentic Ship verification: ${passedCount}/${gates.length} gates passed.\n`);
  if (!allPassed) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
