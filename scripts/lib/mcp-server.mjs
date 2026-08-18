import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createWorkStore } from "./work-state.mjs";
import { createConnectionService } from "./connections/service.mjs";

const SECRET_SHAPE =
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+|\bwhsec_[A-Za-z0-9]+|\bphx_[A-Za-z0-9]+|\bre_[A-Za-z0-9]{16,}|\b(?:api[_-]?key|secret|token|password)\s*[=:]\s*\S+/i;

function sanitize(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return SECRET_SHAPE.test(value) ? value.replace(SECRET_SHAPE, "[REDACTED_CREDENTIAL]") : value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }
  if (typeof value === "object") {
    const clean = {};
    for (const [k, v] of Object.entries(value)) {
      clean[k] = sanitize(v);
    }
    return clean;
  }
  return value;
}

export const MCP_TOOLS = [
  {
    name: "get_health",
    description: "Read workspace health check and provider readiness status without running modifying mutations.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_connections",
    description: "Read provider connections status and active connection receipts.",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", description: "Optional provider id to filter by" },
      },
    },
  },
  {
    name: "get_work_status",
    description: "Read the durable work queue state, product goals, and all work item statuses.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_next_work",
    description: "Query ready, unblocked work items eligible for execution by the specified role.",
    inputSchema: {
      type: "object",
      properties: {
        role: { type: "string", description: "Optional agent role (e.g. frontend-builder, backend-builder)" },
      },
    },
  },
  {
    name: "get_ui_plan",
    description: "Read the UI plan and component topology specification.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_ui_evidence",
    description: "Read the UI visual evidence checklist and verification status.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "start_work",
    description: "Transition a ready work item to in_progress.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The work item ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "wait_work",
    description: "Transition a work item to input_required pending a connection action or human input.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The work item ID" },
        actionId: { type: "string", description: "The connection action ID" },
        reason: { type: "string", description: "The reason for waiting" },
      },
      required: ["id", "reason"],
    },
  },
  {
    name: "resume_work",
    description: "Resume a work item from input_required back to ready.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The work item ID" },
        evidence: { type: "string", description: "Verification evidence for the resumed action" },
      },
      required: ["id", "evidence"],
    },
  },
  {
    name: "block_work",
    description: "Mark a work item as blocked due to an unexpected impediment.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The work item ID" },
        reason: { type: "string", description: "The reason for the blocker" },
      },
      required: ["id", "reason"],
    },
  },
  {
    name: "unblock_work",
    description: "Unblock a work item with resolution evidence.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The work item ID" },
        evidence: { type: "string", description: "Evidence that the blocker has been resolved" },
      },
      required: ["id", "evidence"],
    },
  },
  {
    name: "complete_work",
    description: "Complete a work item with gate evidence verifying its acceptance criteria.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The work item ID" },
        evidence: {
          type: "array",
          items: { type: "string" },
          description: "Array of verification gate evidence strings",
        },
      },
      required: ["id", "evidence"],
    },
  },
];

export function createAgenticShipMcpServer(projectRoot) {
  const root = projectRoot;
  const store = createWorkStore(root);

  const getConnectionsService = () => {
    try {
      return createConnectionService({ projectRoot: root });
    } catch {
      return null;
    }
  };

  const handlers = {
    get_health: async () => {
      return {
        status: "healthy",
        projectRoot: root,
        hasWorkState: existsSync(join(root, ".agent-state", "work-items.json")),
        hasConnections: existsSync(join(root, ".agent-state", "connections")),
      };
    },

    get_connections: async (params = {}) => {
      const connections = getConnectionsService();
      if (!connections) {
        return { message: "No connection catalog in project root", providers: [] };
      }
      const catalog = connections.catalog;
      const providers = Object.keys(catalog.providers);
      if (params.provider) {
        if (!catalog.providers[params.provider]) {
          throw new Error(`Unknown provider: ${params.provider}`);
        }
        return {
          provider: params.provider,
          definition: catalog.providers[params.provider],
        };
      }
      return {
        providers,
        catalogVersion: catalog.providerDocument?.schemaVersion ?? 1,
      };
    },

    get_work_status: async () => {
      try {
        return store.load();
      } catch (error) {
        return { error: error.message, initialized: false };
      }
    },

    get_next_work: async (params = {}) => {
      try {
        return store.next(params.role);
      } catch (error) {
        return { error: error.message, ready: [] };
      }
    },

    get_ui_plan: async () => {
      const planFile = join(root, ".agent-state", "ui-plan.json");
      if (existsSync(planFile)) {
        return JSON.parse(readFileSync(planFile, "utf8"));
      }
      return { message: "No active UI plan recorded" };
    },

    get_ui_evidence: async () => {
      const evidenceFile = join(root, ".agent-state", "ui-evidence.json");
      if (existsSync(evidenceFile)) {
        return JSON.parse(readFileSync(evidenceFile, "utf8"));
      }
      return { message: "No active UI evidence recorded" };
    },

    start_work: async (params) => {
      if (!params?.id) throw new Error("Missing work item id");
      return store.transition(params.id, "start");
    },

    wait_work: async (params) => {
      if (!params?.id) throw new Error("Missing work item id");
      if (!params?.reason) throw new Error("Missing wait reason");
      return store.transition(params.id, "wait", {
        actionId: params.actionId,
        reason: params.reason,
      });
    },

    resume_work: async (params) => {
      if (!params?.id) throw new Error("Missing work item id");
      if (!params?.evidence) throw new Error("Missing resume evidence");
      return store.transition(params.id, "resume", {
        evidence: params.evidence,
      });
    },

    block_work: async (params) => {
      if (!params?.id) throw new Error("Missing work item id");
      if (!params?.reason) throw new Error("Missing block reason");
      return store.transition(params.id, "block", {
        reason: params.reason,
      });
    },

    unblock_work: async (params) => {
      if (!params?.id) throw new Error("Missing work item id");
      if (!params?.evidence) throw new Error("Missing unblock evidence");
      return store.transition(params.id, "unblock", {
        evidence: params.evidence,
      });
    },

    complete_work: async (params) => {
      if (!params?.id) throw new Error("Missing work item id");
      if (!Array.isArray(params?.evidence) || params.evidence.length === 0) {
        throw new Error("complete_work requires non-empty evidence array");
      }
      return store.transition(params.id, "complete", {
        evidence: params.evidence,
      });
    },
  };

  const handleRequest = async (request) => {
    if (!request || typeof request !== "object") {
      return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } };
    }

    const { id, method, params } = request;

    if (method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: {
            name: "agentic-ship",
            version: "1.0.0",
          },
          capabilities: {
            tools: {},
          },
        },
      };
    }

    if (method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: MCP_TOOLS,
        },
      };
    }

    if (method === "tools/call") {
      const toolName = params?.name;
      const toolArgs = params?.arguments ?? {};

      const handler = handlers[toolName];
      if (!handler) {
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Method not found: ${toolName}`,
          },
        };
      }

      try {
        const rawResult = await handler(toolArgs);
        const cleanResult = sanitize(rawResult);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(cleanResult, null, 2),
              },
            ],
          },
        };
      } catch (error) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            isError: true,
            content: [
              {
                type: "text",
                text: `Tool error: ${error.message}`,
              },
            ],
          },
        };
      }
    }

    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Unsupported method: ${method}` },
    };
  };

  return {
    handleRequest,
    tools: MCP_TOOLS,
  };
}
