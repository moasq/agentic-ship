import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createConnectionService } from "./connections/service.mjs";
import { inspectUiEvidence, UI_PLAN_FILE, UI_REVIEW_FILE } from "./ui-evidence.mjs";
import { createWorkStore, WORK_ROLES } from "./work-state.mjs";

export const MCP_PROTOCOL_VERSION = "2025-06-18";
const ITEM_ID = "^[a-z0-9]+(?:-[a-z0-9]+)*$";
const SAFE_ID = "^[A-Za-z0-9_-]{1,128}$";
const CREDENTIALS = [
  /(?:sk|rk)_(?:live|test)_[A-Za-z0-9_-]{16,}/g,
  /whsec_[A-Za-z0-9_-]{16,}/g,
  /phx_[A-Za-z0-9_-]{16,}/g,
  /re_[A-Za-z0-9_-]{16,}/g,
  /github_pat_[A-Za-z0-9_]+/g,
  /gh[pousr]_[A-Za-z0-9_]{20,}/g,
  /bearer\s+[A-Za-z0-9._-]{20,}/gi,
  /((?:api[_-]?key|api[_-]?token|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|webhook[_-]?secret|signing[_-]?secret|private[_-]?key|deploy[_-]?key|password|passphrase|secret|token|auth(?:orization)?[_-]?code)\b\s*["']?\s*[=:]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,}\]]+)/gi,
];
const PERSONAL_DATA = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /(?!\d{4}-\d{2}-\d{2}(?:T|\b))(?:\+?\d[\d ().-]{8,}\d)/g,
  /\b(?:\d[ -]*?){13,19}\b/g,
];

// Normalize key spelling before classifying it so `accessToken`, `access_token`, and
// `access-token` share one rule. Match suffixes rather than substrings: status metadata
// such as `tokenConfigured`, `secretName`, and `authorizationStatus` is safe and useful,
// while values held directly under a token/secret/password key are never safe to emit.
const PRIVATE_KEY_SUFFIXES = [
  "token",
  "secret",
  "password",
  "passphrase",
  "apikey",
  "privatekey",
  "deploykey",
  "signingkey",
  "encryptionkey",
  "authorization",
  "authorizationcode",
  "authcode",
  "credential",
  "credentials",
  "cookie",
  "cookies",
  "prompt",
  "prompts",
  "prompttext",
  "transcript",
  "transcripts",
  "transcripttext",
  "providerpayload",
  "providerpayloads",
];
const SAFE_PRIVATE_KEY_METADATA_SUFFIXES = [
  "available",
  "budget",
  "configured",
  "count",
  "enabled",
  "expiresat",
  "expiration",
  "expiry",
  "hint",
  "lastfour",
  "limit",
  "name",
  "present",
  "provider",
  "remaining",
  "source",
  "state",
  "status",
  "type",
  "usage",
  "used",
];

function isPrivateKey(key) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (PRIVATE_KEY_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return true;
  const containsPrivateMarker = PRIVATE_KEY_SUFFIXES.some((suffix) => normalized.includes(suffix));
  if (!containsPrivateMarker) return false;
  return !SAFE_PRIVATE_KEY_METADATA_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function sanitizeString(value) {
  const trimmed = value.trim();
  let result = value;
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      const offset = value.indexOf(trimmed);
      return `${value.slice(0, offset)}${JSON.stringify(sanitize(parsed))}${value.slice(offset + trimmed.length)}`;
    } catch {
      // A log line can resemble JSON without being a complete document. The credential
      // patterns below still redact recognized values without trusting or repairing it.
    }
  }
  for (const pattern of [...CREDENTIALS, ...PERSONAL_DATA]) result = result.replace(pattern, "[REDACTED]");
  return result;
}

function sanitize(value) {
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, isPrivateKey(key) ? "[REDACTED]" : sanitize(item)]),
  );
}

function objectSchema(properties = {}, required = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

const idProperty = { type: "string", pattern: ITEM_ID };
const actionProperty = { type: "string", pattern: SAFE_ID };
const textProperty = { type: "string", minLength: 1, maxLength: 2048 };
const outputSchema = objectSchema({ schemaVersion: { type: "integer" }, tool: { type: "string" }, data: {} }, ["schemaVersion", "tool", "data"]);

function tool(name, description, inputSchema, readOnlyHint) {
  return {
    name,
    description,
    inputSchema,
    outputSchema,
    annotations: {
      title: name.replaceAll("_", " "),
      readOnlyHint,
      destructiveHint: false,
      idempotentHint: readOnlyHint,
      openWorldHint: false,
    },
  };
}

export const MCP_TOOLS = [
  tool("get_health", "Run and return the local workspace health gate.", objectSchema(), true),
  tool("get_verification_results", "Run and return the offline definition-of-done gate.", objectSchema(), true),
  tool("get_connections", "Read safe provider connection status and receipts.", objectSchema({ provider: { type: "string", pattern: ITEM_ID } }), true),
  tool("get_work_status", "Read the durable work queue.", objectSchema(), true),
  tool("get_next_work", "Read ready work for one validated role.", objectSchema({ role: { type: "string", enum: WORK_ROLES } }), true),
  tool("get_ui_plan", "Read the canonical UI plan.", objectSchema(), true),
  tool("get_ui_evidence", "Inspect canonical visual evidence and its acceptance state.", objectSchema(), true),
  tool("start_work", "Start a ready work item.", objectSchema({ id: idProperty }, ["id"]), false),
  tool("wait_work", "Wait on a safe human action.", objectSchema({ id: idProperty, actionId: actionProperty, reason: textProperty }, ["id", "actionId", "reason"]), false),
  tool("resume_work", "Resume waiting work with evidence.", objectSchema({ id: idProperty, evidence: textProperty }, ["id", "evidence"]), false),
  tool("block_work", "Block work with a safe reason.", objectSchema({ id: idProperty, reason: textProperty }, ["id", "reason"]), false),
  tool("unblock_work", "Unblock work with evidence.", objectSchema({ id: idProperty, evidence: textProperty }, ["id", "evidence"]), false),
  tool("complete_work", "Complete work with gate evidence.", objectSchema({ id: idProperty, evidence: { type: "array", minItems: 1, maxItems: 20, items: textProperty } }, ["id", "evidence"]), false),
];

const toolByName = new Map(MCP_TOOLS.map((definition) => [definition.name, definition]));

function matchesSchema(value, schema, path = "arguments") {
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object`);
    for (const key of schema.required ?? []) if (!(key in value)) throw new Error(`${path}.${key} is required`);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!(key in schema.properties)) throw new Error(`${path}.${key} is not supported`);
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (key in value) matchesSchema(value[key], child, `${path}.${key}`);
    }
  } else if (schema.type === "string") {
    if (typeof value !== "string") throw new Error(`${path} must be a string`);
    if (schema.minLength && value.trim().length < schema.minLength) throw new Error(`${path} must not be empty`);
    if (schema.maxLength && value.length > schema.maxLength) throw new Error(`${path} is too long`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) throw new Error(`${path} has an invalid format`);
    if (schema.enum && !schema.enum.includes(value)) throw new Error(`${path} must be one of: ${schema.enum.join(", ")}`);
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
    if (schema.minItems && value.length < schema.minItems) throw new Error(`${path} needs at least one item`);
    if (schema.maxItems && value.length > schema.maxItems) throw new Error(`${path} has too many items`);
    value.forEach((item, index) => matchesSchema(item, schema.items, `${path}[${index}]`));
  }
}

function rejectPrivateInput(value) {
  const source = JSON.stringify(value);
  if (sanitizeString(source) !== source) throw new Error("arguments contain a credential or personal data; publish safe metadata only");
}

function readJson(root, relativePath) {
  const path = join(root, relativePath);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function defaultRunScript(root, script, args = []) {
  return spawnSync(process.execPath, [join(root, "scripts", script), ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
}

function gateResult(result) {
  const output = sanitizeString(`${result.stdout ?? ""}${result.stderr ?? ""}`)
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-12);
  return { status: result.status === 0 && !result.error ? "pass" : "fail", exitCode: result.status, output };
}

export function createAgenticShipMcpServer(projectRoot, options = {}) {
  const root = projectRoot;
  const allowMutations = options.allowMutations === true;
  const runScript = options.runScript ?? ((script, args) => defaultRunScript(root, script, args));
  const store = options.workStore ?? createWorkStore(root);
  let initialized = false;

  const handlers = {
    get_health: () => gateResult(runScript("health.mjs")),
    get_verification_results: () => gateResult(runScript("verify.mjs", ["--quiet"])),
    get_connections: (args) => {
      const status = (options.connectionService ?? createConnectionService({ projectRoot: root })).status();
      if (!args.provider) return status;
      const provider = status.providers.find((candidate) => candidate.id === args.provider);
      if (!provider) throw new Error(`unknown provider: ${args.provider}`);
      return { ...status, providers: [provider], actions: status.actions.filter((action) => action.provider === args.provider) };
    },
    get_work_status: () => store.load(),
    get_next_work: (args) => store.next(args.role),
    get_ui_plan: () => readJson(root, UI_PLAN_FILE) ?? { status: "not_configured" },
    get_ui_evidence: () => ({ inspection: inspectUiEvidence(root), manifest: readJson(root, UI_REVIEW_FILE) }),
    start_work: (args) => store.transition(args.id, "start"),
    wait_work: (args) => store.transition(args.id, "wait", { actionId: args.actionId, reason: args.reason }),
    resume_work: (args) => store.transition(args.id, "resume", { evidence: args.evidence }),
    block_work: (args) => store.transition(args.id, "block", { reason: args.reason }),
    unblock_work: (args) => store.transition(args.id, "unblock", { evidence: args.evidence }),
    complete_work: (args) => store.transition(args.id, "complete", { evidence: args.evidence }),
  };

  function protocolError(id, code, message) {
    return { jsonrpc: "2.0", id: id ?? null, error: { code, message: sanitizeString(message) } };
  }

  async function handleRequest(request) {
    if (!request || typeof request !== "object" || Array.isArray(request) || request.jsonrpc !== "2.0" || typeof request.method !== "string") {
      return protocolError(request?.id, -32600, "Invalid Request");
    }
    const notification = !("id" in request);
    if (request.method === "initialize") {
      if (notification || !request.params || typeof request.params.protocolVersion !== "string") return protocolError(request.id, -32602, "initialize requires protocolVersion");
      initialized = true;
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          serverInfo: { name: "agentic-ship", version: "1.0.0" },
          capabilities: { tools: { listChanged: false } },
        },
      };
    }
    if (request.method === "notifications/initialized") return null;
    if (notification) return null;
    if (!initialized) return protocolError(request.id, -32002, "Server is not initialized");
    if (request.method === "tools/list") return { jsonrpc: "2.0", id: request.id, result: { tools: MCP_TOOLS } };
    if (request.method !== "tools/call") return protocolError(request.id, -32601, `Method not found: ${request.method}`);
    if (!request.params || typeof request.params.name !== "string") return protocolError(request.id, -32602, "tools/call requires a tool name");

    const definition = toolByName.get(request.params.name);
    if (!definition) return protocolError(request.id, -32602, `Unknown tool: ${request.params.name}`);
    const args = request.params.arguments ?? {};
    try {
      matchesSchema(args, definition.inputSchema);
      if (!definition.annotations.readOnlyHint) {
        if (!allowMutations) throw new Error("mutation tools are disabled for this server; start it with --allow-mutations");
        rejectPrivateInput(args);
      }
      const data = sanitize(await handlers[definition.name](args));
      const envelope = { schemaVersion: 1, tool: definition.name, data };
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          structuredContent: envelope,
          content: [{ type: "text", text: JSON.stringify(envelope) }],
        },
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          isError: true,
          content: [{ type: "text", text: sanitizeString(`Tool error: ${error.message}`) }],
        },
      };
    }
  }

  return { handleRequest, tools: MCP_TOOLS };
}
