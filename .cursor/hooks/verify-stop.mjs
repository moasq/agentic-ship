#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MAX_LOOP_COUNT = 2;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function respond(payload) {
  process.stdout.write(JSON.stringify(payload) + "\n");
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    respond({});
    return;
  }

  const candidate = Number(input.loop_count);
  const loopCount = Number.isInteger(candidate) && candidate >= 0 ? candidate : MAX_LOOP_COUNT;
  if (input.status !== "completed" || loopCount >= MAX_LOOP_COUNT) {
    respond({});
    return;
  }

  const result = spawnSync(process.execPath, ["scripts/verify.mjs", "--quiet"], {
    cwd: root,
    encoding: "utf8",
    timeout: 590_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.status === 0) {
    respond({});
    return;
  }

  const attempt = loopCount + 1;
  respond({
    followup_message:
      "[Verification retry " +
      attempt +
      "/" +
      MAX_LOOP_COUNT +
      "] Repository gates are red. Run pnpm verify, fix the root cause without weakening a gate, and verify again before declaring completion.",
  });
}

main();
