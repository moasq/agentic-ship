// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createGitHubWorkMirror } from "./work-state-github.mjs";

const roots = [];
const makeRoot = () => { const root = mkdtempSync(join(tmpdir(), "agent-gh-mirror-")); roots.push(root); return root; };
const valueAfter = (args, flag) => args[args.indexOf(flag) + 1];

function fakeGitHub() {
  const state = { calls: [], labels: new Set(), issues: new Map(), nextIssue: 101, failOnce: new Set(), failAfter: new Set(), projectItems: new Map() };
  const failKey = (args) => args.slice(0, 2).join(" ");
  const runner = (_command, args) => {
    state.calls.push(args);
    const key = failKey(args);
    if (state.failOnce.delete(key)) throw new Error(`forced ${key} failure`);
    if (key === "auth status") return "authenticated";
    if (key === "label create") { state.labels.add(args[2]); return ""; }
    if (key === "issue list") return JSON.stringify([...state.issues.values()].map(({ comments: _comments, ...issue }) => issue));
    if (key === "issue view") {
      const issue = state.issues.get(Number(args[2]));
      if (!issue) throw new Error("issue not found");
      return JSON.stringify(issue);
    }
    if (key === "issue create") {
      const number = state.nextIssue++;
      const url = `https://github.com/example/repo/issues/${number}`;
      state.issues.set(number, {
        number,
        url,
        title: valueAfter(args, "--title"),
        body: valueAfter(args, "--body"),
        state: "OPEN",
        labels: valueAfter(args, "--label").split(",").map((name) => ({ name })),
        comments: [],
      });
      if (state.failAfter.delete(key)) throw new Error(`forced ${key} response failure`);
      return url;
    }
    if (key === "issue edit") {
      const issue = state.issues.get(Number(args[2]));
      issue.title = valueAfter(args, "--title");
      issue.body = valueAfter(args, "--body");
      const remove = args.includes("--remove-label") ? valueAfter(args, "--remove-label").split(",") : [];
      const add = args.includes("--add-label") ? valueAfter(args, "--add-label").split(",") : [];
      const labels = issue.labels.map(({ name }) => name).filter((name) => !remove.includes(name));
      issue.labels = [...new Set([...labels, ...add])].map((name) => ({ name }));
      return "";
    }
    if (key === "issue comment") { state.issues.get(Number(args[2])).comments.push({ body: valueAfter(args, "--body") }); return ""; }
    if (key === "issue close") { state.issues.get(Number(args[2])).state = "CLOSED"; return ""; }
    if (key === "issue reopen") { state.issues.get(Number(args[2])).state = "OPEN"; return ""; }
    if (key === "repo view") return JSON.stringify({ owner: { login: "example" } });
    if (key === "project view") return JSON.stringify({ id: "PVT_project" });
    if (key === "project field-list") return JSON.stringify({ fields: [{ id: "PVTF_status", name: "Status", options: [{ id: "todo", name: "Todo" }, { id: "progress", name: "In Progress" }, { id: "blocked", name: "Blocked" }, { id: "done", name: "Done" }] }] });
    if (key === "project item-list") return JSON.stringify({ items: [...state.projectItems.values()] });
    if (key === "project item-add") {
      const issueNumber = Number(valueAfter(args, "--url").split("/").at(-1));
      const item = { id: `PVTI_${issueNumber}`, content: { number: issueNumber, url: valueAfter(args, "--url") } };
      state.projectItems.set(issueNumber, item);
      return JSON.stringify(item);
    }
    if (key === "project item-edit") {
      const item = [...state.projectItems.values()].find((entry) => entry.id === valueAfter(args, "--id"));
      const option = valueAfter(args, "--single-select-option-id");
      item.status = { todo: "Todo", progress: "In Progress", blocked: "Blocked", done: "Done" }[option];
      return "";
    }
    throw new Error(`unexpected command: ${args.join(" ")}`);
  };
  return { runner, state };
}

function item(overrides = {}) {
  return {
    id: "verify-mirror",
    role: "quality-engineer",
    summary: "Verify the GitHub mirror",
    status: "ready",
    acceptanceCriteria: ["The mirror converges"],
    dependsOn: [],
    evidence: [],
    humanAction: null,
    blockReason: null,
    ...overrides,
  };
}

const workState = (...items) => ({ schemaVersion: 1, items });

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("GitHub work queue mirror", () => {
  test("provisions labels, creates one issue, and is idempotent without a Project", () => {
    const root = makeRoot();
    const github = fakeGitHub();
    const mirror = createGitHubWorkMirror(root, { runner: github.runner, clock: () => Date.parse("2026-08-18T00:00:00Z") });

    expect(mirror.sync(workState(item()))).toMatchObject({ ok: true, status: "synced", items: [{ action: "created", issueNumber: 101 }] });
    expect(mirror.sync(workState(item()))).toMatchObject({ ok: true, items: [{ action: "noop", issueNumber: 101 }] });
    expect(github.state.issues.size).toBe(1);
    expect(github.state.labels.has("agentic-work")).toBe(true);
    expect(github.state.labels.has("role:quality-engineer")).toBe(true);
    expect(github.state.labels.has("status:done")).toBe(true);
    expect(github.state.calls.some((args) => args[0] === "project")).toBe(false);
    if (process.platform !== "win32") expect(statSync(mirror.mirrorFile).mode & 0o777).toBe(0o600);
  });

  test("recovers after comment success and close failure without duplicating either", () => {
    const root = makeRoot();
    const github = fakeGitHub();
    github.state.failOnce.add("issue close");
    const mirror = createGitHubWorkMirror(root, { runner: github.runner });
    const done = item({ status: "done", evidence: ["pnpm verify passed"] });

    expect(mirror.sync(workState(done))).toMatchObject({ ok: false, status: "partial", items: [{ action: "error" }] });
    expect(github.state.issues.get(101).comments).toHaveLength(1);
    expect(mirror.sync(workState(done))).toMatchObject({ ok: true, items: [{ issueNumber: 101 }] });
    expect(github.state.issues.size).toBe(1);
    expect(github.state.issues.get(101).comments).toHaveLength(1);
    expect(github.state.issues.get(101).state).toBe("CLOSED");
  });

  test("corrects an edited mirror comment from queue evidence only once", () => {
    const root = makeRoot();
    const github = fakeGitHub();
    const mirror = createGitHubWorkMirror(root, { runner: github.runner });
    const done = item({ status: "done", evidence: ["pnpm verify passed"], updatedAt: "2026-08-18T00:00:01Z" });
    mirror.sync(workState(done));
    const remote = github.state.issues.get(101);
    remote.comments[0].body = `${remote.comments[0].body.split("\n")[0]}\nChanged by hand`;

    mirror.sync(workState(done));
    mirror.sync(workState(done));
    expect(remote.comments).toHaveLength(2);
    expect(remote.comments[1].body).toContain("pnpm verify passed");
  });

  test("recovers a lost or corrupt local map from the stable remote marker", () => {
    const root = makeRoot();
    const github = fakeGitHub();
    const mirror = createGitHubWorkMirror(root, { runner: github.runner });
    mirror.sync(workState(item()));
    writeFileSync(mirror.mirrorFile, "not-json", { mode: 0o600 });

    const result = mirror.sync(workState(item()));
    expect(result).toMatchObject({ ok: true, items: [{ action: "noop", issueNumber: 101 }] });
    expect(github.state.issues.size).toBe(1);
    expect(mirror.loadMirror().items["verify-mirror"].issueNumber).toBe(101);
  });

  test("recovers an issue whose create response was lost", () => {
    const root = makeRoot();
    const github = fakeGitHub();
    github.state.failAfter.add("issue create");
    const mirror = createGitHubWorkMirror(root, { runner: github.runner });

    expect(mirror.sync(workState(item()))).toMatchObject({ ok: false, items: [{ action: "error" }] });
    expect(mirror.sync(workState(item()))).toMatchObject({ ok: true, items: [{ action: "noop", issueNumber: 101 }] });
    expect(github.state.issues.size).toBe(1);
  });

  test("restores queue-owned fields and reopening while preserving unrelated labels and comments", () => {
    const root = makeRoot();
    const github = fakeGitHub();
    const mirror = createGitHubWorkMirror(root, { runner: github.runner });
    mirror.sync(workState(item()));
    const remote = github.state.issues.get(101);
    remote.title = "Manual title";
    remote.body = "Manual body";
    remote.state = "CLOSED";
    remote.labels = [{ name: "customer-priority" }, { name: "status:done" }];
    remote.comments.push({ body: "Keep this human comment" });

    expect(mirror.sync(workState(item()))).toMatchObject({ ok: true, items: [{ action: "updated" }] });
    expect(remote.title).toBe("[quality-engineer] Verify the GitHub mirror");
    expect(remote.body).toContain("<!-- agentic-work-item:verify-mirror -->");
    expect(remote.labels.map(({ name }) => name)).toContain("customer-priority");
    expect(remote.labels.map(({ name }) => name)).toContain("status:ready");
    expect(remote.comments).toEqual([{ body: "Keep this human comment" }]);
    expect(remote.state).toBe("OPEN");
  });

  test("publishes safe wait and blocked details from the queue fields", () => {
    const root = makeRoot();
    const github = fakeGitHub();
    const mirror = createGitHubWorkMirror(root, { runner: github.runner });
    mirror.sync(workState(item({ status: "input_required", humanAction: { id: "connect-123", reason: "Approve provider access" } })));
    expect(github.state.issues.get(101).comments[0].body).toContain("Approve provider access");
    expect(github.state.issues.get(101).comments[0].body).toContain("pnpm connect resume connect-123 --json");

    mirror.sync(workState(item({ status: "blocked", blockReason: "The provider probe is unavailable" })));
    expect(github.state.issues.get(101).comments[1].body).toContain("The provider probe is unavailable");
  });

  test("posts one comment for each distinct repeated wait transition", () => {
    const root = makeRoot();
    const github = fakeGitHub();
    const mirror = createGitHubWorkMirror(root, { runner: github.runner });
    const waiting = (updatedAt) => item({ status: "input_required", updatedAt, humanAction: { id: "connect-123", reason: "Approve provider access" } });

    mirror.sync(workState(waiting("2026-08-18T00:00:01Z")));
    mirror.sync(workState(item({ status: "ready", updatedAt: "2026-08-18T00:00:02Z" })));
    mirror.sync(workState(waiting("2026-08-18T00:00:03Z")));
    mirror.sync(workState(waiting("2026-08-18T00:00:03Z")));

    expect(github.state.issues.get(101).comments).toHaveLength(2);
  });

  test("redacts every credential and email before publishing or returning errors", () => {
    const root = makeRoot();
    const github = fakeGitHub();
    const mirror = createGitHubWorkMirror(root, { runner: github.runner });
    const sensitive = item({ summary: "Use sk_live_first, whsec_second, and github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 for owner@example.com or +1 415 555 0132", acceptanceCriteria: ["token=third-secret then api_key=fourth-secret or 4242 4242 4242 4242"] });
    mirror.sync(workState(sensitive));
    const published = JSON.stringify(github.state.calls);
    expect(published).not.toMatch(/sk_live_first|whsec_second|github_pat_|owner@example.com|third-secret|fourth-secret|415 555 0132|4242 4242/);
    expect(published.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(8);
  });

  test("adds an issue to the selected Project with an owner and updates its Status field", () => {
    const root = makeRoot();
    const github = fakeGitHub();
    const mirror = createGitHubWorkMirror(root, { runner: github.runner });

    expect(mirror.sync(workState(item({ status: "in_progress" })), { projectNumber: "7", projectOwner: "example" }).ok).toBe(true);
    const add = github.state.calls.find((args) => args[0] === "project" && args[1] === "item-add");
    const edit = github.state.calls.find((args) => args[0] === "project" && args[1] === "item-edit");
    expect(add).toEqual(expect.arrayContaining(["--owner", "example", "--format", "json"]));
    expect(edit).toEqual(expect.arrayContaining(["--project-id", "PVT_project", "--field-id", "PVTF_status", "--single-select-option-id", "progress"]));
    expect(mirror.loadMirror().items["verify-mirror"]).toMatchObject({ projectOwner: "example", projectId: "PVT_project", projectItemId: "PVTI_101" });
    mirror.sync(workState(item({ status: "in_progress" })), { projectNumber: "7", projectOwner: "example" });
    expect(github.state.calls.filter((args) => args[0] === "project" && args[1] === "item-add")).toHaveLength(1);
    expect(github.state.calls.filter((args) => args[0] === "project" && args[1] === "item-edit")).toHaveLength(1);
  });

  test("does not adopt a Project item for the same issue number in another repository", () => {
    const root = makeRoot();
    const github = fakeGitHub();
    github.state.projectItems.set("wrong", { id: "PVTI_wrong", content: { number: 101, url: "https://github.com/other/repo/issues/101" } });
    const mirror = createGitHubWorkMirror(root, { runner: github.runner });

    expect(mirror.sync(workState(item()), { projectNumber: "7", projectOwner: "example" }).ok).toBe(true);
    expect(github.state.calls.some((args) => args[0] === "project" && args[1] === "item-add")).toBe(true);
    expect(mirror.loadMirror().items["verify-mirror"].projectItemId).toBe("PVTI_101");
  });

  test("keeps the issue mirror usable when the optional Project update fails", () => {
    const root = makeRoot();
    const github = fakeGitHub();
    github.state.failOnce.add("project field-list");
    const mirror = createGitHubWorkMirror(root, { runner: github.runner });

    const first = mirror.sync(workState(item()), { projectNumber: "7", projectOwner: "example" });
    expect(first).toMatchObject({ ok: false, status: "partial", items: [{ action: "created" }] });
    expect(first.items[0].projectError).toContain("forced project field-list failure");
    expect(github.state.issues.size).toBe(1);
    expect(mirror.sync(workState(item()), { projectNumber: "7", projectOwner: "example" }).ok).toBe(true);
    expect(github.state.issues.size).toBe(1);
  });

  test("reports revoked access and a live lock without mutating the queue", () => {
    const root = makeRoot();
    const unavailable = createGitHubWorkMirror(root, { runner: () => { throw new Error("gh: not authenticated"); } });
    expect(unavailable.sync(workState(item()))).toMatchObject({ ok: false, status: "unavailable", total: 1 });

    const github = fakeGitHub();
    const lockDirectory = join(root, ".agent-state");
    mkdirSync(lockDirectory, { recursive: true });
    writeFileSync(join(lockDirectory, "github-mirror.lock"), JSON.stringify({ schemaVersion: 1, token: "live", pid: process.pid, createdAt: Date.now() }), { mode: 0o600 });
    const busy = createGitHubWorkMirror(root, { runner: github.runner });
    expect(busy.sync(workState(item()))).toMatchObject({ ok: false, status: "busy" });
    unlinkSync(join(lockDirectory, "github-mirror.lock"));
  });

  test("recovers a mirror lock whose recorded process is dead", () => {
    const root = makeRoot();
    const lockDirectory = join(root, ".agent-state");
    mkdirSync(lockDirectory, { recursive: true });
    writeFileSync(join(lockDirectory, "github-mirror.lock"), JSON.stringify({ schemaVersion: 1, token: "dead", pid: 424242, createdAt: Date.now() }), { mode: 0o600 });
    const github = fakeGitHub();
    const mirror = createGitHubWorkMirror(root, { runner: github.runner, isProcessAlive: () => false });

    expect(mirror.sync(workState(item()))).toMatchObject({ ok: true, status: "synced" });
    expect(github.state.issues.size).toBe(1);
  });

  test("does not remove a live lock that replaced the stale lock during recovery", () => {
    const root = makeRoot();
    const lockDirectory = join(root, ".agent-state");
    const lockFile = join(lockDirectory, "github-mirror.lock");
    mkdirSync(lockDirectory, { recursive: true });
    writeFileSync(lockFile, JSON.stringify({ schemaVersion: 1, token: "dead", pid: 424242, createdAt: Date.now() }), { mode: 0o600 });
    let replaced = false;
    const mirror = createGitHubWorkMirror(root, {
      runner: fakeGitHub().runner,
      isProcessAlive: (pid) => {
        if (pid === 424242 && !replaced) {
          replaced = true;
          writeFileSync(lockFile, JSON.stringify({ schemaVersion: 1, token: "new-live", pid: process.pid, createdAt: Date.now() }), { mode: 0o600 });
          return false;
        }
        return true;
      },
    });

    expect(mirror.sync(workState(item()))).toMatchObject({ ok: false, status: "busy" });
    expect(JSON.parse(readFileSync(lockFile, "utf8")).token).toBe("new-live");
    unlinkSync(lockFile);
  });
});
