#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENTIC_WORKFLOW_IDS } from "./lib/agentic-workflows.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = mkdtempSync(join(tmpdir(), "agentic-aw-install-"));
const gh = process.platform === "win32" ? "gh.exe" : "gh";

function run(command, args) {
  const result = spawnSync(command, args, { cwd: fixture, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout || result.error?.message || "unknown error").trim()}`);
  }
}

try {
  run("git", ["init", "--quiet"]);
  for (const id of AGENTIC_WORKFLOW_IDS) {
    run(gh, [
      "aw",
      "add",
      join(root, ".github", "workflows", `${id}.md`),
      "--dir",
      ".github/workflows",
      "--force",
      "--no-gitattributes",
    ]);
  }
  for (const id of AGENTIC_WORKFLOW_IDS) {
    if (!existsSync(join(fixture, ".github", "workflows", `${id}.md`))) throw new Error(`${id} source was not installed`);
    if (!existsSync(join(fixture, ".github", "workflows", `${id}.lock.yml`))) throw new Error(`${id} lock file was not compiled`);
  }
  console.log("Agentic Workflows fixture install: PASS");
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
