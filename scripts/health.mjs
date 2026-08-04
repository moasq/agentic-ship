#!/usr/bin/env node
/**
 * The machine-checkable half of the setup-health skill.
 *
 * Everything here used to be a shell one-liner: `readlink`, `grep -r`, `cp`, `openssl`.
 * None of those exist on a stock Windows box, and a health check that silently no-ops on
 * a third of buyers' machines is worse than no health check. This runs the same on
 * macOS, Linux and Windows because Node is the only thing it needs.
 *
 * Agents still run the setup-health SKILL for the parts a script cannot do (probing MCP
 * servers, judging whether generated UI looks generated). This covers the rest.
 *
 * Exit code: 0 = HEALTHY or DEGRADED, 1 = BROKEN.
 */
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rows = [];
const add = (check, status, fix = "") => rows.push({ check, status, fix });
const read = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : null);
const json = (p) => {
  const raw = read(p);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined; // present but malformed
  }
};

/* ---------- 1. toolchain ---------- */

const nodeMajor = Number(process.versions.node.split(".")[0]);
add(`node ${process.versions.node}`, nodeMajor >= 20 ? "PASS" : "FAIL", nodeMajor >= 20 ? "" : "need >= 20 — install via nvm, fnm, mise or nvm-windows");

// No `pnpm -v` spawn: the binary is pnpm on posix and pnpm.cmd on Windows, and spawning
// across that difference is exactly the kind of thing that breaks silently. pnpm tells us
// itself through the user agent it sets on its own scripts.
const ua = process.env.npm_config_user_agent ?? "";
const pnpmVersion = /pnpm\/(\d+\.\d+\.\d+)/.exec(ua)?.[1];
const declaredPm = json("package.json")?.packageManager ?? "";
if (!pnpmVersion) {
  add("package manager", ua ? "WARN" : "SKIP", `run through pnpm (\`pnpm health\`); declared: ${declaredPm || "none"}`);
} else {
  const ok = Number(pnpmVersion.split(".")[0]) >= 9;
  add(`pnpm ${pnpmVersion}`, ok ? "PASS" : "FAIL", ok ? "" : "need >= 9 — run `corepack enable`");
}

/* ---------- 2. version pins ---------- */

const pkg = json("package.json");
const lock = json("skills.lock.json");
if (!pkg || !lock) {
  add("package.json + skills.lock.json readable", "FAIL", "one is missing or malformed");
} else {
  for (const [name, pin] of Object.entries(lock.pins ?? {})) {
    if (name === "shadcn-cli") continue; // a CLI, not a dependency of this package
    const declared = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
    if (!declared) {
      add(`pin ${name}`, "WARN", `pinned to ${pin} in skills.lock.json but not in package.json`);
      continue;
    }
    const want = pin.split(".")[0];
    const got = /(\d+)/.exec(declared)?.[1];
    add(`pin ${name} ${declared}`, got === want ? "PASS" : "FAIL", got === want ? "" : `lockfile wants ${pin} — run the upstream-sync skill, do not hand-edit`);
  }
}

/* ---------- 3. tailwind v4 has no config file ---------- */

const fossil = ["tailwind.config.js", "tailwind.config.ts", "tailwind.config.mjs", "tailwind.config.cjs"].find((f) => existsSync(join(root, f)));
add("no tailwind.config.*", fossil ? "FAIL" : "PASS", fossil ? `${fossil} is a v3 fossil — move its contents into the @theme block in src/app/globals.css` : "");

/* ---------- 4. single source of truth ---------- */

const claudeMd = read("CLAUDE.md");
add("CLAUDE.md imports AGENTS.md", claudeMd?.trim() === "@AGENTS.md" ? "PASS" : "FAIL", claudeMd?.trim() === "@AGENTS.md" ? "" : "CLAUDE.md must contain exactly `@AGENTS.md` — never a second copy of the rules");

const agents = read("AGENTS.md") ?? "";
const bothBlocks = agents.includes("nextjs-agent-rules") && agents.includes("# ShipKit");
add("AGENTS.md rule blocks", bothBlocks ? "PASS" : "FAIL", bothBlocks ? "" : "both the Next.js block and the ShipKit block must be present");

// .claude/skills — the check `readlink` used to do, minus readlink.
const linkPath = join(root, ".claude", "skills");
let skillsStatus = "FAIL";
let skillsFix = "run `pnpm link:skills`";
if (existsSync(join(linkPath, "setup-health", "SKILL.md"))) {
  const isCopy = existsSync(join(root, ".claude", ".skills-is-a-copy"));
  skillsStatus = isCopy ? "WARN" : "PASS";
  skillsFix = isCopy ? "it is a COPY, not a link — edit .agents/skills then re-run `pnpm link:skills`" : "";
} else if (existsSync(linkPath) && lstatSync(linkPath).isFile()) {
  skillsFix = "it is a text stub — this checkout has core.symlinks=false (normal on Windows). Fix: `pnpm link:skills`";
}
add(".claude/skills resolves", skillsStatus, skillsFix);

/* ---------- 5. cross-tool mirror ---------- */

const mcpRaw = read(".mcp.json");
const mirrorRaw = read(".cursor/mcp.json");
add(".cursor/mcp.json mirror", mcpRaw !== null && mcpRaw === mirrorRaw ? "PASS" : "FAIL", mcpRaw === mirrorRaw ? "" : "generated file drifted or is missing — run `pnpm sync:mcp`, never edit it directly");

if (process.platform === "win32") {
  add("MCP launcher on Windows", "WARN", "if a server never starts, wrap it: \"command\": \"cmd\", \"args\": [\"/c\", \"npx\", ...] — see references/platform-notes.md");
}

/* ---------- 6. design system ---------- */

const css = read("src/app/globals.css") ?? "";
add("globals.css @theme block", css.includes("@theme") ? "PASS" : "FAIL", css.includes("@theme") ? "" : "the token layer is the whole design system — run the ui-system skill");

// Only what is actually LOADED counts. Naming a banned face in a comment (this repo's
// layout.tsx explains why they are banned) is not a violation — an early version of this
// check flagged its own documentation.
const layout = read("src/app/layout.tsx") ?? "";
const loadedFonts = [...layout.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']next\/font\/(?:google|local)["']/g)]
  .flatMap((m) => m[1].split(","))
  .map((s) => s.trim());
const bannedFont = ["Inter", "Geist", "Space_Grotesk", "Poppins"].find((f) => loadedFonts.includes(f));
add("no banned primary font", bannedFont ? "FAIL" : "PASS", bannedFont ? `${bannedFont} is the loudest "an AI made this site" signal — see ui-system/references/font-pairings.md` : "");

/* ---------- 7. hardcoded colors (the `grep -r` replacement) ---------- */

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(full)) out.push(full);
  }
  return out;
}

const sourceFiles = [...walk(join(root, "src")), ...walk(join(root, "content"))];
const posix = (p) => relative(root, p).split(sep).join("/"); // stable output on Windows

const rawColor = [];
const leaks = [];
for (const file of sourceFiles) {
  const body = readFileSync(file, "utf8");
  const rel = posix(file);
  if (!rel.startsWith("src/components/ui/") && /(?:bg|text|border|from|to|via|fill|stroke|ring|shadow)-\[#|:\s*#[0-9a-fA-F]{3,8}\b/.test(body)) {
    rawColor.push(rel);
  }
  // Server-only env in a client component ships the value to the browser.
  if (/^\s*["']use client["']/m.test(body)) {
    for (const m of body.matchAll(/process\.env\.([A-Za-z0-9_]+)/g)) {
      if (!m[1].startsWith("NEXT_PUBLIC_")) leaks.push(`${rel} -> process.env.${m[1]}`);
    }
  }
}
add("no raw hex / arbitrary color values", rawColor.length ? "FAIL" : "PASS", rawColor.length ? `${rawColor.length} file(s): ${rawColor.slice(0, 3).join(", ")} — these must become tokens` : "");
add("no server env in client components", leaks.length ? "CRITICAL" : "PASS", leaks.length ? leaks.slice(0, 3).join("; ") : "");

/* ---------- 8. convex backend ---------- */

// Connecting Convex is a human step (`npx convex dev` opens a browser). Not being
// connected yet is NOT a failure — it is a stage of onboarding, reported as such.
if (!existsSync(join(root, "convex", "schema.ts"))) {
  add("convex backend", "SKIP", "frontend only — no convex/ in this repo");
} else {
  const envLocal = read(".env.local") ?? "";
  const envHas = (key) => new RegExp(`^\\s*${key}\\s*=\\s*\\S`, "m").test(envLocal);
  const connected = envHas("CONVEX_DEPLOYMENT");
  const generated = existsSync(join(root, "convex", "_generated", "api.d.ts")) || existsSync(join(root, "convex", "_generated", "api.js"));

  add("convex deployment", connected ? "PASS" : "WARN", connected ? "" : "not connected yet — run `pnpm onboard`, then `npx convex dev` (opens a browser, needs you)");
  add("convex/_generated", generated ? "PASS" : "WARN", generated ? "" : "created by `npx convex dev`; commit it once it exists");
  add("NEXT_PUBLIC_CONVEX_URL", envHas("NEXT_PUBLIC_CONVEX_URL") ? "PASS" : "WARN", envHas("NEXT_PUBLIC_CONVEX_URL") ? "" : "written by `npx convex dev`; until then Convex components render their not-connected state");

  const seam = read("src/lib/convex-api.ts") ?? "";
  const typed = /^\s*(?:import|export)[^\n]*_generated\/api/m.test(seam);
  add("convex api seam", typed ? "PASS" : "WARN", typed ? "typed against generated api" : "running untyped via anyApi — after `npx convex dev`, swap the one line in src/lib/convex-api.ts");

  // Action secrets belong in Convex env. Finding one in .env.local means it is one
  // `git add` away from being public.
  const misplaced = [
    "BETTER_AUTH_SECRET",
    "CONVEX_DEPLOY_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_\\w+",
    "RESEND_API_KEY",
    "RESEND_WEBHOOK_SECRET",
  ].filter((k) => envHas(k));
  const misplacedNames = misplaced.map((k) => k.replace("\\w+", "*"));
  add("no backend secrets in .env.local", misplaced.length ? "CRITICAL" : "PASS", misplaced.length ? `${misplacedNames.join(", ")} must live in Convex env — \`npx convex env set\` — not in .env.local` : "");

  // R7: live Stripe credentials have no business on a dev machine's env file at all.
  const liveKey = /\b(sk|rk)_live_[A-Za-z0-9]/.test(envLocal);
  add("no live Stripe key in .env.local", liveKey ? "CRITICAL" : "PASS", liveKey ? "sk_live/rk_live found — live keys belong in the PROD deployment's Convex env only" : "");

  const authRoute = existsSync(join(root, "src", "app", "api", "auth", "[...all]", "route.ts"));
  const authWired = existsSync(join(root, "convex", "auth.ts"));
  if (authWired) add("better auth proxy route", authRoute ? "PASS" : "CRITICAL", authRoute ? "" : "convex/auth.ts exists but src/app/api/auth/[...all]/route.ts does not — every sign-in fails with no useful error");

  /* email — the testMode / requireEmailVerification interlock */
  const emailSrc = read("convex/email.ts") ?? "";
  const authSrc = read("convex/auth.ts") ?? "";
  if (emailSrc) {
    const testMode = /testMode:\s*true/.test(emailSrc);
    const requireVerify = /requireEmailVerification:\s*true/.test(authSrc);
    // Both directions are broken states, and both are silent in production.
    if (testMode && requireVerify) {
      add("email testMode interlock", "CRITICAL", "requireEmailVerification is ON while convex/email.ts is still in testMode — Resend refuses real addresses, so every genuine signup is locked out");
    } else if (!testMode && !requireVerify) {
      add("email testMode interlock", "WARN", "testMode is off (real email sends) but requireEmailVerification is still false — verify a domain and turn it on, or unverified addresses can sign up");
    } else {
      add("email testMode interlock", "PASS", testMode ? "testMode on — only Resend test inboxes receive mail" : "");
    }
    add("resend webhook route", /resend-webhook/.test(read("convex/http.ts") ?? "") ? "PASS" : "WARN", "without it, bounces and complaints are invisible");
  }
}

/* ---------- 9. analytics (PostHog) ---------- */

const analyticsSeam = read("src/lib/analytics.ts");
if (!analyticsSeam) {
  add("analytics", "SKIP", "no analytics seam in this repo");
} else {
  const envAll = (read(".env.local") ?? "") + (read(".env") ?? "");
  const publicKey = /NEXT_PUBLIC_POSTHOG_KEY\s*=\s*\S/.test(envAll);

  // A personal API key is a full-access credential. It has no business anywhere here.
  // A bare prefix is documentation ("never commit a phx_ key"); a prefix followed by a
  // payload is the credential itself. Matching the prefix alone made this check flag
  // the very comments warning against the thing.
  const personalKey = [envAll, ...sourceFiles.map((f) => readFileSync(f, "utf8"))].some((body) => /\bphx_[A-Za-z0-9]{20,}/.test(body));
  add("no PostHog personal key", personalKey ? "CRITICAL" : "PASS", personalKey ? "a phx_ personal key is a full-access credential — only the public phc_ project key belongs in this repo" : "");

  // The proxy is what keeps the CSP closed. Key without proxy = blocked requests.
  const proxied = /\/ingest/.test(read("next.config.ts") ?? "") && /\/ingest/.test(read("instrumentation-client.ts") ?? "");
  add("posthog proxied through /ingest", proxied ? "PASS" : publicKey ? "FAIL" : "WARN", proxied ? "" : "analytics must route through the /ingest rewrite — otherwise the CSP blocks it and ad blockers drop it");

  add("posthog key", publicKey ? "PASS" : "WARN", publicKey ? "" : "not configured — analytics is a no-op. Run `pnpm onboard`");
}

/* ---------- 10. deploy (Render) ---------- */

const blueprint = read("render.yaml");
if (!blueprint) {
  add("deploy blueprint", "WARN", "no render.yaml — deployment topology is not captured in the repo");
} else {
  const deploysBackend = /convex deploy/.test(blueprint);
  add("render.yaml deploys Convex", deploysBackend ? "PASS" : "CRITICAL", deploysBackend ? "" : "buildCommand must run `npx convex deploy --cmd 'pnpm build'` or the frontend ships against a stale backend");
  // Prefix + payload only, for the same reason as the PostHog check above: this file
  // deliberately names the secrets it must never contain.
  const holdsSecret = /\b(sk_live_|rk_live_|whsec_|phx_|prod:)[A-Za-z0-9]{16,}/.test(blueprint);
  add("no secret values in render.yaml", holdsSecret ? "CRITICAL" : "PASS", holdsSecret ? "this file is committed — secrets must use `sync: false` and be set in the dashboard" : "");
}

/* ---------- 11. env hygiene ---------- */

const gitignore = read(".gitignore") ?? "";
add(".env* gitignored", /^\.env\*/m.test(gitignore) ? "PASS" : "CRITICAL", /^\.env\*/m.test(gitignore) ? "" : "add `.env*` to .gitignore immediately");
const exampleExempt = /^!\.env\.example/m.test(gitignore);
add(".env.example committed", exampleExempt ? "PASS" : "WARN", exampleExempt ? "" : "the template must be exempt from the .env* rule");
add(".env.local exists", existsSync(join(root, ".env.local")) ? "PASS" : "WARN", existsSync(join(root, ".env.local")) ? "" : "run `pnpm setup:env`");

/* ---------- report ---------- */

const width = Math.max(...rows.map((r) => r.check.length), 5);
console.log(`\n| ${"check".padEnd(width)} | status   | fix or fallback |`);
console.log(`| ${"-".repeat(width)} | -------- | --------------- |`);
for (const r of rows) console.log(`| ${r.check.padEnd(width)} | ${r.status.padEnd(8)} | ${r.fix} |`);

const critical = rows.filter((r) => r.status === "CRITICAL" || r.status === "FAIL").length;
const warned = rows.filter((r) => r.status === "WARN").length;
const hardStop = rows.some((r) => r.status === "CRITICAL");

console.log(
  "\n" +
    (critical === 0 && warned === 0
      ? "HEALTHY — all machine checks passed."
      : hardStop
        ? `BROKEN — ${critical} critical. Fix before continuing.`
        : critical
          ? `BROKEN — ${critical} failing check(s), ${warned} warning(s).`
          : `DEGRADED — ${warned} warning(s). Fallbacks listed above; the project still builds.`),
);
console.log("Machine checks only. Run the setup-health skill for MCP probes, registries and the build proof.\n");

process.exit(critical ? 1 : 0);
