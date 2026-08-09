#!/usr/bin/env node
/**
 * The definition of done. Nothing is finished until this passes.
 *
 *   pnpm verify        tool health + adapter and MCP integrity + unit contracts
 *   pnpm verify:full   verify + supply-chain audit
 *
 * It exists as one command so that "did you check?" has a single answer, and so the
 * Stop hook in .claude/settings.json can enforce it without judgment: the hook runs
 * this, and a non-zero exit blocks the agent from declaring a task complete.
 *
 * Node only — no shell chaining — so it behaves identically on macOS, Linux and
 * Windows, where `&&` and `;` do not mean the same things.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const asHook = process.argv.includes("--hook"); // exit 2 on failure, which is what blocks a Stop
const quiet = process.argv.includes("--quiet") || asHook; // hooks require JSON-only stdout
const full = process.argv.includes("--full");

/**
 * Loop guard. A Stop hook that blocks fires again on the next stop; if the agent cannot
 * fix the failure, that is an infinite trap for the user. Claude Code sets
 * `stop_hook_active` when it is already continuing because of this hook, so the second
 * time through we report and get out of the way.
 */
if (asHook) {
  try {
    const input = JSON.parse(readFileSync(0, "utf8") || "{}");
    if (input.stop_hook_active) {
      process.stdout.write("{}\n");
      process.exit(0);
    }
  } catch {
    // No stdin (run by hand, or a harness that does not send one) — carry on.
  }
}

const steps = [
  { name: "health", cmd: "pnpm health", why: "tool assets and no bundled product application" },
  { name: "agent adapters", cmd: "pnpm check:agents", why: "canonical roles and generated host-native adapters" },
  { name: "MCP mirror", cmd: "pnpm check:mcp", why: "one pinned tool catalog across supported hosts" },
  { name: "UI tooling", cmd: "pnpm check:ui", why: "visual-plan tooling remains valid with no bundled UI" },
  { name: "unit", cmd: "pnpm test", why: "deterministic tool contracts" },
];

if (full) {
  steps.push(
    { name: "supply chain", cmd: "pnpm audit:supply-chain", why: "fail-closed production dependency audit" },
  );
}

const failures = [];

for (const step of steps) {
  if (!quiet) process.stdout.write(`  ${step.name} … `);
  // shell: true — pnpm is pnpm.cmd on Windows, and spawning across that difference is
  // exactly the kind of thing that breaks silently.
  const run = spawnSync(step.cmd, { cwd: root, shell: true, encoding: "utf8" });
  const ok = run.status === 0;
  if (!quiet) console.log(ok ? "ok" : "FAILED");
  if (!ok) failures.push({ ...step, output: `${run.stdout ?? ""}${run.stderr ?? ""}`.trim() });
}

if (failures.length === 0) {
  if (asHook) process.stdout.write("{}\n");
  if (!quiet) {
    console.log(
      full
        ? "\n  fully verified — tool health, integrity, contracts, and supply-chain gates are green.\n"
        : "\n  verified — tool health, adapters, MCP, UI tooling, and unit gates are green.\n",
    );
  }
  process.exit(0);
}

// On failure, always speak: print the decisive output, not a summary of it.
console.error(`\n  NOT DONE — ${failures.length} check(s) failed.\n`);
for (const f of failures) {
  console.error(`  --- ${f.name} ---`);
  console.error(
    f.output
      .split("\n")
      .slice(-25) // the tail is where the error is; the head is progress noise
      .map((l) => `  ${l}`)
      .join("\n"),
  );
  console.error("");
}
console.error("  Fix these before calling the task complete.\n");
// Exit 2 is what Claude Code reads as "block the stop"; anything else is advisory.
process.exit(asHook ? 2 : 1);
