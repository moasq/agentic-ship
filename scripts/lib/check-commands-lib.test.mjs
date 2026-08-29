// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  PNPM_BUILTINS,
  DOWNSTREAM_ONLY,
  extractPnpmRefs,
  matchesScript,
  isDownstream,
  classifyRefs,
  unreferencedScripts,
  reconcile,
} from "./check-commands-lib.mjs";

describe("extractPnpmRefs", () => {
  test("finds a plain command with its line number", () => {
    const refs = extractPnpmRefs("intro\nrun `pnpm verify` before done\n");
    expect(refs).toEqual([{ name: "verify", line: 2 }]);
  });

  test("captures colon and hyphen names", () => {
    const refs = extractPnpmRefs("`pnpm check:mcp` and `pnpm sync:agents`").map((r) => r.name);
    expect(refs).toEqual(["check:mcp", "sync:agents"]);
  });

  test("drops pnpm's own subcommands", () => {
    const refs = extractPnpmRefs("pnpm install then pnpm add x then pnpm dlx y then pnpm audit");
    expect(refs).toEqual([]);
  });

  test("handles --silent, -s, and run prefixes", () => {
    const names = extractPnpmRefs(
      "`pnpm --silent health` `pnpm -s heal` `pnpm run preflight`",
    ).map((r) => r.name);
    expect(names).toEqual(["health", "heal", "preflight"]);
  });

  test("ignores 'pnpm' embedded in a path or word — the boundary rule", () => {
    // "Node/pnpm versions" is prose about the tool, not a `pnpm versions` command;
    // "pnpm-lock.yaml" is a filename. Neither may be read as a command.
    expect(extractPnpmRefs("supported Node/pnpm versions and pins")).toEqual([]);
    expect(extractPnpmRefs("delete pnpm-lock.yaml to reset")).toEqual([]);
  });

  test("a wildcard permission yields a trailing-colon remnant", () => {
    const names = extractPnpmRefs('"Bash(pnpm audit:*)" "Bash(pnpm agent:work:*)"').map((r) => r.name);
    expect(names).toEqual(["audit:", "agent:work:"]);
  });

  test("empty or non-string input is safe", () => {
    expect(extractPnpmRefs("")).toEqual([]);
    expect(extractPnpmRefs(undefined)).toEqual([]);
  });
});

describe("matchesScript", () => {
  const scripts = new Set(["verify", "check:mcp", "agent:work", "audit:supply-chain", "component:list"]);

  test("exact name matches", () => {
    expect(matchesScript("verify", scripts)).toBe(true);
    expect(matchesScript("check:mcp", scripts)).toBe(true);
  });

  test("an unknown name does not match", () => {
    expect(matchesScript("nonexistent", scripts)).toBe(false);
  });

  test("a wildcard remnant resolves to its base script", () => {
    // `pnpm agent:work:*` → "agent:work:" → base "agent:work" exists.
    expect(matchesScript("agent:work:", scripts)).toBe(true);
  });

  test("a wildcard remnant resolves to a script nested under it", () => {
    // `pnpm audit:*` → "audit:" → "audit:supply-chain" starts with it.
    expect(matchesScript("audit:", scripts)).toBe(true);
  });

  test("a wildcard remnant with no base and no nested script does not match", () => {
    expect(matchesScript("ghost:", scripts)).toBe(false);
  });
});

describe("downstream escape hatch", () => {
  test("the four product-workspace commands are excused", () => {
    for (const name of ["dev", "build", "start", "test:e2e", "build:vinext", "build:cloudflare", "deploy:cloudflare", "preview:cloudflare"]) {
      expect(isDownstream(name)).toBe(true);
    }
    expect(DOWNSTREAM_ONLY.map((d) => d.name).sort()).toEqual([
      "build",
      "build:cloudflare",
      "build:vinext",
      "deploy:cloudflare",
      "dev",
      "preview:cloudflare",
      "start",
      "test:e2e",
    ]);
  });

  test("a non-downstream unknown command is not excused", () => {
    expect(isDownstream("deploy:prod")).toBe(false);
  });

  test("builtins list excludes lifecycle shortcuts that run a script", () => {
    // `pnpm test` / `pnpm start` run package scripts, so they must be validated.
    expect(PNPM_BUILTINS.has("test")).toBe(false);
    expect(PNPM_BUILTINS.has("start")).toBe(false);
    expect(PNPM_BUILTINS.has("install")).toBe(true);
  });
});

describe("classifyRefs", () => {
  const scripts = new Set(["verify", "test", "check:ui"]);

  test("real scripts and downstream names are ok; unknowns are missing", () => {
    const refs = [
      { name: "verify", line: 1 },
      { name: "build", line: 2 }, // downstream
      { name: "bogus", line: 3 }, // missing
      { name: "test", line: 4 }, // real (not a builtin)
    ];
    const { ok, missing } = classifyRefs(refs, scripts);
    expect(ok.map((r) => r.name).sort()).toEqual(["build", "test", "verify"]);
    expect(missing.map((r) => r.name)).toEqual(["bogus"]);
  });

  test("catches drift: a documented command absent from package.json", () => {
    const refs = extractPnpmRefs("run `pnpm nonexistent-xyz` to break the gate");
    const { missing } = classifyRefs(refs, scripts);
    expect(missing).toEqual([{ name: "nonexistent-xyz", line: 1 }]);
  });
});

describe("unreferencedScripts", () => {
  test("reports scripts never mentioned, honoring implicit skips", () => {
    const scripts = new Set(["verify", "postinstall", "orphan"]);
    const out = unreferencedScripts(scripts, ["verify"], { implicit: ["postinstall"] });
    expect(out).toEqual(["orphan"]);
  });

  test("a wildcard remnant marks its base and nested scripts as referenced", () => {
    const scripts = new Set(["agent:work", "audit:supply-chain"]);
    const out = unreferencedScripts(scripts, ["agent:work:", "audit:"]);
    expect(out).toEqual([]);
  });
});

describe("reconcile", () => {
  test("identical sets reconcile cleanly", () => {
    const r = reconcile(["a", "b", "c"], ["c", "b", "a"]);
    expect(r.ok).toBe(true);
    expect(r.countMismatch).toBe(false);
  });

  test("names present on disk but not in the lock are reported", () => {
    const r = reconcile(["a", "b"], ["a", "b", "c"]);
    expect(r.ok).toBe(false);
    expect(r.missingFromLock).toEqual(["c"]);
    expect(r.countMismatch).toBe(true);
  });

  test("names in the lock but missing on disk are reported", () => {
    const r = reconcile(["a", "b", "c"], ["a", "b"]);
    expect(r.ok).toBe(false);
    expect(r.missingFromDisk).toEqual(["c"]);
  });

  test("same count but different members is still a mismatch", () => {
    const r = reconcile(["a", "b"], ["a", "z"]);
    expect(r.ok).toBe(false);
    expect(r.countMismatch).toBe(false);
    expect(r.missingFromLock).toEqual(["z"]);
    expect(r.missingFromDisk).toEqual(["b"]);
  });
});
