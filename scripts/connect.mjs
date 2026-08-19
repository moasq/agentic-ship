#!/usr/bin/env node
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ConnectionCommandError, createConnectionService } from "./lib/connections/service.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
  return [
    "Service connections",
    "",
    "  pnpm --silent connect status [--json]",
    "  pnpm --silent connect begin <provider> --host <host> [--json]",
    "  pnpm --silent connect resume <actionId> [--json]",
    "  pnpm --silent connect cancel <actionId> [--json]",
    "",
    "Providers: convex, stripe, github, resend, posthog, netlify, vercel, polar, lemonsqueezy",
    "Hosts: claude, codex, cursor, hermes, openclaw",
  ].join("\n");
}

function parse(argv) {
  const json = argv.includes("--json");
  const values = argv.filter((arg) => arg !== "--json");
  const command = values.shift();
  if (!command || command === "help" || command === "--help" || command === "-h") return { command: "help", json };

  if (command === "status") {
    if (values.length) throw new ConnectionCommandError("invalid_arguments", "status does not accept positional arguments");
    return { command, json };
  }

  if (command === "begin") {
    const provider = values.shift();
    const hostFlag = values.shift();
    const host = values.shift();
    if (!provider || hostFlag !== "--host" || !host || values.length) {
      throw new ConnectionCommandError("invalid_arguments", "begin requires: <provider> --host <host>");
    }
    return { command, provider, host, json };
  }

  if (command === "resume" || command === "cancel") {
    const actionId = values.shift();
    if (!actionId || values.length) throw new ConnectionCommandError("invalid_arguments", `${command} requires one actionId`);
    return { command, actionId, json };
  }

  throw new ConnectionCommandError("unknown_command", `Unknown command "${command}"`);
}

function printHuman(result) {
  if (result.type === "connection_status") {
    console.log("\nService connection status\n");
    for (const provider of result.providers) {
      const project = provider.projectVerification.localPrerequisitesPassed ? "local checks pass" : "setup incomplete";
      const action = provider.latestAction ? `${provider.latestAction.state} (${provider.latestAction.actionId})` : "no receipt";
      console.log(`  ${provider.displayName.padEnd(10)} ${project}; ${action}`);
    }
    console.log(`\nReceipts: ${result.stateDirectory}\n`);
    return;
  }

  console.log(`\n${result.type}: ${result.action.provider} on ${result.action.host}`);
  console.log(`Action: ${result.action.actionId}`);
  console.log(`State: ${result.action.state} · phase: ${result.action.phase}`);
  if (result.inputRequired) {
    console.log(`\n${result.inputRequired.title}\n`);
    if (result.inputRequired.consent) {
      console.log(`Ask first — one yes/no question, nothing runs before the answer:`);
      console.log(`  ${result.inputRequired.consent.question}`);
      console.log(`  yes → ${result.inputRequired.consent.onYes}`);
      console.log(`  no  → ${result.inputRequired.consent.onNo}\n`);
    }
    if (result.inputRequired.decision) {
      console.log(`Your call first — ${result.inputRequired.decision.question}`);
      for (const option of result.inputRequired.decision.options) {
        console.log(`  [${option.value}] ${option.label}`);
        for (const step of option.run) console.log(`    $ ${step.command}`);
      }
      console.log("  {placeholders} are filled with your answer before anything runs.\n");
    }
    if (result.inputRequired.agentRuns?.length) {
      console.log("Agent runs these on your behalf (a browser step only needs your consent):");
      for (const step of result.inputRequired.agentRuns) {
        console.log(`  $ ${step.command}${step.opensBrowser ? "   ← opens a browser; approve it and the command continues" : ""}`);
      }
      console.log("\nIf no agent is driving, the manual equivalent:");
    }
    for (const instruction of result.inputRequired.instructions) console.log(`  - ${instruction}`);
    if (result.inputRequired.browserUrl) console.log(`\nOpen: ${result.inputRequired.browserUrl}`);
    console.log(`\nResume: ${result.inputRequired.resumeCommand}`);
    console.log(`Cancel: ${result.inputRequired.cancelCommand}`);
    console.log("\nNever paste credentials, authorization codes, or webhook secrets into this command.\n");
    return;
  }
  if (result.message) console.log(`\n${result.message}`);
  if (result.revocation?.length) {
    console.log("\nTo revoke access itself:");
    for (const step of result.revocation) console.log(`  ${step.command ? `$ ${step.command}` : `- ${step.text}`}`);
  }
  console.log("");
}

let parsed;
try {
  parsed = parse(process.argv.slice(2));
  if (parsed.command === "help") {
    console.log(usage());
    process.exit(0);
  }

  const stateDirectory = process.env.AGENT_CONNECTION_STATE_DIR
    ? resolve(process.env.AGENT_CONNECTION_STATE_DIR)
    : resolve(projectRoot, ".agent-state", "connections");
  const service = createConnectionService({ projectRoot, stateDirectory });
  const result =
    parsed.command === "status"
      ? service.status()
      : parsed.command === "begin"
        ? service.begin(parsed.provider, parsed.host)
        : parsed.command === "resume"
          ? service.resume(parsed.actionId)
          : service.cancel(parsed.actionId);

  if (parsed.json) console.log(JSON.stringify(result, null, 2));
  else printHuman(result);
} catch (error) {
  const json = parsed?.json ?? process.argv.includes("--json");
  const code = error instanceof ConnectionCommandError ? error.code : "connection_error";
  const message = error instanceof Error ? error.message : String(error);
  if (json) console.error(JSON.stringify({ schemaVersion: 1, type: "connection_error", error: { code, message } }, null, 2));
  else console.error(`${message}\n\n${usage()}`);
  process.exitCode = 2;
}
