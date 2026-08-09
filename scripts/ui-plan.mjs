#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { UI_PLAN_EXAMPLE_FILE, UI_PLAN_FILE, validateUiPlan } from "./lib/ui-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [command, ...rest] = process.argv.slice(2);

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (rest.length > 0) fail(`Unexpected argument(s): ${rest.join(" ")}`);

if (command === "init") {
  const target = resolve(root, UI_PLAN_FILE);
  if (existsSync(target)) fail(`${UI_PLAN_FILE} already exists. Edit it deliberately; init never overwrites a plan.`);
  const example = resolve(root, UI_PLAN_EXAMPLE_FILE);
  if (!existsSync(example)) fail(`${UI_PLAN_EXAMPLE_FILE} is missing.`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(example));
  console.log(`UI plan: CREATED ${UI_PLAN_FILE}`);
  console.log("Replace every example decision, then run `pnpm ui:plan check`.");
  process.exit(0);
}

if (command === "check") {
  const target = resolve(root, UI_PLAN_FILE);
  if (!existsSync(target)) fail(`UI plan: FAIL — ${UI_PLAN_FILE} is missing. Run \`pnpm ui:plan init\`.`);
  let plan;
  try {
    plan = JSON.parse(readFileSync(target, "utf8"));
  } catch (error) {
    fail(`UI plan: FAIL — invalid JSON: ${error.message}`);
  }
  const errors = validateUiPlan(plan);
  if (errors.length > 0) {
    console.error(`UI plan: FAIL — ${errors.length} violation(s)\n`);
    for (const error of errors) console.error(`  ${error.path} ${error.message}`);
    process.exit(1);
  }
  console.log(`UI plan: PASS — ${plan.surfaces.length} surface(s), ${plan.viewports.length} viewport(s), explicit state and theme coverage.`);
  process.exit(0);
}

fail("Usage: pnpm ui:plan <init|check>");
