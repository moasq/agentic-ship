#!/usr/bin/env node
/**
 * Tier-1 self-healing: every repair a script can PROVE, applied in order, then health
 * re-run as the receipt. No model involved, nothing creative — that is tier 2's job
 * (the testing skill), and it only starts where this stops.
 *
 * Hard boundary: this never touches secrets, env values, version pins, or anything on
 * the health CRITICAL list. Those failures are printed, not "fixed" — a script that
 * edits credentials is a much worse bug than the one it repairs.
 *
 *   pnpm heal
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd) => spawnSync(cmd, { cwd: root, shell: true, encoding: "utf8" });

const repairs = [
  {
    name: "skills link",
    fix: "node scripts/link-skills.mjs",
    why: "symlink, junction, or Windows text-stub repair",
  },
  {
    name: "mcp mirror",
    fix: "node scripts/sync-mcp.mjs",
    why: ".cursor/mcp.json regenerated from .mcp.json",
  },
  {
    name: "env scaffold",
    fix: "node scripts/init-env.mjs",
    why: ".env.local created if missing — never overwritten",
  },
  {
    name: "lockfile",
    check: "pnpm install --frozen-lockfile --lockfile-only",
    fix: "pnpm install --lockfile-only",
    why: "package.json and pnpm-lock.yaml resynced — the exact failure CI once caught",
  },
];

console.log("\n  tier-1 heal — deterministic repairs only\n");

for (const repair of repairs) {
  if (repair.check) {
    const probe = run(repair.check);
    if (probe.status === 0) {
      console.log(`  ${repair.name}: already sound`);
      continue;
    }
  }
  const result = run(repair.fix);
  console.log(`  ${repair.name}: ${result.status === 0 ? "repaired — " + repair.why : "FAILED (" + repair.why + ")"}`);
}

console.log("\n  proof:\n");
const health = run("pnpm health");
process.stdout.write(health.stdout ?? "");
if (health.status !== 0) {
  console.error("  Health is still not green. What remains needs judgment or a human — see the fix column above.");
}
process.exit(health.status ?? 1);
