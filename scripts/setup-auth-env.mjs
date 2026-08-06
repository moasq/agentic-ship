#!/usr/bin/env node
/**
 * Sets the auth seam's two required values in the Convex deployment env:
 * BETTER_AUTH_SECRET (generated here, hex, never printed) and SITE_URL.
 *
 *   pnpm setup:auth                 → SITE_URL defaults to http://localhost:3000
 *   pnpm setup:auth https://ex.com  → explicit SITE_URL
 *
 * Exists so the connection process can run the whole auth setup on the user's
 * behalf without the secret ever entering a transcript, chat, or agent state —
 * the value goes straight from the generator to the Convex CLI argument vector.
 * Pure Node, no shell, so it behaves identically on macOS, Linux and Windows.
 */
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const siteUrl = process.argv[2] ?? "http://localhost:3000";
if (!/^https?:\/\//.test(siteUrl)) {
  console.error(`FAIL  SITE_URL must be an http(s) URL, got: ${siteUrl}`);
  process.exit(1);
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function setEnv(name, value, shown) {
  const result = spawnSync(npx, ["convex", "env", "set", name, value], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (result.error || result.status !== 0) {
    console.error(`FAIL  could not set ${name} — is the deployment configured? (npx convex dev --once)`);
    process.exit(1);
  }
  console.log(`set ${name}${shown ? ` = ${shown}` : ""}`);
}

setEnv("BETTER_AUTH_SECRET", randomBytes(32).toString("hex"));
setEnv("SITE_URL", siteUrl, siteUrl);
console.log("auth env ready — the secret was not printed and must not be asked for");
