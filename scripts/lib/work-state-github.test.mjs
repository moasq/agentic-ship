// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createGitHubWorkMirror } from "./work-state-github.mjs";

const roots = [];
const makeTempDir = () => {
  const root = mkdtempSync(join(tmpdir(), "agent-gh-mirror-"));
  roots.push(root);
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("GitHub work queue mirror", () => {
  test("creates issues for new work items and tracks their issue numbers", () => {
    const root = makeTempDir();
    let issueCounter = 101;
    const executedCommands = [];

    const mockRunner = vi.fn((cmd, args) => {
      executedCommands.push({ cmd, args });
      if (args[0] === "issue" && args[1] === "create") {
        return `https://github.com/moasq/agentic-ship/issues/${issueCounter++}`;
      }
      return "";
    });

    const mirror = createGitHubWorkMirror(root, { runner: mockRunner });

    const workState = {
      schemaVersion: 1,
      product: { name: "Agentic Ship", goal: "Ship it" },
      items: [
        {
          id: "backend-core",
          role: "backend-builder",
          summary: "Implement database schema",
          status: "ready",
          acceptanceCriteria: ["Schema compiles", "Migrations pass"],
          dependsOn: [],
        },
      ],
    };

    const result = mirror.sync(workState);
    expect(result.ok).toBe(true);
    expect(result.items[0]).toMatchObject({
      id: "backend-core",
      action: "created",
      issueNumber: 101,
      issueUrl: "https://github.com/moasq/agentic-ship/issues/101",
    });

    const mirrorData = mirror.loadMirror();
    expect(mirrorData.items["backend-core"]).toMatchObject({
      issueNumber: 101,
      lastStatus: "ready",
    });
  });

  test("is strictly idempotent on repeated syncs", () => {
    const root = makeTempDir();
    let issueCreatedCount = 0;

    const mockRunner = vi.fn((cmd, args) => {
      if (args[0] === "issue" && args[1] === "create") {
        issueCreatedCount++;
        return `https://github.com/moasq/agentic-ship/issues/201`;
      }
      return "";
    });

    const mirror = createGitHubWorkMirror(root, { runner: mockRunner });

    const workState = {
      schemaVersion: 1,
      items: [
        {
          id: "task-1",
          role: "frontend-builder",
          summary: "Build dashboard UI",
          status: "ready",
          acceptanceCriteria: ["Renders clean"],
        },
      ],
    };

    // First sync creates the issue
    const res1 = mirror.sync(workState);
    expect(res1.items[0].action).toBe("created");
    expect(issueCreatedCount).toBe(1);

    // Second sync on identical state is a no-op (zero duplicate issues created)
    const res2 = mirror.sync(workState);
    expect(res2.items[0].action).toBe("noop");
    expect(issueCreatedCount).toBe(1);
  });

  test("posts evidence comment and closes issue upon completion", () => {
    const root = makeTempDir();
    const comments = [];
    const closedIssues = [];

    const mockRunner = vi.fn((cmd, args) => {
      if (args[0] === "issue" && args[1] === "create") {
        return `https://github.com/moasq/agentic-ship/issues/301`;
      }
      if (args[0] === "issue" && args[1] === "comment") {
        comments.push({ num: args[2], body: args[4] });
        return "";
      }
      if (args[0] === "issue" && args[1] === "close") {
        closedIssues.push(args[2]);
        return "";
      }
      return "";
    });

    const mirror = createGitHubWorkMirror(root, { runner: mockRunner });

    // 1. Initial ready state
    mirror.sync({
      schemaVersion: 1,
      items: [
        {
          id: "task-verify",
          role: "quality-engineer",
          summary: "Run e2e verification",
          status: "in_progress",
          acceptanceCriteria: ["Tests green"],
        },
      ],
    });

    // 2. Transition to done with gate evidence
    mirror.sync({
      schemaVersion: 1,
      items: [
        {
          id: "task-verify",
          role: "quality-engineer",
          summary: "Run e2e verification",
          status: "done",
          evidence: ["npm test: 28/28 test suites passed", "pnpm verify: all 6 gates green"],
          acceptanceCriteria: ["Tests green"],
        },
      ],
    });

    expect(closedIssues).toContain("301");
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toContain("### ✅ Work Item Completed");
    expect(comments[0].body).toContain("28/28 test suites passed");
  });

  test("redacts secrets and credentials before syncing to GitHub", () => {
    const root = makeTempDir();
    let issueBody = "";

    const mockRunner = vi.fn((cmd, args) => {
      if (args[0] === "issue" && args[1] === "create") {
        issueBody = args[args.indexOf("--body") + 1];
        return `https://github.com/moasq/agentic-ship/issues/401`;
      }
      return "";
    });

    const mirror = createGitHubWorkMirror(root, { runner: mockRunner });

    mirror.sync({
      schemaVersion: 1,
      items: [
        {
          id: "secret-task",
          role: "backend-builder",
          summary: "Setup stripe webhook with sk_live_secret123456789",
          status: "ready",
          acceptanceCriteria: ["Verified with whsec_testsecretkey9999"],
        },
      ],
    });

    expect(issueBody).not.toContain("sk_live_secret123456789");
    expect(issueBody).not.toContain("whsec_testsecretkey9999");
    expect(issueBody).toContain("[REDACTED_CREDENTIAL]");
  });

  test("gracefully handles gh CLI execution errors without crashing local queue", () => {
    const root = makeTempDir();
    const failingRunner = vi.fn(() => {
      throw new Error("gh: command not found");
    });

    const mirror = createGitHubWorkMirror(root, { runner: failingRunner });

    const result = mirror.sync({
      schemaVersion: 1,
      items: [{ id: "task-fail", role: "backend-builder", summary: "Task", status: "ready" }],
    });

    expect(result.ok).toBe(true);
    expect(result.items[0].action).toBe("error");
    expect(result.items[0].error).toContain("gh: command not found");
  });
});
