#!/usr/bin/env node
/**
 * Downloads a Fontshare family for next/font/local. Cross-platform: pure Node fetch,
 * no curl, no unzip.
 *
 *   pnpm font general-sans 500,600,700
 *
 * Why a script at all: Fontshare (ITF) faces are free for commercial use but NOT
 * redistributable — the files must not be committed, so every machine fetches its own.
 * `src/fonts/` is gitignored for exactly that reason. OFL faces (IBM Plex, Source
 * Serif) never need this — they load through next/font/google.
 *
 * Flow: Fontshare's CSS endpoint → parse the woff2 URLs → download into
 * src/fonts/<family>/ → print the next/font/local snippet to paste into layout.tsx.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const family = process.argv[2];
const weights = (process.argv[3] ?? "400,500,700").split(",").map((w) => w.trim());

if (!family) {
  console.error("usage: pnpm font <family-slug> [weights]\n       pnpm font general-sans 500,600,700");
  process.exit(1);
}

const cssUrl = `https://api.fontshare.com/v2/css?f[]=${family}@${weights.join(",")}&display=swap`;
const outDir = join(root, "src", "fonts", family);

const res = await fetch(cssUrl, { headers: { "user-agent": "shipkit-font-fetch" } });
if (!res.ok) {
  console.error(`FAIL  Fontshare returned ${res.status} for "${family}". Check the slug at fontshare.com.`);
  process.exit(1);
}
const css = await res.text();

// Each @font-face block carries one weight and one woff2 URL.
const faces = [...css.matchAll(/font-weight:\s*(\d+)[\s\S]*?url\((https:[^)]+\.woff2)\)/g)].map((m) => ({
  weight: m[1],
  url: m[2],
}));

if (faces.length === 0) {
  console.error("FAIL  no woff2 faces found in the Fontshare CSS. The endpoint may have changed — see the skill's upstream link.");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const files = [];
for (const face of faces) {
  const name = `${family}-${face.weight}.woff2`;
  const font = await fetch(face.url);
  if (!font.ok) {
    console.error(`FAIL  could not download weight ${face.weight} (${font.status})`);
    process.exit(1);
  }
  writeFileSync(join(outDir, name), Buffer.from(await font.arrayBuffer()));
  files.push({ name, weight: face.weight });
  console.log(`  fetched ${name}`);
}

const varName = family.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
console.log(`
Done. ${files.length} file(s) in src/fonts/${family}/ (gitignored — Fontshare files are not redistributable).

Paste into src/app/layout.tsx:

  import localFont from "next/font/local";

  const ${varName} = localFont({
    variable: "--font-heading",
    display: "swap",
    src: [
${files.map((f) => `      { path: "../fonts/${family}/${f.name}", weight: "${f.weight}" },`).join("\n")}
    ],
  });

Then add the variable to the <html> className and map it in globals.css.
Every machine runs this once — see .agents/skills/ui-system/references/font-pairings.md.
`);
