#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createWorkStore, WORK_ROLES } from "./lib/work-state.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const store = createWorkStore(root);
const argv = process.argv.slice(2);
const command = argv.shift();
const json = argv.includes("--json");

function take(name, { repeat = false } = {}) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== name) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${name} needs a value`);
    values.push(value);
    argv.splice(index, 2);
    index -= 1;
  }
  return repeat ? values : values.at(-1);
}

function print(value) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) console.log("No work is ready.");
    for (const item of value) console.log(`${item.id}\t${item.role}\t${item.summary}`);
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

function usage() {
  console.log(`Agent work queue

  pnpm agent:work init --name <product> --goal <outcome>
  pnpm agent:work add <id> --role <${WORK_ROLES.join("|")}> --summary <scope> --accept <criterion> [--depends <id>]
  pnpm agent:work next [--role <role>] [--json]
  pnpm agent:work start <id>
  pnpm agent:work wait <id> --action <connection-action-id> --reason <why>
  pnpm agent:work resume <id> --evidence <verification>
  pnpm agent:work block <id> --reason <why>
  pnpm agent:work unblock <id> --evidence <resolution>
  pnpm agent:work complete <id> --evidence <gate/result> [--evidence <gate/result>]
  pnpm agent:work status [--json]
  pnpm agent:work mirror-github [--project <number>] [--json]

State contains safe coordination metadata only and lives under .agent-state/.`);
}

try {
  let result;
  if (command === "init") {
    result = store.init({ name: take("--name"), goal: take("--goal") });
  } else if (command === "add") {
    const id = argv.shift();
    result = store.add({
      id,
      role: take("--role"),
      summary: take("--summary"),
      dependsOn: take("--depends", { repeat: true }),
      acceptanceCriteria: take("--accept", { repeat: true }),
    });
  } else if (command === "next") {
    result = store.next(take("--role"));
  } else if (command === "status") {
    result = store.load();
  } else if (command === "mirror-github" || command === "sync-github") {
    const { createGitHubWorkMirror } = await import("./lib/work-state-github.mjs");
    const mirror = createGitHubWorkMirror(root);
    const projectNumber = take("--project");
    result = mirror.sync(store.load(), { projectNumber });
  } else if (["start", "wait", "resume", "block", "unblock", "complete"].includes(command)) {
    const id = argv.shift();
    const payload = {
      actionId: take("--action"),
      reason: take("--reason"),
      evidence: command === "complete" ? take("--evidence", { repeat: true }) : take("--evidence"),
    };
    result = store.transition(id, command, payload);
  } else {
    usage();
    process.exit(command ? 1 : 0);
  }
  print(result);
} catch (error) {
  console.error(`Agent work: ${error.message}`);
  process.exit(1);
}
