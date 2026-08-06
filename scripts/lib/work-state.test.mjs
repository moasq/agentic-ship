// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { createWorkStore, WorkStateBusyError } from "./work-state.mjs";

const roots = [];
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const makeStore = (options = {}) => {
  const root = mkdtempSync(join(tmpdir(), "agent-work-"));
  roots.push(root);
  let tick = 0;
  return createWorkStore(root, { now: () => `2026-08-06T00:00:0${tick++}.000Z`, ...options });
};

function writeLock(store, contents, modifiedAt = new Date()) {
  const directory = dirname(store.path);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "work-items.lock");
  writeFileSync(path, contents, { mode: 0o600 });
  utimesSync(path, modifiedAt, modifiedAt);
  return path;
}

function runAddWorker(root, id) {
  const moduleUrl = pathToFileURL(join(repositoryRoot, "scripts", "lib", "work-state.mjs")).href;
  const source = [
    `import { createWorkStore } from ${JSON.stringify(moduleUrl)};`,
    "const store = createWorkStore(process.argv[1]);",
    "store.add({ id: process.argv[2], role: 'quality-engineer', summary: `Add ${process.argv[2]}`, acceptanceCriteria: ['The item is durable'] });",
  ].join("\n");
  const child = spawn(process.execPath, ["--input-type=module", "--eval", source, root, id], {
    cwd: repositoryRoot,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  return new Promise((finish) => child.once("exit", (code) => finish({ code, stderr })));
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("host-neutral work state", () => {
  test("enforces dependencies and evidence-backed completion", () => {
    const store = makeStore();
    store.init({ name: "Example", goal: "Ship a verified workflow" });
    store.add({ id: "backend", role: "backend-builder", summary: "Create the contract", acceptanceCriteria: ["Contract test passes"] });
    store.add({ id: "frontend", role: "frontend-builder", summary: "Consume the contract", dependsOn: ["backend"], acceptanceCriteria: ["Browser flow passes"] });

    expect(store.next().map((item) => item.id)).toEqual(["backend"]);
    expect(() => store.transition("frontend", "start")).toThrow("unfinished dependencies");
    store.transition("backend", "start");
    expect(() => store.transition("backend", "complete", { evidence: [] })).toThrow("completion evidence");
    store.transition("backend", "complete", { evidence: ["unit gate passed"] });
    expect(store.next().map((item) => item.id)).toEqual(["frontend"]);
  });

  test("pauses and resumes on a reference to a human action", () => {
    const store = makeStore();
    store.init({ name: "Example", goal: "Connect a provider" });
    store.add({ id: "billing", role: "connection-guide", summary: "Connect billing", acceptanceCriteria: ["Provider verifies"] });
    store.transition("billing", "start");
    store.transition("billing", "wait", { actionId: "stripe-123", reason: "User must authorize in the provider" });
    expect(store.load().items[0].status).toBe("input_required");
    store.transition("billing", "resume", { evidence: "connection status reports ready" });
    expect(store.next()[0].id).toBe("billing");
  });

  test("rejects credentials in coordination metadata", () => {
    const store = makeStore();
    expect(() => store.init({ name: "Example", goal: "Use token=super-secret" })).toThrow("credential");
  });

  test("serializes initialization and never writes through a live owner", () => {
    const store = makeStore({ lockAttempts: 1 });
    const lockPath = writeLock(
      store,
      JSON.stringify({ schemaVersion: 1, token: "live-owner", pid: process.pid, createdAt: Date.now() }),
    );

    expect(() => store.init({ name: "Example", goal: "Initialize once" })).toThrow(WorkStateBusyError);
    expect(existsSync(store.path)).toBe(false);

    unlinkSync(lockPath);
    const initialized = store.init({ name: "Example", goal: "Initialize once" });
    expect(initialized.product).toEqual({ name: "Example", goal: "Initialize once" });
    expect(store.init({ name: "Example", goal: "Initialize once" })).toEqual(initialized);
    expect(() => store.init({ name: "Other", goal: "Overwrite the queue" })).toThrow("different product");
    expect(store.load().product).toEqual({ name: "Example", goal: "Initialize once" });
  });

  test("preserves both updates when separate agent processes mutate concurrently", async () => {
    const store = makeStore();
    store.init({ name: "Example", goal: "Coordinate independent agents" });
    const root = dirname(dirname(store.path));

    const results = await Promise.all([runAddWorker(root, "first-agent"), runAddWorker(root, "second-agent")]);

    expect(results, results.map((result) => result.stderr).join("\n")).toEqual([
      { code: 0, stderr: "" },
      { code: 0, stderr: "" },
    ]);
    expect(store.load().items.map((item) => item.id).sort()).toEqual(["first-agent", "second-agent"]);
  });

  test("recovers a lock whose recorded process is dead", () => {
    const store = makeStore({ isProcessAlive: () => false, lockAttempts: 2, lockRetryDelayMs: 0 });
    store.init({ name: "Example", goal: "Recover after a crash" });
    writeLock(
      store,
      JSON.stringify({ schemaVersion: 1, token: "dead-owner", pid: 424242, createdAt: Date.now() }),
    );

    const item = store.add({
      id: "recovered",
      role: "quality-engineer",
      summary: "Prove recovery",
      acceptanceCriteria: ["Mutation succeeds after the dead lock is removed"],
    });

    expect(item.id).toBe("recovered");
    expect(existsSync(join(dirname(store.path), "work-items.lock"))).toBe(false);
  });

  test("recovers an abandoned partial lock only after its grace period", () => {
    const store = makeStore({ staleLockMs: 1_000, lockAttempts: 2, lockRetryDelayMs: 0 });
    store.init({ name: "Example", goal: "Recover an interrupted lock write" });
    writeLock(store, "", new Date(Date.now() - 2_000));

    store.add({
      id: "partial-lock",
      role: "quality-engineer",
      summary: "Recover the partial lock",
      acceptanceCriteria: ["The state remains valid"],
    });

    expect(store.load().items.map((item) => item.id)).toEqual(["partial-lock"]);
  });

  test("does not steal an aged lock while its owner is alive", () => {
    const store = makeStore({
      clock: () => Date.now() + 60_000,
      isProcessAlive: () => true,
      lockAttempts: 1,
      staleLockMs: 1,
    });
    store.init({ name: "Example", goal: "Preserve a live writer" });
    writeLock(
      store,
      JSON.stringify({ schemaVersion: 1, token: "slow-live-owner", pid: process.pid, createdAt: Date.now() - 60_000 }),
      new Date(Date.now() - 60_000),
    );

    expect(() =>
      store.add({
        id: "must-wait",
        role: "quality-engineer",
        summary: "Do not race the writer",
        acceptanceCriteria: ["Live ownership wins"],
      }),
    ).toThrow(WorkStateBusyError);
    expect(JSON.parse(readFileSync(store.path, "utf8")).items).toEqual([]);
  });

  test("requires evidence to recover a blocked item and makes it claimable again", () => {
    const store = makeStore();
    store.init({ name: "Example", goal: "Recover resolved blockers" });
    store.add({
      id: "blocked-work",
      role: "backend-builder",
      summary: "Finish after a dependency repair",
      acceptanceCriteria: ["The repaired gate passes"],
    });
    store.transition("blocked-work", "start");
    store.transition("blocked-work", "block", { reason: "A dependency gate is red" });

    expect(store.next()).toEqual([]);
    expect(() => store.transition("blocked-work", "unblock", {})).toThrow("unblock evidence");
    const recovered = store.transition("blocked-work", "unblock", { evidence: "Dependency gate passed after the repair" });
    expect(recovered.status).toBe("ready");
    expect(recovered.blockReason).toBeNull();
    expect(recovered.evidence).toContain("Dependency gate passed after the repair");
    expect(store.next().map((item) => item.id)).toEqual(["blocked-work"]);
    expect(store.transition("blocked-work", "start").status).toBe("in_progress");
    expect(() => store.transition("blocked-work", "complete", { evidence: [] })).toThrow("completion evidence");
    expect(store.load().items[0].status).toBe("in_progress");
    expect(
      store.transition("blocked-work", "complete", { evidence: ["pnpm verify passed"] }).status,
    ).toBe("done");
  });

  test("retains a safe human action reference while blocked and clears it after recovery", () => {
    const store = makeStore();
    store.init({ name: "Example", goal: "Recover a provider branch" });
    store.add({
      id: "provider-work",
      role: "connection-guide",
      summary: "Connect the provider",
      acceptanceCriteria: ["The provider probe passes"],
    });
    store.transition("provider-work", "start");
    store.transition("provider-work", "wait", {
      actionId: "connection-action-123",
      reason: "A person must finish the provider flow",
    });
    const blocked = store.transition("provider-work", "block", { reason: "The provider rejected verification" });

    expect(blocked.humanAction?.id).toBe("connection-action-123");
    const recovered = store.transition("provider-work", "unblock", { evidence: "The provider probe now passes" });
    expect(recovered.humanAction).toBeNull();
  });
});
