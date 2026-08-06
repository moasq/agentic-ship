import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";

function projectPath(projectRoot, candidate) {
  const root = resolve(projectRoot);
  const path = resolve(root, candidate);
  const fromRoot = relative(root, path);
  if (fromRoot === ".." || fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(fromRoot)) {
    throw new Error(`Connection probe path escapes the project: ${candidate}`);
  }
  return path;
}

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function envValue(source, key) {
  if (source === null) return null;
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0 || trimmed.slice(0, separator).trim() !== key) continue;
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return null;
}

function probeResult(probe, passed, detail) {
  return {
    id: probe.id,
    label: probe.label,
    required: probe.required,
    passed,
    detail,
  };
}

function homePath(homeDirectory, candidate) {
  const root = resolve(homeDirectory ?? homedir());
  const path = resolve(root, candidate);
  const fromRoot = relative(root, path);
  if (fromRoot === ".." || fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(fromRoot)) {
    throw new Error(`Connection probe path escapes the home directory: ${candidate}`);
  }
  return path;
}

export function runConnectionProbe(probe, { projectRoot, homeDirectory }) {
  if (probe.type === "file_exists") {
    const passed = existsSync(projectPath(projectRoot, probe.path));
    return probeResult(probe, passed, passed ? "detected" : "not detected");
  }

  // Existence only, never contents: CLI pairing files (Stripe, Convex) hold credentials,
  // so the probe may prove the login happened but must never read what it produced.
  if (probe.type === "home_file_exists") {
    const passed = existsSync(homePath(homeDirectory, probe.homePath));
    return probeResult(probe, passed, passed ? "detected" : "not detected");
  }

  if (probe.type === "any_file_exists") {
    const passed = probe.paths.some((path) => existsSync(projectPath(projectRoot, path)));
    return probeResult(probe, passed, passed ? "detected" : "not detected");
  }

  if (probe.type === "file_contains") {
    const source = read(projectPath(projectRoot, probe.file));
    const passed = source !== null && source.includes(probe.text);
    return probeResult(probe, passed, passed ? "expected integration detected" : "expected integration not detected");
  }

  if (probe.type === "env_file_key") {
    const value = envValue(read(projectPath(projectRoot, probe.file)), probe.key);
    const denied = value !== null && (probe.denyPrefixes ?? []).some((prefix) => value.startsWith(prefix));
    const allowed = !probe.allowPrefixes?.length || (value !== null && probe.allowPrefixes.some((prefix) => value.startsWith(prefix)));
    const passed = Boolean(value) && allowed && !denied;
    const detail = denied ? "a forbidden credential class was detected" : passed ? "configured" : "not configured with an allowed value";
    return probeResult(probe, passed, detail);
  }

  if (probe.type === "mcp_server") {
    const source = read(projectPath(projectRoot, ".mcp.json"));
    let passed = false;
    try {
      passed = Boolean(source && JSON.parse(source).mcpServers?.[probe.server]);
    } catch {
      passed = false;
    }
    return probeResult(probe, passed, passed ? "declared in project MCP configuration" : "not declared in project MCP configuration");
  }

  throw new Error(`Unsupported connection probe type: ${probe.type}`);
}

export function runConnectionProbes(probes, context) {
  const results = probes.map((probe) => runConnectionProbe(probe, context));
  return {
    passed: results.every((result) => !result.required || result.passed),
    results,
  };
}
