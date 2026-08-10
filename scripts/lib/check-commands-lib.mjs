// @vitest-environment node
/**
 * Pure logic for the command/prose reconciliation gate (scripts/check-commands.mjs).
 *
 * Why this exists: the drift this catches is prose promising a `pnpm <name>` that
 * package.json never defines. Generators gate their outputs; prose was ungated, so
 * AGENTS.md, README, skills, and settings could name commands that did not exist.
 *
 * ── Downstream escape hatch ────────────────────────────────────────────────────
 * Some documented commands belong to the *product workspace* that adopts Agentic
 * Ship, not to this tool-only repo — `pnpm dev`, `pnpm build`, `pnpm start`,
 * `pnpm test:e2e`. They are correct to document and correctly absent here.
 *
 * Two mechanisms were considered:
 *   (1) an explicit allowlist of the known downstream-only names, and
 *   (2) skipping every fenced code block inside a file carrying the standard
 *       "> Downstream contract:" marker line.
 * This file uses (1). Mechanism (2) is rejected because it suppresses *every*
 * command in those blocks — including a genuinely missing repo script — which is a
 * false negative, exactly the silent drift this gate exists to prevent. The named
 * allowlist excuses only the four product-workspace commands and nothing else, so a
 * real stale reference in a marked skill still fails the gate.
 *
 * Extraction is raw-text (not code-span-only) on purpose: it flags a `pnpm <name>`
 * wherever it appears, even in bare prose, so a typo'd command name cannot hide
 * outside backticks. It favors a loud false positive over a silent false negative.
 */

/**
 * pnpm's own subcommands and aliases. Writing `pnpm <one-of-these>` invokes pnpm
 * itself, never a package script, so these are never validated against package.json.
 * Deliberately EXCLUDES `test` and `start`: npm-style lifecycle shortcuts that run a
 * package script, so they must resolve against package.json like any other name.
 */
export const PNPM_BUILTINS = new Set([
  "install", "i", "add", "remove", "rm", "update", "up", "upgrade",
  "audit", "dlx", "exec", "run", "dedupe", "prune", "rebuild", "fetch",
  "view", "info", "why", "list", "ls", "ll", "link", "unlink", "import",
  "store", "create", "init", "publish", "pack", "config", "patch",
  "patch-commit", "deploy", "licenses", "outdated", "root", "bin", "env",
  "help", "doctor", "setup", "server", "cat-file", "cat-index",
]);

/**
 * Commands that belong to a downstream product workspace, not this engine repo.
 * Each carries the reason it is legitimately absent from this package.json.
 */
export const DOWNSTREAM_ONLY = [
  { name: "dev", reason: "product workspace: Next.js dev server" },
  { name: "build", reason: "product workspace: Next.js production build (also `npx convex deploy --cmd 'pnpm build'`)" },
  { name: "start", reason: "product workspace: Next.js production server" },
  { name: "test:e2e", reason: "product workspace: gate G3 (Playwright against the product build)" },
];

const DOWNSTREAM_NAMES = new Set(DOWNSTREAM_ONLY.map((d) => d.name));

/**
 * A pnpm command reference. `name` is the script token; a trailing `:` marks a
 * permission wildcard remnant (e.g. `pnpm audit:*` → `audit:`), which matchesScript
 * resolves as a prefix.
 *
 * The leading `(?<![\w/-])` boundary keeps "Node/pnpm versions" and "pnpm-lock" from
 * ever being read as a command; the char class stops at `*`, so `pnpm audit:*`
 * yields `audit:`.
 */
const PNPM_REF = /(?<![\w/-])pnpm\s+(?:--silent\s+|-s\s+|run\s+)?([a-z0-9:_-]+)/g;

/**
 * Every pnpm command reference in a blob of text, with 1-based line numbers.
 * pnpm builtins are dropped here; downstream classification happens in classifyRefs.
 */
export function extractPnpmRefs(text) {
  const refs = [];
  if (typeof text !== "string" || text.length === 0) return refs;
  // Precompute line starts for O(1)-ish line lookup.
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") lineStarts.push(i + 1);
  const lineOf = (idx) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= idx) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  PNPM_REF.lastIndex = 0;
  let m;
  while ((m = PNPM_REF.exec(text)) !== null) {
    const name = m[1];
    if (PNPM_BUILTINS.has(name)) continue;
    refs.push({ name, line: lineOf(m.index) });
  }
  return refs;
}

/**
 * Does `name` name a real script? Exact match, or — for a wildcard remnant ending in
 * `:` — the base (`agent:work:` → `agent:work`) or any script under it
 * (`audit:` → `audit:supply-chain`).
 */
export function matchesScript(name, scripts) {
  if (scripts.has(name)) return true;
  if (name.endsWith(":")) {
    const base = name.slice(0, -1);
    if (scripts.has(base)) return true;
    for (const s of scripts) if (s.startsWith(name)) return true;
  }
  return false;
}

export function isDownstream(name) {
  return DOWNSTREAM_NAMES.has(name);
}

/**
 * Split references into resolved and missing. `scripts` is a Set of package.json
 * script names. Downstream-only names are treated as resolved.
 * @param {Array<{name,line,file?}>} refs
 */
export function classifyRefs(refs, scripts) {
  const missing = [];
  const ok = [];
  for (const ref of refs) {
    if (matchesScript(ref.name, scripts) || isDownstream(ref.name)) ok.push(ref);
    else missing.push(ref);
  }
  return { missing, ok };
}

/**
 * Scripts defined in package.json that no scanned source ever mentions. Warning
 * only — an unused script is not a defect, but a surprising one is worth surfacing.
 * Downstream names and a small set of always-implicit scripts are never "unused".
 */
export function unreferencedScripts(scripts, referencedNames, { implicit = [] } = {}) {
  const referenced = new Set();
  for (const n of referencedNames) {
    referenced.add(n);
    if (n.endsWith(":")) referenced.add(n.slice(0, -1)); // wildcard remnant covers its base
  }
  const skip = new Set(implicit);
  const out = [];
  for (const s of scripts) {
    if (referenced.has(s) || skip.has(s)) continue;
    // A wildcard remnant like `agent:work:` should mark `agent:work` as referenced;
    // also treat any `<script>` as referenced if a `<script>:` remnant was seen.
    let covered = false;
    for (const r of referenced) if (r.endsWith(":") && s.startsWith(r)) { covered = true; break; }
    if (!covered) out.push(s);
  }
  return out.sort();
}

/**
 * Generic set reconciliation used for both skills(dir vs lock) and MCP(source vs
 * lock). Returns what each side is missing and whether the counts disagree.
 * @param {string[]} lockNames  names recorded in skills.lock.json
 * @param {string[]} diskNames  names found on disk / in the source of truth
 */
export function reconcile(lockNames, diskNames, { lockLabel = "lock", diskLabel = "disk" } = {}) {
  const lock = new Set(lockNames);
  const disk = new Set(diskNames);
  const missingFromLock = diskNames.filter((n) => !lock.has(n)).sort(); // on disk, not locked
  const missingFromDisk = lockNames.filter((n) => !disk.has(n)).sort(); // locked, not on disk
  const countMismatch = lock.size !== disk.size;
  return {
    ok: missingFromLock.length === 0 && missingFromDisk.length === 0 && !countMismatch,
    missingFromLock,
    missingFromDisk,
    countMismatch,
    lockCount: lock.size,
    diskCount: disk.size,
    lockLabel,
    diskLabel,
  };
}
