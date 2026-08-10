#!/usr/bin/env node
/**
 * Boot-probes every stdio MCP server in `.mcp.json` with a real JSON-RPC `initialize`
 * handshake, in parallel. Exists because a server can be perfectly configured and still
 * dead: a partially-extracted npx cache entry once broke the magicui server with
 * ERR_MODULE_NOT_FOUND while every static health check stayed green — each host just
 * silently lost the tools.
 *
 *   node scripts/probe-mcp.mjs --check   probe only, exit 1 on any hard failure
 *   node scripts/probe-mcp.mjs           probe, then repair the one failure this script
 *                                        can PROVE (a module error inside an _npx cache
 *                                        directory → remove that entry, refetch, retry)
 *
 * The npx cache is derived state — npx rebuilds a removed entry on the next run — so
 * clearing a provably corrupt entry is resolution, not a decision. Remote (HTTP)
 * servers are out of scope: their availability is the vendor's, probed by
 * `upstream-sync`, and a 401 from a key-gated server is a stage, not a failure.
 *
 * Outcomes per server: replies to initialize → ok; process dies first → FAIL (with the
 * decisive stderr line); still alive but silent at the deadline → indeterminate, which
 * never fails the run — some servers legitimately wait on project state.
 */
import { spawn } from "node:child_process";
import { rmSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname, sep, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
const DEADLINE_MS = 90_000; // cold npx fetches are slow; parallel probes hide most of it

const servers = Object.entries(
  JSON.parse(readFileSync(resolve(root, ".mcp.json"), "utf8")).mcpServers ?? {},
).filter(([, server]) => typeof server.command === "string");

const INITIALIZE = `${JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "agentic-ship-probe", version: "1" },
  },
})}\n`;

function probe(name, server) {
  return new Promise((done) => {
    const child = spawn(server.command, server.args ?? [], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
      // npx is npx.cmd on Windows; a shell resolves it. Args carry no user input.
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      done(result);
    };
    const timer = setTimeout(
      () => settle({ name, outcome: "indeterminate" }),
      DEADLINE_MS,
    );
    child.stdout.on("data", (data) => {
      stdout += data;
      for (const line of stdout.split("\n")) {
        try {
          const message = JSON.parse(line);
          if (message.id === 1 && (message.result || message.error)) {
            settle({ name, outcome: message.result ? "ok" : "protocol-error" });
          }
        } catch {
          // partial line or a server's non-JSON banner — keep reading
        }
      }
    });
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    child.on("error", (error) => settle({ name, outcome: "failed", stderr: String(error.message) }));
    child.on("exit", () => settle({ name, outcome: "failed", stderr }));
    child.stdin.write(INITIALIZE);
  });
}

/**
 * A module error inside an npx cache entry is the one failure with a provable repair.
 * This only pulls the candidate path OUT of the (untrusted) server stderr; it does not
 * decide anything is safe to delete — safeNpxCacheEntry does that.
 */
function corruptNpxCacheDir(stderr) {
  if (!/ERR_MODULE_NOT_FOUND|Cannot find module/.test(stderr ?? "")) return null;
  const match = (stderr ?? "").match(/([A-Za-z]:)?[/\\][^'"\n]*[/\\]_npx[/\\][0-9a-f]+/);
  return match ? match[0] : null;
}

/**
 * The rmSync target is parsed from a server's stderr — untrusted input — so it is
 * validated to the narrowest possible shape before deletion: the resolved path must be
 * exactly `<something>/_npx/<hex>`, i.e. its parent directory is literally named `_npx`,
 * its own name is a non-empty lowercase-hex string with no separators or `..`, and the
 * directory actually exists. Anything else (a traversal, a deeper path, a non-hex name,
 * a symlink swap that no longer resolves to that shape) returns null and nothing is
 * removed. Returns the safe absolute path, or null to refuse.
 */
function safeNpxCacheEntry(raw) {
  if (!raw) return null;
  const resolved = resolve(raw);
  const entry = basename(resolved);
  if (!/^[0-9a-f]+$/.test(entry)) return null; // strict hex, no `.`/`..`/separators
  const parent = resolved.slice(0, resolved.length - entry.length - 1);
  if (basename(parent) !== "_npx") return null; // must sit directly under an _npx root
  // Reconstructing the path from its validated parts must reproduce it exactly — this
  // rejects any residual `..`, doubled separators, or normalization surprise.
  if (`${parent}${sep}${entry}` !== resolved) return null;
  try {
    if (!statSync(resolved).isDirectory()) return null;
  } catch {
    return null; // gone or unreadable — nothing to remove
  }
  return resolved;
}

const results = await Promise.all(servers.map(([name, server]) => probe(name, server)));
let failed = 0;

for (const result of results) {
  if (result.outcome === "ok") {
    console.log(`  ${result.name}: ok`);
    continue;
  }
  if (result.outcome === "indeterminate") {
    console.log(`  ${result.name}: no handshake before the deadline, process alive — not treated as a failure`);
    continue;
  }
  const cacheDir = safeNpxCacheEntry(corruptNpxCacheDir(result.stderr));
  if (cacheDir && !checkOnly) {
    rmSync(cacheDir, { recursive: true, force: true });
    console.log(`  ${result.name}: corrupt npx cache entry removed (${cacheDir}) — refetching`);
    const retry = await probe(result.name, Object.fromEntries(servers)[result.name]);
    if (retry.outcome === "ok" || retry.outcome === "indeterminate") {
      console.log(`  ${result.name}: ok after refetch`);
      continue;
    }
  }
  failed += 1;
  const line = (result.stderr ?? "").split("\n").find((entry) => entry.trim()) ?? "no stderr";
  console.error(`  ${result.name}: FAILED — ${line.trim().slice(0, 160)}`);
}

process.exit(failed ? 1 : 0);
