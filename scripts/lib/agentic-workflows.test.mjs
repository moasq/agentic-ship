// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  STARTER_WORKFLOWS,
  SUPPORTED_ENGINES,
  validateWorkflowSpec,
  compileWorkflowToYaml,
  syncAgenticWorkflows,
} from "./agentic-workflows.mjs";

const roots = [];
const makeTempDir = () => {
  const root = mkdtempSync(join(tmpdir(), "agentic-aw-"));
  roots.push(root);
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("GitHub Agentic Workflows", () => {
  test("all 5 starter workflows pass validation", () => {
    expect(STARTER_WORKFLOWS).toHaveLength(5);
    for (const workflow of STARTER_WORKFLOWS) {
      const res = validateWorkflowSpec(workflow);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    }
  });

  test("rejects invalid engines", () => {
    const invalid = {
      ...STARTER_WORKFLOWS[0],
      engine: "unsupported-engine",
    };
    const res = validateWorkflowSpec(invalid);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain("not supported");
  });

  test("forbids contents: write permission", () => {
    const invalid = {
      ...STARTER_WORKFLOWS[0],
      permissions: { contents: "write" },
    };
    const res = validateWorkflowSpec(invalid);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain("contents permission must be read or none");
  });

  test("enforces max cost budget limit ($1.00)", () => {
    const invalid = {
      ...STARTER_WORKFLOWS[0],
      maxCostUsd: 50.0,
    };
    const res = validateWorkflowSpec(invalid);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain("maxCostUsd must be a positive budget <= $1.00");
  });

  test("compiles workflow spec to valid and deterministic YAML", () => {
    const yaml = compileWorkflowToYaml(STARTER_WORKFLOWS[0]);
    expect(yaml).toContain("name: aw-issue-clarification");
    expect(yaml).toContain("timeout-minutes: 10");
    expect(yaml).toContain('AW_ENGINE: "claude"');
    expect(yaml).toContain("contents: read");
  });

  test("syncAgenticWorkflows creates authored markdown and compiled workflows in fixture directory", () => {
    const root = makeTempDir();
    const results = syncAgenticWorkflows(root);
    expect(results).toHaveLength(5);
  });
});
