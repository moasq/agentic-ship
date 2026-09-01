// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  classifyAgenticWorkflowLockDiff,
  classifyGhAwCompilation,
  classifyGhAwPreflight,
  readAgenticWorkflowCompilerVersion,
} from "./agentic-workflow-compiler.mjs";

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Agentic Workflows compiler preflight", () => {
  test("reads the exact reviewed version from aw.yml", () => {
    const root = mkdtempSync(join(tmpdir(), "agentic-workflows-"));
    roots.push(root);
    writeFileSync(join(root, "aw.yml"), 'manifest-version: "1"\nmin-version: v0.87.10\n', "utf8");
    expect(readAgenticWorkflowCompilerVersion(root)).toBe("v0.87.10");
  });

  test("distinguishes a missing CLI from a missing extension", () => {
    expect(classifyGhAwPreflight({ error: { code: "ENOENT" }, status: null })).toBe("missing_cli");
    expect(classifyGhAwPreflight({ status: 1, stderr: "unknown command aw" })).toBe("missing_extension");
    expect(classifyGhAwPreflight({ status: 0, stdout: "v0.87.10" })).toBe("ready");
  });

  test("keeps compiler failure separate from installation failure", () => {
    expect(classifyGhAwCompilation({ status: 1 })).toBe("compile_failed");
    expect(classifyGhAwCompilation({ status: 0 })).toBe("compiled");
  });

  test("classifies generated lock drift without conflating it with compilation", () => {
    expect(classifyAgenticWorkflowLockDiff({ status: 0 })).toBe("current");
    expect(classifyAgenticWorkflowLockDiff({ status: 1 })).toBe("stale");
  });
});
