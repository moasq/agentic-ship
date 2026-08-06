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
 * Secret steps are verified by NAME only: once a deployment is connected, one
 * `npx convex env list` call is parsed for which names exist. Values are never printed
 * and never leave this process. Two steps (Render, go-live) have no local signal at
 * all — they are marked `manual` and listed as your verifications, instead of the old
 * behaviour of hardcoding them not-done and jamming the sequence at step 6 forever.
 *
 * Same on macOS, Linux and Windows: pure Node; the one spawn uses shell:true so npx
 * resolves to npx.cmd on Windows, with a timeout so a signed-out CLI cannot hang this.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const has = (p) => existsSync(join(root, p));
const read = (p) => (has(p) ? readFileSync(join(root, p), "utf8") : "");

let pkg = {};
try {
  pkg = JSON.parse(read("package.json") || "{}");
} catch {
  console.error("package.json is not valid JSON — fix that first.");
  process.exit(0);
}
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
const envLocal = read(".env.local");
const envHas = (key) => new RegExp(`^\\s*${key}\\s*=\\s*\\S`, "m").test(envLocal);

const seam = read("src/lib/convex-api.ts");
// Line-anchored like health.mjs: the seam's own doc comment shows the import it wants
// you to write, and `includes()` matched that comment forever (comment-vs-code class).
const seamTyped = /^\s*(?:import|export)[^\n]*_generated\/api/m.test(seam);

// One env-list call, names only. `convex env list` prints NAME=value lines; we keep
// the names and drop the rest on the floor — values never reach a log.
const connected = envHas("CONVEX_DEPLOYMENT");
let convexEnvNames = null;
let convexEnvNote = "";
if (connected) {
  const res = spawnSync("npx convex env list", { cwd: root, shell: true, encoding: "utf8", timeout: 15_000 });
  if (res.status === 0 && typeof res.stdout === "string") {
    convexEnvNames = [...res.stdout.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]);
  } else {
    convexEnvNote =
      res.error?.code === "ETIMEDOUT"
        ? "could not read Convex env: `npx convex env list` timed out — secret steps show as not done until it answers."
        : "could not read Convex env: `npx convex env list` failed — run `npx convex login`, then `pnpm onboard` again. Secret steps show as not done until then.";
  }
}
const inConvexEnv = (...keys) =>
  convexEnvNames !== null &&
  keys.every((k) => (k.endsWith("*") ? convexEnvNames.some((n) => n.startsWith(k.slice(0, -1))) : convexEnvNames.includes(k)));

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
    command: "ships with ShipKit — schema, auth, billing, email",
    note: "auth = Better Auth via the official component; billing = Stripe via @convex-dev/stripe. Both idle safely until connected.",
  },
  {
    title: "Connect a deployment",
    done: connected,
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
    done: inConvexEnv("BETTER_AUTH_SECRET", "SITE_URL"),
    command: "pnpm secret, then: npx convex env set BETTER_AUTH_SECRET <paste>  ·  npx convex env set SITE_URL http://localhost:3000",
    note: "Convex env, never .env.local — pnpm health treats either name in .env.local as CRITICAL. After this the auth backend answers; the engine ships no sign-in UI, so build the screens you want against the seams in src/lib/auth-client.ts.",
  },
  {
    title: "Stripe keys",
    done: inConvexEnv("STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"),
    human: true,
    command: "stripe sandbox create   (works with NO Stripe account) — then: npx convex env set STRIPE_SECRET_KEY <rk_or_sk>  ·  npx convex env set STRIPE_WEBHOOK_SECRET <whsec_>",
    note: "sandbox first by decision: you can watch a test payment land before creating any account. Prefer a restricted key (rk_). Webhook secret comes from the next step.",
  },
  {
    title: "Stripe webhook + price",
    done: inConvexEnv("STRIPE_PRICE_*"),
    verifyInstead: "a test checkout flips api.billing.getEntitlement with no reload",
    command: "stripe listen --forward-to <deployment>.convex.site/stripe/webhook   ·   create a price, then: npx convex env set STRIPE_PRICE_PRO price_...",
    note: "the printed whsec_ is the STRIPE_WEBHOOK_SECRET above. In prod: add the convex.site URL in the Stripe dashboard instead. Fulfillment rides the webhook, never the redirect.",
  },
  {
    title: "Email — Resend",
    done: inConvexEnv("RESEND_API_KEY"),
    human: true,
    verifyInstead: "a signup email appears in the component's deliveryEvents table",
    command: "create a Resend account, copy the API key, then: npx convex env set RESEND_API_KEY re_...   ·   add a webhook at <deployment>.convex.site/resend-webhook (all email.* events), then: npx convex env set RESEND_WEBHOOK_SECRET whsec_...",
    note: "convex/email.ts stays in testMode, so only Resend's test inboxes (delivered@resend.dev) can receive mail — a mistake cannot reach a real person. Going live is a deliberate 3-step flip, documented in references/email-resend.md.",
  },
  {
    title: "Analytics — PostHog",
    done: Boolean(envHas("NEXT_PUBLIC_POSTHOG_KEY")),
    command: "create a PostHog project, then put NEXT_PUBLIC_POSTHOG_KEY=phc_... in .env.local",
    note: "the phc_ project key is public by design and belongs in .env.local. A phx_ personal key is a full-access credential and must never enter this repo — pnpm health treats one as CRITICAL. Events route through /ingest on your own origin, so the CSP stays closed.",
  },
  {
    title: "Deploy — Render",
    manual: true,
    verifyInstead: "the prod URL serves, and <prod-deployment>.convex.site/stripe/webhook is reachable",
    command: "connect the repo at render.com — it detects render.yaml — then set CONVEX_DEPLOY_KEY (Convex dashboard → prod → Deploy Keys) and NEXT_PUBLIC_POSTHOG_KEY in Render",
    note: "render.yaml is the whole topology, committed. The build runs `npx convex deploy --cmd 'pnpm build'` so backend and frontend ship together. Backend secrets live in the PROD Convex deployment's env — Render never sees them. Move SITE_URL and the Stripe/Resend webhook URLs to prod values: references/deploy-render.md.",
  },
  {
    title: "Go live — production preflight",
    manual: true,
    verifyInstead: "pnpm preflight --prod prints READY",
    command: "pnpm preflight --prod",
    note: "the launch gate: live Stripe keys in prod (not test), email out of testMode WITH verification on, real EMAIL_FROM, https SITE_URL, and no ALLOW_TEST_SEED backdoor. The judgment half (prod webhooks, one refunded live checkout, rollback story) is in the production-preflight skill.",
  },
];

// Vendor MCP servers (stripe, resend, posthog, render in .mcp.json) authenticate with
// a browser OAuth the first time your agent uses them — that is you, not a script.

// `manual` steps have no machine-readable signal on this machine (a Render dashboard,
// a live checkout). They never block the NEXT pointer and are listed as YOUR
// verifications once every checkable step is done — the old hardcoded `done: false`
// pinned NEXT at the first secret step forever, even on a fully live app.
const firstOpen = steps.findIndex((s) => !s.done && !s.manual);

console.log("\nShipKit backend onboarding\n");
for (const [i, step] of steps.entries()) {
  const mark = step.done ? "done   " : step.manual ? "manual " : i === firstOpen ? "NEXT   " : "waiting";
  console.log(`  ${mark} ${i + 1}. ${step.title}${step.human && !step.done ? "   (needs you — opens a browser)" : ""}`);
}
if (convexEnvNote) console.log(`\n  note: ${convexEnvNote}`);

if (firstOpen === -1) {
  const manual = steps.filter((s) => s.manual);
  console.log("\nEvery machine-checkable step is done. What remains is yours to verify:\n");
  for (const step of manual) console.log(`  ${step.title}\n    verify: ${step.verifyInstead}\n`);
  console.log("Then `pnpm health` and `pnpm build` to confirm, and `pnpm preflight --prod` before real traffic.\n");
  process.exit(0);
}

const next = steps[firstOpen];
console.log(`\nNext: ${next.title}\n\n  ${next.command}\n\n  ${next.note}\n`);
if (next.verifyInstead) {
  console.log(`  Also verify by hand:  ${next.verifyInstead}\n`);
}
if (next.human) {
  console.log("  This one is yours — no script can log in for you. Run it, finish in the\n  browser, then run `pnpm onboard` again.\n");
}
console.log("Secrets go in Convex env, never .env.local:  pnpm secret  then  npx convex env set <NAME> <value>\n");
process.exit(0);
