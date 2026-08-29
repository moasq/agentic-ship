#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CLOUDFLARE_ADAPTER,
  parseWranglerConfig,
  validateCloudflareAccountId,
  validateCloudflareProjectName,
} from "./lib/connections/cloudflare.mjs";

function valueFor(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const root = process.cwd();
const accountId = valueFor("--account-id");
const projectName = valueFor("--project-name");
const account = validateCloudflareAccountId(accountId);
const project = validateCloudflareProjectName(projectName);
if (!account.valid) fail(account.error);
if (!project.valid) fail(project.error);

const candidates = ["wrangler.json", "wrangler.jsonc"]
  .map((path) => ({ path, absolute: resolve(root, path) }))
  .filter(({ absolute }) => {
    try {
      readFileSync(absolute, "utf8");
      return true;
    } catch {
      return false;
    }
  });
if (candidates.length !== 1) fail("Run vinext init first and keep exactly one of wrangler.json or wrangler.jsonc");

const selected = candidates[0];
let config;
let pkg;
try {
  config = parseWranglerConfig(readFileSync(selected.absolute, "utf8"), selected.path);
  pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
} catch (error) {
  fail(error.message);
}

config.name = projectName;
config.account_id = accountId;
config.compatibility_flags = [...new Set([...(config.compatibility_flags ?? []), "nodejs_compat"])];
pkg.dependencies = {
  ...(pkg.dependencies ?? {}),
  [CLOUDFLARE_ADAPTER.framework]: CLOUDFLARE_ADAPTER.frameworkVersion,
  [CLOUDFLARE_ADAPTER.deploymentPackage]: CLOUDFLARE_ADAPTER.deploymentVersion,
};
pkg.scripts = {
  ...(pkg.scripts ?? {}),
  "build:vinext": "vinext build",
  "build:cloudflare": "npx convex deploy --cmd 'pnpm build:vinext'",
  "deploy:cloudflare": "vinext-cloudflare deploy --skip-build --config dist/server/wrangler.json",
  "preview:cloudflare": "wrangler versions upload --config dist/server/wrangler.json",
};

writeFileSync(selected.absolute, `${JSON.stringify(config, null, 2)}\n`, "utf8");
writeFileSync(resolve(root, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
console.log(`Cloudflare selection saved for ${projectName} in account ${accountId}. Run pnpm install before building.`);
