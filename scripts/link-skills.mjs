#!/usr/bin/env node
/**
 * Makes the `.claude/` views resolve to their `.agents/` sources on every platform:
 *
 *   .claude/skills  ->  .agents/skills    (the ten skills)
 *   .claude/agents  ->  .agents/agents    (the subagents — shipkit-* + playwright-*)
 *
 * Why this is a script and not `ln -s`:
 *   - Windows POSIX symlinks need Developer Mode or admin. Directory JUNCTIONS do not.
 *   - `git clone` with core.symlinks=false (the Windows default when symlinks are
 *     unavailable) writes a PLAIN TEXT FILE containing the link target instead of a
 *     link. Nothing errors. Skills silently disappear. This script detects that exact
 *     degenerate state and repairs it.
 *
 * Strategy, in order: junction (win32) / symlink (posix) -> copy + marker.
 * A copy is a last resort and is reported loudly: it breaks the single source of truth
 * until re-run. Nothing is deleted before the source it would be replaced with is
 * proven to exist.
 *
 *   node scripts/link-skills.mjs           repair if needed
 *   node scripts/link-skills.mjs --check   report only, exit 1 if wrong
 *   node scripts/link-skills.mjs --soft    repair, but never fail an install
 */
import { existsSync, lstatSync, readFileSync, readlinkSync, rmSync, cpSync, symlinkSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
// Used by postinstall: a warning is right, aborting someone's install is not.
const soft = process.argv.includes("--soft");

const LINKS = [
  {
    name: "skills",
    linkPath: join(root, ".claude", "skills"),
    targetAbs: join(root, ".agents", "skills"),
    targetRel: "../.agents/skills",
    markerPath: join(root, ".claude", ".skills-is-a-copy"),
  },
  {
    name: "agents",
    linkPath: join(root, ".claude", "agents"),
    targetAbs: join(root, ".agents", "agents"),
    targetRel: "../.agents/agents",
    markerPath: join(root, ".claude", ".agents-is-a-copy"),
  },
];

function state(l) {
  if (!exists(l.linkPath)) return "missing";
  const st = lstatSync(l.linkPath);
  if (st.isSymbolicLink()) {
    // Junctions report as symlinks on Windows; both are correct if they resolve to the
    // target. Resolve-and-compare only: an earlier version also accepted "any link that
    // happens to contain the probe file", which defeated wrong-target detection.
    const dest = resolve(dirname(l.linkPath), readlinkSync(l.linkPath));
    return dest === l.targetAbs ? "linked" : "wrong-target";
  }
  if (st.isFile()) {
    const body = readFileSync(l.linkPath, "utf8").trim();
    // The Windows checkout failure mode: the link's TEXT, written as a file.
    return body === l.targetRel || body.endsWith(`.agents/${l.name}`) ? "text-stub" : "foreign-file";
  }
  if (st.isDirectory()) return existsSync(l.markerPath) ? "copy" : "real-directory";
  return "unknown";
}

// lstat sees broken links that existsSync (which follows) misses.
function exists(p) {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

function link(l) {
  // Prove the replacement is possible BEFORE deleting anything: with the source dir
  // missing, the old order deleted the link, failed to create anything, and left the
  // repo worse than it found it.
  if (!existsSync(l.targetAbs)) return "no-source";
  mkdirSync(dirname(l.linkPath), { recursive: true });
  rmSync(l.linkPath, { recursive: true, force: true });
  rmSync(l.markerPath, { force: true });

  if (process.platform === "win32") {
    // Junctions need an ABSOLUTE target and, unlike symlinks, no elevation.
    try {
      symlinkSync(l.targetAbs, l.linkPath, "junction");
      return "junction";
    } catch {
      /* fall through */
    }
  }
  try {
    symlinkSync(l.targetRel, l.linkPath, "dir");
    return "symlink";
  } catch {
    cpSync(l.targetAbs, l.linkPath, { recursive: true });
    writeFileSync(
      l.markerPath,
      "Generated copy, not a link. Neither a junction nor a symlink could be created here.\n" +
        `Files are DUPLICATED: edit .agents/${l.name} only, then re-run \`pnpm link:skills\`.\n`,
    );
    return "copy";
  }
}

let worst = 0;
for (const l of LINKS) {
  const before = state(l);
  const label = `.claude/${l.name}`;

  if (before === "linked") {
    if (!checkOnly) console.log(`${l.name} link OK (${label} -> .agents/${l.name})`);
    continue;
  }
  if (before === "copy") {
    console.warn(`WARN  ${label} is a COPY, not a link. Edit .agents/${l.name}, then re-run \`pnpm link:skills\`.`);
    if (checkOnly) worst = Math.max(worst, 1);
    continue;
  }
  if (before === "foreign-file" || before === "real-directory") {
    console.error(`FAIL  ${label} exists and is not a ShipKit link (${before}). Refusing to delete it. Move it aside and re-run.`);
    worst = Math.max(worst, 1);
    continue;
  }
  if (checkOnly) {
    const why =
      before === "text-stub"
        ? "it is a text stub — this checkout has core.symlinks=false (normal on Windows)"
        : `state: ${before}`;
    console.error(`FAIL  ${label} does not resolve to .agents/${l.name}; ${why}. Fix: pnpm link:skills`);
    worst = Math.max(worst, 1);
    continue;
  }

  const how = link(l);
  if (how === "no-source") {
    console.error(`FAIL  .agents/${l.name} does not exist — nothing to link ${label} to. This checkout is incomplete.`);
    worst = Math.max(worst, 1);
  } else if (how === "copy") {
    console.warn(`WARN  created ${label} as a COPY (no link support here). Single source of truth is degraded — re-run after editing.`);
  } else {
    console.log(`created ${label} as a ${how}`);
  }
}

process.exit(worst && !soft ? 1 : 0);
