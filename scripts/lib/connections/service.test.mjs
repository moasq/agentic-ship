// @vitest-environment node
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { test } from "vitest";
import { ConnectionCommandError, createConnectionService } from "./service.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const catalogDirectory = join(repositoryRoot, ".agents", "connections");

function write(projectRoot, path, contents = "") {
  const destination = join(projectRoot, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents, "utf8");
}

function fixture(t) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "agent-connections-"));
  const projectRoot = join(temporaryRoot, "project");
  const stateDirectory = join(temporaryRoot, "state");
  mkdirSync(projectRoot, { recursive: true });
  t.onTestFinished(() => rmSync(temporaryRoot, { recursive: true, force: true }));

  write(
    projectRoot,
    ".mcp.json",
    JSON.stringify({
      mcpServers: {
        convex: {},
        stripe: {},
        resend: {},
        posthog: {},
        render: {},
      },
    }),
  );
  write(projectRoot, "convex/billing.ts", 'import "@convex-dev/stripe";');
  write(projectRoot, "convex/email.ts", 'import "@convex-dev/resend";\nconst config = { testMode: true };');
  write(projectRoot, "convex/http.ts", 'const routes = ["/stripe/webhook", "/resend-webhook"];');
  write(projectRoot, "src/lib/analytics.ts", 'import "posthog-js";');
  write(projectRoot, "next.config.ts", 'const route = "/ingest/:path*";');
  write(projectRoot, "render.yaml", "sync: false\nbuildCommand: npx convex deploy --cmd 'pnpm build'\n");

  let current = new Date("2026-08-06T10:00:00.000Z");
  let sequence = 0;
  const service = createConnectionService({
    projectRoot,
    catalogDirectory,
    stateDirectory,
    now: () => current,
    idFactory: () => `conn_test_${String(++sequence).padStart(4, "0")}`,
  });
  return {
    projectRoot,
    stateDirectory,
    service,
    advance(milliseconds) {
      current = new Date(current.getTime() + milliseconds);
    },
  };
}

test("catalog exposes every supported provider and host", (t) => {
  const { service } = fixture(t);
  const result = service.status();
  assert.equal(result.type, "connection_status");
  assert.deepEqual(
    result.providers.map((provider) => provider.id),
    ["convex", "stripe", "resend", "posthog", "render"],
  );
  assert.deepEqual(result.supportedHosts, ["claude", "codex", "cursor", "hermes", "openclaw"]);
});

test("begin is idempotent and receipts contain only normalized safe metadata", (t) => {
  const { service, stateDirectory } = fixture(t);
  const first = service.begin("stripe", "codex");
  const second = service.begin("stripe", "codex");

  assert.equal(first.type, "input_required");
  assert.equal(first.inputRequired.kind, "browser_authorization");
  assert.equal(first.inputRequired.browserUrl, null);
  assert.equal(first.inputRequired.sensitiveInputAllowed, false);
  assert.match(first.inputRequired.instructions[0], /codex mcp login workspace-stripe/);
  assert.equal(second.action.actionId, first.action.actionId);
  assert.equal(readdirSync(stateDirectory).length, 1);

  const persisted = JSON.parse(readFileSync(join(stateDirectory, `${first.action.actionId}.json`), "utf8"));
  assert.deepEqual(Object.keys(persisted).sort(), [
    "actionId",
    "agentToolAttestedAt",
    "completedPhases",
    "createdAt",
    "expiresAt",
    "history",
    "host",
    "phase",
    "projectAttestedAt",
    "provider",
    "schemaVersion",
    "state",
    "updatedAt",
    "verificationAttempts",
  ]);
  assert.doesNotMatch(JSON.stringify(persisted), /authorization.?code|access.?token|secret.?key|webhook.?secret/i);
});

test("remote OAuth and project provisioning stay separate", (t) => {
  const { service } = fixture(t);
  const started = service.begin("stripe", "claude");
  const projectHandoff = service.resume(started.action.actionId);
  assert.equal(projectHandoff.type, "input_required");
  assert.equal(projectHandoff.action.phase, "project_provisioning");
  assert.equal(projectHandoff.inputRequired.kind, "project_provisioning");
  assert.match(projectHandoff.inputRequired.browserUrl, /^https:\/\//);

  const ready = service.resume(started.action.actionId);
  assert.equal(ready.type, "connection_ready");
  assert.equal(ready.action.state, "ready");
  assert.equal(ready.verification.policy, "probe_and_attestation");
  assert.equal(ready.verification.agentTool.passed, true);

  const repeated = service.resume(started.action.actionId);
  assert.equal(repeated.type, "connection_ready");
  assert.equal(repeated.action.verificationAttempts, 1);
});

test("machine verification retries until Convex signals exist", (t) => {
  const { service, projectRoot } = fixture(t);
  const started = service.begin("convex", "cursor");
  const projectHandoff = service.resume(started.action.actionId);
  assert.equal(projectHandoff.type, "input_required");

  const failed = service.resume(started.action.actionId);
  assert.equal(failed.type, "input_required");
  assert.equal(failed.action.state, "failed_retryable");
  assert.equal(failed.inputRequired.verification.passed, false);

  write(
    projectRoot,
    ".env.local",
    [
      "CONVEX_DEPLOYMENT=dev:example",
      "NEXT_PUBLIC_CONVEX_URL=https://example.convex.cloud",
      "NEXT_PUBLIC_CONVEX_SITE_URL=https://example.convex.site",
      "",
    ].join("\n"),
  );
  write(projectRoot, "convex/_generated/api.d.ts", "export {};\n");

  const ready = service.resume(started.action.actionId);
  assert.equal(ready.type, "connection_ready");
  assert.equal(ready.verification.project.passed, true);
  assert.equal(ready.action.verificationAttempts, 2);
});

test("PostHog probe rejects personal keys without exposing their value", (t) => {
  const { service, projectRoot } = fixture(t);
  const started = service.begin("posthog", "hermes");
  service.resume(started.action.actionId);
  write(projectRoot, ".env.local", "NEXT_PUBLIC_POSTHOG_KEY=phx_do-not-print\n");

  const failed = service.resume(started.action.actionId);
  const keyProbe = failed.inputRequired.verification.results.find((probe) => probe.id === "public-project-key");
  assert.equal(keyProbe.passed, false);
  assert.equal(keyProbe.detail, "a forbidden credential class was detected");
  assert.doesNotMatch(JSON.stringify(failed), /phx_do-not-print/);

  write(projectRoot, ".env.local", "NEXT_PUBLIC_POSTHOG_KEY=phc_public-project\n");
  const ready = service.resume(started.action.actionId);
  assert.equal(ready.type, "connection_ready");

  write(projectRoot, ".env.local", "NEXT_PUBLIC_POSTHOG_KEY=\n");
  const stale = service.begin("posthog", "hermes");
  assert.equal(stale.type, "input_required");
  assert.equal(stale.action.actionId, started.action.actionId);
  assert.equal(stale.action.state, "failed_retryable");

  write(projectRoot, ".env.local", "NEXT_PUBLIC_POSTHOG_KEY=phc_restored-project\n");
  const restored = service.resume(started.action.actionId);
  assert.equal(restored.type, "connection_ready");
});

test("active actions expire and a new begin creates a fresh receipt", (t) => {
  const { service, advance } = fixture(t);
  const first = service.begin("render", "codex");
  advance(24 * 60 * 60 * 1000 + 1);

  const expired = service.resume(first.action.actionId);
  assert.equal(expired.type, "connection_expired");
  const second = service.begin("render", "codex");
  assert.notEqual(second.action.actionId, first.action.actionId);
});

test("cancel is idempotent and never claims to revoke remote access", (t) => {
  const { service } = fixture(t);
  const started = service.begin("resend", "claude");
  const canceled = service.cancel(started.action.actionId);
  const repeated = service.cancel(started.action.actionId);
  assert.equal(canceled.type, "connection_canceled");
  assert.equal(repeated.type, "connection_canceled");
  assert.match(repeated.message, /No remote access was revoked/);
});

test("bounded probe retries end in a cancelable manual block", (t) => {
  const { service } = fixture(t);
  const started = service.begin("convex", "codex");
  service.resume(started.action.actionId);
  let result;
  for (let attempt = 0; attempt < 5; attempt += 1) result = service.resume(started.action.actionId);
  assert.equal(result.type, "connection_blocked");
  assert.equal(result.action.verificationAttempts, 5);
  const canceled = service.cancel(started.action.actionId);
  assert.equal(canceled.type, "connection_canceled");
});

test("invalid catalog ids fail closed", (t) => {
  const { service } = fixture(t);
  assert.throws(
    () => service.begin("unknown", "claude"),
    (error) => error instanceof ConnectionCommandError && error.code === "unknown_provider",
  );
  assert.throws(
    () => service.begin("stripe", "unknown"),
    (error) => error instanceof ConnectionCommandError && error.code === "unknown_host",
  );
});

test("a cross-process lock rejects a conflicting mutation and permits a retry", async (t) => {
  const { projectRoot, stateDirectory } = fixture(t);
  const storeModule = pathToFileURL(join(repositoryRoot, "scripts", "lib", "connections", "state-store.mjs")).href;
  const workerSource = [
    `import { createConnectionStateStore } from ${JSON.stringify(storeModule)};`,
    "const store = createConnectionStateStore(process.argv[1]);",
    "store.withLock(() => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300));",
  ].join("\n");
  const worker = spawn(process.execPath, ["--input-type=module", "--eval", workerSource, stateDirectory], {
    cwd: repositoryRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let workerError = "";
  worker.stderr.on("data", (chunk) => {
    workerError += chunk.toString();
  });
  const workerExit = new Promise((resolveExit) => worker.once("exit", (code) => resolveExit(code)));

  const lockPath = join(stateDirectory, ".mutation.lock");
  for (let attempt = 0; attempt < 100 && !existsSync(lockPath); attempt += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 5));
  }
  assert.equal(existsSync(lockPath), true, "worker did not acquire the test lock");

  const contendingService = createConnectionService({
    projectRoot,
    catalogDirectory,
    stateDirectory,
    lockOptions: { lockAttempts: 2, lockRetryDelayMs: 5 },
  });
  assert.throws(
    () => contendingService.begin("stripe", "codex"),
    (error) => error instanceof ConnectionCommandError && error.code === "connection_busy",
  );

  assert.equal(await workerExit, 0, workerError);
  const retried = contendingService.begin("stripe", "codex");
  assert.equal(retried.type, "input_required");
  assert.equal(readdirSync(stateDirectory).filter((name) => name.endsWith(".json")).length, 1);
});

test("CLI status emits machine-readable JSON in an isolated state directory", (t) => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "agent-connections-cli-"));
  t.onTestFinished(() => rmSync(temporaryRoot, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [join(repositoryRoot, "scripts", "connect.mjs"), "status", "--json"], {
    cwd: repositoryRoot,
    env: { ...process.env, AGENT_CONNECTION_STATE_DIR: temporaryRoot },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.type, "connection_status");
  assert.equal(output.providers.length, 5);
  assert.deepEqual(readdirSync(temporaryRoot), []);
});
