#!/usr/bin/env node
/**
 * pnpm seed --slug <workspace-slug>
 *
 * Fills an existing shelf with showcase content: eight books across all three states,
 * margin notes, and one published book so the public share page has something real
 * behind it. For demos, screenshots and manual exploration — never for production.
 *
 * The mutation it calls is INTERNAL, so there is no browser path to it, and it is gated
 * on `ALLOW_TEST_SEED`. This script sets that flag on the DEV deployment only and
 * refuses `--prod` outright; `pnpm preflight --prod` FAILS if the flag ever exists on
 * production, which is what keeps seeded rows out of a real tenant.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const args = process.argv.slice(2);

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (args.includes("--prod")) {
  fail("Seeding never targets production. Showcase rows in a real tenant are indistinguishable from customer data.");
}

const value = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const slug = value("slug");
if (!slug) {
  fail(
    "Usage: pnpm seed --slug <workspace-slug> [--books N] [--offset N] [--over-limit]\n\n" +
      "Sign up in the app first — the slug is the last segment of /app/<slug>.\n" +
      "`--offset` starts further into the catalogue, so a second shelf shows different books.\n" +
      "`--over-limit` ignores the plan's book ceiling; by default a Free shelf stops at 12,\n" +
      "because a Free shelf showing sixty books contradicts your own pricing page.",
  );
}

const payload = { slug };
if (value("books")) payload.books = Number(value("books"));
if (value("offset")) payload.offset = Number(value("offset"));
if (args.includes("--over-limit")) payload.overLimit = true;

function convex(commandArgs, options = {}) {
  return spawnSync(npx, ["convex", ...commandArgs], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

// The flag is a deliberate switch, so say out loud when it gets turned on.
const listed = convex(["env", "list"], { quiet: true });
if (listed.status !== 0) fail("Could not read the Convex env. Connect first: `npx convex dev`.");
const names = (listed.stdout ?? "").split(/\r?\n/).map((line) => line.split("=")[0].trim());

if (!names.includes("ALLOW_TEST_SEED")) {
  console.log("Setting ALLOW_TEST_SEED on the DEV deployment (preflight fails if it ever reaches prod).");
  const set = spawnSync(npx, ["convex", "env", "set", "ALLOW_TEST_SEED"], {
    cwd: projectRoot,
    input: "1",
    stdio: ["pipe", "inherit", "inherit"],
    encoding: "utf8",
  });
  if (set.status !== 0) fail("Could not set ALLOW_TEST_SEED.");
}

const run = convex(["run", "seed:demo", JSON.stringify(payload)]);
if (run.status !== 0) process.exit(run.status ?? 1);

console.log(`\nSeeded "${slug}". Open /app/${slug} to see it.`);
console.log("To take the flag back off: `npx convex env remove ALLOW_TEST_SEED`.");
