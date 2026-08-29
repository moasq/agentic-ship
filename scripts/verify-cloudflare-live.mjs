#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CLOUDFLARE_AUTH_ENV, discoverCloudflareCredentials, inspectCloudflareBlueprint, parseWranglerConfig } from "./lib/connections/cloudflare.mjs";
import { verifyCloudflareLiveEnvironment } from "./lib/connections/cloudflare-live.mjs";

function fail(message) {
  console.error(message);
  process.exit(1);
}

const candidates = ["wrangler.json", "wrangler.jsonc"].filter((path) => {
  try {
    readFileSync(resolve(path), "utf8");
    return true;
  } catch {
    return false;
  }
});
if (candidates.length !== 1) fail("Keep exactly one wrangler.json or wrangler.jsonc before live verification");

let config;
try {
  const configSource = readFileSync(resolve(candidates[0]), "utf8");
  const packageJsonSource = readFileSync(resolve("package.json"), "utf8");
  const blueprint = inspectCloudflareBlueprint({
    configSources: [{ path: candidates[0], source: configSource }],
    packageJsonSource,
  });
  if (blueprint.status !== "PASS") throw new Error(blueprint.detail);
  config = parseWranglerConfig(configSource, candidates[0]);
} catch (error) {
  fail(error.message);
}

const commandRunner = (command, args, options = {}) =>
  spawnSync(process.platform === "win32" ? `${command}.cmd` : command, args, {
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
  });
const auth = discoverCloudflareCredentials({ commandRunner });
if (!auth.authenticated) fail(auth.error ?? "Cloudflare authentication failed its remote probe");

try {
  const result = await verifyCloudflareLiveEnvironment({
    config,
    configPath: candidates[0],
    commandRunner,
    env: { ...process.env, ...CLOUDFLARE_AUTH_ENV },
  });
  console.log(`Cloudflare live verification passed for ${result.productionOrigin} and ${result.previewOrigin}.`);
} catch (error) {
  fail(error.message);
}
