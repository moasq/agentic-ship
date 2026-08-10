#!/usr/bin/env node
/**
 * Agentic Ship installer.
 *
 * Copies the toolkit payload — rules, skills, role briefs, host adapters, the
 * pinned MCP catalog, and the Node scripts behind every `pnpm` command — into
 * the current directory, so any agentic host can drive the project from there.
 *
 * Run from the project you want to adopt it in:
 *
 *   npx github:moasq/agentic-ship            # install here, skip anything present
 *   npx github:moasq/agentic-ship --force    # overwrite files that already exist
 *   npx github:moasq/agentic-ship --merge    # also merge scripts into package.json
 *   npx github:moasq/agentic-ship --dry-run  # show what would happen, write nothing
 *
 * Pure Node, zero dependencies, no shell. Uses fs/path only, copies real files
 * (never symlinks — `pnpm install` recreates the skills link on the buyer's
 * machine), and never touches git. Same behaviour on macOS, Linux and Windows.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

// The payload root is this file's own package, the way `npx` unpacks it.
const PACKAGE_DIR = path.resolve(__dirname, "..");
const TARGET_DIR = process.cwd();

// Top-level entries the buyer actually needs. Everything else in the repo —
// .git, node_modules, .github (our CI), .next, test-results, .agent-state,
// .env.local, this bin/, and the repo's own README — is deliberately excluded.
const PAYLOAD = [
  ".agents",
  ".claude",
  ".claude-plugin",
  ".codex",
  ".codex-plugin",
  ".cursor",
  ".hermes",
  ".openclaw",
  "agents",
  "scripts",
  "AGENTS.md",
  "CLAUDE.md",
  ".mcp.json",
  "components.json",
  "vitest.config.mts",
  "pnpm-workspace.yaml",
  "skills.lock.json",
  "LICENSE",
  ".gitignore",
  ".gitattributes",
];

function parseArgs(argv) {
  const flags = { force: false, merge: false, dryRun: false, help: false };
  for (const arg of argv) {
    switch (arg) {
      case "--force":
      case "-f":
        flags.force = true;
        break;
      case "--merge":
      case "-m":
        flags.merge = true;
        break;
      case "--dry-run":
      case "-n":
        flags.dryRun = true;
        break;
      case "--help":
      case "-h":
        flags.help = true;
        break;
      default:
        console.warn(`Unknown option: ${arg} (ignored)`);
    }
  }
  return flags;
}

const USAGE = `Agentic Ship installer

Usage: npx github:moasq/agentic-ship [options]

Installs the toolkit into the current directory. Existing files are skipped and
reported by default; nothing is overwritten unless you ask for it.

Options:
  -f, --force     overwrite files that already exist in the target
  -m, --merge     merge pnpm scripts + devDependencies into an existing package.json
  -n, --dry-run   report what would change without writing anything
  -h, --help      show this help
`;

/**
 * Recursively copy a payload entry. Skips symlinks (the skills link is recreated
 * by `pnpm install`), skips existing files unless force, and records every path.
 */
function copyTree(src, dest, flags, report) {
  const stat = fs.lstatSync(src);

  if (stat.isSymbolicLink()) {
    report.symlinks.push(path.relative(TARGET_DIR, dest));
    return;
  }

  if (stat.isDirectory()) {
    if (!flags.dryRun) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyTree(path.join(src, entry), path.join(dest, entry), flags, report);
    }
    return;
  }

  // Regular file.
  const exists = fs.existsSync(dest);
  if (exists && !flags.force) {
    report.skipped.push(path.relative(TARGET_DIR, dest));
    return;
  }

  if (!flags.dryRun) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
  (exists ? report.overwritten : report.created).push(
    path.relative(TARGET_DIR, dest)
  );
}

/**
 * package.json is never blindly overwritten. With no target file we drop ours in;
 * with an existing one we merge scripts + devDependencies under --merge, or print
 * the entries to merge by hand otherwise.
 */
function handlePackageJson(flags, report) {
  const srcPath = path.join(PACKAGE_DIR, "package.json");
  const destPath = path.join(TARGET_DIR, "package.json");
  const ours = JSON.parse(fs.readFileSync(srcPath, "utf8"));

  if (!fs.existsSync(destPath)) {
    if (!flags.dryRun) fs.writeFileSync(destPath, JSON.stringify(ours, null, 2) + "\n");
    report.created.push("package.json");
    report.pkgNote =
      "package.json created — set your own name/version before publishing.";
    return;
  }

  const theirs = JSON.parse(fs.readFileSync(destPath, "utf8"));

  if (!flags.merge) {
    report.pkgNote =
      "package.json already exists — left untouched.\n" +
      "  Re-run with --merge to add the scripts + devDependencies below, or copy them in:\n" +
      indent(JSON.stringify({ scripts: ours.scripts }, null, 2), 4) +
      "\n" +
      indent(
        JSON.stringify(
          {
            devDependencies: ours.devDependencies,
            packageManager: ours.packageManager,
          },
          null,
          2
        ),
        4
      );
    return;
  }

  // --merge: add missing keys, preserving everything the buyer already has.
  theirs.scripts = theirs.scripts || {};
  theirs.devDependencies = theirs.devDependencies || {};
  const mergedScripts = [];
  const conflicts = [];

  for (const [name, cmd] of Object.entries(ours.scripts || {})) {
    if (name in theirs.scripts && !flags.force) {
      conflicts.push(name);
    } else {
      theirs.scripts[name] = cmd;
      mergedScripts.push(name);
    }
  }
  for (const [name, ver] of Object.entries(ours.devDependencies || {})) {
    if (!(name in theirs.devDependencies) || flags.force) {
      theirs.devDependencies[name] = ver;
    }
  }
  if (!theirs.packageManager || flags.force) {
    theirs.packageManager = ours.packageManager;
  }

  if (!flags.dryRun) {
    fs.writeFileSync(destPath, JSON.stringify(theirs, null, 2) + "\n");
  }
  report.merged.push("package.json");
  report.pkgNote =
    `package.json merged: added scripts [${mergedScripts.join(", ") || "none"}]` +
    (conflicts.length
      ? `; kept your existing [${conflicts.join(", ")}] (use --force to replace)`
      : "");
}

function indent(text, spaces) {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => pad + line)
    .join("\n");
}

function printSummary(flags, report) {
  const line = "-".repeat(48);
  console.log("\n" + line);
  console.log(flags.dryRun ? "Agentic Ship — dry run (no files written)" : "Agentic Ship installed");
  console.log(line);
  console.log(`  created:     ${report.created.length}`);
  console.log(`  skipped:     ${report.skipped.length}` + (report.skipped.length ? "  (already present — use --force to overwrite)" : ""));
  if (report.overwritten.length) console.log(`  overwritten: ${report.overwritten.length}`);
  if (report.merged.length) console.log(`  merged:      ${report.merged.length}`);
  if (report.symlinks.length) console.log(`  links:       ${report.symlinks.length}  (recreated by pnpm install)`);
  console.log(line);

  if (report.pkgNote) console.log("\n" + report.pkgNote);

  console.log("\nNext:");
  console.log("  1. pnpm install        # deps + recreate the skills link (postinstall)");
  console.log("  2. open this folder in your agentic host (Claude Code, Codex, Cursor, ...)");
  console.log("  3. say what you want to build — the agent reads AGENTS.md and follows it");
  console.log("");
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(USAGE);
    return;
  }

  const report = {
    created: [],
    skipped: [],
    overwritten: [],
    merged: [],
    symlinks: [],
    pkgNote: "",
  };

  console.log(`Installing Agentic Ship into ${TARGET_DIR}`);
  if (flags.dryRun) console.log("(dry run — nothing will be written)");

  for (const entry of PAYLOAD) {
    const src = path.join(PACKAGE_DIR, entry);
    if (!fs.existsSync(src)) continue; // tolerate a slimmed-down payload
    copyTree(src, path.join(TARGET_DIR, entry), flags, report);
  }

  handlePackageJson(flags, report);
  printSummary(flags, report);
}

main();
