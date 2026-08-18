import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

const SECRET_SHAPE =
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+|\bwhsec_[A-Za-z0-9]+|\bphx_[A-Za-z0-9]+|\bre_[A-Za-z0-9]{16,}|\b(?:api[_-]?key|secret|token|password)\s*[=:]\s*\S+/i;

const STATUS_TO_LABEL = {
  ready: "status:ready",
  in_progress: "status:in-progress",
  input_required: "status:input-required",
  blocked: "status:blocked",
  done: "status:done",
};

const STATUS_TO_PROJECT_COLUMN = {
  ready: "Todo",
  in_progress: "In Progress",
  input_required: "Blocked",
  blocked: "Blocked",
  done: "Done",
};

function sanitizeText(text) {
  if (!text || typeof text !== "string") return "";
  if (SECRET_SHAPE.test(text)) {
    return text.replace(SECRET_SHAPE, "[REDACTED_CREDENTIAL]");
  }
  return text;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
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

export function createGitHubWorkMirror(root, options = {}) {
  const runner = options.runner ?? execFileSync;
  const stateDirectory = join(root, ".agent-state");
  const mirrorFile = join(stateDirectory, "github-mirror.json");

  const loadMirror = () => {
    if (!existsSync(mirrorFile)) {
      return { schemaVersion: 1, items: {}, lastSyncedAt: null };
    }
    const data = readJson(mirrorFile);
    return data && typeof data === "object" ? data : { schemaVersion: 1, items: {}, lastSyncedAt: null };
  };

  const saveMirror = (data) => {
    atomicJson(mirrorFile, data);
  };

  const runGh = (args, input = undefined) => {
    try {
      return runner("gh", args, {
        cwd: root,
        encoding: "utf8",
        input,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    } catch (error) {
      const message = error?.stderr?.toString() || error?.message || "gh CLI execution failed";
      throw new Error(`GitHub CLI error: ${message}`);
    }
  };

  const checkGhAuth = () => {
    try {
      runGh(["auth", "status"]);
      return true;
    } catch {
      return false;
    }
  };

  const mirrorItem = (item, mirrorData, projectOptions = {}) => {
    const itemId = item.id;
    const existing = mirrorData.items[itemId];

    const title = sanitizeText(`[${item.role}] ${item.summary}`);
    const bodyLines = [
      `### Work Item: \`${item.id}\``,
      `**Role:** \`${item.role}\``,
      `**Status:** \`${item.status}\``,
      "",
      "#### Acceptance Criteria:",
      ...(item.acceptanceCriteria || []).map((ac) => `- [${item.status === "done" ? "x" : " "}] ${sanitizeText(ac)}`),
      "",
      item.dependsOn?.length ? `**Depends On:** ${item.dependsOn.map((d) => `\`${d}\``).join(", ")}` : "",
    ].filter(Boolean);

    const body = bodyLines.join("\n");
    const labels = ["agentic-work", `role:${item.role}`, STATUS_TO_LABEL[item.status] || "status:ready"];

    if (!existing) {
      // 1. Create Issue
      const issueUrl = runGh([
        "issue",
        "create",
        "--title",
        title,
        "--body",
        body,
        "--label",
        labels.join(","),
      ]);

      const issueNumberMatch = issueUrl.match(/\/issues\/(\d+)$/);
      const issueNumber = issueNumberMatch ? Number(issueNumberMatch[1]) : null;

      mirrorData.items[itemId] = {
        issueNumber,
        issueUrl,
        lastStatus: item.status,
        lastCommentedStatus: null,
        lastEvidence: [],
      };

      // Optional Project Item addition
      if (projectOptions.projectNumber && issueUrl) {
        try {
          runGh(["project", "item-add", String(projectOptions.projectNumber), "--url", issueUrl]);
        } catch {
          // Non-blocking project addition
        }
      }

      return { action: "created", issueNumber, issueUrl };
    }

    // 2. Update existing issue if status changed or completion evidence available
    const issueNumStr = String(existing.issueNumber);
    let updated = false;

    if (existing.lastStatus !== item.status) {
      try {
        runGh([
          "issue",
          "edit",
          issueNumStr,
          "--title",
          title,
          "--body",
          body,
        ]);
        updated = true;
      } catch {
        // Non-blocking edit error
      }
    }

    // Status transition comments
    if (item.status === "done" && existing.lastCommentedStatus !== "done") {
      const evidenceLines = (item.evidence || []).map((e) => `- ${sanitizeText(e)}`).join("\n");
      const commentBody = [
        "### ✅ Work Item Completed",
        evidenceLines.length ? `**Gate Evidence:**\n${evidenceLines}` : "**Completed successfully**",
      ].join("\n\n");

      try {
        runGh(["issue", "comment", issueNumStr, "--body", commentBody]);
        runGh(["issue", "close", issueNumStr]);
        existing.lastCommentedStatus = "done";
        updated = true;
      } catch {
        // Continue
      }
    } else if (item.status === "input_required" && existing.lastCommentedStatus !== "input_required") {
      const commentBody = `### ⏸️ Human Action Required\n**Reason:** ${sanitizeText(item.reason || "Action pending")}`;
      try {
        runGh(["issue", "comment", issueNumStr, "--body", commentBody]);
        existing.lastCommentedStatus = "input_required";
        updated = true;
      } catch {
        // Continue
      }
    } else if (item.status === "blocked" && existing.lastCommentedStatus !== "blocked") {
      const commentBody = `### 🚫 Blocked\n**Reason:** ${sanitizeText(item.reason || "Dependency blocked")}`;
      try {
        runGh(["issue", "comment", issueNumStr, "--body", commentBody]);
        existing.lastCommentedStatus = "blocked";
        updated = true;
      } catch {
        // Continue
      }
    }

    existing.lastStatus = item.status;
    return { action: updated ? "updated" : "noop", issueNumber: existing.issueNumber, issueUrl: existing.issueUrl };
  };

  const sync = (workState, projectOptions = {}) => {
    if (!workState || !Array.isArray(workState.items)) {
      return { ok: false, error: "Invalid work state" };
    }

    const mirrorData = loadMirror();
    const results = [];

    for (const item of workState.items) {
      try {
        const res = mirrorItem(item, mirrorData, projectOptions);
        results.push({ id: item.id, ...res });
      } catch (error) {
        results.push({ id: item.id, action: "error", error: error.message });
      }
    }

    mirrorData.lastSyncedAt = new Date().toISOString();
    saveMirror(mirrorData);

    return {
      ok: true,
      items: results,
      total: workState.items.length,
      syncedAt: mirrorData.lastSyncedAt,
    };
  };

  return {
    sync,
    loadMirror,
    checkGhAuth,
    mirrorFile,
  };
}
