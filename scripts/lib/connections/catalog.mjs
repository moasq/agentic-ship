import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const IDENTIFIER = /^[a-z][a-z0-9-]*$/;
const PLACEHOLDER = /\{([a-z][a-z0-9-]*)\}/g;
const PROBE_TYPES = new Set(["any_file_exists", "env_file_key", "file_contains", "file_exists", "home_file_exists", "mcp_server"]);
const AUTH_FLOWS = new Set(["cli_browser_login", "remote_oauth"]);
const VERIFICATION_POLICIES = new Set(["machine", "probe_and_attestation"]);
const CAPABILITIES = new Set(["analytics", "backend", "billing", "deployment", "email", "repository", "tracking"]);

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Connection catalog is unreadable: ${path} (${error.message})`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid connection catalog: ${message}`);
}

function validateProbe(probe, owner) {
  assert(probe && typeof probe === "object", `${owner} has a malformed probe`);
  assert(IDENTIFIER.test(probe.id ?? ""), `${owner} probe id must be kebab-case`);
  assert(typeof probe.label === "string" && probe.label.length > 0, `${owner}.${probe.id} needs a label`);
  assert(PROBE_TYPES.has(probe.type), `${owner}.${probe.id} uses unsupported probe type ${probe.type}`);
  assert(typeof probe.required === "boolean", `${owner}.${probe.id} must declare required`);
  if (probe.type === "file_exists") assert(typeof probe.path === "string", `${owner}.${probe.id} needs a path`);
  if (probe.type === "any_file_exists") {
    assert(Array.isArray(probe.paths) && probe.paths.length > 0 && probe.paths.every((path) => typeof path === "string"), `${owner}.${probe.id} needs paths`);
  }
  if (probe.type === "file_contains") {
    assert(typeof probe.file === "string" && typeof probe.text === "string", `${owner}.${probe.id} needs file and text`);
  }
  if (probe.type === "env_file_key") {
    assert(typeof probe.file === "string" && typeof probe.key === "string", `${owner}.${probe.id} needs file and key`);
  }
  if (probe.type === "mcp_server") assert(IDENTIFIER.test(probe.server ?? ""), `${owner}.${probe.id} needs a server id`);
  if (probe.type === "home_file_exists") {
    assert(typeof probe.homePath === "string" && probe.homePath.length > 0, `${owner}.${probe.id} needs a homePath`);
    assert(
      !probe.homePath.startsWith("/") && !/^[A-Za-z]:/.test(probe.homePath) && !probe.homePath.split("/").includes(".."),
      `${owner}.${probe.id} homePath must stay relative to the home directory`,
    );
  }
}

function validateSteps(steps, owner, allowedPlaceholders = []) {
  if (steps === undefined) return;
  assert(Array.isArray(steps), `${owner} must be an array`);
  for (const step of steps) {
    assert(step && typeof step === "object", `${owner} has a malformed step`);
    const hasCommand = typeof step.command === "string" && step.command.length > 0;
    const hasText = typeof step.text === "string" && step.text.length > 0;
    assert(hasCommand !== hasText, `${owner} steps need exactly one of command or text`);
    if (hasCommand) {
      assert(typeof step.why === "string" && step.why.length > 0, `${owner} command steps need a why`);
      if (step.opensBrowser !== undefined) assert(typeof step.opensBrowser === "boolean", `${owner} opensBrowser must be boolean`);
      for (const match of step.command.matchAll(PLACEHOLDER)) {
        assert(allowedPlaceholders.includes(match[1]), `${owner} command uses undeclared placeholder {${match[1]}}`);
      }
    }
    for (const key of Object.keys(step)) {
      assert(["command", "text", "why", "opensBrowser"].includes(key), `${owner} step has unsupported key ${key}`);
    }
  }
}

function validateDecision(decision, owner) {
  if (decision === undefined) return;
  assert(decision && typeof decision === "object", `${owner}.decision must be an object`);
  assert(IDENTIFIER.test(decision.id ?? ""), `${owner}.decision id must be kebab-case`);
  assert(typeof decision.question === "string" && decision.question.length > 0, `${owner}.decision needs a question`);
  assert(Array.isArray(decision.options) && decision.options.length >= 2, `${owner}.decision needs at least two options`);
  for (const option of decision.options) {
    assert(option && typeof option === "object", `${owner}.decision has a malformed option`);
    assert(IDENTIFIER.test(option.value ?? ""), `${owner}.decision option values must be kebab-case`);
    assert(typeof option.label === "string" && option.label.length > 0, `${owner}.decision.${option.value} needs a label`);
    const placeholders = option.placeholders ?? [];
    assert(
      Array.isArray(placeholders) && placeholders.every((name) => IDENTIFIER.test(name)),
      `${owner}.decision.${option.value} placeholders must be kebab-case strings`,
    );
    assert(Array.isArray(option.run) && option.run.length > 0, `${owner}.decision.${option.value} needs run steps`);
    validateSteps(option.run, `${owner}.decision.${option.value}.run`, placeholders);
    for (const key of Object.keys(option)) {
      assert(["value", "label", "placeholders", "run"].includes(key), `${owner}.decision option has unsupported key ${key}`);
    }
  }
}

function validateAutomation(automation, owner) {
  if (automation === undefined) return;
  assert(automation && typeof automation === "object", `${owner}.automation must be an object`);
  for (const key of Object.keys(automation)) {
    assert(["run", "decision"].includes(key), `${owner}.automation has unsupported key ${key}`);
  }
  validateSteps(automation.run, `${owner}.automation.run`);
  validateDecision(automation.decision, `${owner}.automation`);
}

export function loadConnectionCatalog({ projectRoot, catalogDirectory } = {}) {
  const root = resolve(projectRoot ?? process.cwd());
  const directory = resolve(catalogDirectory ?? join(root, ".agents", "connections"));
  const providerDocument = readJson(join(directory, "providers.json"));
  const hostDocument = readJson(join(directory, "hosts.json"));

  assert(providerDocument.schemaVersion === 1, "providers.json schemaVersion must be 1");
  assert(hostDocument.schemaVersion === 1, "hosts.json schemaVersion must be 1");
  assert(providerDocument.providers && typeof providerDocument.providers === "object", "providers.json needs providers");
  assert(hostDocument.hosts && typeof hostDocument.hosts === "object", "hosts.json needs hosts");

  for (const [id, provider] of Object.entries(providerDocument.providers)) {
    assert(IDENTIFIER.test(id), `provider id ${id} must be kebab-case`);
    assert(typeof provider.displayName === "string" && provider.displayName.length > 0, `${id} needs displayName`);
    assert(CAPABILITIES.has(provider.capability), `${id} needs a supported capability`);
    assert(Number.isInteger(provider.actionTtlMinutes) && provider.actionTtlMinutes > 0, `${id} needs a positive actionTtlMinutes`);
    assert(Number.isInteger(provider.maxVerificationAttempts) && provider.maxVerificationAttempts > 0, `${id} needs positive maxVerificationAttempts`);
    if (provider.agentTool !== undefined) {
      assert(provider.agentTool && typeof provider.agentTool === "object", `${id}.agentTool must be an object when declared`);
      assert(AUTH_FLOWS.has(provider.agentTool.authFlow), `${id} has an unsupported agent-tool auth flow`);
      assert(IDENTIFIER.test(provider.agentTool.mcpServer ?? ""), `${id} needs an MCP server id`);
      assert(
        Array.isArray(provider.agentTool.instructions) &&
          provider.agentTool.instructions.length > 0 &&
          provider.agentTool.instructions.every((step) => typeof step === "string"),
        `${id} needs agent-tool instructions`,
      );
      validateProbe(provider.agentTool.configurationProbe, `${id}.agentTool`);
      validateAutomation(provider.agentTool.automation, `${id}.agentTool`);
    }
    validateAutomation(provider.projectProvisioning?.automation, `${id}.projectProvisioning`);
    validateSteps(provider.revocation, `${id}.revocation`);

    const verification = provider.projectProvisioning?.verification;
    assert(
      Array.isArray(provider.projectProvisioning?.instructions) &&
        provider.projectProvisioning.instructions.length > 0 &&
        provider.projectProvisioning.instructions.every((step) => typeof step === "string"),
      `${id} needs project-provisioning instructions`,
    );
    assert(VERIFICATION_POLICIES.has(verification?.policy), `${id} has an unsupported verification policy`);
    assert(Array.isArray(verification?.probes) && verification.probes.length > 0, `${id} needs project probes`);
    for (const probe of verification.probes) validateProbe(probe, `${id}.projectProvisioning`);
  }

  for (const [id, host] of Object.entries(hostDocument.hosts)) {
    assert(IDENTIFIER.test(id), `host id ${id} must be kebab-case`);
    assert(typeof host.displayName === "string" && host.displayName.length > 0, `${id} needs displayName`);
    for (const flow of AUTH_FLOWS) {
      assert(typeof host.authInstructions?.[flow] === "string", `${id} needs ${flow} instructions`);
    }
    assert(typeof host.readOnlyProbeInstruction === "string", `${id} needs a read-only probe instruction`);
  }

  return {
    schemaVersion: 1,
    providers: providerDocument.providers,
    hosts: hostDocument.hosts,
  };
}
