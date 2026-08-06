#!/usr/bin/env node
/**
 * Downloads font files for next/font/local. Cross-platform: pure Node fetch, no curl,
 * no unzip.
 *
 *   pnpm font general-sans 500,600,700          Fontshare — NOT redistributable
 *   pnpm font --ofl "IBM Plex Sans" 400,500     Google Fonts OFL — committed
 *
 * Two providers, because the licence decides where the files may live:
 *
 *   Fontshare (ITF) faces are free for commercial use but NOT redistributable — the
 *   files must not be committed, so every machine fetches its own into
 *   `src/fonts/<family>/`, which is gitignored.
 *
 *   OFL faces (IBM Plex, Source Serif) ARE redistributable, so `--ofl` writes them to
 *   `src/fonts/ofl/` and they are COMMITTED on purpose: a build that reaches out to
 *   fonts.googleapis.com is a build that fails on any host without egress — an
 *   air-gapped server, a locked-down CI runner. That was a real outage here; see
 *   `.agents/heal-ledger.md`. Committed OFL files are what makes `pnpm build` offline.
 *
 * Redistribution has two obligations this script enforces, not just documents:
 *
 *   1. OFL §2 requires the licence text to accompany the files. `--ofl` fetches the
 *      family's own OFL.txt from the google/fonts repo and writes it BESIDE the faces
 *      as `<slug>-OFL.txt` — per family, because each family has its own copyright
 *      line. If the family has no `ofl/` directory upstream, the run FAILS: that means
 *      the face is not actually OFL and must not be committed.
 *
 *   2. Variable fonts. Google serves one variable file for every requested weight of a
 *      variable family — download-per-weight would commit N identical copies under N
 *      names (this repo shipped 4x IBM Plex Sans that way once). Downloads are hashed;
 *      when every weight is the same bytes, ONE file is written and the printed
 *      snippet uses a single weight-range entry.
 *
 * Flow: the provider's CSS endpoint → parse the woff2 URLs (host-pinned) → download →
 * dedupe by content → write faces + licence → print the next/font/local snippet.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const ofl = argv.includes("--ofl") || argv.includes("--google");
const rest = argv.filter((a) => !a.startsWith("--"));
const family = rest[0];
const weights = (rest[1] ?? "400,500,700").split(",").map((w) => w.trim());

if (!family) {
  console.error(
    "usage: pnpm font <family-slug> [weights]        Fontshare (gitignored)\n" +
      '       pnpm font --ofl "<Family Name>" [weights]  Google Fonts OFL (committed)\n' +
      "\n" +
      "       pnpm font general-sans 500,600,700\n" +
      '       pnpm font --ofl "IBM Plex Sans" 400,500,600,700',
  );
  process.exit(1);
}

if (!weights.every((w) => /^[1-9]00$/.test(w))) {
  console.error(`FAIL  weights must be 100-900 in hundreds, got "${weights.join(",")}".`);
  process.exit(1);
}

// The family reaches the filesystem as a directory and a filename. Validate it as a
// slug rather than trusting argv: "../../.." is a valid string and an invalid path.
const slug = family.trim().toLowerCase().replace(/\s+/g, "-");
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  console.error(`FAIL  "${family}" is not a usable family name — letters, digits, spaces and hyphens only.`);
  process.exit(1);
}

// The CSS is fetched from the provider, but the file URLs inside it are data from the
// network. Pin the download host per provider so a tampered CSS response cannot point
// the download anywhere else (fetch-asset.mjs applies the same rule to images).
const FONT_HOSTS = { google: "fonts.gstatic.com", fontshare: "cdn.fontshare.com" };

/** No timeout means a hung endpoint hangs the whole script, and the Stop hook with it. */
async function get(url, init = {}) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    console.error(`FAIL  could not reach ${new URL(url).host} — ${err.cause?.code ?? err.name}. Check the network and retry.`);
    process.exit(1);
  }
  return res;
}

const faces = ofl ? await fromGoogleFonts() : await fromFontshare();

if (faces.length === 0) {
  console.error("FAIL  no woff2 faces found in the provider's CSS. The endpoint may have changed — see the ui-system skill's upstream link.");
  process.exit(1);
}

const pinnedHost = ofl ? FONT_HOSTS.google : FONT_HOSTS.fontshare;
for (const face of faces) {
  if (new URL(face.url).host !== pinnedHost) {
    console.error(`FAIL  refusing to download from ${new URL(face.url).host} — expected ${pinnedHost}. The provider's CSS looks tampered with or changed; do not bypass this.`);
    process.exit(1);
  }
}

const outDir = ofl ? join(root, "src", "fonts", "ofl") : join(root, "src", "fonts", slug);
mkdirSync(outDir, { recursive: true });

// Download everything BEFORE writing anything: a partial failure must not leave a
// half-updated family on disk.
const downloads = [];
for (const face of faces) {
  const font = await get(face.url);
  if (!font.ok) {
    console.error(`FAIL  could not download weight ${face.weight} (${font.status})`);
    process.exit(1);
  }
  const buf = Buffer.from(await font.arrayBuffer());
  downloads.push({ weight: face.weight, buf, hash: createHash("sha256").update(buf).digest("hex") });
}

// One variable file served for every weight → commit it once, not once per weight.
const uniqueHashes = new Set(downloads.map((d) => d.hash));
const isVariable = downloads.length > 1 && uniqueHashes.size === 1;

const files = [];
if (isVariable) {
  const name = `${slug}-variable.woff2`;
  writeFileSync(join(outDir, name), downloads[0].buf);
  const sorted = weights.map(Number).sort((a, b) => a - b);
  files.push({ name, weight: `${sorted[0]} ${sorted[sorted.length - 1]}` });
  console.log(`  fetched ${name} (variable — one file covers weights ${sorted.join(", ")})`);
} else {
  if (uniqueHashes.size < downloads.length) {
    console.log("  note: some weights are byte-identical — the provider may serve a variable face; check before committing duplicates.");
  }
  for (const d of downloads) {
    const name = `${slug}-${d.weight}.woff2`;
    writeFileSync(join(outDir, name), d.buf);
    files.push({ name, weight: d.weight });
    console.log(`  fetched ${name}`);
  }
}

if (ofl) await writeLicence();

report();

// ---------------------------------------------------------------------------

async function fromFontshare() {
  const cssUrl = `https://api.fontshare.com/v2/css?f[]=${encodeURIComponent(slug)}@${weights.join(",")}&display=swap`;
  const res = await get(cssUrl, { headers: { "user-agent": "shipkit-font-fetch" } });
  if (!res.ok) {
    console.error(`FAIL  Fontshare returned ${res.status} for "${slug}". Check the slug at fontshare.com.`);
    process.exit(1);
  }
  const css = await res.text();
  // Parse per @font-face block. A single regex spanning blocks once paired the weight
  // of one block with the URL of the next when a block had no woff2 URL.
  const byWeight = new Map();
  for (const m of css.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)) {
    const block = m[1];
    const weight = block.match(/font-weight:\s*(\d+)/)?.[1];
    const url = block.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
    if (weight && url && !byWeight.has(weight)) byWeight.set(weight, url);
  }
  const missing = weights.filter((w) => !byWeight.has(w));
  if (missing.length) {
    console.error(`FAIL  Fontshare did not return weight(s) ${missing.join(", ")} for "${slug}". Check the family page for which weights exist.`);
    process.exit(1);
  }
  return weights.map((weight) => ({ weight, url: byWeight.get(weight) }));
}

async function fromGoogleFonts() {
  const name = family.trim().replace(/\s+/g, "+");
  const cssUrl = `https://fonts.googleapis.com/css2?family=${name}:wght@${weights.join(";")}&display=swap`;
  // Google serves woff2 only to a UA it believes supports it; its own bot string gets
  // ttf. This is the one place a browser UA is the correct request, not a disguise.
  const res = await get(cssUrl, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) {
    console.error(`FAIL  Google Fonts returned ${res.status} for "${family}". Check the exact family name at fonts.google.com.`);
    process.exit(1);
  }
  const css = await res.text();

  // Google emits one @font-face per (weight, subset), each preceded by a subset
  // comment. We want `latin` only — shipping cyrillic and greek would triple the
  // committed bytes for glyphs this template does not render.
  const byWeight = new Map();
  for (const m of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([\s\S]*?)\}/g)) {
    if (m[1] !== "latin") continue;
    const block = m[2];
    const weight = block.match(/font-weight:\s*(\d+)/)?.[1];
    const url = block.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
    if (weight && url && !byWeight.has(weight)) byWeight.set(weight, url);
  }

  const missing = weights.filter((w) => !byWeight.has(w));
  if (missing.length) {
    console.error(`FAIL  Google Fonts did not return weight(s) ${missing.join(", ")} for "${family}" in the latin subset.`);
    process.exit(1);
  }
  return weights.map((weight) => ({ weight, url: byWeight.get(weight) }));
}

// OFL §2: redistribution must carry the licence. Each family's OFL.txt (its own
// copyright line, not a generic template) lives in the google/fonts repo under a
// directory named after the family. 404 there means the face is NOT in Google's OFL
// set — refuse to leave committed-looking files without their licence.
async function writeLicence() {
  const gfDir = family.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const url = `https://raw.githubusercontent.com/google/fonts/main/ofl/${gfDir}/OFL.txt`;
  const res = await get(url);
  if (!res.ok) {
    console.error(
      `FAIL  no OFL licence found for "${family}" at google/fonts (${res.status} for ofl/${gfDir}/OFL.txt).\n` +
        "      The face may not be OFL — verify the licence at fonts.google.com before committing anything.",
    );
    process.exit(1);
  }
  const name = `${slug}-OFL.txt`;
  writeFileSync(join(outDir, name), await res.text());
  console.log(`  fetched ${name} (the licence ships beside the faces — OFL requires it)`);
}

function report() {
  const camel = slug.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
  const varName = /^[0-9]/.test(camel) ? `font${camel[0].toUpperCase()}${camel.slice(1)}` : camel;
  const dir = ofl ? "ofl" : slug;
  const licence = ofl
    ? `Committed on purpose — OFL faces are redistributable, and committing them is what keeps\n\`pnpm build\` working with no network. The family's own OFL.txt is written beside them.`
    : `Gitignored — Fontshare files are not redistributable, so every machine runs this once.`;

  console.log(`
Done. ${files.length} file(s) in src/fonts/${dir}/.
${licence}

Paste into src/app/layout.tsx:

  import localFont from "next/font/local";

  const ${varName} = localFont({
    variable: "--font-sans",
    display: "swap",
    src: [
${files.map((f) => `      { path: "../fonts/${dir}/${f.name}", weight: "${f.weight}", style: "normal" },`).join("\n")}
    ],
  });

Then add the variable to the <html> className and map it in globals.css.
See .agents/skills/ui-system/references/font-pairings.md.
`);
}
