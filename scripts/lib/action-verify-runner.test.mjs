import { describe, expect, it, vi } from "vitest";
import {
  formatGitHubAnnotation,
  formatStepSummary,
  runVerificationGates,
  sanitizeText,
} from "./action-verify-runner.mjs";

describe("Agentic Ship verification action", () => {
  it("runs the repository's real offline gate", () => {
    const runner = vi.fn(() => ({ status: 0, stdout: "ok", stderr: "" }));
    const result = runVerificationGates({ cwd: "/fixture", runner });

    expect(runner).toHaveBeenCalledOnce();
    expect(runner).toHaveBeenCalledWith(["verify"], "/fixture");
    expect(result.allPassed).toBe(true);
  });

  it("adds the fail-closed supply-chain gate only when requested", () => {
    const runner = vi
      .fn()
      .mockReturnValueOnce({ status: 0, stdout: "", stderr: "" })
      .mockReturnValueOnce({ status: 1, stdout: "advisory", stderr: "" });
    const result = runVerificationGates({ audit: true, runner });

    expect(runner.mock.calls.map(([args]) => args)).toEqual([["verify"], ["audit:supply-chain"]]);
    expect(result.allPassed).toBe(false);
  });

  it("globally redacts current credential shapes", () => {
    const secrets = [
      `sk_${"live"}_${"a".repeat(24)}`,
      `github_${"pat"}_${"A".repeat(40)}`,
      `gh${"p"}_${"B".repeat(30)}`,
    ];
    const sanitized = sanitizeText(secrets.join(" then "));
    for (const secret of secrets) expect(sanitized).not.toContain(secret);
    expect(sanitized.match(/\[REDACTED_SECRET\]/g)).toHaveLength(3);
  });

  it("escapes annotation commands and Markdown cells", () => {
    const gate = { name: "Offline,\nverification", passed: false, details: "bad%\nvalue | more" };
    expect(formatGitHubAnnotation(gate)).toBe(
      "::error title=Offline  verification::bad%25%0Avalue | more",
    );
    expect(formatStepSummary([gate])).toContain("bad% value \\| more");
  });
});
