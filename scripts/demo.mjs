#!/usr/bin/env node
/**
 * pnpm demo [--accounts N] [--books N] [--base http://localhost:3000] [--over-limit]
 *
 * Stands up a showcase: creates N demo readers through the app's OWN sign-up flow, then
 * fills each of their shelves from the catalogue in `convex/seed.ts` and prints the
 * credentials so you can sign in and demo any of them.
 *
 * Sign-up runs in a real browser rather than against the auth endpoint directly, because
 * creating the account is only half of it — the client also creates the reader's first
 * workspace, and a shelf is what the demo is about.
 *
 * Dev only, and it says so in three places: it refuses `--prod`, the seed it calls is an
 * internal mutation gated on `ALLOW_TEST_SEED`, and `pnpm preflight --prod` FAILS if
 * that flag ever exists on production. The accounts are synthetic — `.test` is a
 * reserved TLD that cannot receive mail — and they share one obvious demo password.
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

const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

if (flag("prod")) fail("The demo never targets production. Showcase rows in a real tenant are indistinguishable from customer data.");

const accounts = Math.min(Math.max(1, Number(value("accounts", "3"))), 12);
const books = Math.min(Math.max(1, Number(value("books", "24"))), 66);
const base = value("base", "http://localhost:3000").replace(/\/$/, "");
const password = "showcase-demo-password";

/** Readers, so the seeded shelves are attributed to people rather than to "user 3". */
const READERS = [
  "Ada Okonkwo",
  "Idris Bassey",
  "Priya Raman",
  "Mateo Alvarez",
  "Noor Haddad",
  "Lena Fischer",
  "Tomas Nowak",
  "Sofia Ricci",
  "Hana Suzuki",
  "Omar Farouk",
  "Grace Mwangi",
  "Elias Berg",
];

function convex(commandArgs, options = {}) {
  return spawnSync(npx, ["convex", ...commandArgs], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

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

const reachable = await fetch(`${base}/robots.txt`).then((r) => r.ok).catch(() => false);
if (!reachable) fail(`Nothing is serving ${base}. Start the app first (\`pnpm dev\`), or pass --base <url>.`);

// `@playwright/test` is the dependency this repo actually pins (gate G3); it re-exports
// the browser launchers, so there is no second Playwright package to install.
let chromium;
try {
  ({ chromium } = await import("@playwright/test"));
} catch {
  fail("Playwright is not available. Run `pnpm install`, then `npx playwright install chromium`.");
}

const stamp = Date.now();
const browser = await chromium.launch();
const created = [];

for (let i = 0; i < accounts; i += 1) {
  const name = READERS[i % READERS.length];
  const email = `demo-${stamp}-${i + 1}@marginalia.test`;
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${base}/sign-up`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/app\/[^/]+$/, { timeout: 60_000 });

    const slug = new URL(page.url()).pathname.split("/").filter(Boolean)[1];
    created.push({ name, email, slug });
    console.log(`  signed up ${name} → /app/${slug}`);
  } catch (error) {
    console.error(`  could not create ${name}: ${error.message.split("\n")[0]}`);
  } finally {
    await context.close();
  }
}

await browser.close();
if (!created.length) {
  fail(
    `No accounts were created.\n\n` +
      `The usual cause is the origin: Better Auth refuses a credential POST from anywhere\n` +
      `outside its trusted list, and that list is SITE_URL plus E2E_ORIGIN in the Convex\n` +
      `env — nothing else. ${base} has to be one of them.\n\n` +
      `Check with \`npx convex env get SITE_URL\` and \`npx convex env get E2E_ORIGIN\`, then\n` +
      `serve the app on that port or pass --base with it.`,
  );
}

console.log("");
for (const [index, reader] of created.entries()) {
  // Each shelf starts at a different point in the catalogue so no two demos show the
  // same books side by side.
  const payload = { slug: reader.slug, books, offset: index * 17, overLimit: flag("over-limit") };
  const run = convex(["run", "seed:demo", JSON.stringify(payload)], { quiet: true });
  if (run.status !== 0) {
    console.error(`  seeding ${reader.slug} failed: ${(run.stderr ?? "").trim().split("\n").slice(-1)[0]}`);
    continue;
  }
  try {
    const result = JSON.parse((run.stdout ?? "").trim());
    reader.books = result.books;
    reader.plan = result.plan;
    reader.capped = result.cappedByPlan;
    console.log(`  seeded ${reader.slug}: ${result.books} books, ${result.notes} notes, ${result.shared} published`);
  } catch {
    console.log(`  seeded ${reader.slug}`);
  }
}

console.log("\nDemo accounts — all share the password below.\n");
console.log(`  password: ${password}\n`);
for (const reader of created) {
  console.log(`  ${reader.name.padEnd(16)} ${reader.email.padEnd(42)} ${base}/app/${reader.slug}`);
}

if (created.some((reader) => reader.capped)) {
  console.log(
    "\nSome shelves stopped at the Free plan's 12-book ceiling — which is the pricing page telling the truth.",
  );
  console.log("Subscribe one of them in the app (Stripe test card 4242 4242 4242 4242), then rerun with a larger --books.");
}
console.log("\nWhen you are done: `npx convex env remove ALLOW_TEST_SEED`.");
