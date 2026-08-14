#!/usr/bin/env node
/**
 * The prose-vs-package gate. Generators gate their outputs; prose was ungated, so
 * AGENTS.md, README, skills, providers.json, and settings could promise a
 * `pnpm <name>` that package.json never defined. This gate closes that seam.
 *
 * Two independent checks, one exit code:
 *   1. Command reconciliation — every `pnpm <name>` written in prose/config resolves
 *      to a package.json script, a pnpm builtin, or a documented downstream-only
 *      command. (Reverse gap — defined-but-unmentioned scripts — is a warning only.)
 *   2. Lock reconciliation — skills.lock.json agrees with .agents/skills/ on disk,
 *      and with .mcp.json on servers: same names, same counts, both directions.
 *
 * Node only, no shell-isms — identical on macOS, Linux, and Windows.
 *
 *   node scripts/check-commands.mjs            report, exit 1 on drift
 *   node scripts/check-commands.mjs --quiet    print only on failure
 *
 * The downstream escape hatch and extraction strategy are documented in
 * scripts/lib/check-commands-lib.mjs.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractPnpmRefs,
  classifyRefs,
  isDownstream,
  unreferencedScripts,
  reconcile,
} from "./lib/check-commands-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const quiet = process.argv.includes("--quiet");
const rel = (p) => relative(root, p) || p;

function readIf(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** Every *.md under a directory, recursively (skills SKILL.md + references/). */
function markdownUnder(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...markdownUnder(p));
    else if (entry.endsWith(".md")) out.push(p);
  }
  return out.sort();
}

// ── Sources that make command promises ────────────────────────────────────────
const sourceFiles = [
  join(root, "AGENTS.md"),
  join(root, "README.md"),
  ...markdownUnder(join(root, "docs")),
  ...markdownUnder(join(root, ".agents", "skills")),
  ...readdirSync(join(root, ".agents", "agents"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => join(root, ".agents", "agents", f)),
  join(root, ".agents", "connections", "providers.json"),
  join(root, ".claude", "settings.json"),
].filter((p) => existsSync(p));

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const scripts = new Set(Object.keys(pkg.scripts ?? {}));

// ── Check 1: command reconciliation ───────────────────────────────────────────
const missingRefs = [];
const referencedNames = new Set();
for (const file of sourceFiles) {
  const refs = extractPnpmRefs(readFileSync(file, "utf8"));
  for (const r of refs) referencedNames.add(r.name);
  const { missing } = classifyRefs(refs, scripts);
  for (const r of missing) missingRefs.push({ ...r, file });
}

// scripts run only by pnpm itself / lifecycle, never named in prose — not "unused".
const IMPLICIT_SCRIPTS = ["postinstall"];
const unused = unreferencedScripts(scripts, referencedNames, { implicit: IMPLICIT_SCRIPTS });

// ── Check 2: lock reconciliation (skills + MCP) ───────────────────────────────
const lock = JSON.parse(readFileSync(join(root, "skills.lock.json"), "utf8"));

const skillDirs = readdirSync(join(root, ".agents", "skills")).filter((d) =>
  statSync(join(root, ".agents", "skills", d)).isDirectory(),
);
const skillsRecon = reconcile(
  (lock.skills ?? []).map((s) => s.name),
  skillDirs,
  { lockLabel: "skills.lock.json", diskLabel: ".agents/skills/" },
);

const mcpSource = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
const mcpRecon = reconcile(
  (lock.mcp ?? []).map((s) => s.name),
  Object.keys(mcpSource.mcpServers ?? {}),
  { lockLabel: "skills.lock.json", diskLabel: ".mcp.json" },
);

// ── Verdict ───────────────────────────────────────────────────────────────────
const failed = missingRefs.length > 0 || !skillsRecon.ok || !mcpRecon.ok;

if (!failed) {
  if (!quiet) {
    console.log(
      "commands: PASS — every documented `pnpm <name>` resolves to a script, builtin, or downstream command; " +
        `skills.lock.json matches ${skillDirs.length} skill dirs and ${mcpRecon.diskCount} MCP servers.`,
    );
    if (unused.length > 0) {
      console.log(`  note — ${unused.length} script(s) defined but never documented: ${unused.join(", ")}`);
    }
  }
  process.exit(0);
}

const problems = missingRefs.length + (skillsRecon.ok ? 0 : 1) + (mcpRecon.ok ? 0 : 1);
console.error(`commands: FAIL — ${problems} problem(s)\n`);

if (missingRefs.length > 0) {
  console.error("  Documented `pnpm <name>` with no matching package.json script:");
  for (const r of missingRefs) {
    console.error(`    ${rel(r.file)}:${r.line}  pnpm ${r.name}`);
  }
  console.error(
    "\n  Fix: add the script to package.json, correct the reference, or — if it is a\n" +
      "  product-workspace command — add it to DOWNSTREAM_ONLY in scripts/lib/check-commands-lib.mjs.\n",
  );
}

for (const [recon, source] of [
  [skillsRecon, "Skills"],
  [mcpRecon, "MCP servers"],
]) {
  if (recon.ok) continue;
  console.error(`  ${source}: ${recon.lockLabel} disagrees with ${recon.diskLabel}`);
  if (recon.countMismatch) {
    console.error(`    count mismatch: ${recon.lockCount} locked vs ${recon.diskCount} on ${recon.diskLabel}`);
  }
  for (const n of recon.missingFromLock) console.error(`    on ${recon.diskLabel}, missing from lock: ${n}`);
  for (const n of recon.missingFromDisk) console.error(`    in lock, missing from ${recon.diskLabel}: ${n}`);
  console.error("    Fix: reconcile via the upstream-sync skill; never hand-edit versions.\n");
}

process.exit(1);
