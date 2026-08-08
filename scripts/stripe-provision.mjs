#!/usr/bin/env node
/**
 * pnpm stripe:provision [--plan <key> --usd <amount>] [--rotate] [--status]
 *
 * Provisions Stripe through the paired CLI so no dashboard clicking and no secret
 * pasting is ever needed:
 *
 *   default          ensure the Convex `/stripe/webhook` endpoint exists; on creation
 *                    the signing secret is parsed from the API response and piped
 *                    straight into `npx convex env set STRIPE_WEBHOOK_SECRET` —
 *                    it is never printed and never touches a file here
 *   --plan --usd     create the product + monthly recurring price for a plan key
 *                    (idempotent via Stripe lookup_key) and store STRIPE_PRICE_<KEY>;
 *                    the amount is a deliberate product decision, so it is required
 *   --rotate         delete + recreate the webhook endpoint to mint a fresh secret
 *   --status         booleans only: paired, webhook registered, env names present
 *   --test-key       copy the paired CLI's TEST-mode key into Convex env as
 *                    STRIPE_SECRET_KEY, so a sandbox can take a 4242 payment without a
 *                    human fetching anything. Read straight out of the CLI's own store,
 *                    piped to `convex env set`, never printed and never written here
 *
 * `--test-key` is hard-limited to test mode in three ways: it reads only
 * `test_mode_api_key`, it refuses any value that is not `sk_test_`/`rk_test_`, and it
 * refuses `--prod` outright. A LIVE key is never minted, copied or touched by this
 * script — Stripe issues those in the dashboard and they stay human, through
 * `pnpm secret:set STRIPE_SECRET_KEY`, which is also the right path for a restricted
 * key with a narrower scope than the CLI's.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function stripeJson(args) {
  const result = spawnSync("stripe", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error) fail(`The stripe CLI is not runnable: ${result.error.message}. Run \`pnpm provider:login stripe\` first.`);
  if (result.status !== 0) fail(`stripe ${args[0]} ${args[1] ?? ""} failed:\n${result.stderr.trim()}`);
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail(`stripe ${args[0]} returned unparseable output; not printing it in case it carries a secret.`);
  }
}

function convexEnvSet(name, value) {
  const result = spawnSync(npx, ["convex", "env", "set", name], {
    cwd: projectRoot,
    input: value,
    stdio: ["pipe", "ignore", "inherit"],
    encoding: "utf8",
  });
  if (result.status !== 0) fail(`npx convex env set ${name} failed (exit ${result.status}).`);
}

function convexEnvNames() {
  const result = spawnSync(npx, ["convex", "env", "list"], { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.split("=")[0].trim())
    .filter((name) => /^[A-Z][A-Z0-9_]*$/.test(name));
}

function envLocalValue(key) {
  const path = join(projectRoot, ".env.local");
  if (!existsSync(path)) return null;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${key}=`)) return trimmed.slice(key.length + 1).split(" #")[0].trim();
  }
  return null;
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const stripeConfigPath = join(homedir(), ".config", "stripe", "config.toml");
const paired = existsSync(stripeConfigPath);

/**
 * The paired CLI's TEST key, out of its own config, for the named profile only.
 *
 * `live_mode_api_key` sits in the same file and is deliberately unreachable from here:
 * this reads exactly one field name. The value is returned to the caller, handed to
 * `convex env set` over stdin, and never logged, echoed, or written to disk.
 */
function testModeKeyFromCli(profile) {
  if (!paired) return null;
  let inProfile = false;
  for (const raw of readFileSync(stripeConfigPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      inProfile = line === `[${profile}]`;
      continue;
    }
    if (!inProfile) continue;
    const match = /^test_mode_api_key\s*=\s*(.+)$/.exec(line);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}
const siteUrl = envLocalValue("NEXT_PUBLIC_CONVEX_SITE_URL");
const webhookUrl = siteUrl ? `${siteUrl.replace(/\/$/, "")}/stripe/webhook` : null;

if (flag("status")) {
  const names = convexEnvNames();
  const endpoints = paired && webhookUrl ? stripeJson(["webhook_endpoints", "list", "--limit", "100"]) : { data: [] };
  console.log(
    JSON.stringify(
      {
        cliPaired: paired,
        convexSiteUrlKnown: Boolean(webhookUrl),
        webhookRegistered: endpoints.data.some((endpoint) => endpoint.url === webhookUrl && endpoint.status === "enabled"),
        env: {
          STRIPE_SECRET_KEY: names.includes("STRIPE_SECRET_KEY"),
          STRIPE_WEBHOOK_SECRET: names.includes("STRIPE_WEBHOOK_SECRET"),
          prices: names.filter((name) => name.startsWith("STRIPE_PRICE_")),
        },
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (!paired) fail("The Stripe CLI is not paired. Run `pnpm provider:login stripe` first — the browser approval is the whole consent.");
if (!webhookUrl) fail("NEXT_PUBLIC_CONVEX_SITE_URL is missing from .env.local. Connect Convex first (`pnpm connect begin convex --host <host>`).");

if (flag("test-key")) {
  // Three independent refusals, because the same file holds a live key.
  if (flag("prod")) fail("--test-key never targets production. A live deployment takes a live key, set by a person: `pnpm secret:set STRIPE_SECRET_KEY`.");
  const profile = process.env.STRIPE_PROFILE ?? "default";
  const key = testModeKeyFromCli(profile);
  if (!key) fail(`No test_mode_api_key for profile "${profile}" in ${stripeConfigPath}. Run \`pnpm provider:login stripe\` to pair in test mode.`);
  if (!/^(sk|rk)_test_/.test(key)) fail("The paired key is not a TEST key. Refusing — this path never handles live credentials.");
  convexEnvSet("STRIPE_SECRET_KEY", key);
  console.log("STRIPE_SECRET_KEY set in Convex env from the paired CLI's TEST key (value never printed).");
  console.log("This is a sandbox credential. Going live is a separate, human step: `pnpm secret:set STRIPE_SECRET_KEY` against the prod deployment.");
}

const planKey = value("plan");
const usd = value("usd");
if ((planKey && !usd) || (!planKey && usd)) fail("--plan and --usd travel together: the price is a deliberate product decision.");

// Webhook endpoint — the secret exists in memory between these two calls and nowhere else.
const endpoints = stripeJson(["webhook_endpoints", "list", "--limit", "100"]);
const existing = endpoints.data.find((endpoint) => endpoint.url === webhookUrl);
if (existing && flag("rotate")) {
  stripeJson(["webhook_endpoints", "delete", existing.id]);
  console.log(`Rotated: deleted webhook endpoint ${existing.id} for ${webhookUrl}.`);
}
if (existing && !flag("rotate")) {
  console.log(`Webhook endpoint already registered for ${webhookUrl} (${existing.id}).`);
  if (!convexEnvNames().includes("STRIPE_WEBHOOK_SECRET")) {
    console.log("But STRIPE_WEBHOOK_SECRET is not in the Convex env — Stripe only reveals it at creation. Rerun with --rotate to mint a fresh one.");
  }
} else {
  const created = stripeJson(["webhook_endpoints", "create", "--url", webhookUrl, "--enabled-events", "*"]);
  if (!created.secret) fail("Stripe did not return a signing secret on creation; endpoint left as-is.");
  convexEnvSet("STRIPE_WEBHOOK_SECRET", created.secret);
  console.log(`Created webhook endpoint ${created.id} for ${webhookUrl}; STRIPE_WEBHOOK_SECRET set in Convex env (value never printed).`);
}

// Plan price — idempotent through Stripe's own lookup_key, so reruns reuse, never duplicate.
if (planKey && usd) {
  if (!/^[a-z][a-z0-9-]*$/.test(planKey)) fail("--plan must be a lowercase key, e.g. pro");
  const cents = Math.round(Number(usd) * 100);
  if (!Number.isInteger(cents) || cents <= 0) fail("--usd must be a positive amount, e.g. 19 or 19.5");
  const lookupKey = `agentic-ship-${planKey}-monthly`;
  const found = stripeJson(["prices", "list", "-d", `lookup_keys[]=${lookupKey}`]);
  let price = found.data.find((entry) => entry.lookup_key === lookupKey && entry.active);
  if (price) {
    console.log(`Price ${price.id} already exists for lookup key ${lookupKey}; reusing it.`);
  } else {
    const product = stripeJson(["products", "create", "--name", `${planKey[0].toUpperCase()}${planKey.slice(1)}`, "-d", `metadata[agentic_ship_plan]=${planKey}`]);
    price = stripeJson([
      "prices",
      "create",
      "-d",
      `product=${product.id}`,
      "-d",
      "currency=usd",
      "-d",
      `unit_amount=${cents}`,
      "-d",
      "recurring[interval]=month",
      "-d",
      `lookup_key=${lookupKey}`,
    ]);
    console.log(`Created product ${product.id} and monthly price ${price.id} ($${usd}/mo, test mode).`);
  }
  const envName = `STRIPE_PRICE_${planKey.toUpperCase().replaceAll("-", "_")}`;
  convexEnvSet(envName, price.id);
  console.log(`${envName}=${price.id} set in Convex env (price ids are not secrets).`);
}

const names = convexEnvNames();
if (!names.includes("STRIPE_SECRET_KEY")) {
  console.log("\nOne human step remains: run `pnpm secret:set STRIPE_SECRET_KEY` in your terminal (hidden input, straight into Convex env).");
}
