import { readFileSync } from "node:fs";
import { join } from "node:path";

export function readAgenticWorkflowCompilerVersion(root) {
  const source = readFileSync(join(root, "aw.yml"), "utf8");
  const match = source.match(/^min-version:\s*(v\d+\.\d+\.\d+)\s*$/m);
  if (!match) throw new Error("aw.yml must declare an exact min-version");
  return match[1];
}

export function classifyGhAwPreflight(result) {
  if (result.error?.code === "ENOENT") return "missing_cli";
  if (result.status !== 0) return "missing_extension";
  return "ready";
}

export function classifyGhAwCompilation(result) {
  if (result.status === 0 && !result.error) return "compiled";
  return "compile_failed";
}

export function classifyAgenticWorkflowLockDiff(result) {
  return result.status === 0 && !result.error ? "current" : "stale";
}
