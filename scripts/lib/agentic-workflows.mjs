import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const AGENTIC_WORKFLOW_IDS = [
  "issue-clarification",
  "ci-diagnosis",
  "documentation-drift",
  "upstream-review",
  "release-notes",
];
export const AGENTIC_WORKFLOW_ENGINES = ["claude", "codex"];

function read(root, path) {
  return readFileSync(join(root, path), "utf8");
}

export function inspectAgenticWorkflowBundle(root) {
  const errors = [];
  const manifest = read(root, "aw.yml");
  for (const required of [
    ".github/agents/agentic-workflows.md",
    ".github/skills/agentic-workflows",
    ...AGENTIC_WORKFLOW_IDS.map((id) => `.github/workflows/${id}.md`),
  ]) {
    if (!manifest.includes(`- ${required}`)) errors.push(`aw.yml does not include ${required}`);
  }
  if (!existsSync(join(root, ".github", "agents", "agentic-workflows.md"))) errors.push("official gh-aw agent is missing");
  if (!existsSync(join(root, ".github", "skills", "agentic-workflows", "SKILL.md"))) errors.push("official gh-aw skill is missing");

  const engines = new Set();
  for (const id of AGENTIC_WORKFLOW_IDS) {
    const sourcePath = `.github/workflows/${id}.md`;
    const lockPath = `.github/workflows/${id}.lock.yml`;
    if (!existsSync(join(root, sourcePath)) || !existsSync(join(root, lockPath))) {
      errors.push(`${id} needs authored Markdown and an official lock file`);
      continue;
    }
    const source = read(root, sourcePath);
    const engine = source.match(/^engine:\s*([a-z]+)$/m)?.[1];
    if (engine) engines.add(engine);
    if (!source.includes("network: {}")) errors.push(`${id} must deny agent network access`);
    if (!source.includes("AGENTIC_WORKFLOWS_ENABLED")) errors.push(`${id} must be opt-in`);
    if (!/^timeout-minutes:\s*\d+$/m.test(source) || !/^max-ai-credits:\s*\d+$/m.test(source)) {
      errors.push(`${id} needs time and AI-credit budgets`);
    }
    if (/^\s+(?:actions|contents|issues|pull-requests):\s*write\s*$/m.test(source)) {
      errors.push(`${id} grants the agent direct write permission`);
    }
    if (/pull_request_target/.test(source)) errors.push(`${id} uses pull_request_target`);
    if (!/untrusted data/i.test(source)) errors.push(`${id} must define its untrusted-input boundary`);

    const lock = read(root, lockPath);
    const metadataLine = lock.split(/\r?\n/, 1)[0].replace("# gh-aw-metadata: ", "");
    let metadata;
    try {
      metadata = JSON.parse(metadataLine);
    } catch {
      errors.push(`${id} lock metadata is invalid`);
    }
    if (metadata?.strict !== true || metadata?.compiler_version !== "v0.87.10") {
      errors.push(`${id} must be strict output from gh-aw v0.87.10`);
    }
    for (const match of lock.matchAll(/^\s*uses:\s*([^\s]+)@([^\s#]+).*$/gm)) {
      if (!/^[a-f0-9]{40}$/.test(match[2])) errors.push(`${id} has a mutable action reference: ${match[1]}@${match[2]}`);
    }
  }
  for (const engine of AGENTIC_WORKFLOW_ENGINES) {
    if (!engines.has(engine)) errors.push(`starter bundle does not exercise ${engine}`);
  }
  for (const engine of engines) {
    if (!AGENTIC_WORKFLOW_ENGINES.includes(engine)) errors.push(`starter bundle uses undeclared engine ${engine}`);
  }
  return errors;
}
