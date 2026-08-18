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
  // An isolated home keeps home_file_exists probes (CLI pairing files) deterministic:
  // the developer's real ~/.config must never leak into a test verdict.
  const homeDirectory = join(temporaryRoot, "home");
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(homeDirectory, { recursive: true });
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
        netlify: {},
      },
    }),
  );
  write(projectRoot, "convex/billing.ts", 'import "@convex-dev/stripe";');
  write(projectRoot, "convex/email.ts", 'import "@convex-dev/resend";\nconst config = { testMode: true };');
  write(projectRoot, "convex/http.ts", 'const routes = ["/stripe/webhook", "/resend-webhook"];');
  write(projectRoot, "src/lib/analytics.ts", 'import "posthog-js";');
  write(projectRoot, "next.config.ts", 'const route = "/ingest/:path*";');
  write(projectRoot, "netlify.toml", "[build]\ncommand = \"npx convex deploy --cmd 'pnpm build'\"\n");

  let current = new Date("2026-08-06T10:00:00.000Z");
  let sequence = 0;
  const service = createConnectionService({
    projectRoot,
    catalogDirectory,
    stateDirectory,
    homeDirectory,
    now: () => current,
    idFactory: () => `conn_test_${String(++sequence).padStart(4, "0")}`,
  });
  return {
    projectRoot,
    stateDirectory,
    homeDirectory,
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
    ["convex", "stripe", "github", "linear", "resend", "posthog", "netlify", "polar"],
  );
  assert.deepEqual(result.supportedHosts, ["claude", "codex", "cursor", "hermes", "openclaw"]);
  assert.equal(result.providers.find((provider) => provider.id === "polar").agentToolConfiguration, null);
});

test("project-only providers never invent an agent-tool authorization phase", (t) => {
  const { service, projectRoot } = fixture(t);
  const started = service.begin("polar", "codex");

  assert.equal(started.type, "input_required");
  assert.equal(started.action.phase, "project_provisioning");
  assert.equal(started.inputRequired.kind, "project_provisioning");
  assert.doesNotMatch(JSON.stringify(started), /Polar MCP|remote_oauth|read-only provider call/);

  const missing = service.resume(started.action.actionId);
  assert.equal(missing.type, "input_required");
  assert.equal(missing.action.state, "failed_retryable");

  write(projectRoot, "convex/auth.ts", 'import "@polar-sh/better-auth";\nconst handler = webhooks({});');
  write(projectRoot, "src/lib/auth-client.ts", "const client = polarClient();");
  const ready = service.resume(started.action.actionId);
  assert.equal(ready.type, "connection_ready");
  assert.equal(ready.verification.agentTool.required, false);
  assert.equal(ready.verification.agentTool.basis, "not_required");
});

test("begin checks first and reports a fully configured provider ready with no pause", (t) => {
  const { service, projectRoot, stateDirectory } = fixture(t);
  write(projectRoot, ".env.local", "NEXT_PUBLIC_POSTHOG_KEY=phc_test_project_key\n");

  const result = service.begin("posthog", "claude");
  assert.equal(result.type, "connection_ready");
  assert.equal(result.verification.project.passed, true);
  assert.equal(result.verification.agentTool.passed, true);
  assert.equal(result.verification.agentTool.basis, "preexisting_local_configuration");
  assert.equal(readdirSync(stateDirectory).length, 1);

  const again = service.begin("posthog", "claude");
  assert.equal(again.type, "connection_ready");
  assert.equal(readdirSync(stateDirectory).length, 1);
});

test("every pause is gated behind one yes/no consent question", (t) => {
  const { service } = fixture(t);

  const authorization = service.begin("convex", "claude");
  assert.equal(authorization.type, "input_required");
  assert.match(authorization.inputRequired.consent.question, /Authorize Convex for Claude Code now\?/);
  assert.match(authorization.inputRequired.consent.onNo, new RegExp(`connect cancel ${authorization.action.actionId}`));

  const provisioning = service.resume(authorization.action.actionId);
  assert.match(provisioning.inputRequired.consent.question, /Set up Convex for this project now\?/);
  assert.match(provisioning.inputRequired.consent.onYes, /dashboard\.convex\.dev/);
});

test("automation and revocation flow from the catalog to payloads by runner", (t) => {
  const { service } = fixture(t);

  const authorization = service.begin("convex", "claude");
  assert.equal(authorization.type, "input_required");
  assert.equal(authorization.inputRequired.agentRuns.length, 1);
  assert.match(authorization.inputRequired.agentRuns[0].command, /npx convex login/);
  assert.equal(authorization.inputRequired.agentRuns[0].opensBrowser, true);

  const provisioning = service.resume(authorization.action.actionId);
  assert.equal(provisioning.type, "input_required");
  assert.equal(provisioning.inputRequired.kind, "project_provisioning");
  assert.deepEqual(
    provisioning.inputRequired.agentRuns.map((step) => step.command),
    ["pnpm setup:auth"],
  );

  // The project choice is the user's: the decision precedes every run, and its
  // validated placeholders are the only holes an answer may fill.
  const decision = provisioning.inputRequired.decision;
  assert.equal(decision.question, "Create a new Convex project or link an existing one?");
  assert.deepEqual(
    decision.options.map((option) => option.value),
    ["new-project", "existing-project"],
  );
  for (const option of decision.options) {
    assert.deepEqual(option.placeholders, ["team", "project"]);
    assert.match(option.run[0].command, /npx convex dev --once --configure (new|existing) --team \{team\} --project \{project\}/);
  }

  // Stripe's OAuth is CLI pairing: install-if-missing plus browser-approved login,
  // then provisioning runs through the paired CLI instead of a dashboard.
  const stripeAuthorization = service.begin("stripe", "claude");
  assert.equal(stripeAuthorization.inputRequired.kind, "provider_login");
  assert.deepEqual(
    stripeAuthorization.inputRequired.agentRuns.map((step) => step.command),
    ["pnpm provider:login stripe"],
  );
  const stripeProvisioning = service.resume(stripeAuthorization.action.actionId);
  assert.deepEqual(
    stripeProvisioning.inputRequired.agentRuns.map((step) => step.command),
    ["pnpm stripe:provision", "pnpm open:url https://dashboard.stripe.com/test/apikeys"],
  );

  // A provider with no runnable CLI step still redirects: the opener becomes the step,
  // so no payload can carry a browserUrl that nothing ever opens.
  const githubAuthorization = service.begin("github", "claude");
  const githubProvisioning = service.resume(githubAuthorization.action.actionId);
  assert.equal(githubProvisioning.inputRequired.agentRuns.length, 1);
  assert.equal(
    githubProvisioning.inputRequired.agentRuns[0].command,
    `pnpm open:url ${githubProvisioning.inputRequired.browserUrl}`,
  );
  assert.equal(githubProvisioning.inputRequired.agentRuns[0].opensBrowser, true);

  const status = service.status();
  const convex = status.providers.find((provider) => provider.id === "convex");
  assert.match(convex.revocation[0].command, /npx convex logout/);
  assert.ok(convex.revocation.every((step) => !("command" in step) !== !("text" in step)));

  const canceled = service.cancel(authorization.action.actionId);
  assert.equal(canceled.type, "connection_canceled");
  assert.match(canceled.revocation[0].command, /npx convex logout/);
});

test("begin is idempotent and receipts contain only normalized safe metadata", (t) => {
  const { service, stateDirectory } = fixture(t);
  const first = service.begin("stripe", "codex");
  const second = service.begin("stripe", "codex");

  assert.equal(first.type, "input_required");
  assert.equal(first.inputRequired.kind, "provider_login");
  assert.equal(first.inputRequired.browserUrl, null);
  assert.equal(first.inputRequired.sensitiveInputAllowed, false);
  assert.match(first.inputRequired.instructions[0], /Run the provider login command in the project terminal/);
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

test("a paired CLI plus a configured remote makes GitHub born-ready with no pause", (t) => {
  const { service, projectRoot, homeDirectory } = fixture(t);
  write(projectRoot, ".git/config", '[remote "origin"]\n\turl = https://github.com/example/repo.git\n');
  writeFileSync(join(mkdirSyncDeep(join(homeDirectory, ".config", "gh")), "hosts.yml"), "github.com:\n", "utf8");

  const result = service.begin("github", "claude");
  assert.equal(result.type, "connection_ready");
  assert.equal(result.verification.agentTool.basis, "preexisting_local_configuration");
});

function mkdirSyncDeep(path) {
  mkdirSync(path, { recursive: true });
  return path;
}

test("catalog placeholders fail closed when a command uses an undeclared token", (t) => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "agent-connections-catalog-"));
  t.onTestFinished(() => rmSync(temporaryRoot, { recursive: true, force: true }));
  const badCatalog = join(temporaryRoot, "connections");
  mkdirSync(badCatalog, { recursive: true });
  const providers = JSON.parse(readFileSync(join(catalogDirectory, "providers.json"), "utf8"));
  providers.providers.convex.projectProvisioning.automation.decision.options[0].run[0].command = "npx convex dev --once --team {oops}";
  writeFileSync(join(badCatalog, "providers.json"), JSON.stringify(providers), "utf8");
  writeFileSync(join(badCatalog, "hosts.json"), readFileSync(join(catalogDirectory, "hosts.json")), "utf8");

  assert.throws(
    () => createConnectionService({ projectRoot: temporaryRoot, catalogDirectory: badCatalog, stateDirectory: join(temporaryRoot, "state") }),
    /undeclared placeholder \{oops\}/,
  );
});

test("a project-only provider skips fictional MCP authorization", (t) => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "agent-connections-project-only-"));
  t.onTestFinished(() => rmSync(temporaryRoot, { recursive: true, force: true }));
  const customCatalog = join(temporaryRoot, "connections");
  const projectRoot = join(temporaryRoot, "project");
  const stateDirectory = join(temporaryRoot, "state");
  mkdirSync(customCatalog, { recursive: true });
  mkdirSync(projectRoot, { recursive: true });

  const providers = JSON.parse(readFileSync(join(catalogDirectory, "providers.json"), "utf8"));
  providers.providers.fixturepay = structuredClone(providers.providers.stripe);
  providers.providers.fixturepay.displayName = "Fixture Pay";
  providers.providers.fixturepay.defaultForCapability = false;
  delete providers.providers.fixturepay.agentTool;
  providers.providers.fixturepay.billing = {
    ownedEnvPrefixes: ["FIXTURE_PAY_"],
    secretEnv: "FIXTURE_PAY_SECRET",
    webhookEnv: "FIXTURE_PAY_WEBHOOK",
    requiredEnv: ["SITE_URL"],
    mappingEnvPrefix: "FIXTURE_PAY_PLAN_",
    productionChecks: [
      {
        type: "equals",
        env: "FIXTURE_PAY_MODE",
        value: "live",
        message: "Fixture Pay requires live mode.",
      },
    ],
  };
  providers.providers.fixturepay.projectProvisioning.verification.probes = [
    {
      id: "fixture-seam",
      label: "Fixture billing seam exists",
      type: "file_contains",
      file: "convex/billing.ts",
      text: "fixturepay",
      required: true,
    },
  ];
  writeFileSync(join(customCatalog, "providers.json"), JSON.stringify(providers), "utf8");
  writeFileSync(join(customCatalog, "hosts.json"), readFileSync(join(catalogDirectory, "hosts.json")), "utf8");

  const service = createConnectionService({ projectRoot, catalogDirectory: customCatalog, stateDirectory });
  const started = service.begin("fixturepay", "codex");
  assert.equal(started.type, "input_required");
  assert.equal(started.action.phase, "project_provisioning");
  assert.equal(started.inputRequired.kind, "project_provisioning");
  assert.doesNotMatch(JSON.stringify(started), /read-only provider call|remote_oauth/);

  write(projectRoot, "convex/billing.ts", 'const adapter = "fixturepay";');
  const ready = service.resume(started.action.actionId);
  assert.equal(ready.type, "connection_ready");
  assert.equal(ready.verification.agentTool.required, false);
  assert.equal(ready.verification.agentTool.basis, "not_required");
});

test("active actions expire and a new begin creates a fresh receipt", (t) => {
  const { service, advance } = fixture(t);
  const first = service.begin("netlify", "codex");
  advance(24 * 60 * 60 * 1000 + 1);

  const expired = service.resume(first.action.actionId);
  assert.equal(expired.type, "connection_expired");
  const second = service.begin("netlify", "codex");
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
  assert.equal(output.providers.length, 8);
  assert.deepEqual(readdirSync(temporaryRoot), []);
});
