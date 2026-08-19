#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const command = process.platform === "win32" ? "gh.exe" : "gh";
const result = spawnSync(
  command,
  ["aw", "compile", "--strict", "--validate", "--purge", "--no-check-update"],
  { cwd: root, stdio: "inherit" },
);

if (result.error?.code === "ENOENT") {
  console.error("GitHub CLI is missing. Install it, then install the pinned gh-aw extension documented in the Agentic Workflows guide.");
  process.exit(1);
}
if (result.status !== 0) {
  console.error("Official gh-aw compilation failed. Repair the authored Markdown; never edit a .lock.yml file.");
  process.exit(result.status ?? 1);
}

if (process.argv.includes("--check")) {
  const diff = spawnSync(
    "git",
    ["diff", "--exit-code", "--", ".github/aw/actions-lock.json", ".github/workflows"],
    { cwd: root, stdio: "inherit" },
  );
  if (diff.status !== 0) {
    console.error("Agentic Workflow lock files are stale. Run pnpm sync:aw and commit the official compiler output.");
    process.exit(diff.status ?? 1);
  }
}
