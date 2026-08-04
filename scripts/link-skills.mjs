#!/usr/bin/env node
/**
 * Makes `.claude/skills` resolve to `.agents/skills` on every platform.
 *
 * Why this is a script and not `ln -s`:
 *   - Windows POSIX symlinks need Developer Mode or admin. Directory JUNCTIONS do not.
 *   - `git clone` with core.symlinks=false (the Windows default when symlinks are
 *     unavailable) writes a PLAIN TEXT FILE containing "../.agents/skills" instead of a
 *     link. Nothing errors. Skills silently disappear. This script detects that exact
 *     degenerate state and repairs it.
 *
 * Strategy, in order: junction (win32) / symlink (posix) -> copy + marker.
 * A copy is a last resort and is reported loudly: it breaks the single source of truth
 * until re-run.
 *
 *   node scripts/link-skills.mjs           repair if needed
 *   node scripts/link-skills.mjs --check   report only, exit 1 if wrong
 *   node scripts/link-skills.mjs --soft    repair, but never fail an install
 */
import { existsSync, lstatSync, readFileSync, readlinkSync, rmSync, cpSync, symlinkSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const linkPath = join(root, ".claude", "skills");
const targetAbs = join(root, ".agents", "skills");
const targetRel = "../.agents/skills";
const markerPath = join(root, ".claude", ".skills-is-a-copy");
const checkOnly = process.argv.includes("--check");
// Used by postinstall: a warning is right, aborting someone's install is not.
const soft = process.argv.includes("--soft");
const fail = (code = 1) => process.exit(soft ? 0 : code);

function state() {
  if (!existsSync(linkPath) && !isBrokenLink()) return "missing";
  const st = lstatSync(linkPath);
  if (st.isSymbolicLink()) {
    // Junctions report as symlinks on Windows; both are correct if they resolve.
    const dest = resolve(dirname(linkPath), readlinkSync(linkPath));
    return dest === targetAbs || existsSync(join(linkPath, "setup-health", "SKILL.md")) ? "linked" : "wrong-target";
  }
  if (st.isFile()) {
    const body = readFileSync(linkPath, "utf8").trim();
    // The Windows checkout failure mode: the link's TEXT, written as a file.
    return body === targetRel || body.endsWith(".agents/skills") ? "text-stub" : "foreign-file";
  }
  if (st.isDirectory()) return existsSync(markerPath) ? "copy" : "real-directory";
  return "unknown";
}

function isBrokenLink() {
  try {
    lstatSync(linkPath);
    return true;
  } catch {
    return false;
  }
}

function link() {
  mkdirSync(dirname(linkPath), { recursive: true });
  rmSync(linkPath, { recursive: true, force: true });
  rmSync(markerPath, { force: true });

  if (process.platform === "win32") {
    // Junctions need an ABSOLUTE target and, unlike symlinks, no elevation.
    try {
      symlinkSync(targetAbs, linkPath, "junction");
      return "junction";
    } catch {
      /* fall through */
    }
  }
  try {
    symlinkSync(targetRel, linkPath, "dir");
    return "symlink";
  } catch {
    cpSync(targetAbs, linkPath, { recursive: true });
    writeFileSync(
      markerPath,
      "Generated copy, not a link. Neither a junction nor a symlink could be created here.\n" +
        "Skills are DUPLICATED: edit .agents/skills only, then re-run `pnpm link:skills`.\n",
    );
    return "copy";
  }
}

const before = state();

if (before === "linked") {
  if (!checkOnly) console.log("skills link OK (.claude/skills -> .agents/skills)");
  process.exit(0);
}

if (before === "copy") {
  console.warn("WARN  .claude/skills is a COPY, not a link. Edit .agents/skills, then re-run `pnpm link:skills`.");
  if (checkOnly) fail();
  process.exit(0);
}

if (before === "foreign-file" || before === "real-directory") {
  console.error(`FAIL  .claude/skills exists and is not a ShipKit link (${before}). Refusing to delete it. Move it aside and re-run.`);
  fail();
}

if (checkOnly) {
  const why =
    before === "text-stub"
      ? "it is a text stub — this checkout has core.symlinks=false (normal on Windows)"
      : `state: ${before}`;
  console.error(`FAIL  .claude/skills does not resolve to .agents/skills; ${why}. Fix: pnpm link:skills`);
  fail();
}

const how = link();
console.log(
  how === "copy"
    ? "WARN  created .claude/skills as a COPY (no link support here). Single source of truth is degraded — re-run after editing skills."
    : `created .claude/skills as a ${how}`,
);
process.exit(0);
