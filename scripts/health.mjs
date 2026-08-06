#!/usr/bin/env node
/**
 * The machine-checkable half of the workspace-health skill.
 *
 * Everything here used to be a shell one-liner: `readlink`, `grep -r`, `cp`, `openssl`.
 * None of those exist on a stock Windows box, and a health check that silently no-ops on
 * a third of buyers' machines is worse than no health check. This runs the same on
 * macOS, Linux and Windows because Node is the only thing it needs.
 *
 * Agents use service-connections for live provider state and ui-system for visual
 * judgment. This command covers deterministic repository state.
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
    if (name.startsWith("$")) continue; // $comment is annotation, not a pin
    const declared = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
    if (!declared) {
      add(`pin ${name}`, "WARN", `pinned to ${pin} in skills.lock.json but not in package.json`);
      continue;
    }
    // Two pin shapes. "16.x" pins the major. A complete semantic version pins EXACTLY,
    // with no range. Better Auth is exact because its patched runtime and the adapter's
    // narrow provider-only type bridge are regression-tested together.
    const exact = /^\d+\.\d+\.\d+$/.test(pin);
    const ok = exact ? declared === pin : /(\d+)/.exec(declared)?.[1] === pin.split(".")[0];
    add(
      `pin ${name} ${declared}`,
      ok ? "PASS" : "FAIL",
      ok ? "" : `lockfile wants ${exact ? `exactly ${pin} (no range — a range re-admits a proven breakage)` : pin} — run the upstream-sync skill, do not hand-edit`,
    );
  }
}

/* ---------- 3. tailwind v4 has no config file ---------- */

const fossil = ["tailwind.config.js", "tailwind.config.ts", "tailwind.config.mjs", "tailwind.config.cjs"].find((f) => existsSync(join(root, f)));
add("no tailwind.config.*", fossil ? "FAIL" : "PASS", fossil ? `${fossil} is a v3 fossil — move its contents into the @theme block in src/app/globals.css` : "");

/* ---------- 4. single source of truth ---------- */

const claudeMd = read("CLAUDE.md");
add("CLAUDE.md imports AGENTS.md", claudeMd?.trim() === "@AGENTS.md" ? "PASS" : "FAIL", claudeMd?.trim() === "@AGENTS.md" ? "" : "CLAUDE.md must contain exactly `@AGENTS.md` — never a second copy of the rules");

const agents = read("AGENTS.md") ?? "";
const bothBlocks = agents.includes("nextjs-agent-rules") && agents.includes("# Agentic Ship");
add("AGENTS.md rule blocks", bothBlocks ? "PASS" : "FAIL", bothBlocks ? "" : "both the Next.js block and the Agentic Ship block must be present");

const portableRoles = ["product-orchestrator", "frontend-builder", "backend-builder", "connection-guide", "quality-engineer"];
const legacyRoles = [".agents/agents", "agents", ".codex/agents", ".cursor/agents"].flatMap((directory) => {
  const full = join(root, directory);
  return existsSync(full)
    ? readdirSync(full)
        // Both prefixes: `shipkit-` predates the rename, `agentic-ship-` is the current
        // product name. A role named after the product is not portable either way.
        .filter((name) => /^(?:shipkit|agentic-ship)-.*\.(?:md|toml)$/i.test(name))
        .map((name) => `${directory}/${name}`)
    : [];
});
add(
  "canonical role names are portable",
  legacyRoles.length ? "FAIL" : "PASS",
  legacyRoles.length ? `product-prefixed role briefs remain: ${legacyRoles.join(", ")}` : "",
);

const missingAdapters = portableRoles.flatMap((role) =>
  [`.agents/agents/${role}.md`, `agents/${role}.md`, `.codex/agents/${role}.toml`, `.cursor/agents/${role}.md`].filter(
    (path) => !existsSync(join(root, path)),
  ),
);
for (const path of [".codex/config.toml", ".codex/hooks.json", ".cursor/hooks.json", ".hermes/profile/config.yaml", ".hermes/roles.md", ".openclaw/config.json5", ".openclaw/roles.md"]) {
  if (!existsSync(join(root, path))) missingAdapters.push(path);
}
add(
  "native agent adapters",
  missingAdapters.length ? "FAIL" : "PASS",
  missingAdapters.length ? `missing: ${missingAdapters.slice(0, 5).join(", ")} — run \`pnpm sync:agents\`` : "",
);

const claudePlugin = json(".claude-plugin/plugin.json");
const codexMarketplace = json(".agents/plugins/marketplace.json");
const codexMarketplaceEntry = codexMarketplace?.plugins?.find((entry) => entry.name === "agentic-ship");
const pluginWiringValid =
  claudePlugin?.skills === "./.agents/skills/" &&
  claudePlugin?.mcpServers === "./.mcp.json" &&
  !("agents" in (claudePlugin ?? {})) &&
  codexMarketplaceEntry?.source?.source === "local" &&
  codexMarketplaceEntry?.source?.path === "./" &&
  codexMarketplaceEntry?.policy?.installation === "AVAILABLE" &&
  codexMarketplaceEntry?.policy?.authentication === "ON_USE";
add(
  "plugin distribution wiring",
  pluginWiringValid ? "PASS" : "FAIL",
  pluginWiringValid
    ? ""
    : "Claude must auto-discover generated agents/ and canonical skills; Codex marketplace policy must use current enum values",
);

const contractFiles = ["product-brief.schema.json", "feature-contract.schema.json", "input-required.schema.json"];
const brokenContracts = contractFiles.filter((file) => !json(join(".agents", "contracts", file)));
add(
  "agent handoff contracts",
  brokenContracts.length ? "FAIL" : "PASS",
  brokenContracts.length ? `missing or malformed: ${brokenContracts.join(", ")}` : "",
);

// .claude/skills and .claude/agents — the check `readlink` used to do, minus readlink.
for (const [name, probe] of [
  ["skills", join("workspace-health", "SKILL.md")],
  ["agents", "frontend-builder.md"],
]) {
  const linkPath = join(root, ".claude", name);
  let status = "FAIL";
  let fix = "run `pnpm link:skills`";
  if (existsSync(join(linkPath, probe))) {
    const isCopy = existsSync(join(root, ".claude", `.${name}-is-a-copy`));
    status = isCopy ? "WARN" : "PASS";
    fix = isCopy ? `it is a COPY, not a link — edit .agents/${name} then re-run \`pnpm link:skills\`` : "";
  } else if (existsSync(linkPath) && lstatSync(linkPath).isFile()) {
    fix = "it is a text stub — this checkout has core.symlinks=false (normal on Windows). Fix: `pnpm link:skills`";
  }
  add(`.claude/${name} resolves`, status, fix);
}

/* ---------- 5. cross-tool mirror ---------- */

const mcpRaw = read(".mcp.json");
const mirrorRaw = read(".cursor/mcp.json");
add(".cursor/mcp.json mirror", mcpRaw !== null && mcpRaw === mirrorRaw ? "PASS" : "FAIL", mcpRaw === mirrorRaw ? "" : "generated file drifted or is missing — run `pnpm sync:mcp`, never edit it directly");

{
  const servers = Object.entries(json(".mcp.json")?.mcpServers ?? {});
  const floating = servers
    .filter(([, server]) => server.command === "npx")
    .filter(([, server]) => {
      const executable = server.args?.find((arg) => !arg.startsWith("-"));
      if (!executable) return true;
      if (executable.includes("@latest")) return true;
      if (executable.startsWith("@")) return !/@[^@/]+$/.test(executable);
      return !/@\d+\.\d+\.\d+$/.test(executable);
    })
    .map(([name]) => name);
  add(
    "MCP executables are exact",
    floating.length ? "FAIL" : "PASS",
    floating.length ? `floating executable versions: ${floating.join(", ")} — run upstream-sync and commit exact versions` : "",
  );
}

// Every server must have lockfile provenance, and every lockfile entry must still be
// wired (21st is the documented off-by-default exception). Catches the exact failure
// `npx playwright init-agents` caused once: it OVERWRITES .mcp.json wholesale.
{
  const mcpServers = json(".mcp.json")?.mcpServers ?? {};
  const mcpNames = Object.keys(mcpServers);
  const lockEntries = json("skills.lock.json")?.mcp ?? [];
  const lockNames = lockEntries.map((entry) => entry.name);
  const unlocked = mcpNames.filter((name) => !lockNames.includes(name));
  const unwired = lockNames.filter((name) => !mcpNames.includes(name) && name !== "21st");
  add(
    "mcp servers match lockfile",
    unlocked.length || unwired.length ? "FAIL" : "PASS",
    [
      unlocked.length ? `no provenance for: ${unlocked.join(", ")} — add skills.lock.json entries` : "",
      unwired.length ? `in lockfile but missing from .mcp.json: ${unwired.join(", ")} — a tool overwrote it (init-agents does); restore and pnpm sync:mcp` : "",
    ]
      .filter(Boolean)
      .join("; "),
  );

  const pinDrift = lockEntries
    .filter((entry) => /^\d+\.\d+\.\d+$/.test(entry.pinned ?? "") && mcpServers[entry.name]?.command === "npx")
    .filter((entry) => {
      const executable = mcpServers[entry.name].args?.find((arg) => !arg.startsWith("-")) ?? "";
      return executable.match(/@(\d+\.\d+\.\d+)$/)?.[1] !== entry.pinned;
    })
    .map((entry) => `${entry.name} wants ${entry.pinned}`);
  add(
    "MCP executable pins match provenance",
    pinDrift.length ? "FAIL" : "PASS",
    pinDrift.length ? `${pinDrift.join(", ")} — run upstream-sync, then regenerate adapters` : "",
  );
}

if (process.platform === "win32") {
  add("MCP launcher on Windows", "WARN", "if a server never starts, wrap it: \"command\": \"cmd\", \"args\": [\"/c\", \"npx\", ...] — see references/platform-notes.md");
}

/* ---------- 6. design system ---------- */

const css = read("src/app/globals.css") ?? "";
add("globals.css @theme block", css.includes("@theme") ? "PASS" : "FAIL", css.includes("@theme") ? "" : "the token layer is the whole design system — run the ui-system skill");

// Only what is actually LOADED counts. Naming a banned face in a comment (this repo's
// layout.tsx explains why they are banned) is not a violation — an early version of this
// check flagged its own documentation.
//
// Two shapes to cover, because the two loaders import differently:
//   next/font/google → named imports, the family IS the identifier: { Inter }
//   next/font/local  → a default import, the family is only in the src file paths
// Checking the google shape alone let a banned face in through a local `src:` array.
const layout = read("src/app/layout.tsx") ?? "";
const loadedFonts = [...layout.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']next\/font\/google["']/g)]
  .flatMap((m) => m[1].split(","))
  .map((s) => s.trim());
const localFontPaths = /from\s*["']next\/font\/local["']/.test(layout)
  ? [...layout.matchAll(/path:\s*["']([^"']+)["']/g)].map((m) => m[1])
  : [];
const BANNED = ["Inter", "Geist", "Space_Grotesk", "Poppins"];
const bannedFont =
  BANNED.find((f) => loadedFonts.includes(f)) ??
  BANNED.find((f) => {
    // "Space_Grotesk" as a file is "space-grotesk"; match the slug, and only as a whole
    // path segment so a directory named "geist-alternatives" is not a false positive.
    const slug = f.toLowerCase().replace(/_/g, "-");
    return localFontPaths.some((p) => new RegExp(`(^|/)${slug}[-.]`).test(p));
  });
add("no banned primary font", bannedFont ? "FAIL" : "PASS", bannedFont ? `${bannedFont} is the loudest "an AI made this site" signal — see ui-system/references/font-pairings.md` : "");

// The build must not need the network. next/font/google fetches the face during
// `next build`, so a host with no egress cannot build at all — an air-gapped server, a
// locked-down CI runner. OFL files committed under src/fonts/ofl/ are the fix.
const usesRemoteFont = /from\s*["']next\/font\/google["']/.test(layout);
add(
  "fonts build offline",
  usesRemoteFont ? "WARN" : "PASS",
  usesRemoteFont
    ? "layout.tsx loads next/font/google — `next build` will fetch fonts.googleapis.com and fail on any host without egress. Self-host: `pnpm font --ofl \"<Family>\" <weights>`, then switch to next/font/local"
    : "",
);

// The paths must also RESOLVE. On a fresh clone (CI is one), a font that was never
// `git add`ed makes every next/font/local build fail with module-not-found — and the
// check above stays green because it only looks for the remote loader. This is the
// gap that let src/fonts/ sit untracked while everything claimed it was committed.
if (localFontPaths.length) {
  const missingFonts = localFontPaths.filter((p) => !existsSync(join(root, "src", "app", p)));
  add(
    "local font files exist",
    missingFonts.length ? "FAIL" : "PASS",
    missingFonts.length ? `${missingFonts.join(", ")} referenced by layout.tsx but not on disk — refetch with \`pnpm font\` and commit src/fonts/ofl/` : "",
  );
}

/* ---------- 7. hardcoded colors (the `grep -r` replacement) ---------- */

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    // statSync follows symlinks and THROWS on a broken one. A single dangling link
    // under src/ must not abort the whole health run — skip it and keep going.
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(full)) out.push(full);
  }
  return out;
}

// The comment-vs-code rule (heal-ledger.md): a check must be able to tell the code from
// the documentation of the code. Strip line and block comments before pattern checks so
// a comment showing what NOT to write never trips the check that bans it.
const stripComments = (body) => body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const sourceFiles = [
  ...walk(join(root, "src")),
  ...walk(join(root, "content")),
  ...(existsSync(join(root, "mdx-components.tsx")) ? [join(root, "mdx-components.tsx")] : []),
];
const posix = (p) => relative(root, p).split(sep).join("/"); // stable output on Windows

const rawColor = [];
const leaks = [];
for (const file of sourceFiles) {
  const raw = readFileSync(file, "utf8");
  const body = stripComments(raw);
  const rel = posix(file);
  if (!rel.startsWith("src/components/ui/") && /(?:bg|text|border|from|to|via|fill|stroke|ring|shadow)-\[#|:\s*#[0-9a-fA-F]{3,8}\b/.test(body)) {
    rawColor.push(rel);
  }
  // Server-only env in a client component ships the value to the browser. Anchored to a
  // line start AND comment-stripped, so a commented-out directive cannot arm the scan.
  if (/^\s*["']use client["']/m.test(body)) {
    for (const m of body.matchAll(/process\.env\.([A-Za-z0-9_]+)/g)) {
      if (!m[1].startsWith("NEXT_PUBLIC_")) leaks.push(`${rel} -> process.env.${m[1]}`);
    }
  }
}
add("no raw hex / arbitrary color values", rawColor.length ? "FAIL" : "PASS", rawColor.length ? `${rawColor.length} file(s): ${rawColor.slice(0, 3).join(", ")} — these must become tokens` : "");
add(
  "no server env in client components",
  leaks.length ? "CRITICAL" : "PASS",
  leaks.length
    ? `${leaks.slice(0, 3).join("; ")} — a "use client" file ships its env values to the browser. Move the read into a server component or Server Action and pass the RESULT down as a prop; if the value is genuinely public, rename it NEXT_PUBLIC_*`
    : "",
);

/* ---------- 8. secret placement ---------- */

// UNCONDITIONAL, on purpose. These checks used to live inside the convex and analytics
// sections, which meant a repo without convex/schema.ts or src/lib/analytics.ts was
// never scanned for live Stripe keys or personal API keys at all — the checks silently
// skipped exactly the non-standard layouts most likely to have drifted. A secret in the
// wrong file is a secret in the wrong file regardless of which seams the repo ships.
{
  const envAll = (read(".env.local") ?? "") + "\n" + (read(".env") ?? "");
  const envHasKey = (key) => new RegExp(`^\\s*${key}\\s*=\\s*\\S`, "m").test(envAll);

  // Action secrets belong in Convex env. Finding one here means it is one `git add`
  // away from being public.
  const misplaced = [
    "BETTER_AUTH_SECRET",
    "CONVEX_DEPLOY_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_\\w+",
    "RESEND_API_KEY",
    "RESEND_WEBHOOK_SECRET",
  ].filter(envHasKey);
  const misplacedNames = misplaced.map((k) => k.replace("\\w+", "*"));
  add("no backend secrets in .env.local", misplaced.length ? "CRITICAL" : "PASS", misplaced.length ? `${misplacedNames.join(", ")} must live in Convex env — \`npx convex env set\` — not in .env.local` : "");

  // R7: live Stripe credentials have no business on a dev machine's env file at all.
  const liveKey = /\b(sk|rk)_live_[A-Za-z0-9]/.test(envAll);
  add("no live Stripe key in .env.local", liveKey ? "CRITICAL" : "PASS", liveKey ? "sk_live/rk_live found — live keys belong in the PROD deployment's Convex env only" : "");

  // A PostHog personal API key is a full-access credential. Prefix + payload only: a
  // bare prefix is documentation ("never commit a phx_ key"), and matching the prefix
  // alone made this check flag the very comments warning against the thing.
  const personalKey = [envAll, ...sourceFiles.map((f) => readFileSync(f, "utf8"))].some((body) => /\bphx_[A-Za-z0-9]{20,}/.test(body));
  add("no PostHog personal key", personalKey ? "CRITICAL" : "PASS", personalKey ? "a phx_ personal key is a full-access credential — only the public phc_ project key belongs in this repo" : "");
}

/* ---------- 9. convex backend ---------- */

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

  // Secret placement is checked unconditionally in section 8 — not here, where it would
  // only run for repos that happen to ship convex/schema.ts.

  const authRoute = existsSync(join(root, "src", "app", "api", "auth", "[...all]", "route.ts"));
  const authWired = existsSync(join(root, "convex", "auth.ts"));
  if (authWired) add("better auth proxy route", authRoute ? "PASS" : "CRITICAL", authRoute ? "" : "convex/auth.ts exists but src/app/api/auth/[...all]/route.ts does not — every sign-in fails with no useful error");

  /* email — the testMode / requireEmailVerification interlock */
  const emailSrc = read("convex/email.ts") ?? "";
  const authSrc = read("convex/auth.ts") ?? "";
  if (emailSrc) {
    // Line-anchored: comments discussing these flags must never satisfy the check
    // (the comment-vs-code bug class — heal-ledger.md).
    const testMode = /^\s*testMode:\s*true/m.test(emailSrc);
    const requireVerify = /^\s*requireEmailVerification:\s*true/m.test(authSrc);
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

/* ---------- 10. analytics (PostHog) ---------- */

// The phx_ personal-key scan is NOT here — it runs unconditionally in section 8, so a
// repo without this seam is still scanned.
const analyticsSeam = read("src/lib/analytics.ts");
if (!analyticsSeam) {
  add("analytics", "SKIP", "no analytics seam in this repo");
} else {
  const envAll = (read(".env.local") ?? "") + (read(".env") ?? "");
  const publicKey = /NEXT_PUBLIC_POSTHOG_KEY\s*=\s*\S/.test(envAll);

  // The proxy is what keeps the CSP closed. Key without proxy = blocked requests.
  const proxied = /\/ingest/.test(read("next.config.ts") ?? "") && /\/ingest/.test(read("instrumentation-client.ts") ?? "");
  add("posthog proxied through /ingest", proxied ? "PASS" : publicKey ? "FAIL" : "WARN", proxied ? "" : "analytics must route through the /ingest rewrite — otherwise the CSP blocks it and ad blockers drop it");

  add("posthog key", publicKey ? "PASS" : "WARN", publicKey ? "" : "not configured — analytics is a no-op. Run `pnpm onboard`");
}

/* ---------- 11. deploy (Render) ---------- */

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

/* ---------- 12. env hygiene ---------- */

const gitignore = read(".gitignore") ?? "";
add(".env* gitignored", /^\.env\*/m.test(gitignore) ? "PASS" : "CRITICAL", /^\.env\*/m.test(gitignore) ? "" : "add `.env*` to .gitignore immediately");
const exampleExempt = /^!\.env\.example/m.test(gitignore);
add(".env.example committed", exampleExempt ? "PASS" : "WARN", exampleExempt ? "" : "the template must be exempt from the .env* rule");
add(".env.local exists", existsSync(join(root, ".env.local")) ? "PASS" : "WARN", existsSync(join(root, ".env.local")) ? "" : "run `pnpm setup:env`");
const stateIgnored = /^\/?\.agent-state\/$/m.test(gitignore);
add("agent state gitignored", stateIgnored ? "PASS" : "CRITICAL", stateIgnored ? "" : "add `/.agent-state/` — receipts and work coordination metadata are local runtime state");

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
console.log("Machine checks only. Use workspace-health for interpretation and service-connections for live provider authorization or provisioning.\n");

process.exit(critical ? 1 : 0);
