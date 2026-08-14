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
 *   - redirects are NOT followed. Checking only the URL you typed is not a check: an
 *     allowlisted host that 302s elsewhere would walk the download straight past the
 *     allowlist. Every hop is re-validated against the same list.
 *   - the response must actually be an image
 *   - files land in public/images/<name>.<ext> — no scattered assets
 *
 * Serve the result through next/image. Never hotlink: the ui-system skill's asset-pipeline reference has the
 * licensing and treatment rules.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ALLOWED_IMAGE_HOSTS as ALLOWED_HOSTS, checkAssetUrl } from "./lib/asset-allowlist.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [rawUrl, rawName] = process.argv.slice(2);

if (!rawUrl || !rawName) {
  console.error('usage: pnpm asset <https-url> <kebab-name>\n       pnpm asset "https://images.unsplash.com/photo-..." hero-workspace');
  process.exit(1);
}

// The source allowlist and the per-URL gate live in scripts/lib/asset-allowlist.mjs so
// the security check is unit-tested; this stays the caller that drives the redirect loop.
const checkUrl = (candidate) => checkAssetUrl(candidate, ALLOWED_HOSTS);

const first = checkUrl(rawUrl);
if (first.error) {
  console.error(`FAIL  ${first.error}`);
  process.exit(1);
}

// The name reaches the filesystem. Reject rather than mangle: silently rewriting
// "../../etc/x" into a dash salad would write a file the caller did not ask for.
const name = rawName.toLowerCase();
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
  console.error(`FAIL  "${rawName}" is not a kebab-case name — lowercase letters, digits and single hyphens only (e.g. hero-workspace).`);
  process.exit(1);
}

// redirect:"manual" is the whole point: fetch's default follows hops without telling
// anyone, so the allowlist would only ever have described the first URL.
let target = first.url.href;
let res;
for (let hop = 0; ; hop++) {
  if (hop > 5) {
    console.error("FAIL  too many redirects.");
    process.exit(1);
  }
  res = await fetch(target, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
  if (res.status < 300 || res.status >= 400) break;

  const location = res.headers.get("location");
  if (!location) {
    console.error(`FAIL  ${res.status} redirect with no Location header.`);
    process.exit(1);
  }
  const next = checkUrl(new URL(location, target).href);
  if (next.error) {
    console.error(`FAIL  redirect left the allowlist: ${next.error}`);
    process.exit(1);
  }
  target = next.url.href;
}

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
use it:  <Image src="/images/${name}.${ext}" ... />  — record source + license per ui-system references/asset-pipeline.md`);
