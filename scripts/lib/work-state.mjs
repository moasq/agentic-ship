import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export const WORK_ROLES = [
  "product-orchestrator",
  "frontend-builder",
  "backend-builder",
  "quality-engineer",
  "connection-guide",
];

const WORK_STATUSES = ["ready", "in_progress", "input_required", "blocked", "done"];
const SECRET_SHAPE = /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+|\bwhsec_[A-Za-z0-9]+|\bphx_[A-Za-z0-9]+|\bre_[A-Za-z0-9]{16,}|\b(?:api[_-]?key|secret|token|password)\s*[=:]\s*\S+/i;

export class WorkStateBusyError extends Error {
  constructor() {
    super("another agent is updating work state; retry this command shortly");
    this.name = "WorkStateBusyError";
  }
}

function wait(milliseconds) {
  if (milliseconds <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    return true;
  }
}

function assertSafeText(value, field) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} must be non-empty text`);
  if (SECRET_SHAPE.test(value)) throw new Error(`${field} looks like a credential; store only safe metadata in agent state`);
  return value.trim();
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function atomicJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
}

function validateState(state) {
  if (state?.schemaVersion !== 1 || !state.product || !Array.isArray(state.items)) throw new Error("work state is malformed or from an unsupported version");
  const ids = new Set();
  for (const item of state.items) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) || ids.has(item.id)) throw new Error(`invalid or duplicate work item id: ${item.id}`);
    if (!WORK_ROLES.includes(item.role)) throw new Error(`unknown role for ${item.id}: ${item.role}`);
    if (!WORK_STATUSES.includes(item.status)) throw new Error(`unknown status for ${item.id}: ${item.status}`);
    ids.add(item.id);
  }
  for (const item of state.items) {
    for (const dependency of item.dependsOn) if (!ids.has(dependency)) throw new Error(`${item.id} depends on missing item ${dependency}`);
  }
  return state;
}

export function createWorkStore(root, options = {}) {
  const now = options.now ?? (() => new Date().toISOString());
  const clock = options.clock ?? Date.now;
  const isProcessAlive = options.isProcessAlive ?? processIsAlive;
  const pause = options.pause ?? wait;
  const lockAttempts = options.lockAttempts ?? 40;
  const lockRetryDelayMs = options.lockRetryDelayMs ?? 25;
  const staleLockMs = options.staleLockMs ?? 30_000;
  const stateDirectory = join(root, ".agent-state");
  const stateFile = join(stateDirectory, "work-items.json");
  const lockFile = join(stateDirectory, "work-items.lock");
  const recoveryLockFile = join(stateDirectory, "work-items.recovery.lock");

  if (!Number.isInteger(lockAttempts) || lockAttempts < 1) throw new Error("lockAttempts must be a positive integer");
  if (!Number.isFinite(lockRetryDelayMs) || lockRetryDelayMs < 0) throw new Error("lockRetryDelayMs must be non-negative");
  if (!Number.isFinite(staleLockMs) || staleLockMs < 0) throw new Error("staleLockMs must be non-negative");

  const load = () => {
    if (!existsSync(stateFile)) throw new Error("work state is not initialized; run `pnpm agent:work init --name <name> --goal <goal>`");
    return validateState(readJson(stateFile));
  };

  const tryCreateLock = (file) => {
    const token = randomUUID();
    let descriptor;
    try {
      descriptor = openSync(file, "wx", 0o600);
    } catch (error) {
      if (error?.code === "EEXIST") return null;
      throw error;
    }

    try {
      writeFileSync(
        descriptor,
        JSON.stringify({ schemaVersion: 1, token, pid: process.pid, createdAt: clock() }),
        "utf8",
      );
      return { descriptor, file, token };
    } catch (error) {
      closeSync(descriptor);
      try {
        unlinkSync(file);
      } catch {
        // Preserve the decisive write failure. A partial lock also ages out safely.
      }
      throw error;
    }
  };

  const releaseLock = ({ descriptor, file, token }) => {
    closeSync(descriptor);
    try {
      const owner = JSON.parse(readFileSync(file, "utf8"));
      if (owner?.token === token) unlinkSync(file);
    } catch (error) {
      if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
  };

  const inspectLock = (file) => {
    try {
      const stats = statSync(file);
      const raw = readFileSync(file, "utf8");
      let owner = null;
      try {
        owner = JSON.parse(raw);
      } catch {
        // An empty or partial lock is recoverable only after its grace period.
      }
      const validOwner =
        owner?.schemaVersion === 1 &&
        typeof owner.token === "string" &&
        owner.token.length > 0 &&
        Number.isInteger(owner.pid) &&
        owner.pid > 0 &&
        Number.isFinite(owner.createdAt);
      const stale = validOwner ? !isProcessAlive(owner.pid) : clock() - stats.mtimeMs > staleLockMs;
      return { exists: true, raw, mtimeMs: stats.mtimeMs, stale };
    } catch (error) {
      if (error?.code === "ENOENT") return { exists: false, stale: false };
      throw error;
    }
  };

  const removeIfStillStale = (file, snapshot) => {
    const latest = inspectLock(file);
    if (
      !latest.exists ||
      !latest.stale ||
      latest.raw !== snapshot.raw ||
      latest.mtimeMs !== snapshot.mtimeMs
    ) {
      return false;
    }
    try {
      unlinkSync(file);
      return true;
    } catch (error) {
      if (error?.code === "ENOENT") return false;
      throw error;
    }
  };

  const tryRecoverLock = () => {
    let recovery = tryCreateLock(recoveryLockFile);
    if (!recovery) {
      const recoverySnapshot = inspectLock(recoveryLockFile);
      if (recoverySnapshot.exists && recoverySnapshot.stale) {
        removeIfStillStale(recoveryLockFile, recoverySnapshot);
        recovery = tryCreateLock(recoveryLockFile);
      }
    }
    if (!recovery) return false;

    try {
      const snapshot = inspectLock(lockFile);
      return snapshot.exists && snapshot.stale && removeIfStillStale(lockFile, snapshot);
    } finally {
      releaseLock(recovery);
    }
  };

  const acquireLock = () => {
    mkdirSync(stateDirectory, { recursive: true });
    for (let attempt = 0; attempt < lockAttempts; attempt += 1) {
      const acquired = tryCreateLock(lockFile);
      if (acquired) return acquired;
      if (tryRecoverLock()) {
        const recovered = tryCreateLock(lockFile);
        if (recovered) return recovered;
      }
      if (attempt + 1 < lockAttempts) pause(lockRetryDelayMs);
    }
    throw new WorkStateBusyError();
  };

  const withLock = (operation) => {
    const lock = acquireLock();
    try {
      return operation();
    } finally {
      releaseLock(lock);
    }
  };

  const mutate = (change) =>
    withLock(() => {
      const state = load();
      const result = change(state);
      state.updatedAt = now();
      atomicJson(stateFile, state);
      return result ?? state;
    });

  return {
    path: stateFile,
    init({ name, goal }) {
      const product = { name: assertSafeText(name, "name"), goal: assertSafeText(goal, "goal") };
      return withLock(() => {
        if (existsSync(stateFile)) {
          const existing = load();
          if (existing.product.name === product.name && existing.product.goal === product.goal) return existing;
          throw new Error("work state already exists for a different product; preserve it or archive it deliberately before initializing another");
        }
        const timestamp = now();
        const state = { schemaVersion: 1, product, items: [], createdAt: timestamp, updatedAt: timestamp };
        atomicJson(stateFile, state);
        return state;
      });
    },
    load,
    add({ id, role, summary, dependsOn = [], acceptanceCriteria = [] }) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error("id must be lowercase kebab-case");
      if (!WORK_ROLES.includes(role)) throw new Error(`role must be one of: ${WORK_ROLES.join(", ")}`);
      if (acceptanceCriteria.length === 0) throw new Error("at least one acceptance criterion is required");
      return mutate((state) => {
        if (state.items.some((item) => item.id === id)) throw new Error(`work item already exists: ${id}`);
        for (const dependency of dependsOn) {
          if (!state.items.some((item) => item.id === dependency)) throw new Error(`dependency does not exist: ${dependency}`);
        }
        const timestamp = now();
        const item = {
          id,
          role,
          summary: assertSafeText(summary, "summary"),
          status: "ready",
          dependsOn: [...new Set(dependsOn)],
          acceptanceCriteria: acceptanceCriteria.map((criterion) => assertSafeText(criterion, "acceptance criterion")),
          evidence: [],
          humanAction: null,
          blockReason: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        state.items.push(item);
        return item;
      });
    },
    next(role) {
      const state = load();
      const done = new Set(state.items.filter((item) => item.status === "done").map((item) => item.id));
      return state.items.filter(
        (item) => item.status === "ready" && (!role || item.role === role) && item.dependsOn.every((dependency) => done.has(dependency)),
      );
    },
    transition(id, action, payload = {}) {
      return mutate((state) => {
        const item = state.items.find((candidate) => candidate.id === id);
        if (!item) throw new Error(`unknown work item: ${id}`);
        const dependenciesDone = item.dependsOn.every((dependency) => state.items.find((candidate) => candidate.id === dependency)?.status === "done");
        if (action === "start") {
          if (item.status !== "ready") throw new Error(`${id} must be ready before it can start`);
          if (!dependenciesDone) throw new Error(`${id} has unfinished dependencies`);
          item.status = "in_progress";
        } else if (action === "wait") {
          if (item.status !== "in_progress") throw new Error(`${id} must be in progress before waiting for a person`);
          item.status = "input_required";
          item.humanAction = {
            id: assertSafeText(payload.actionId, "action id"),
            reason: assertSafeText(payload.reason, "reason"),
          };
        } else if (action === "resume") {
          if (item.status !== "input_required") throw new Error(`${id} is not waiting for human input`);
          item.status = "ready";
          item.evidence.push(assertSafeText(payload.evidence, "resume evidence"));
          item.humanAction = null;
        } else if (action === "block") {
          if (item.status === "done") throw new Error(`${id} is already done`);
          item.status = "blocked";
          item.blockReason = assertSafeText(payload.reason, "block reason");
        } else if (action === "unblock") {
          if (item.status !== "blocked") throw new Error(`${id} is not blocked`);
          item.status = "ready";
          item.evidence.push(assertSafeText(payload.evidence, "unblock evidence"));
          item.blockReason = null;
          item.humanAction = null;
        } else if (action === "complete") {
          if (item.status !== "in_progress") throw new Error(`${id} must be in progress before completion`);
          if (!Array.isArray(payload.evidence) || payload.evidence.length === 0) {
            throw new Error("completion evidence is required");
          }
          const completionEvidence = payload.evidence.map((entry) => assertSafeText(entry, "completion evidence"));
          item.status = "done";
          item.evidence.push(...completionEvidence);
        } else {
          throw new Error(`unknown transition: ${action}`);
        }
        item.updatedAt = now();
        return item;
      });
    },
  };
}
