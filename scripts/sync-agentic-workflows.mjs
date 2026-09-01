#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyAgenticWorkflowLockDiff,
  classifyGhAwCompilation,
  classifyGhAwPreflight,
  readAgenticWorkflowCompilerVersion,
} from "./lib/agentic-workflow-compiler.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const command = process.platform === "win32" ? "gh.exe" : "gh";
const compilerVersion = readAgenticWorkflowCompilerVersion(root);
const preflight = spawnSync(command, ["aw", "--version"], { cwd: root, encoding: "utf8", stdio: "pipe" });
const preflightStatus = classifyGhAwPreflight(preflight);
if (preflightStatus === "missing_cli") {
  console.error("GitHub CLI is missing. Install it before compiling Agentic Workflows.");
  process.exit(1);
}
if (preflightStatus === "missing_extension") {
  console.error(`The gh-aw extension is missing. Install the reviewed compiler with: gh extension install github/gh-aw --pin ${compilerVersion}`);
  process.exit(1);
}

const compileArgs = ["aw", "compile", "--strict", "--validate", "--purge", "--no-check-update"];
if (process.argv.includes("--approve")) compileArgs.push("--approve");
const result = spawnSync(command, compileArgs, { cwd: root, stdio: "inherit" });

if (classifyGhAwCompilation(result) === "compile_failed") {
  console.error("Official gh-aw compilation failed. Repair the authored Markdown; never edit a .lock.yml file.");
  process.exit(result.status ?? 1);
}

if (process.argv.includes("--check")) {
  const diff = spawnSync(
    "git",
    ["diff", "--exit-code", "--", ".github/aw/actions-lock.json", ".github/workflows"],
    { cwd: root, stdio: "inherit" },
  );
  if (classifyAgenticWorkflowLockDiff(diff) === "stale") {
    console.error("Agentic Workflow lock files are stale. Run pnpm sync:aw and commit the official compiler output.");
    process.exit(diff.status ?? 1);
  }
}
