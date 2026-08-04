#!/usr/bin/env node
/**
 * Generates `.cursor/mcp.json` from `.mcp.json`. Replaces `cp`, which does not exist on
 * Windows cmd/PowerShell.
 *
 * The mirror is kept BYTE-IDENTICAL on purpose: drift detection is then a string
 * compare with no parsing ambiguity, on every platform.
 *
 *   node scripts/sync-mcp.mjs           write the mirror
 *   node scripts/sync-mcp.mjs --check   report only, exit 1 on drift
 *   node scripts/sync-mcp.mjs --soft    write, but never fail an install
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, ".mcp.json");
const mirror = join(root, ".cursor", "mcp.json");
const checkOnly = process.argv.includes("--check");
const soft = process.argv.includes("--soft"); // postinstall: warn, never abort the install
const fail = () => process.exit(soft ? 0 : 1);

if (!existsSync(source)) {
  console.error("FAIL  .mcp.json is missing. It is the source of truth for tool wiring.");
  fail();
}

const wanted = readFileSync(source, "utf8");
JSON.parse(wanted); // fail loudly on a malformed source rather than mirroring garbage

const current = existsSync(mirror) ? readFileSync(mirror, "utf8") : null;

if (current === wanted) {
  if (!checkOnly) console.log("mcp mirror OK (.cursor/mcp.json matches .mcp.json)");
  process.exit(0);
}

if (checkOnly) {
  console.error(
    current === null
      ? "FAIL  .cursor/mcp.json is missing. Fix: pnpm sync:mcp"
      : "FAIL  .cursor/mcp.json has drifted from .mcp.json. It is generated — never edit it. Fix: pnpm sync:mcp",
  );
  fail();
}

mkdirSync(dirname(mirror), { recursive: true });
writeFileSync(mirror, wanted);
console.log("wrote .cursor/mcp.json from .mcp.json");
