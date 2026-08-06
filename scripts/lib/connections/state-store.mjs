import { randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ACTION_ID = /^[A-Za-z0-9_-]{8,100}$/;
const IDENTIFIER = /^[a-z][a-z0-9-]*$/;
const STATES = new Set(["waiting_for_user", "verifying", "failed_retryable", "blocked_manual", "ready", "expired", "canceled"]);
const PHASES = new Set(["agent_tool_authorization", "project_provisioning", "complete"]);
const COMPLETED_PHASES = new Set(["agent_tool_authorization", "project_provisioning"]);
const EVENTS = new Set([
  "created",
  "expired",
  "agent_tool_authorized",
  "verification_started",
  "verification_failed",
  "verification_blocked",
  "connection_ready",
  // begin's check-first path: every safe probe already passed, so the receipt is born
  // ready without a consent question, redirect, or command.
  "verified_preexisting",
  "project_configuration_drifted",
  "canceled",
]);

function isTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function safeAction(action) {
  return {
    schemaVersion: 1,
    actionId: action.actionId,
    provider: action.provider,
    host: action.host,
    state: action.state,
    phase: action.phase,
    createdAt: action.createdAt,
    updatedAt: action.updatedAt,
    expiresAt: action.expiresAt,
    verificationAttempts: action.verificationAttempts,
    completedPhases: [...action.completedPhases],
    agentToolAttestedAt: action.agentToolAttestedAt ?? null,
    projectAttestedAt: action.projectAttestedAt ?? null,
    history: action.history.map((event) => ({ event: event.event, at: event.at })),
  };
}

function normalizeAction(action, expectedId) {
  if (!action || action.schemaVersion !== 1 || action.actionId !== expectedId) return null;
  if (!IDENTIFIER.test(action.provider ?? "") || !IDENTIFIER.test(action.host ?? "")) return null;
  if (!STATES.has(action.state) || !PHASES.has(action.phase)) return null;
  if (![action.createdAt, action.updatedAt, action.expiresAt].every(isTimestamp)) return null;
  if (!Number.isInteger(action.verificationAttempts) || action.verificationAttempts < 0) return null;
  if (!Array.isArray(action.completedPhases) || action.completedPhases.some((phase) => !COMPLETED_PHASES.has(phase))) return null;
  if (action.agentToolAttestedAt !== null && !isTimestamp(action.agentToolAttestedAt)) return null;
  if (action.projectAttestedAt !== null && !isTimestamp(action.projectAttestedAt)) return null;
  if (
    !Array.isArray(action.history) ||
    action.history.some((item) => !item || !EVENTS.has(item.event) || !isTimestamp(item.at))
  ) {
    return null;
  }
  return safeAction(action);
}

export class ConnectionStateBusyError extends Error {
  constructor() {
    super("Another agent is updating connection state; retry this command shortly");
    this.name = "ConnectionStateBusyError";
  }
}

function wait(milliseconds) {
  if (milliseconds <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

export function createConnectionStateStore(directory, { lockAttempts = 20, lockRetryDelayMs = 25, staleLockMs = 30_000 } = {}) {
  const stateDirectory = resolve(directory);
  const lockPath = join(stateDirectory, ".mutation.lock");

  function ensureDirectory() {
    mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
  }

  function pathFor(actionId) {
    if (!ACTION_ID.test(actionId)) throw new Error("Invalid connection action id");
    return join(stateDirectory, `${actionId}.json`);
  }

  return {
    directory: stateDirectory,

    withLock(operation) {
      ensureDirectory();
      let descriptor = null;
      const owner = `${process.pid}:${randomUUID()}`;
      for (let attempt = 0; attempt < lockAttempts; attempt += 1) {
        try {
          const opened = openSync(lockPath, "wx", 0o600);
          try {
            writeFileSync(opened, owner, "utf8");
          } catch (error) {
            closeSync(opened);
            try {
              unlinkSync(lockPath);
            } catch {
              // Preserve the decisive write error; a stale empty lock ages out safely.
            }
            throw error;
          }
          descriptor = opened;
          break;
        } catch (error) {
          if (error?.code !== "EEXIST") throw error;
          try {
            if (Date.now() - statSync(lockPath).mtimeMs > staleLockMs) {
              unlinkSync(lockPath);
              continue;
            }
          } catch (inspectionError) {
            if (inspectionError?.code !== "ENOENT") throw inspectionError;
            continue;
          }
          if (attempt + 1 < lockAttempts) wait(lockRetryDelayMs);
        }
      }
      if (descriptor === null) throw new ConnectionStateBusyError();

      try {
        return operation();
      } finally {
        closeSync(descriptor);
        try {
          if (readFileSync(lockPath, "utf8") === owner) unlinkSync(lockPath);
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }
    },

    read(actionId) {
      const path = pathFor(actionId);
      if (!existsSync(path)) return null;
      try {
        const action = JSON.parse(readFileSync(path, "utf8"));
        return normalizeAction(action, actionId);
      } catch {
        return null;
      }
    },

    list() {
      if (!existsSync(stateDirectory)) return [];
      return readdirSync(stateDirectory)
        .filter((name) => name.endsWith(".json") && ACTION_ID.test(name.slice(0, -5)))
        .map((name) => this.read(name.slice(0, -5)))
        .filter(Boolean);
    },

    write(action) {
      ensureDirectory();
      const path = pathFor(action.actionId);
      const temporaryPath = `${path}.${process.pid}.tmp`;
      const normalized = normalizeAction(safeAction(action), action.actionId);
      if (!normalized) throw new Error("Refusing to persist malformed connection state");
      writeFileSync(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      renameSync(temporaryPath, path);
      return normalized;
    },
  };
}
