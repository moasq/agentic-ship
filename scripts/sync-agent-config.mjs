#!/usr/bin/env node
/**
 * Validates the canonical role briefs in `.agents/agents/` and generates the native
 * project adapters used by Claude Code plugins, Codex, and Cursor. Hermes and OpenClaw
 * have no project-scoped named-agent directory, so the same pass writes non-secret
 * profile/config templates and delegation catalogs without changing a user's home.
 *
 *   node scripts/sync-agent-config.mjs
 *   node scripts/sync-agent-config.mjs --check
 *   node scripts/sync-agent-config.mjs --soft
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { projectAgenticShipServer } from "./lib/host-mcp-adapters.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const canonicalDir = join(root, ".agents", "agents");
const claudePluginDir = join(root, "agents");
const codexDir = join(root, ".codex", "agents");
const cursorDir = join(root, ".cursor", "agents");
const hermesDir = join(root, ".hermes");
const openclawDir = join(root, ".openclaw");
const mcpSource = join(root, ".mcp.json");
const checkOnly = process.argv.includes("--check");
const soft = process.argv.includes("--soft");

const roleNames = [
  "product-orchestrator",
  "frontend-builder",
  "backend-builder",
  "connection-guide",
  "quality-engineer",
];
const legacyNames = ["shipkit-frontend", "shipkit-convex", "shipkit-testing"];
// A role named after the product cannot travel to another repository. `shipkit` predates
// the rename and stays listed so an old checkout still fails the same way.
const productNames = ["shipkit", "agentic-ship"];
const hasProductName = (value) => productNames.some((product) => (value ?? "").toLowerCase().includes(product));
const vendorNames = [
  "playwright-test-planner",
  "playwright-test-generator",
  "playwright-test-healer",
];
const allowedColors = new Set(["blue", "cyan", "green", "yellow", "purple", "orange", "pink", "red"]);
const errors = [];
let sourceMcpCount = 0;
let sourceMcpServers = {};

function parseFrontmatter(source, label) {
  const normalized = source.replaceAll("\r\n", "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    errors.push(`${label}: missing YAML frontmatter`);
    return { fields: {}, body: "" };
  }

  const lines = match[1].split("\n");
  const fields = {};
  for (let index = 0; index < lines.length; index += 1) {
    const field = lines[index].match(/^([a-z][a-z0-9_-]*):(?:\s*(.*))?$/);
    if (!field) continue;

    const [, key, raw = ""] = field;
    if (raw === "|" || raw === "|-" || raw === ">" || raw === ">-") {
      const block = [];
      while (index + 1 < lines.length && !/^[a-z][a-z0-9_-]*:/.test(lines[index + 1])) {
        block.push(lines[index + 1].startsWith("  ") ? lines[index + 1].slice(2) : lines[index + 1]);
        index += 1;
      }
      fields[key] = block.join("\n").trim();
    } else {
      fields[key] = raw.replace(/^(['"])([\s\S]*)\1$/, "$2").trim();
    }
  }

  return { fields, body: match[2].trim() };
}

function readRole(name) {
  const path = join(canonicalDir, `${name}.md`);
  if (!existsSync(path)) {
    errors.push(`missing canonical role: .agents/agents/${name}.md`);
    return null;
  }

  const source = readFileSync(path, "utf8");
  const parsed = parseFrontmatter(source, `.agents/agents/${name}.md`);
  const { fields, body } = parsed;
  if (fields.name !== name) errors.push(`${name}: frontmatter name must match its filename`);
  if (!/^[a-z0-9](?:[a-z0-9-]{1,48})[a-z0-9]$/.test(fields.name ?? "")) {
    errors.push(`${name}: name must be 3-50 lowercase alphanumeric/hyphen characters`);
  }
  if (hasProductName(fields.name)) {
    errors.push(`${name}: product-prefixed agent names are not portable`);
  }
  if (fields.model !== "inherit") errors.push(`${name}: model must be inherit`);
  if (!allowedColors.has(fields.color)) errors.push(`${name}: invalid Claude agent color`);
  if (!(fields.description ?? "").startsWith("Use this agent when")) {
    errors.push(`${name}: description must begin with a concrete trigger`);
  }
  if (((fields.description ?? "").match(/<example>/g) ?? []).length < 2) {
    errors.push(`${name}: description must contain at least two trigger examples`);
  }
  if (((fields.description ?? "").match(/<commentary>/g) ?? []).length < 2) {
    errors.push(`${name}: each trigger example needs commentary`);
  }
  for (const heading of ["## Required context", "## Input contract", "## Procedure", "## Handoffs", "## Output contract"]) {
    if (!body.includes(heading)) errors.push(`${name}: missing dispatch section ${heading}`);
  }
  if (!body.includes("pnpm verify")) errors.push(`${name}: completion procedure must run a verify gate`);
  for (const match of body.matchAll(/`(AGENTS\.md|\.agents\/[^`]+)`/g)) {
    const referencedPath = match[1];
    if (!existsSync(join(root, referencedPath))) {
      errors.push(`${name}: referenced path does not exist: ${referencedPath}`);
    }
  }

  return { name, path, ...fields, body };
}

function yamlBlock(value) {
  return value
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

function codexAdapter(role) {
  if (role.body.includes("'''")) {
    errors.push(`${role.name}: body contains a TOML literal-string terminator`);
  }
  return `# Generated by scripts/sync-agent-config.mjs from .agents/agents/${role.name}.md.\nname = ${JSON.stringify(role.name)}\ndescription = ${JSON.stringify(role.description)}\ndeveloper_instructions = '''\n${role.body}\n'''\n`;
}

function claudePluginAdapter(role) {
  const body = role.body.replaceAll("`.agents/", "`${CLAUDE_PLUGIN_ROOT}/.agents/");
  return `---\nname: ${role.name}\ndescription: |\n${yamlBlock(role.description)}\nmodel: inherit\ncolor: ${role.color}\n---\n\n<!-- Generated by scripts/sync-agent-config.mjs from .agents/agents/${role.name}.md. -->\n\n${body}\n`;
}

function cursorAdapter(role) {
  return `---\nname: ${role.name}\ndescription: |\n${yamlBlock(role.description)}\nmodel: inherit\nreadonly: false\n---\n\n<!-- Generated by scripts/sync-agent-config.mjs from .agents/agents/${role.name}.md. -->\n\n${role.body}\n`;
}

function hermesCatalog(roles) {
  const rows = roles
    .map((role) => `| \`${role.name}\` | \`.agents/agents/${role.name}.md\` | ${role.description.split("\n")[0]} |`)
    .join("\n");
  return `# Hermes delegation role catalog\n\nGenerated by \`scripts/sync-agent-config.mjs\`. Do not edit this file directly.\n\nHermes reads \`AGENTS.md\` as project context, but it does not discover named roles from a\nproject agent directory. Before calling \`delegate_task\`, read the canonical role file\nand put its bounded goal, required inputs, acceptance criteria, relevant paths, and expected\noutput into the child's \`goal\` and \`context\`. A child starts with no parent conversation\nhistory. Use \`role=\"orchestrator\"\` only for \`product-orchestrator\`; all other roles are\nleaf tasks.\n\n| Role | Canonical brief | Trigger |\n| --- | --- | --- |\n${rows}\n`;
}

// A key-authenticated HTTP server may declare headers, but only as a placeholder:
// exactly one header whose value is a "${ENV_VAR}" reference, resolved by each host at
// startup. A literal value here would commit a credential to the repository, and more
// than one header has no Codex equivalent. Returns the env var name, or null on error.
function httpHeaderEnv(name, headers) {
  if (headers === undefined) return null;
  const entries = headers === null || typeof headers !== "object" ? [] : Object.entries(headers);
  const value = entries[0]?.[1];
  const match = typeof value === "string" ? value.match(/^\$\{([A-Z][A-Z0-9_]*)\}$/) : null;
  if (entries.length !== 1 || !match) {
    errors.push(
      `.mcp.json HTTP server ${name} headers must be exactly one "\${ENV_VAR}" placeholder — a literal value would commit a credential`,
    );
    return null;
  }
  return match[1];
}

function buildCodexConfig() {
  if (!existsSync(mcpSource)) {
    errors.push(".mcp.json is missing; Codex MCP config cannot be generated");
    return "";
  }

  let source;
  try {
    source = JSON.parse(readFileSync(mcpSource, "utf8"));
  } catch (error) {
    errors.push(`.mcp.json is invalid JSON: ${error.message}`);
    return "";
  }
  if (source === null || typeof source !== "object" || source.mcpServers === null || typeof source.mcpServers !== "object") {
    errors.push(".mcp.json must contain an mcpServers object");
    return "";
  }
  sourceMcpServers = source.mcpServers;
  sourceMcpCount = Object.keys(sourceMcpServers).length;

  const sections = [
    "# Generated by scripts/sync-agent-config.mjs from .mcp.json and .agents/agents/.",
    "# Trust this project before Codex loads project-scoped MCP servers.",
    "[agents]",
    "max_concurrent_threads_per_session = 4",
  ];
  for (const [name, server] of Object.entries(source.mcpServers)) {
    if (!/^[A-Za-z0-9_-]+$/.test(name)) {
      errors.push(`.mcp.json server name is not TOML-safe: ${name}`);
      continue;
    }
    // Project config layers merge with user config by key. A neutral prefix prevents a
    // user's same-named server with a different transport from producing an invalid mix.
    sections.push("", `# Source server: ${name}`, `[mcp_servers.workspace-${name}]`);
    if (typeof server.command === "string") {
      const keys = Object.keys(server).sort();
      if (keys.some((key) => !["args", "command"].includes(key))) {
        errors.push(`.mcp.json stdio server ${name} has unsupported fields: ${keys.join(", ")}`);
        continue;
      }
      if (!Array.isArray(server.args) || server.args.some((arg) => typeof arg !== "string")) {
        errors.push(`.mcp.json stdio server ${name} must have a string args array`);
        continue;
      }
      sections.push(`command = ${JSON.stringify(server.command)}`);
      sections.push(`args = [${server.args.map((arg) => JSON.stringify(arg)).join(", ")}]`);
    } else if (server.type === "http" && typeof server.url === "string") {
      const keys = Object.keys(server).sort();
      if (keys.some((key) => !["headers", "type", "url"].includes(key))) {
        errors.push(`.mcp.json HTTP server ${name} has unsupported fields: ${keys.join(", ")}`);
        continue;
      }
      const headerEnv = httpHeaderEnv(name, server.headers);
      if (server.headers !== undefined && headerEnv === null) continue;
      sections.push(`url = ${JSON.stringify(server.url)}`);
      // Codex has no per-header auth field; a single ${VAR} key header maps to its
      // native bearer auth, which key-authenticated vendors accept interchangeably.
      if (headerEnv) sections.push(`bearer_token_env_var = ${JSON.stringify(headerEnv)}`);
    } else {
      errors.push(`.mcp.json server ${name} must be stdio command/args or HTTP type/url`);
    }
  }
  return `${sections.join("\n")}\n`;
}

const codexConfig = buildCodexConfig();

function buildCodexPluginMcp() {
  const directMap = {};
  for (const [name, server] of Object.entries(sourceMcpServers)) {
    if (typeof server.command === "string" && Array.isArray(server.args)) {
      directMap[name] = { command: server.command, args: server.args };
    } else if (server.type === "http" && typeof server.url === "string") {
      directMap[name] = server.headers === undefined ? { url: server.url } : { url: server.url, headers: server.headers };
    }
  }
  return `${JSON.stringify(directMap, null, 2)}\n`;
}

const codexPluginMcp = buildCodexPluginMcp();

let hermesAgenticShipMcp = { command: "", args: [] };
let openclawAgenticShipMcp = { command: "", args: [], cwd: "" };
try {
  hermesAgenticShipMcp = projectAgenticShipServer(sourceMcpServers, "${PROJECT_ROOT}");
  openclawAgenticShipMcp = projectAgenticShipServer(sourceMcpServers, "<PROJECT_ROOT>", { includeCwd: true });
} catch (error) {
  errors.push(`cannot generate Hermes/OpenClaw Agentic Ship MCP adapters: ${error.message}`);
}

const hermesAgenticShipMcpYaml = `mcp_servers:\n  agentic-ship:\n    command: ${JSON.stringify(hermesAgenticShipMcp.command)}\n    args:\n${hermesAgenticShipMcp.args
  .map((arg) => `      - ${JSON.stringify(arg)}`)
  .join("\n")}`;

const codexHooks = `${JSON.stringify(
  {
    description: "Run the repository definition-of-done before Codex stops.",
    hooks: {
      Stop: [
        {
          hooks: [
            {
              type: "command",
              command: "node scripts/verify.mjs --quiet --hook",
              timeout: 600,
              statusMessage: "Verifying repository gates",
            },
          ],
        },
      ],
    },
  },
  null,
  2,
)}\n`;

const cursorHooks = `${JSON.stringify(
  {
    version: 1,
    hooks: {
      stop: [
        {
          command: "node .cursor/hooks/verify-stop.mjs",
          timeout: 600,
        },
      ],
    },
  },
  null,
  2,
)}\n`;

const cursorVerifyStop = `#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MAX_LOOP_COUNT = 2;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function respond(payload) {
  process.stdout.write(JSON.stringify(payload) + "\\n");
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    respond({});
    return;
  }

  const candidate = Number(input.loop_count);
  const loopCount = Number.isInteger(candidate) && candidate >= 0 ? candidate : MAX_LOOP_COUNT;
  if (input.status !== "completed" || loopCount >= MAX_LOOP_COUNT) {
    respond({});
    return;
  }

  const result = spawnSync(process.execPath, ["scripts/verify.mjs", "--quiet"], {
    cwd: root,
    encoding: "utf8",
    timeout: 590_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.status === 0) {
    respond({});
    return;
  }

  const attempt = loopCount + 1;
  respond({
    followup_message:
      "[Verification retry " +
      attempt +
      "/" +
      MAX_LOOP_COUNT +
      "] Repository gates are red. Run pnpm verify, fix the root cause without weakening a gate, and verify again before declaring completion.",
  });
}

main();
`;

const hermesDistribution = `name: product-builder\nversion: 0.1.0\ndescription: "Repository-aware product delivery coordinator"\nhermes_requires: ">=0.20.0"\nauthor: "Repository maintainers"\nlicense: "MIT"\nenv_requires:\n  - name: PROJECT_ROOT\n    description: "Absolute path to the project repository"\n    required: true\n`;

const hermesConfig = `# Generated profile configuration. No credentials belong in this file.\nterminal:\n  backend: local\n  cwd: "\${PROJECT_ROOT}"\n${hermesAgenticShipMcpYaml}\nskills:\n  external_dirs:\n    - "\${PROJECT_ROOT}/.agents/skills"\ndelegation:\n  max_concurrent_children: 4\n  max_spawn_depth: 2\n  orchestrator_enabled: true\n`;

const hermesSoul = `# Product delivery coordinator\n\nWork from \`\${PROJECT_ROOT}\`. Read \`AGENTS.md\`, then read\n\`.agents/agents/product-orchestrator.md\` and follow its contracts. For host-specific\nbehavior, read \`.agents/skills/agent-compatibility/SKILL.md\`.\n\nBefore each \`delegate_task\` call, read the selected canonical role under\n\`.agents/agents/\` and pass its required inputs, relevant paths, acceptance criteria,\nand expected output in the child's goal and context. Children receive no parent history.\nNever place credentials, authorization codes, or secrets in delegation context.\n`;

const hermesGitignore = `.env\nauth.json\nstate.db*\nmemories/\nsessions/\nlogs/\nplans/\nworkspace/\nhome/\ncache/\nlocal/\n`;

const openclawConfig = `// Generated by scripts/sync-agent-config.mjs. Non-secret template — no credentials
// belong in this file, and nothing in this repository edits your global OpenClaw
// configuration. Merge into ~/.openclaw/openclaw.json yourself and replace
// <PROJECT_ROOT> with this repository's absolute path.
//
// With the repository as the agent workspace, OpenClaw reads AGENTS.md at the root
// and discovers .agents/skills natively. skills.load.extraDirs covers an agent that
// keeps a different workspace.
{
  agents: {
    list: [
      { id: "agentic-ship", workspace: "<PROJECT_ROOT>" },
    ],
  },
  mcp: {
    servers: {
      "agentic-ship": {
        command: ${JSON.stringify(openclawAgenticShipMcp.command)},
        args: [${openclawAgenticShipMcp.args.map((arg) => JSON.stringify(arg)).join(", ")}],
        cwd: ${JSON.stringify(openclawAgenticShipMcp.cwd)},
      },
    },
  },
  skills: {
    load: {
      extraDirs: ["<PROJECT_ROOT>/.agents/skills"],
    },
  },
}
`;

function openclawCatalog(roles) {
  const rows = roles
    .map((role) => `| \`${role.name}\` | \`.agents/agents/${role.name}.md\` | ${role.description.split("\n")[0]} |`)
    .join("\n");
  return `# OpenClaw delegation role catalog\n\nGenerated by \`scripts/sync-agent-config.mjs\`. Do not edit this file directly.\n\nWhen this repository is the agent workspace, OpenClaw reads \`AGENTS.md\` and discovers\n\`.agents/skills\` natively, but it does not discover named roles from a project agent\ndirectory. Before spawning a subagent with \`sessions_spawn\`, read the canonical role\nfile and put its bounded goal, required inputs, acceptance criteria, relevant paths,\nand expected output into the spawn \`task\`. A spawned session is isolated by default and\nreceives no parent conversation history. Never place credentials, authorization codes,\nor secrets in a spawn task.\n\n| Role | Canonical brief | Trigger |\n| --- | --- | --- |\n${rows}\n`;
}

function checkToml(source, role) {
  if (!source.startsWith("# Generated by scripts/sync-agent-config.mjs")) {
    errors.push(`${role.name}: malformed generated Codex header`);
  }
  if (!source.includes(`name = ${JSON.stringify(role.name)}\n`)) {
    errors.push(`${role.name}: malformed Codex name`);
  }
  if (!source.includes("developer_instructions = '''\n") || !source.endsWith("\n'''\n")) {
    errors.push(`${role.name}: malformed Codex developer_instructions`);
  }
}

function checkCursor(source, role) {
  const parsed = parseFrontmatter(source, `.cursor/agents/${role.name}.md`);
  if (parsed.fields.name !== role.name || parsed.fields.model !== "inherit") {
    errors.push(`${role.name}: malformed Cursor frontmatter`);
  }
  if (parsed.fields.readonly !== "false") {
    errors.push(`${role.name}: Cursor implementation role must be writable`);
  }
}

function checkSharedConfigs() {
  if (!codexConfig.includes("[agents]\nmax_concurrent_threads_per_session = 4\n")) {
    errors.push("malformed generated Codex project agent settings");
  }
  if (codexConfig.includes("mcp-remote") || codexConfig.includes("type = \"http\"")) {
    errors.push("Codex MCP config must use native direct URLs, not transport wrappers");
  }
  const configuredMcpCount = (codexConfig.match(/^\[mcp_servers\./gm) ?? []).length;
  if (configuredMcpCount !== sourceMcpCount) {
    errors.push(`Codex MCP config has ${configuredMcpCount} servers; source has ${sourceMcpCount}`);
  }
  let pluginMcp;
  try {
    pluginMcp = JSON.parse(codexPluginMcp);
  } catch (error) {
    errors.push(`generated Codex plugin MCP map is invalid JSON: ${error.message}`);
    pluginMcp = {};
  }
  if ("mcpServers" in pluginMcp || "mcp_servers" in pluginMcp) {
    errors.push("Codex plugin MCP file must be a direct server map");
  }
  if (Object.keys(pluginMcp).length !== sourceMcpCount) {
    errors.push(`Codex plugin MCP map has ${Object.keys(pluginMcp).length} servers; source has ${sourceMcpCount}`);
  }
  if (Object.values(pluginMcp).some((server) => server.type === "http" || String(server.command ?? "").includes("mcp-remote"))) {
    errors.push("Codex plugin MCP map must use native direct URLs, not transport wrappers");
  }
  let hooks;
  try {
    hooks = JSON.parse(codexHooks);
  } catch (error) {
    errors.push(`generated Codex hooks file is invalid JSON: ${error.message}`);
    hooks = {};
  }
  const stopHandler = hooks.hooks?.Stop?.[0]?.hooks?.[0];
  if (
    stopHandler?.type !== "command" ||
    stopHandler?.command !== "node scripts/verify.mjs --quiet --hook" ||
    stopHandler?.timeout !== 600
  ) {
    errors.push("Codex Stop hook must run the repository verifier with a 600-second timeout");
  }
  if (!existsSync(join(root, "scripts", "verify.mjs"))) {
    errors.push("Codex Stop hook target is missing: scripts/verify.mjs");
  }
  let cursorHookConfig;
  try {
    cursorHookConfig = JSON.parse(cursorHooks);
  } catch (error) {
    errors.push(`generated Cursor hooks file is invalid JSON: ${error.message}`);
    cursorHookConfig = {};
  }
  const cursorStop = cursorHookConfig.hooks?.stop?.[0];
  if (
    cursorHookConfig.version !== 1 ||
    cursorStop?.command !== "node .cursor/hooks/verify-stop.mjs" ||
    cursorStop?.timeout !== 600
  ) {
    errors.push("Cursor Stop hook must run its Node verifier wrapper with a 600-second timeout");
  }
  if (!cursorVerifyStop.includes("const MAX_LOOP_COUNT = 2;") || !cursorVerifyStop.includes('["scripts/verify.mjs", "--quiet"]')) {
    errors.push("Cursor Stop wrapper must enforce a retry cap and run the repository verifier");
  }
  const requiredHermesLines = [
    "terminal:",
    '  cwd: "${PROJECT_ROOT}"',
    "mcp_servers:",
    "  agentic-ship:",
    '    command: "node"',
    '      - "${PROJECT_ROOT}/scripts/mcp-server.mjs"',
    '      - "--allow-mutations"',
    "skills:",
    '    - "${PROJECT_ROOT}/.agents/skills"',
    "delegation:",
    "  max_spawn_depth: 2",
  ];
  for (const line of requiredHermesLines) {
    if (!hermesConfig.split("\n").includes(line)) {
      errors.push(`malformed Hermes profile config: missing ${line}`);
    }
  }
  if (!hermesDistribution.startsWith("name: product-builder\n") || !hermesDistribution.includes("PROJECT_ROOT")) {
    errors.push("malformed Hermes distribution manifest");
  }
  if ([hermesDistribution, hermesConfig, hermesSoul].some((value) => value.split("\n").some((line) => line.startsWith("+")))) {
    errors.push("malformed Hermes profile distribution: patch markers found");
  }
  const requiredOpenclawLines = [
    "  agents: {",
    '      { id: "agentic-ship", workspace: "<PROJECT_ROOT>" },',
    "  mcp: {",
    "    servers: {",
    '      "agentic-ship": {',
    '        command: "node",',
    '        args: ["<PROJECT_ROOT>/scripts/mcp-server.mjs", "--allow-mutations"],',
    '        cwd: "<PROJECT_ROOT>",',
    '      extraDirs: ["<PROJECT_ROOT>/.agents/skills"],',
  ];
  for (const line of requiredOpenclawLines) {
    if (!openclawConfig.split("\n").includes(line)) {
      errors.push(`malformed OpenClaw config template: missing ${line}`);
    }
  }
  if (/(token|secret|api[_-]?key|password)\s*[:=]/i.test(openclawConfig)) {
    errors.push("OpenClaw config template must stay non-secret");
  }
  if (openclawConfig.split("\n").some((line) => line.startsWith("+"))) {
    errors.push("malformed OpenClaw config template: patch markers found");
  }
}

function emit(path, wanted) {
  const relative = path.slice(root.length + 1);
  const current = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (current === wanted) return;
  if (checkOnly) {
    errors.push(`${relative}: missing or drifted; run node scripts/sync-agent-config.mjs`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, wanted);
  console.log(`wrote ${relative}`);
}

for (const legacyName of legacyNames) {
  for (const directory of [canonicalDir, claudePluginDir, codexDir, cursorDir]) {
    const path = join(directory, `${legacyName}${directory === codexDir ? ".toml" : ".md"}`);
    if (!existsSync(path)) continue;
    if (checkOnly) errors.push(`${path.slice(root.length + 1)}: legacy product-prefixed agent remains`);
    else {
      unlinkSync(path);
      console.log(`removed ${path.slice(root.length + 1)}`);
    }
  }
}

for (const vendorName of vendorNames) {
  if (!existsSync(join(canonicalDir, `${vendorName}.md`))) {
    errors.push(`missing vendor agent: .agents/agents/${vendorName}.md`);
  }
}

for (const file of readdirSync(canonicalDir).filter((entry) => entry.endsWith(".md"))) {
  const source = readFileSync(join(canonicalDir, file), "utf8");
  const declaredName = source.match(/^name:\s*([^\n]+)$/m)?.[1]?.replaceAll(/["']/g, "").trim();
  if (hasProductName(declaredName)) {
    errors.push(`${file}: product-prefixed agent name remains`);
  }
}

const roles = roleNames.map(readRole).filter(Boolean);
const colors = roles.map((role) => role.color);
if (new Set(colors).size !== colors.length) errors.push("portable Claude roles must use distinct colors");
checkSharedConfigs();

if (errors.length === 0) {
  for (const role of roles) {
    const claude = claudePluginAdapter(role);
    const codex = codexAdapter(role);
    const cursor = cursorAdapter(role);
    checkToml(codex, role);
    checkCursor(cursor, role);
    emit(join(claudePluginDir, `${role.name}.md`), claude);
    emit(join(codexDir, `${role.name}.toml`), codex);
    emit(join(cursorDir, `${role.name}.md`), cursor);
  }
  emit(join(root, ".codex", "config.toml"), codexConfig);
  emit(join(root, ".codex", "hooks.json"), codexHooks);
  emit(join(root, ".codex-plugin", "mcp.json"), codexPluginMcp);
  emit(join(root, ".cursor", "hooks.json"), cursorHooks);
  emit(join(root, ".cursor", "hooks", "verify-stop.mjs"), cursorVerifyStop);
  emit(join(hermesDir, "profile", "distribution.yaml"), hermesDistribution);
  emit(join(hermesDir, "profile", "config.yaml"), hermesConfig);
  emit(join(hermesDir, "profile", "SOUL.md"), hermesSoul);
  emit(join(hermesDir, "profile", ".gitignore"), hermesGitignore);
  emit(join(hermesDir, "roles.md"), hermesCatalog(roles));
  emit(join(openclawDir, "config.json5"), openclawConfig);
  emit(join(openclawDir, "roles.md"), openclawCatalog(roles));
}

if (errors.length > 0) {
  console.error("agent adapters FAIL");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(soft && !checkOnly ? 0 : 1);
}

console.log(checkOnly ? "agent adapters OK" : "agent adapters synchronized");
