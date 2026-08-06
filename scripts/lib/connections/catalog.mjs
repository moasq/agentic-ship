import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const IDENTIFIER = /^[a-z][a-z0-9-]*$/;
const PROBE_TYPES = new Set(["any_file_exists", "env_file_key", "file_contains", "file_exists", "mcp_server"]);
const AUTH_FLOWS = new Set(["cli_browser_login", "remote_oauth"]);
const VERIFICATION_POLICIES = new Set(["machine", "probe_and_attestation"]);

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
    assert(Number.isInteger(provider.actionTtlMinutes) && provider.actionTtlMinutes > 0, `${id} needs a positive actionTtlMinutes`);
    assert(Number.isInteger(provider.maxVerificationAttempts) && provider.maxVerificationAttempts > 0, `${id} needs positive maxVerificationAttempts`);
    assert(AUTH_FLOWS.has(provider.agentTool?.authFlow), `${id} has an unsupported agent-tool auth flow`);
    assert(IDENTIFIER.test(provider.agentTool?.mcpServer ?? ""), `${id} needs an MCP server id`);
    assert(
      Array.isArray(provider.agentTool?.instructions) && provider.agentTool.instructions.length > 0 && provider.agentTool.instructions.every((step) => typeof step === "string"),
      `${id} needs agent-tool instructions`,
    );
    validateProbe(provider.agentTool.configurationProbe, `${id}.agentTool`);

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
