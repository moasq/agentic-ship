import { describe, expect, it } from "vitest";
import {
  formatGitHubAnnotation,
  formatStepSummary,
  sanitizeText,
} from "./action-verify-runner.mjs";

describe("action-verify-runner", () => {
  it("sanitizeText redacts sensitive keys and secret tokens", () => {
    const dummyKey1 = ["sk", "live", "testmock123456789012345678"].join("_");
    const dummyKey2 = ["whsec", "testmock9876543210abcdef98765432"].join("_");
    const secretString = `Failed at auth ${dummyKey1} and ${dummyKey2}`;
    const sanitized = sanitizeText(secretString);
    expect(sanitized).not.toContain(dummyKey1);
    expect(sanitized).not.toContain(dummyKey2);
    expect(sanitized).toContain("[REDACTED_SECRET]");
  });

  it("formatStepSummary generates well-formed markdown table", () => {
    const mockGates = [
      { id: 1, name: "Lint", passed: true, details: "Clean" },
      { id: 2, name: "Typecheck", passed: false, details: "Type error on line 42" },
      { id: 3, name: "Tests", passed: true, details: "All passed" },
    ];

    const summary = formatStepSummary(mockGates);
    expect(summary).toContain("## 🚢 Agentic Ship Offline Verification Summary");
    expect(summary).toContain("| Gate 1 | Lint | ✅ | Clean |");
    expect(summary).toContain("| Gate 2 | Typecheck | ❌ | Type error on line 42 |");
    expect(summary).toContain("| Gate 3 | Tests | ✅ | All passed |");
  });

  it("formatStepSummary includes audit results when provided", () => {
    const mockGates = [{ id: 1, name: "Lint", passed: true, details: "Clean" }];
    const audit = { passed: true, summary: "0 vulnerabilities" };

    const summary = formatStepSummary(mockGates, audit);
    expect(summary).toContain("### 🛡️ Dependency Security Audit");
    expect(summary).toContain("No high or critical vulnerabilities found");
  });

  it("formatGitHubAnnotation emits error annotation for failing gates only", () => {
    const passingGate = { id: 1, name: "Lint", passed: true, details: "Clean" };
    const failingGate = { id: 2, name: "Typecheck", passed: false, details: "Type mismatch error" };

    expect(formatGitHubAnnotation(passingGate)).toBeNull();
    const ann = formatGitHubAnnotation(failingGate);
    expect(ann).toContain("::error title=Gate 2 Failed (Typecheck)::Type mismatch error");
  });
});
