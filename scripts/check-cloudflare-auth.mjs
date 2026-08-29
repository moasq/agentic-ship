#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { discoverCloudflareCredentials } from "./lib/connections/cloudflare.mjs";

const result = discoverCloudflareCredentials({
  commandRunner(command, args, options = {}) {
    return spawnSync(command, args, {
      encoding: "utf8",
      shell: process.platform === "win32",
      env: { ...process.env, ...(options.env ?? {}) },
    });
  },
});

if (!result.authenticated) {
  console.error(result.error ?? "Cloudflare authentication is unavailable");
  process.exit(1);
}

console.log(`Cloudflare authentication is ready through ${result.method}.`);
