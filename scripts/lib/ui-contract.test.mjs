// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { inspectUiContract } from "./ui-contract.mjs";

const roots = [];

function workspace(files) {
  const root = mkdtempSync(join(tmpdir(), "ui-contract-"));
  roots.push(root);
  for (const [file, body] of Object.entries(files)) {
    const absolute = join(root, file);
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, body);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("inspectUiContract", () => {
  test("accepts a pure block with a deterministic fixture", () => {
    const root = workspace({
      "src/components/blocks/hero.tsx":
        'export function Hero({ title }: { title: string }) { return <section className="rounded-lg bg-card"><h2>{title}</h2></section>; }',
      "src/components/blocks/hero.fixture.tsx":
        'import { Hero } from "./hero"; export const fixture = { Component: Hero, props: { title: "Build" } };',
    });

    expect(inspectUiContract(root)).toEqual([]);
  });

  test("rejects data access and state in a presentational block", () => {
    const root = workspace({
      "src/components/blocks/hero.tsx":
        '"use client"; import { useQuery } from "convex/react"; export function Hero() { const value = useQuery("x"); return <section>{value}</section>; }',
      "src/components/blocks/hero.fixture.tsx": "export const fixture = {};",
    });

    expect(inspectUiContract(root).map((item) => item.rule)).toEqual(
      expect.arrayContaining(["block-dependency", "block-purity"]),
    );
  });

  test("rejects relative block-to-block imports that bypass alias checks", () => {
    const root = workspace({
      "src/components/blocks/hero.tsx":
        'import { OtherBlock } from "./other-block"; export function Hero() { return <OtherBlock />; }',
      "src/components/blocks/hero.fixture.tsx": "export const fixture = {};",
    });

    expect(inspectUiContract(root).map((item) => item.rule)).toContain("block-dependency");
  });

  test("rejects a block that stacks more than two catalog accents", () => {
    const root = workspace({
      "src/components/blocks/hero.tsx":
        'import { A } from "@/components/magicui/a"; import { B } from "@/components/aceternity/b"; import { C } from "@/components/twentyfirst/c"; export function Hero() { return <section><A /><B /><C /></section>; }',
      "src/components/blocks/hero.fixture.tsx": "export const fixture = {};",
    });

    expect(inspectUiContract(root).map((item) => item.rule)).toContain("effect-budget");
  });

  test("rejects missing fixtures, mismatched exports, palette utilities, and arbitrary values", () => {
    const root = workspace({
      "src/components/blocks/banner.tsx":
        'export function HeroBanner() { return <section className="bg-blue-500 rounded-[17px]">Hello</section>; }',
    });

    const rules = inspectUiContract(root).map((item) => item.rule);
    expect(rules).toEqual(expect.arrayContaining(["block-fixture", "component-name", "design-token"]));
  });

  test("does not apply authored conventions to vendor-owned ui primitives", () => {
    const root = workspace({
      "src/components/ui/vendor.tsx":
        'export function One() { return <span className="bg-blue-500 rounded-[17px]" />; } export function Two() { return <span />; }',
    });

    expect(inspectUiContract(root)).toEqual([]);
  });

  test("inspects helper-composed classes and rejects unsafe pasted behavior", () => {
    const root = workspace({
      "src/components/features/profile-card.tsx":
        'import { cn } from "@/lib/utils"; export function ProfileCard() { void fetch("https://example.com"); return <div className={cn("bg-red-500", "rounded-[19px]")} dangerouslySetInnerHTML={{ __html: "x" }} />; }',
    });

    const rules = inspectUiContract(root).map((item) => item.rule);
    expect(rules).toEqual(expect.arrayContaining(["design-token", "untrusted-ui"]));
  });
});
