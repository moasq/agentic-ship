#!/usr/bin/env node
/**
 * Downloads one image into public/images/ with a name you chose. The cross-platform
 * `curl -o` — pure Node, works identically on macOS, Linux and Windows.
 *
 *   pnpm asset "https://images.unsplash.com/photo-..." hero-workspace
 *
 * Rules enforced here rather than remembered:
 *   - https only, and only from the source allowlist — the same hosts next/image and
 *     the CSP already trust. Anything else needs a human decision, not a download.
 *   - the response must actually be an image
 *   - files land in public/images/<name>.<ext> — no scattered assets
 *
 * Serve the result through next/image. Never hotlink: the asset-pipeline skill has the
 * licensing and treatment rules.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [rawUrl, rawName] = process.argv.slice(2);

if (!rawUrl || !rawName) {
  console.error('usage: pnpm asset <https-url> <kebab-name>\n       pnpm asset "https://images.unsplash.com/photo-..." hero-workspace');
  process.exit(1);
}

// Mirrors images.remotePatterns in next.config.ts. Extending this list is a human
// decision made there first — the two must not drift apart silently.
const ALLOWED_HOSTS = new Set(["images.unsplash.com", "images.pexels.com"]);

let url;
try {
  url = new URL(rawUrl);
} catch {
  console.error("FAIL  not a valid URL.");
  process.exit(1);
}
if (url.protocol !== "https:") {
  console.error("FAIL  https only.");
  process.exit(1);
}
if (!ALLOWED_HOSTS.has(url.hostname)) {
  console.error(`FAIL  ${url.hostname} is not in the source allowlist (${[...ALLOWED_HOSTS].join(", ")}).\n      Adding a source is a human decision: update images.remotePatterns in next.config.ts first, then this script's list.`);
  process.exit(1);
}

const name = rawName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
const res = await fetch(rawUrl);
if (!res.ok) {
  console.error(`FAIL  download returned ${res.status}.`);
  process.exit(1);
}

const type = res.headers.get("content-type") ?? "";
const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/svg+xml": "svg" }[type.split(";")[0]];
if (!ext) {
  console.error(`FAIL  response is "${type}", not an image.`);
  process.exit(1);
}

const outDir = join(root, "public", "images");
const outPath = join(outDir, `${name}.${ext}`);
if (existsSync(outPath)) {
  console.error(`FAIL  public/images/${name}.${ext} already exists. Pick another name or delete it first.`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const bytes = Buffer.from(await res.arrayBuffer());
writeFileSync(outPath, bytes);
console.log(`saved public/images/${name}.${ext} (${(bytes.length / 1024).toFixed(0)} KB, ${type.split(";")[0]})
use it:  <Image src="/images/${name}.${ext}" ... />  — record source + license per the asset-pipeline skill`);
