// @vitest-environment node
import { describe, expect, test } from "vitest";
import { projectAgenticShipServer } from "./host-mcp-adapters.mjs";

const inventory = {
  "agentic-ship": {
    command: "node",
    args: ["scripts/mcp-server.mjs", "--allow-mutations"],
  },
};

describe("projectAgenticShipServer", () => {
  test("maps the canonical script path and preserves the capability flag", () => {
    expect(projectAgenticShipServer(inventory, "${PROJECT_ROOT}")).toEqual({
      command: "node",
      args: ["${PROJECT_ROOT}/scripts/mcp-server.mjs", "--allow-mutations"],
    });
    expect(projectAgenticShipServer(inventory, "<PROJECT_ROOT>", { includeCwd: true })).toEqual({
      command: "node",
      args: ["<PROJECT_ROOT>/scripts/mcp-server.mjs", "--allow-mutations"],
      cwd: "<PROJECT_ROOT>",
    });
  });

  test("rejects fields that could carry credentials or change transport", () => {
    expect(() =>
      projectAgenticShipServer(
        {
          "agentic-ship": {
            ...inventory["agentic-ship"],
            env: { TOKEN: "literal" },
          },
        },
        "<PROJECT_ROOT>",
      ),
    ).toThrow("accepts only command and args");
  });

  test("rejects a missing or ambiguous canonical script path", () => {
    expect(() => projectAgenticShipServer({}, "<PROJECT_ROOT>")).toThrow("must contain the agentic-ship stdio server");
    expect(() =>
      projectAgenticShipServer(
        {
          "agentic-ship": {
            command: "node",
            args: ["scripts/mcp-server.mjs", "scripts/mcp-server.mjs"],
          },
        },
        "<PROJECT_ROOT>",
      ),
    ).toThrow("exactly once");
  });
});
