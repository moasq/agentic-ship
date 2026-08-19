import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { AGENTIC_WORKFLOW_IDS, inspectAgenticWorkflowBundle } from "./agentic-workflows.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("GitHub Agentic Workflows bundle", () => {
  test("ships five official, strict, opt-in starter workflows", () => {
    expect(AGENTIC_WORKFLOW_IDS).toHaveLength(5);
    expect(inspectAgenticWorkflowBundle(root)).toEqual([]);
  });
});
