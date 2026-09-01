const LOCAL_SERVER_NAME = "agentic-ship";
const LOCAL_SCRIPT_PATH = "scripts/mcp-server.mjs";

/**
 * Convert the canonical local Agentic Ship MCP declaration into a host adapter.
 * Host templates receive only command/args. Credentials and transport-specific
 * fields cannot cross this boundary.
 */
export function projectAgenticShipServer(mcpServers, projectRoot, { includeCwd = false } = {}) {
  if (mcpServers === null || typeof mcpServers !== "object" || Array.isArray(mcpServers)) {
    throw new TypeError("MCP inventory must be an object");
  }
  if (typeof projectRoot !== "string" || projectRoot.length === 0 || /[\r\n]/.test(projectRoot)) {
    throw new TypeError("project root token must be a non-empty single-line string");
  }

  const server = mcpServers[LOCAL_SERVER_NAME];
  if (server === null || typeof server !== "object" || Array.isArray(server)) {
    throw new TypeError(`MCP inventory must contain the ${LOCAL_SERVER_NAME} stdio server`);
  }
  const keys = Object.keys(server).sort();
  if (keys.some((key) => !["args", "command"].includes(key))) {
    throw new TypeError(`${LOCAL_SERVER_NAME} host adapter accepts only command and args`);
  }
  if (typeof server.command !== "string" || server.command.length === 0) {
    throw new TypeError(`${LOCAL_SERVER_NAME} command must be a non-empty string`);
  }
  if (!Array.isArray(server.args) || server.args.some((arg) => typeof arg !== "string")) {
    throw new TypeError(`${LOCAL_SERVER_NAME} args must be a string array`);
  }
  if (server.args.filter((arg) => arg === LOCAL_SCRIPT_PATH).length !== 1) {
    throw new TypeError(`${LOCAL_SERVER_NAME} args must contain ${LOCAL_SCRIPT_PATH} exactly once`);
  }

  const mapped = {
    command: server.command,
    args: server.args.map((arg) => (arg === LOCAL_SCRIPT_PATH ? `${projectRoot}/${arg}` : arg)),
  };
  return includeCwd ? { ...mapped, cwd: projectRoot } : mapped;
}
