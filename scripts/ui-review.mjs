#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { acceptUiEvidence, captureUiEvidence, inspectUiEvidence, UI_GALLERY_FILE } from "./lib/ui-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [command, ...args] = process.argv.slice(2);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function options(values, accepted) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith("--") || !accepted.includes(token.slice(2))) fail(`Unknown argument: ${token}`);
    const value = values[index + 1];
    if (!value || value.startsWith("--")) fail(`${token} requires a value`);
    parsed[token.slice(2)] = value;
    index += 1;
  }
  return parsed;
}

if (command === "capture") {
  const parsed = options(args, ["base-url"]);
  if (!parsed["base-url"]) fail("capture requires --base-url <local-url>");
  let url;
  try {
    url = new URL(parsed["base-url"]);
  } catch {
    fail("--base-url must be a valid URL");
  }
  if (!new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(url.hostname) || url.username || url.password) {
    fail("Visual evidence may be captured only from a local fixture or development server, never production.");
  }
  let chromium;
  try {
    ({ chromium } = await import("@playwright/test"));
  } catch {
    fail("Playwright is unavailable. Run `pnpm install`, then `npx playwright install chromium`.");
  }
  try {
    const draft = await captureUiEvidence({ root, baseUrl: url.href, chromium });
    console.log(`UI review capture: PASS — ${draft.captures.length} screenshot(s) generated.`);
    console.log(`Inspect ${UI_GALLERY_FILE}, then accept with named review evidence.`);
  } catch (error) {
    fail(`UI review capture: FAIL\n${error.message}`);
  }
  process.exit(0);
}

if (command === "accept") {
  const parsed = options(args, ["reviewer", "responsibility", "reason", "changed"]);
  try {
    const manifest = acceptUiEvidence({
      root,
      reviewer: parsed.reviewer,
      responsibility: parsed.responsibility,
      reason: parsed.reason,
      changedSurfaceSummary: parsed.changed,
    });
    console.log(`UI review: ACCEPTED — ${manifest.captures.length} capture(s) bound to ${manifest.review.reviewer}.`);
  } catch (error) {
    fail(`UI review: FAIL — ${error.message}`);
  }
  process.exit(0);
}

if (command === "check") {
  if (args.length > 0) fail(`Unexpected argument(s): ${args.join(" ")}`);
  const result = inspectUiEvidence(root);
  if (result.status === "not_applicable") {
    console.log("UI review: N/A — the plain engine has no authored product UI yet.");
    process.exit(0);
  }
  if (result.status === "pass") {
    console.log("UI review: PASS — plan, screenshots, browser audits, and accepted manifest match current authored UI.");
    process.exit(0);
  }
  console.error(`UI review: FAIL — ${result.violations.length} violation(s)\n`);
  for (const violation of result.violations) console.error(`  [${violation.rule}] ${violation.message}`);
  console.error("\nRegenerate local captures, inspect the gallery, and accept them with reviewer evidence.");
  process.exit(1);
}

fail("Usage: pnpm ui:review <capture --base-url http://localhost:3000|accept --reviewer NAME --responsibility ROLE --reason TEXT --changed SUMMARY|check>");
