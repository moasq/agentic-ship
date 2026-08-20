#!/usr/bin/env node
/**
 * Production preflight — the go-live gate.
 *
 * `pnpm health` asks "is development sound?". This asks a different question:
 * "is PRODUCTION real?" — selected-provider production billing, email leaving testMode
 * with verification on, no test-seed backdoor, real URLs. Run it before the
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
import { inspectProductionBillingEnvironment } from "./lib/billing-coherence.mjs";
import { inspectDeploymentBlueprint } from "./lib/deployment-coherence.mjs";
import { inspectProductionObservabilityEnvironment } from "./lib/observability/sentry.mjs";
import { inspectProductionAnalyticsEnvironment } from "./lib/analytics/index.mjs";

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

// A seam that does not exist cannot be misconfigured. Without this, a frontend-only
// repo was told "convex/email.ts still has testMode: true" about a file it does not
// have — a blocking FAIL with no possible fix, which teaches people to ignore the gate.
if (!emailSrc) {
  add("email out of testMode", "SKIP", "no convex/email.ts in this repo — nothing sends mail");
} else {
  add(
    "email out of testMode",
    emailLive ? "PASS" : "FAIL",
    emailLive ? "" : "convex/email.ts still has testMode: true — production users receive nothing. Flip AFTER verifying a sending domain (references/email-resend.md)",
  );
}
if (!authSrc) {
  add("email verification required", "SKIP", "no convex/auth.ts in this repo — nothing signs up");
} else {
  add(
    "email verification required",
    verifyOn ? "PASS" : "FAIL",
    verifyOn ? "" : "requireEmailVerification is false — unverified addresses can sign up in production. Flip together with testMode",
  );
}

/* ---------- site identity: placeholders must not ship ---------- */

const siteSrc = read("src/lib/site.ts");
const placeholder = /My App|what it does, in one line|someone would actually read/.test(siteSrc);
add(
  "site identity is real",
  siteSrc ? (placeholder ? "FAIL" : "PASS") : "SKIP",
  siteSrc ? (placeholder ? "src/lib/site.ts still holds scaffold placeholders used by metadata" : "") : "no product site exists in this tool repository",
);

// The public URL is env-driven per environment; the prod value is audited in the
// --prod section below. Locally, the blueprint is the thing that must be intact:
const deployment = inspectDeploymentBlueprint({
  netlifySource: read("netlify.toml"),
  vercelSource: read("vercel.json"),
});
add("selected deploy blueprint intact", deployment.status, deployment.detail);

/* ---------- the CSP that actually ships ---------- */

// React's dev build needs eval(), so `next.config.ts` allows it under a NODE_ENV guard.
// The guard is the entire safety property: `unsafe-eval` in a production policy is what
// lets an injected string become executable code. Assert it is still conditional — an
// unguarded occurrence would be trivially easy to introduce while silencing a console
// warning, and impossible to notice afterwards.
const nextConfigSrc = read("next.config.ts");
const evalOccurrences = (nextConfigSrc.match(/unsafe-eval/g) ?? []).length;
const evalIsGuarded = /isDev\s*\?\s*\[\s*["']'unsafe-eval'["']\s*\]/.test(nextConfigSrc);
add(
  "no unsafe-eval in the production CSP",
  evalOccurrences === 0 || evalIsGuarded ? "PASS" : "FAIL",
  evalOccurrences === 0 || evalIsGuarded
    ? ""
    : "`unsafe-eval` appears in next.config.ts outside the development-only guard — production would ship a policy that lets an injected string execute",
);

/* ---------- dev-side leaks that become launch incidents ---------- */

const envLocal = read(".env.local");
const localBillingSecret = /\b(sk_live_|rk_live_)|^(POLAR_ACCESS_TOKEN|LEMON_SQUEEZY_API_KEY)=/m.test(envLocal);
add(
  "no production billing secret on this machine",
  localBillingSecret ? "FAIL" : "PASS",
  localBillingSecret ? "production billing secrets belong in the production Convex deployment environment" : "",
);
const localSentryAuthSecret = /^NEXT_PUBLIC_SENTRY_AUTH_TOKEN=/m.test(envLocal);
add(
  "no sensitive Sentry auth token in client env",
  localSentryAuthSecret ? "FAIL" : "PASS",
  localSentryAuthSecret ? "NEXT_PUBLIC_SENTRY_AUTH_TOKEN leaks Sentry auth token to the browser bundle — use SENTRY_AUTH_TOKEN in CI/build only" : "",
);
const localPosthogPersonalKey = /^NEXT_PUBLIC_POSTHOG_KEY=phx_/m.test(envLocal);
add(
  "no personal PostHog key in client env",
  localPosthogPersonalKey ? "FAIL" : "PASS",
  localPosthogPersonalKey ? "NEXT_PUBLIC_POSTHOG_KEY contains a personal phx_ key — use a public phc_ project key" : "",
);

/* ---------- the full local gate ---------- */

const verify = spawnSync("pnpm verify:full", { cwd: root, shell: true, encoding: "utf8" });
add(
  "full local release gate",
  verify.status === 0 ? "PASS" : "FAIL",
  verify.status === 0 ? "" : "pnpm verify:full is red — fix architecture, audit, unit, build, or browser failures before preflight",
);

/* ---------- prod deployment audit (needs login) ---------- */

if (withProd) {
  const list = spawnSync("npx convex env list --prod", { cwd: root, shell: true, encoding: "utf8" });
  if (list.status !== 0) {
    add("prod convex env readable", "FAIL", "`npx convex env list --prod` failed — connect first (pnpm onboard)");
  } else {
    const env = list.stdout ?? "";
    const has = (k) => new RegExp(`^${k}=`, "m").test(env);
    const val = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) ?? [])[1] ?? "";

    const billing = inspectProductionBillingEnvironment(env);
    add("prod billing provider is live", billing.status === "PASS" ? "PASS" : "FAIL", billing.status === "PASS" ? "" : billing.detail);
    add("prod Resend key set", has("RESEND_API_KEY") ? "PASS" : "FAIL", "production sends no email without it");
    add("prod EMAIL_FROM on a verified domain", has("EMAIL_FROM") && !/resend\.dev/.test(val("EMAIL_FROM")) ? "PASS" : "FAIL", "EMAIL_FROM missing or still the onboarding fallback — verify a sending domain and set it");
    add("prod SITE_URL is https and not localhost", /^https:\/\//.test(val("SITE_URL")) && !/localhost/.test(val("SITE_URL")) ? "PASS" : "FAIL", "auth callbacks and emails will point at the wrong host");
    add("prod auth secret set", has("BETTER_AUTH_SECRET") ? "PASS" : "FAIL", "pnpm secret, then npx convex env set --prod BETTER_AUTH_SECRET ...");
    const observability = inspectProductionObservabilityEnvironment(env);
    if (observability.status !== "SKIP") {
      add("prod Sentry observability is valid", observability.status === "PASS" ? "PASS" : "FAIL", observability.status === "PASS" ? "" : observability.detail);
    }
    const analytics = inspectProductionAnalyticsEnvironment(env);
    if (analytics.status !== "SKIP") {
      add(`prod ${analytics.providerDisplayName || analytics.provider} analytics is valid`, analytics.status === "PASS" ? "PASS" : "FAIL", analytics.status === "PASS" ? "" : analytics.detail);
    }
    add("NO test-seed backdoor in prod", has("ALLOW_TEST_SEED") ? "FAIL" : "PASS", "ALLOW_TEST_SEED is set on PROD — anyone-callable seeding of production data. Remove it: `npx convex env remove --prod ALLOW_TEST_SEED`");
    add("NO extra trusted auth origin in prod", has("E2E_ORIGIN") ? "FAIL" : "PASS", "E2E_ORIGIN is set on PROD — it adds a trusted origin to Better Auth, which is a CSRF hole outside the browser gate. Remove it: `npx convex env remove --prod E2E_ORIGIN`");
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
      ? "\nREADY — code, build, tests and the prod deployment all check out. The selected deployment guide covers URL, domain, callback, and webhook acceptance.\n"
      : "\nCODE READY — now run `pnpm preflight --prod` to audit the real deployment before launch.\n",
);
process.exit(failed ? 1 : 0);
