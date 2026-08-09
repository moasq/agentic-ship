// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (file) => readFileSync(resolve(root, file), "utf8");

describe("portable UI-quality guidance", () => {
  test("README commands exist as package scripts", () => {
    const packageJson = JSON.parse(read("package.json"));
    const readme = read("README.md");
    const required = ["ui:plan", "ui:review", "check:ui", "verify", "verify:full"];

    for (const command of required) {
      expect(packageJson.scripts[command], `${command} package script`).toBeTypeOf("string");
      expect(readme, `${command} README command`).toContain(`pnpm ${command}`);
    }
  });

  test("README deep links point to canonical UI artifacts", () => {
    const readme = read("README.md");
    const files = [
      ".agents/skills/visual-direction/SKILL.md",
      ".agents/skills/visual-direction/references/anti-slop-rubric.md",
      ".agents/skills/visual-direction/references/sources.md",
      ".agents/skills/visual-direction/references/real-site-gallery.md",
      ".agents/ui/plan.example.json",
      ".agents/skills/visual-qa/references/review-policy.md",
    ];

    for (const file of files) {
      expect(existsSync(resolve(root, file)), `${file} exists`).toBe(true);
      expect(readme, `${file} linked from README`).toContain(`](${file})`);
    }
  });

  test("canonical frontend and quality roles dispatch through the focused skills", () => {
    expect(read(".agents/agents/frontend-builder.md")).toContain(".agents/skills/visual-direction/SKILL.md");
    expect(read(".agents/agents/quality-engineer.md")).toContain(".agents/skills/visual-qa/SKILL.md");
  });
});
