#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function fail(message) {
  console.error(message);
  process.exit(1);
}

export function resolveCloudflareConvexBuild(env = process.env, { dryRun = false } = {}) {
  const branch = env.WORKERS_CI_BRANCH?.trim();
  const productionBranch = env.CLOUDFLARE_PRODUCTION_BRANCH?.trim();
  if (!branch || !productionBranch) {
    throw new Error("WORKERS_CI_BRANCH and CLOUDFLARE_PRODUCTION_BRANCH are required for a Cloudflare build");
  }

  const preview = branch !== productionBranch;
  const secretName = preview ? "CONVEX_PREVIEW_DEPLOY_KEY" : "CONVEX_PROD_DEPLOY_KEY";
  const deployKey = env[secretName];
  if (!deployKey) throw new Error(`${secretName} is required in Workers Builds`);

  const previewName = branch
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
  if (preview && !previewName) throw new Error("WORKERS_CI_BRANCH cannot be converted to a Convex preview name");

  const { CONVEX_PROD_DEPLOY_KEY: _productionKey, CONVEX_PREVIEW_DEPLOY_KEY: _previewKey, ...baseEnv } = env;

  return {
    preview,
    secretName,
    previewName,
    args: [
      "convex",
      "deploy",
      ...(dryRun ? ["--dry-run"] : []),
      ...(preview ? ["--preview-name", previewName] : []),
      "--cmd",
      "pnpm build:vinext",
    ],
    env: { ...baseEnv, CONVEX_DEPLOY_KEY: deployKey },
  };
}

export function runCloudflareConvexBuild({
  env = process.env,
  dryRun = false,
  platform = process.platform,
  spawn = spawnSync,
} = {}) {
  const build = resolveCloudflareConvexBuild(env, { dryRun });
  const executable = platform === "win32" ? "npx.cmd" : "npx";
  return spawn(executable, build.args, { stdio: "inherit", env: build.env });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  let result;
  try {
    result = runCloudflareConvexBuild({ env: process.env, dryRun: process.argv.includes("--dry-run") });
  } catch (error) {
    fail(error.message);
  }
  if (result.error) fail(`Cloudflare Convex build could not start: ${result.error.message}`);
  process.exit(result.status ?? 1);
}
