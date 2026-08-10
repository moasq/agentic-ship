#!/usr/bin/env node
/**
 * Opens one provider URL in the user's browser, after the user has said yes.
 *
 *   pnpm open:url https://dashboard.convex.dev/
 *
 * The redirect step of a connection handoff: the agent asks the consent question,
 * and on "yes" runs this instead of telling the user to go find the page. HTTPS only,
 * and the origin must appear in the connection catalog (a provider's setupUrl or
 * docsUrl) — a URL that arrived from anywhere else, including a provider response or
 * a web page, is not openable with this script. Pure Node dispatch to the platform
 * opener, so it behaves the same on macOS, Linux and Windows.
 */
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { catalogOrigins, classifyOpenUrl } from "./lib/url-allowlist.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const raw = process.argv[2];

if (!raw) {
  console.error("usage: pnpm open:url <https-url from the connection catalog>");
  process.exit(1);
}

const catalog = JSON.parse(readFileSync(join(root, ".agents", "connections", "providers.json"), "utf8"));
const allowedOrigins = catalogOrigins(catalog);

const verdict = classifyOpenUrl(raw, allowedOrigins);
if (!verdict.ok) {
  if (verdict.reason === "invalid-url") {
    console.error(`FAIL  not a valid URL: ${raw}`);
  } else if (verdict.reason === "not-https") {
    console.error(`FAIL  https only (got ${verdict.protocol}).`);
  } else {
    console.error(
      `FAIL  ${verdict.origin} is not a connection-catalog origin.\n` +
        `      Allowed: ${[...allowedOrigins].sort().join(", ")}\n` +
        "      Adding a provider surface is a catalog change in .agents/connections/providers.json, not a flag.",
    );
  }
  process.exit(1);
}
const url = verdict.url;

const openers = {
  darwin: { command: "open", args: [url.href] },
  win32: { command: "cmd", args: ["/c", "start", "", url.href] },
};
const opener = openers[process.platform] ?? { command: "xdg-open", args: [url.href] };
const result = spawnSync(opener.command, opener.args, { stdio: "ignore" });
if (result.error || result.status !== 0) {
  console.error(`FAIL  could not open a browser here. Open this yourself: ${url.href}`);
  process.exit(1);
}
console.log(`opened ${url.href}`);
