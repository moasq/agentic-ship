#!/usr/bin/env node
/**
 * Backend onboarding. Shows where you are in the sequence and the ONE command to run
 * next — nothing more.
 *
 * Connecting Convex is the buyer's manual step: `npx convex dev` opens a browser and
 * needs a human. This script never tries to do it. It reports status, prints the exact
 * next command, and stays out of the way. It always exits 0 — being partway through
 * onboarding is not an error.
 *
 * Same on macOS, Linux and Windows: pure Node, no shell.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const has = (p) => existsSync(join(root, p));
const read = (p) => (has(p) ? readFileSync(join(root, p), "utf8") : "");

const pkg = JSON.parse(read("package.json") || "{}");
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
const envLocal = read(".env.local");
const envHas = (key) => new RegExp(`^\\s*${key}\\s*=\\s*\\S`, "m").test(envLocal);

const seam = read("src/lib/convex-api.ts");
const seamTyped = seam.includes("_generated/api") && !seam.match(/^\s*\*.*_generated\/api/m);

const steps = [
  {
    title: "Convex package",
    done: Boolean(deps.convex),
    command: "pnpm add convex@latest",
    note: "the CLI and the React client",
  },
  {
    title: "Backend source",
    done: has("convex/schema.ts") && has("convex/auth.ts") && has("convex/billing.ts"),
    command: "ships with ShipKit — schema, waitlist, auth, billing",
    note: "auth = Better Auth via the official component; billing = Stripe via @convex-dev/stripe. Both idle safely until connected.",
  },
  {
    title: "Connect a deployment",
    done: envHas("CONVEX_DEPLOYMENT"),
    command: "npx convex dev",
    human: true,
    note: "opens a browser. Creates or links the project, writes CONVEX_DEPLOYMENT and NEXT_PUBLIC_CONVEX_URL into .env.local, and generates convex/_generated/. Leave it running while you work.",
  },
  {
    title: "Generated types",
    done: has("convex/_generated/api.d.ts") || has("convex/_generated/api.js"),
    command: "npx convex dev   (generates them; `npx convex codegen` needs a deployment too)",
    note: "committed once it exists — never hand-edited",
  },
  {
    title: "Type the API seam",
    done: seamTyped,
    command: 'in src/lib/convex-api.ts, swap `anyApi` for `import { api } from "../../convex/_generated/api"`',
    note: "one line. Until then the app runs untyped against Convex, which is why a fresh clone builds with no account.",
  },
  {
    title: "Auth secrets",
    done: false, // reading Convex env needs a connected deployment; verified there by setup-health §7.4
    verifyInstead: "npx convex env list   → BETTER_AUTH_SECRET and SITE_URL present",
    command: "pnpm secret, then: npx convex env set BETTER_AUTH_SECRET <paste>  ·  npx convex env set SITE_URL http://localhost:3000",
    note: "Convex env, never .env.local — pnpm health treats either name in .env.local as CRITICAL. After this, sign-up on /billing works.",
  },
  {
    title: "Stripe keys",
    done: false,
    verifyInstead: "npx convex env list   → STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET present",
    human: true,
    command: "stripe sandbox create   (works with NO Stripe account) — then: npx convex env set STRIPE_SECRET_KEY <rk_or_sk>  ·  npx convex env set STRIPE_WEBHOOK_SECRET <whsec_>",
    note: "sandbox first by decision: you can watch a test payment land before creating any account. Prefer a restricted key (rk_). Webhook secret comes from the next step.",
  },
  {
    title: "Stripe webhook + price",
    done: false,
    verifyInstead: "a test checkout flips /billing to `pro` with no reload",
    command: "stripe listen --forward-to <deployment>.convex.site/stripe/webhook   ·   create a price, then: npx convex env set STRIPE_PRICE_PRO price_...",
    note: "the printed whsec_ is the STRIPE_WEBHOOK_SECRET above. In prod: add the convex.site URL in the Stripe dashboard instead. Fulfillment rides the webhook, never the redirect.",
  },
];

const firstOpen = steps.findIndex((s) => !s.done);

console.log("\nShipKit backend onboarding\n");
for (const [i, step] of steps.entries()) {
  const mark = step.done ? "done   " : i === firstOpen ? "NEXT   " : "waiting";
  console.log(`  ${mark} ${i + 1}. ${step.title}${step.human && !step.done ? "   (needs you — opens a browser)" : ""}`);
}

if (firstOpen === -1) {
  console.log("\nBackend fully connected. Run `pnpm health` and `pnpm build` to confirm.\n");
  process.exit(0);
}

const next = steps[firstOpen];
console.log(`\nNext: ${next.title}\n\n  ${next.command}\n\n  ${next.note}\n`);
if (next.verifyInstead) {
  console.log(`  This script cannot see Convex env, so it cannot mark this step done itself.\n  Verify with:  ${next.verifyInstead}\n`);
}
if (next.human) {
  console.log("  This one is yours — no script can log in for you. Run it, finish in the\n  browser, then run `pnpm onboard` again.\n");
}
console.log("Secrets go in Convex env, never .env.local:  pnpm secret  then  npx convex env set <NAME> <value>\n");
process.exit(0);
