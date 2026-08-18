import { closeSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { WORK_ROLES } from "./work-state.mjs";

const STATUS_LABEL = { ready: "status:ready", in_progress: "status:in-progress", input_required: "status:input-required", blocked: "status:blocked", done: "status:done" };
const PROJECT_STATUS = { ready: "Todo", in_progress: "In Progress", input_required: "Blocked", blocked: "Blocked", done: "Done" };
const LABELS = [
  { name: "agentic-work", color: "1d76db", description: "Mirrored from the Agentic Ship work queue" },
  ...WORK_ROLES.map((role) => ({ name: `role:${role}`, color: "5319e7", description: `Queue owner: ${role}` })),
  ...Object.values(STATUS_LABEL).map((name) => ({ name, color: "bfdadc", description: "Queue status" })),
];
const SENSITIVE = [
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_-]+/gi,
  /\b(?:whsec|phx|polar)_[A-Za-z0-9_-]+/gi,
  /\bre_[A-Za-z0-9_-]{16,}/gi,
  /\bgh[opusr]_[A-Za-z0-9_-]+/gi,
  /\bgithub_pat_[A-Za-z0-9_]+/gi,
  /\b(?:api[_-]?key|secret|token|password|authorization[_-]?code)\s*[=:]\s*[^\s,;]+/gi,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:\+?\d[\d(). -]{7,}\d)\b/g,
  /\b(?:\d[ -]*?){13,19}\b/g,
];
const marker = (id) => `<!-- agentic-work-item:${id} -->`;
const isOwnedLabel = (name) => name === "agentic-work" || name.startsWith("role:") || name.startsWith("status:");

function sanitize(value) {
  let text = typeof value === "string" ? value : "";
  for (const pattern of SENSITIVE) text = text.replace(pattern, "[REDACTED]");
  return text;
}

function readJson(file, fallback = null) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return fallback; }
}

function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return null;
  }
}

function atomicJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
}

function renderIssue(item) {
  const criteria = (item.acceptanceCriteria ?? []).map((text) => `- [${item.status === "done" ? "x" : " "}] ${sanitize(text)}`);
  const dependencies = item.dependsOn?.length ? [`Depends on: ${item.dependsOn.map((id) => `\`${id}\``).join(", ")}`] : [];
  return {
    title: sanitize(`[${item.role}] ${item.summary}`),
    body: [marker(item.id), `Work item: \`${item.id}\``, `Role: \`${item.role}\``, `Status: \`${item.status}\``, "", "### Acceptance criteria", ...criteria, ...dependencies, "", "This issue mirrors the local queue. Update the queue, then run the mirror again."].join("\n"),
  };
}

function renderEvent(item) {
  let content;
  if (item.status === "done") {
    content = ["### Work item completed", "", ...(item.evidence?.length ? ["Gate evidence:", ...item.evidence.map((entry) => `- ${sanitize(entry)}`)] : ["No gate evidence was recorded."])].join("\n");
  } else if (item.status === "input_required") {
    const id = sanitize(item.humanAction?.id || "unknown-action");
    content = ["### Human action required", "", `Reason: ${sanitize(item.humanAction?.reason || "A person must complete the recorded action.")}`, `Action ID: \`${id}\``, `Resume: \`pnpm connect resume ${id} --json\``].join("\n");
  } else if (item.status === "blocked") {
    content = ["### Work item blocked", "", `Reason: ${sanitize(item.blockReason || "The queue records this item as blocked.")}`].join("\n");
  } else return null;
  const digest = createHash("sha256").update(`${item.updatedAt ?? ""}\n${content}`).digest("hex").slice(0, 16);
  return `<!-- agentic-work-event:${item.id}:${item.status}:${digest} -->\n${content}`;
}

function processIsAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code !== "ESRCH"; }
}

export function createGitHubWorkMirror(root, options = {}) {
  const runner = options.runner ?? execFileSync;
  const clock = options.clock ?? Date.now;
  const isProcessAlive = options.isProcessAlive ?? processIsAlive;
  const stateDirectory = join(root, ".agent-state");
  const mirrorFile = join(stateDirectory, "github-mirror.json");
  const lockFile = join(stateDirectory, "github-mirror.lock");
  const recoveryLockFile = join(stateDirectory, "github-mirror.recovery.lock");

  const runGh = (args) => {
    try {
      const result = runner("gh", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      return typeof result === "string" ? result.trim() : "";
    } catch (error) {
      throw new Error(`GitHub CLI error: ${sanitize(error?.stderr?.toString().trim() || error?.message || "execution failed")}`);
    }
  };

  const loadMirror = () => {
    const data = readJson(mirrorFile);
    return data?.schemaVersion === 1 && data.items && typeof data.items === "object" ? data : { schemaVersion: 1, items: {}, lastSyncedAt: null };
  };

  const tryCreateLock = (file) => {
    let descriptor;
    try {
      descriptor = openSync(file, "wx", 0o600);
    } catch (error) {
      if (error?.code === "EEXIST") return null;
      throw error;
    }
    const token = randomUUID();
    try {
      writeFileSync(descriptor, JSON.stringify({ schemaVersion: 1, token, pid: process.pid, createdAt: clock() }));
      return { descriptor, file, token };
    } catch (error) {
      closeSync(descriptor);
      try { unlinkSync(file); } catch { /* A partial lock ages out safely if cleanup fails. */ }
      throw error;
    }
  };

  const releaseLock = (lock) => {
    closeSync(lock.descriptor);
    if (readJson(lock.file)?.token === lock.token) unlinkSync(lock.file);
  };

  const inspectLock = (file) => {
    try {
      const stats = statSync(file);
      const raw = readFileSync(file, "utf8");
      const owner = parseJson(raw, null);
      const validOwner = owner?.schemaVersion === 1 && typeof owner.token === "string" && Number.isInteger(owner.pid) && owner.pid > 0;
      const stale = validOwner ? !isProcessAlive(owner.pid) : clock() - stats.mtimeMs > (options.staleLockMs ?? 30_000);
      return { exists: true, raw, mtimeMs: stats.mtimeMs, stale };
    } catch (error) {
      if (error?.code === "ENOENT") return { exists: false, stale: false };
      throw error;
    }
  };

  const removeIfStillStale = (file, snapshot) => {
    const latest = inspectLock(file);
    if (!latest.exists || !latest.stale || latest.raw !== snapshot.raw || latest.mtimeMs !== snapshot.mtimeMs) return false;
    try { unlinkSync(file); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; }
  };

  const tryRecoverLock = () => {
    let recovery = tryCreateLock(recoveryLockFile);
    if (!recovery) {
      const snapshot = inspectLock(recoveryLockFile);
      if (snapshot.exists && snapshot.stale) {
        removeIfStillStale(recoveryLockFile, snapshot);
        recovery = tryCreateLock(recoveryLockFile);
      }
    }
    if (!recovery) return false;
    try {
      const snapshot = inspectLock(lockFile);
      return snapshot.exists && snapshot.stale && removeIfStillStale(lockFile, snapshot);
    } finally {
      releaseLock(recovery);
    }
  };

  const acquireLock = () => {
    mkdirSync(stateDirectory, { recursive: true });
    const lock = tryCreateLock(lockFile);
    if (lock) return lock;
    if (!tryRecoverLock()) return null;
    return tryCreateLock(lockFile);
  };

  const issueList = () => parseJson(runGh(["issue", "list", "--state", "all", "--label", "agentic-work", "--limit", "1000", "--json", "number,url,title,body,state,labels"]), []);
  const issueView = (number) => parseJson(runGh(["issue", "view", String(number), "--json", "number,url,title,body,state,labels,comments"]), null);

  const reconcileIssue = (item, cached, remoteIssues) => {
    let issue = null;
    if (cached?.issueNumber) {
      try { issue = issueView(cached.issueNumber); } catch { issue = null; }
    }
    issue ??= remoteIssues.find((candidate) => candidate.body?.includes(marker(item.id))) ?? null;
    const rendered = renderIssue(item);
    const desired = ["agentic-work", `role:${item.role}`, STATUS_LABEL[item.status]];
    let action = "noop";
    if (!issue) {
      const url = runGh(["issue", "create", "--title", rendered.title, "--body", rendered.body, "--label", desired.join(",")]);
      const match = url.match(/\/issues\/(\d+)(?:\?.*)?$/);
      if (!match) throw new Error("GitHub did not return an issue URL");
      issue = { number: Number(match[1]), url, title: rendered.title, body: rendered.body, state: "OPEN", labels: desired.map((name) => ({ name })), comments: [] };
      remoteIssues.push(issue);
      action = "created";
    } else if (!issue.comments) {
      issue = issueView(issue.number);
      if (!issue) throw new Error("The mapped GitHub issue could not be read");
    }

    const current = (issue.labels ?? []).map((label) => typeof label === "string" ? label : label.name);
    const next = [...new Set([...current.filter((name) => !isOwnedLabel(name)), ...desired])];
    const labelsChanged = current.slice().sort().join("|") !== next.slice().sort().join("|");
    if (issue.title !== rendered.title || issue.body !== rendered.body || labelsChanged) {
      const args = ["issue", "edit", String(issue.number), "--title", rendered.title, "--body", rendered.body];
      const remove = current.filter((name) => isOwnedLabel(name) && !desired.includes(name));
      const add = desired.filter((name) => !current.includes(name));
      if (remove.length) args.push("--remove-label", remove.join(","));
      if (add.length) args.push("--add-label", add.join(","));
      runGh(args);
      action = action === "created" ? action : "updated";
    }
    if (item.status !== "done" && issue.state === "CLOSED") { runGh(["issue", "reopen", String(issue.number)]); action = "updated"; }

    const event = renderEvent(item);
    if (event) {
      if (!(issue.comments ?? []).some((comment) => comment.body === event)) {
        runGh(["issue", "comment", String(issue.number), "--body", event]);
        issue.comments = [...(issue.comments ?? []), { body: event }];
        if (action !== "created") action = "updated";
      }
    }
    if (item.status === "done" && issue.state !== "CLOSED") { runGh(["issue", "close", String(issue.number)]); if (action !== "created") action = "updated"; }
    return { action, issueNumber: issue.number, issueUrl: issue.url, record: { issueNumber: issue.number, issueUrl: issue.url } };
  };

  const syncProject = (item, issue, options, record) => {
    if (!options.projectNumber) return record;
    const owner = options.projectOwner || parseJson(runGh(["repo", "view", "--json", "owner"]), {})?.owner?.login;
    if (!owner) throw new Error("GitHub Project owner could not be resolved");
    const project = parseJson(runGh(["project", "view", String(options.projectNumber), "--owner", owner, "--format", "json"]), null);
    const fields = parseJson(runGh(["project", "field-list", String(options.projectNumber), "--owner", owner, "--format", "json"]), {});
    const statusField = (fields.fields ?? []).find((field) => field.name === "Status");
    const statusOption = statusField?.options?.find((entry) => entry.name === PROJECT_STATUS[item.status]);
    if (!project?.id || !statusField?.id || !statusOption?.id) throw new Error(`GitHub Project is missing the Status option ${PROJECT_STATUS[item.status]}`);
    const items = parseJson(runGh(["project", "item-list", String(options.projectNumber), "--owner", owner, "--limit", "1000", "--format", "json"]), {});
    let projectItem = (items.items ?? []).find((entry) => canonicalUrl(entry.content?.url) === canonicalUrl(issue.issueUrl));
    if (!projectItem) projectItem = parseJson(runGh(["project", "item-add", String(options.projectNumber), "--owner", owner, "--url", issue.issueUrl, "--format", "json"]), null);
    if (!projectItem?.id) throw new Error("GitHub Project item could not be resolved");
    if (projectItem.status !== PROJECT_STATUS[item.status]) {
      runGh(["project", "item-edit", "--id", projectItem.id, "--project-id", project.id, "--field-id", statusField.id, "--single-select-option-id", statusOption.id]);
    }
    return { ...record, projectOwner: owner, projectNumber: Number(options.projectNumber), projectId: project.id, projectItemId: projectItem.id, projectStatusFieldId: statusField.id, projectStatusOptionId: statusOption.id };
  };

  const sync = (workState, projectOptions = {}) => {
    if (!workState || !Array.isArray(workState.items)) return { ok: false, status: "invalid", error: "Invalid work state" };
    const lock = acquireLock();
    if (!lock) return { ok: false, status: "busy", error: "Another GitHub mirror sync is running", items: [], total: workState.items.length };
    try {
      try { runGh(["auth", "status"]); } catch (error) { return { ok: false, status: "unavailable", error: error.message, items: [], total: workState.items.length }; }
      const mirror = loadMirror();
      let remoteIssues;
      try {
        for (const label of LABELS) runGh(["label", "create", label.name, "--color", label.color, "--description", label.description, "--force"]);
        remoteIssues = issueList();
      } catch (error) {
        return { ok: false, status: "unavailable", error: error.message, items: [], total: workState.items.length };
      }
      const results = [];
      for (const item of workState.items) {
        try {
          const issue = reconcileIssue(item, mirror.items[item.id], remoteIssues);
          let record = issue.record;
          let projectError = null;
          try { record = syncProject(item, issue, projectOptions, record); } catch (error) { projectError = error.message; }
          mirror.items[item.id] = record;
          results.push({ id: item.id, action: issue.action, issueNumber: issue.issueNumber, issueUrl: issue.issueUrl, projectError });
        } catch (error) { results.push({ id: item.id, action: "error", error: error.message }); }
      }
      mirror.lastSyncedAt = new Date(clock()).toISOString();
      atomicJson(mirrorFile, mirror);
      const ok = results.every((result) => result.action !== "error" && !result.projectError);
      return { ok, status: ok ? "synced" : "partial", items: results, total: workState.items.length, syncedAt: mirror.lastSyncedAt };
    } finally { releaseLock(lock); }
  };

  return { sync, loadMirror, checkGhAuth: () => { try { runGh(["auth", "status"]); return true; } catch { return false; } }, mirrorFile };
}
