#!/usr/bin/env node
/**
 * Provider-selective onboarding over the same resumable connection protocol used by
 * agents. A product does not need every vendor, and host authorization is not project
 * provisioning, so there is no universal linear wizard.
 *
 *   pnpm onboard
 *   pnpm onboard stripe --host codex
 *   pnpm onboard --host cursor
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ConnectionCommandError, createConnectionService } from "./lib/connections/service.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const json = argv.includes("--json");
const clean = argv.filter((value) => value !== "--json");
const hostIndex = clean.indexOf("--host");
let host = null;
if (hostIndex >= 0) {
  host = clean[hostIndex + 1];
  if (!host || host.startsWith("--")) {
    console.error("--host needs one of: claude, codex, cursor, hermes, openclaw");
    process.exit(1);
  }
  clean.splice(hostIndex, 2);
}
const provider = clean.shift() ?? null;
if (clean.length) {
  console.error("Usage: pnpm onboard [provider] [--host claude|codex|cursor|hermes|openclaw] [--json]");
  process.exit(1);
}

const stateDirectory = process.env.AGENT_CONNECTION_STATE_DIR
  ? resolve(process.env.AGENT_CONNECTION_STATE_DIR)
  : resolve(root, ".agent-state", "connections");
const service = createConnectionService({ projectRoot: root, stateDirectory });

function printInput(result) {
  console.log(`\n${result.inputRequired.title}`);
  console.log(`\n  action: ${result.action.actionId}`);
  console.log(`  phase:  ${result.action.phase}`);
  if (result.inputRequired.consent) {
    console.log(`\n  Ask first — one yes/no question, nothing runs before the answer:`);
    console.log(`    ${result.inputRequired.consent.question}`);
    console.log(`    yes → ${result.inputRequired.consent.onYes}`);
    console.log(`    no  → ${result.inputRequired.consent.onNo}`);
  }
  if (result.inputRequired.decision) {
    console.log(`\n  Your call first — ${result.inputRequired.decision.question}`);
    for (const option of result.inputRequired.decision.options) {
      console.log(`    [${option.value}] ${option.label}`);
      for (const step of option.run) console.log(`      $ ${step.command}`);
    }
    console.log("    {placeholders} are filled with your answer before anything runs.");
  }
  if (result.inputRequired.agentRuns?.length) {
    console.log("\n  Agent runs these on your behalf — your part is only the browser consent:");
    for (const step of result.inputRequired.agentRuns) {
      console.log(`    $ ${step.command}${step.opensBrowser ? "   ← opens a browser; approve it" : ""}`);
    }
    console.log("\n  Manual equivalent, if no agent is driving:");
  }
  for (const instruction of result.inputRequired.instructions) console.log(`\n  - ${instruction}`);
  if (result.inputRequired.browserUrl) console.log(`\n  open: ${result.inputRequired.browserUrl}`);
  console.log(`\n  resume: ${result.inputRequired.resumeCommand}`);
  console.log(`  cancel: ${result.inputRequired.cancelCommand}`);
  console.log("\nDo not paste credentials, authorization codes, API keys, or webhook secrets into chat or agent state.\n");
}

try {
  if (provider) {
    if (!host) throw new ConnectionCommandError("host_required", "Choose the active AI host with --host claude|codex|cursor|hermes|openclaw");
    const result = service.begin(provider, host);
    if (json) console.log(JSON.stringify(result, null, 2));
    else if (result.type === "input_required") printInput(result);
    else console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  const result = service.status();
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  console.log("\nProvider onboarding\n");
  console.log("Host authorization, project provisioning, and customer checkout are separate flows. Connect only what this product brief requires.\n");
  for (const item of result.providers) {
    const local = item.projectVerification.localPrerequisitesPassed ? "local signals pass" : "setup incomplete";
    const receipt = item.latestAction ? `${item.latestAction.state} · ${item.latestAction.phase}` : "not started";
    console.log(`  ${item.id.padEnd(9)} ${local.padEnd(18)} ${receipt}`);
    if (item.latestAction && ["waiting_for_user", "failed_retryable"].includes(item.latestAction.state)) {
      console.log(`             resume: pnpm connect resume ${item.latestAction.actionId} --json`);
    } else if (!item.latestAction || !["ready", "blocked_manual"].includes(item.latestAction.state)) {
      const selectedHost = host ?? "<claude|codex|cursor|hermes|openclaw>";
      console.log(`             begin:  pnpm connect begin ${item.id} --host ${selectedHost} --json`);
    }
  }
  console.log("\nUse the service-connections skill for interpretation. A hosted Stripe customer checkout remains product runtime and never appears in this table.\n");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (json) console.error(JSON.stringify({ schemaVersion: 1, type: "connection_error", error: { message } }, null, 2));
  else console.error(`${message}\n\nUsage: pnpm onboard [provider] --host <claude|codex|cursor|hermes|openclaw>`);
  process.exit(1);
}
