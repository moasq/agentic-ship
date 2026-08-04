#!/usr/bin/env node
/**
 * Production preflight — the go-live gate.
 *
 * `pnpm health` asks "is development sound?". This asks a different question:
 * "is PRODUCTION real?" — live Stripe keys in the prod deployment, email leaving
 * testMode with verification on, no test-seed backdoor, real URLs. Run it before the
 * first real deploy and before every launch after config changes.
 *
 *   pnpm preflight            checks that need no deployment (code + files)
 *   pnpm preflight --prod     ALSO audits the prod Convex deployment's env
 *                             (runs `npx convex env list --prod` — needs your login)
 *
 * Exit 1 on any FAIL. A launch with a failing preflight is a launch that takes test
 * payments, sends no email, or seeds itself — this gate exists so none of those ship.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : "");
const rows = [];
const add = (check, status, fix = "") => rows.push({ check, status, fix });
const withProd = process.argv.includes("--prod");

/* ---------- code-level: the states that MUST flip for production ---------- */

const emailSrc = read("convex/email.ts");
const authSrc = read("convex/auth.ts");
// Line-anchored so a comment SAYING "set testMode: false" cannot satisfy the check —
// this exact false-positive shipped in the first version of this script, the third
// instance of the comment-vs-code bug class in this repo (see heal-ledger.md).
const emailLive = /^\s*testMode:\s*false/m.test(emailSrc);
const verifyOn = /^\s*requireEmailVerification:\s*true/m.test(authSrc);

add(
  "email out of testMode",
  emailLive ? "PASS" : "FAIL",
  emailLive ? "" : "convex/email.ts still has testMode: true — production users receive nothing. Flip AFTER verifying a sending domain (references/email-resend.md)",
);
add(
  "email verification required",
  verifyOn ? "PASS" : "FAIL",
  verifyOn ? "" : "requireEmailVerification is false — unverified addresses can sign up in production. Flip together with testMode",
);

/* ---------- site identity: placeholders must not ship ---------- */

const siteSrc = read("src/lib/site.ts");
const placeholder = /My App|what it does, in one line|someone would actually read/.test(siteSrc);
add("site identity is real", placeholder ? "FAIL" : "PASS", placeholder ? "src/lib/site.ts still holds the scaffold placeholders — this text is your <title>, OG card and llms.txt" : "");

// The public URL is env-driven per environment; the prod value is audited in the
// --prod section below. Locally, the blueprint is the thing that must be intact:
const blueprint = read("render.yaml");
add("deploy blueprint intact", /convex deploy/.test(blueprint) ? "PASS" : "FAIL", /convex deploy/.test(blueprint) ? "" : "render.yaml missing or its buildCommand no longer runs `npx convex deploy` — frontend would ship against a stale backend");

/* ---------- dev-side leaks that become launch incidents ---------- */

const envLocal = read(".env.local");
add("no live Stripe key on this machine", /\b(sk_live_|rk_live_)/.test(envLocal) ? "FAIL" : "PASS", "live keys belong in the PROD Convex deployment env only (rule R7)");

/* ---------- the full local gate ---------- */

const verify = spawnSync("pnpm verify", { cwd: root, shell: true, encoding: "utf8" });
add("pnpm verify (health + lint + build)", verify.status === 0 ? "PASS" : "FAIL", verify.status === 0 ? "" : "fix the base gate first — preflight on a red build is meaningless");

const vitest = spawnSync("pnpm test", { cwd: root, shell: true, encoding: "utf8" });
add("unit tests", vitest.status === 0 ? "PASS" : "FAIL", vitest.status === 0 ? "" : "pnpm test is red");

/* ---------- prod deployment audit (needs login) ---------- */

if (withProd) {
  const list = spawnSync("npx convex env list --prod", { cwd: root, shell: true, encoding: "utf8" });
  if (list.status !== 0) {
    add("prod convex env readable", "FAIL", "`npx convex env list --prod` failed — connect first (pnpm onboard)");
  } else {
    const env = list.stdout ?? "";
    const has = (k) => new RegExp(`^${k}=`, "m").test(env);
    const val = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) ?? [])[1] ?? "";

    add("prod Stripe key is LIVE", /^(sk|rk)_live_/.test(val("STRIPE_SECRET_KEY")) ? "PASS" : "FAIL", "prod has a test key (or none) — production would take test payments. Set the live key with `npx convex env set --prod STRIPE_SECRET_KEY ...`");
    add("prod Stripe webhook secret set", has("STRIPE_WEBHOOK_SECRET") ? "PASS" : "FAIL", "create the PROD webhook endpoint in the Stripe dashboard (the `stripe listen` secret is dev-only) and set its whsec_");
    add("prod price configured", /^STRIPE_PRICE_/m.test(env) ? "PASS" : "FAIL", "no STRIPE_PRICE_* in prod — checkout cannot resolve a plan");
    add("prod Resend key set", has("RESEND_API_KEY") ? "PASS" : "FAIL", "production sends no email without it");
    add("prod EMAIL_FROM on a verified domain", has("EMAIL_FROM") && !/resend\.dev/.test(val("EMAIL_FROM")) ? "PASS" : "FAIL", "EMAIL_FROM missing or still the onboarding fallback — verify a sending domain and set it");
    add("prod SITE_URL is https and not localhost", /^https:\/\//.test(val("SITE_URL")) && !/localhost/.test(val("SITE_URL")) ? "PASS" : "FAIL", "auth callbacks and emails will point at the wrong host");
    add("prod auth secret set", has("BETTER_AUTH_SECRET") ? "PASS" : "FAIL", "pnpm secret, then npx convex env set --prod BETTER_AUTH_SECRET ...");
    add("NO test-seed backdoor in prod", has("ALLOW_TEST_SEED") ? "FAIL" : "PASS", "ALLOW_TEST_SEED is set on PROD — anyone-callable seeding of production data. Remove it: `npx convex env remove --prod ALLOW_TEST_SEED`");
  }
} else {
  add("prod env audit", "SKIP", "run `pnpm preflight --prod` once connected — it verifies live keys, webhook secrets and the seed gate on the real deployment");
}

/* ---------- report ---------- */

const width = Math.max(...rows.map((r) => r.check.length));
console.log(`\n| ${"check".padEnd(width)} | status | fix |`);
console.log(`| ${"-".repeat(width)} | ------ | --- |`);
for (const r of rows) console.log(`| ${r.check.padEnd(width)} | ${r.status.padEnd(6)} | ${r.fix} |`);

const failed = rows.filter((r) => r.status === "FAIL").length;
console.log(
  failed
    ? `\nNOT READY — ${failed} blocking issue(s). Every one above ships a real incident: test payments, dead email, or an open seed gate.\n`
    : withProd
      ? "\nREADY — code, build, tests and the prod deployment all check out. The go-live checklist in deploy-render.md covers the two manual webhooks.\n"
      : "\nCODE READY — now run `pnpm preflight --prod` to audit the real deployment before launch.\n",
);
process.exit(failed ? 1 : 0);
