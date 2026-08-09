// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  acceptUiEvidence,
  evidenceFingerprint,
  inspectUiEvidence,
  planFingerprint,
  sha256,
  sourceFingerprint,
  UI_EVIDENCE_DRAFT_FILE,
  UI_PLAN_FILE,
  UI_REVIEW_FILE,
  validateUiPlan,
} from "./ui-evidence.mjs";

const roots = [];

function workspace(files = {}) {
  const root = mkdtempSync(join(tmpdir(), "ui-evidence-"));
  roots.push(root);
  for (const [file, body] of Object.entries(files)) write(root, file, body);
  return root;
}

function write(root, file, body) {
  const absolute = join(root, file);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, body);
}

function validPlan({ themes = ["light", "dark"] } = {}) {
  return {
    schemaVersion: 1,
    product: { name: "Library", audience: "Readers" },
    actors: ["visitor"],
    journey: ["See current reading progress"],
    contentHierarchy: ["Promise and action", "Annotated shelf proof"],
    directionExploration: {
      candidates: [
        {
          id: "editorial-workbench",
          thesis: "A quiet editorial frame.",
          composition: "Asymmetric narrative and workbench.",
          typography: "Expressive display and compact sans body.",
          palette: "Paper, ink, annotation accent.",
          signatureElement: "Annotated working shelf.",
        },
        {
          id: "technical-index",
          thesis: "A precise reference index.",
          composition: "Dense ruled rows with marginal labels.",
          typography: "Narrow labels and tabular body.",
          palette: "Cool monochrome and status data.",
          signatureElement: "Live comparison index.",
        },
        {
          id: "human-collage",
          thesis: "A warm human proof wall.",
          composition: "Layered fragments and a clear action column.",
          typography: "Friendly grotesk and annotations.",
          palette: "Warm paper and print accent.",
          signatureElement: "Product-owned proof collage.",
        },
      ],
      selectedDirection: {
        id: "editorial-workbench",
        rationale: "It makes the product the proof.",
        rejections: [
          { id: "technical-index", reason: "It overstates comparison density." },
          { id: "human-collage", reason: "It depends on too many assets." },
        ],
      },
      refinementVariants: [
        { id: "artifact-forward", change: "Prioritize the artifact.", tradeoff: "Less explanatory copy." },
        { id: "narrative-forward", change: "Prioritize the narrative.", tradeoff: "Proof arrives later." },
      ],
      selectedVariant: { id: "artifact-forward", rationale: "The audience needs concrete evidence first." },
    },
    visualThesis: "An annotated working shelf, not an interchangeable marketing shell.",
    signatureElement: "A fixture-backed annotated book stack.",
    surfaces: [
      {
        id: "home",
        route: "/",
        owner: "frontend-builder",
        states: [
          {
            id: "default",
            description: "Deterministic public state",
            query: "",
            marker: { role: "heading", name: "Library" },
          },
        ],
        themes,
        interactions: [],
      },
    ],
    viewports: [
      { name: "narrow", width: 320, height: 640 },
      { name: "tablet", width: 768, height: 1024 },
      { name: "desktop", width: 1440, height: 900 },
    ],
    references: [
      {
        title: "Reference",
        url: "https://example.com/",
        provenance: "live-site",
        lesson: "Use a clear reading order without copying the composition.",
      },
    ],
    tokens: {
      typography: "Editorial display with legible body text.",
      palette: "Paper neutrals and one annotation accent.",
      density: "Dense where readers compare books.",
      shapeLanguage: "Square working surfaces and restrained control rounding.",
    },
    motionBudget: { maxSimultaneousPieces: 1, purpose: "Explain a shelf state change." },
    componentSources: [
      { need: "Action", source: "existing shadcn primitive", decision: "Wrap the primitive." },
    ],
    responsiveIntent: {
      narrow: "One column without horizontal overflow.",
      tablet: "Expose the first side-by-side relationship.",
      desktop: "Increase evidence density, not empty space.",
    },
    accessibilityConstraints: ["One main landmark and named controls."],
    antiGoals: ["No generic gradient hero."],
    dataPolicy: "public-or-synthetic-only",
  };
}

function authoredWorkspace(plan = validPlan()) {
  const root = workspace({
    "src/components/blocks/hero.tsx":
      'export function Hero() { return <section><h1>Library</h1></section>; }',
    [UI_PLAN_FILE]: `${JSON.stringify(plan, null, 2)}\n`,
  });
  return root;
}

function addAcceptedEvidence(root, plan) {
  const captures = [];
  for (const surface of plan.surfaces) {
    for (const state of surface.states) {
      for (const theme of surface.themes) {
        for (const viewport of plan.viewports) {
          const id = `${surface.id}--${state.id}--${theme}--${viewport.name}`;
          const file = `.agents/ui/evidence/captures/${id}.png`;
          const bytes = Buffer.from(`image:${id}`);
          write(root, file, bytes);
          captures.push({
            id,
            surfaceId: surface.id,
            stateId: state.id,
            theme,
            viewport,
            file,
            sha256: sha256(bytes),
            audit: { passed: true, violations: [] },
            interactions: [],
          });
        }
      }
    }
  }
  captures.sort((left, right) => left.id.localeCompare(right.id));
  const draft = {
    schemaVersion: 1,
    generatedAt: "2026-08-09T00:00:00.000Z",
    captureSession: "capture-1",
    planFingerprint: planFingerprint(plan),
    sourceFingerprint: sourceFingerprint(root),
    captures,
  };
  write(root, UI_EVIDENCE_DRAFT_FILE, `${JSON.stringify(draft, null, 2)}\n`);
  const manifest = {
    schemaVersion: 1,
    acceptedAt: "2026-08-09T00:01:00.000Z",
    captureSession: draft.captureSession,
    planFingerprint: draft.planFingerprint,
    sourceFingerprint: draft.sourceFingerprint,
    evidenceFingerprint: evidenceFingerprint(draft),
    review: {
      reviewer: "Avery Reviewer",
      responsibility: "quality-engineer",
      reason: "The declared hierarchy and responsive intent are visible in every capture.",
      changedSurfaceSummary: "Home: established the annotated shelf composition.",
    },
    captures: captures.map(({ id, file, sha256: captureHash }) => ({ id, file, sha256: captureHash })),
  };
  write(root, UI_REVIEW_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
  return { draft, manifest };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("UI plan and visual evidence", () => {
  test("reports a fresh engine without authored product UI as not applicable", () => {
    const root = workspace({
      "src/app/page.tsx": "export default function Page() { return <main>Connect the engine</main>; }",
      "src/app/blog/page.tsx": "export default function Blog() { return <main>No articles yet</main>; }",
    });

    expect(inspectUiEvidence(root)).toEqual({ status: "not_applicable", violations: [] });
  });

  test("rejects missing intent, provenance, responsive coverage, and an unlimited motion budget", () => {
    const plan = validPlan();
    plan.antiGoals = [];
    plan.references[0].provenance = "unknown";
    plan.responsiveIntent.narrow = "";
    plan.motionBudget.maxSimultaneousPieces = 99;

    const paths = validateUiPlan(plan).map((error) => error.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "$.antiGoals",
        "$.references[0].provenance",
        "$.responsiveIntent.narrow",
        "$.motionBudget.maxSimultaneousPieces",
      ]),
    );
  });

  test("rejects unexplored direction and refinement selections", () => {
    const plan = validPlan();
    plan.directionExploration.candidates = plan.directionExploration.candidates.slice(0, 2);
    plan.directionExploration.selectedDirection.id = "not-a-candidate";
    plan.directionExploration.selectedDirection.rejections = [];
    plan.directionExploration.refinementVariants = plan.directionExploration.refinementVariants.slice(0, 1);
    plan.directionExploration.selectedVariant.id = "not-a-variant";

    const paths = validateUiPlan(plan).map((error) => error.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "$.directionExploration.candidates",
        "$.directionExploration.selectedDirection.id",
        "$.directionExploration.selectedDirection.rejections",
        "$.directionExploration.refinementVariants",
        "$.directionExploration.selectedVariant.id",
      ]),
    );
  });

  test("fails closed when authored UI has a plan but no capture or reviewed manifest", () => {
    const result = inspectUiEvidence(authoredWorkspace());

    expect(result.status).toBe("fail");
    expect(result.violations.map((item) => item.rule)).toEqual(expect.arrayContaining(["ui-evidence", "ui-review"]));
  });

  test("accepts an explicit single-theme plan with complete reviewed evidence", () => {
    const plan = validPlan({ themes: ["dark"] });
    const root = authoredWorkspace(plan);
    addAcceptedEvidence(root, plan);

    expect(inspectUiEvidence(root)).toEqual({ status: "pass", violations: [] });
  });

  test("detects authored-source staleness after review", () => {
    const plan = validPlan();
    const root = authoredWorkspace(plan);
    addAcceptedEvidence(root, plan);
    write(root, "src/components/blocks/hero.tsx", 'export function Hero() { return <section><h1>Changed</h1></section>; }');

    const result = inspectUiEvidence(root);
    expect(result.status).toBe("fail");
    expect(result.violations.map((item) => item.rule)).toEqual(
      expect.arrayContaining(["ui-evidence-stale", "ui-review-stale"]),
    );
  });

  test("detects a screenshot visual-evidence mismatch", () => {
    const plan = validPlan({ themes: ["light"] });
    const root = authoredWorkspace(plan);
    const { draft } = addAcceptedEvidence(root, plan);
    write(root, draft.captures[0].file, Buffer.from("visually different image bytes"));

    const result = inspectUiEvidence(root);
    expect(result.status).toBe("fail");
    expect(result.violations).toContainEqual(
      expect.objectContaining({ rule: "ui-evidence-mismatch", message: expect.stringContaining("changed after capture") }),
    );
  });

  test("rejects a prefixed capture path that escapes the evidence directory", () => {
    const plan = validPlan({ themes: ["light"] });
    const root = authoredWorkspace(plan);
    addAcceptedEvidence(root, plan);
    const draft = JSON.parse(readFileSync(join(root, UI_EVIDENCE_DRAFT_FILE), "utf8"));
    const escapedFile = ".agents/ui/evidence/captures/../../escaped.png";
    const escapedBytes = Buffer.from("escaped screenshot");
    write(root, ".agents/ui/escaped.png", escapedBytes);
    draft.captures[0].file = escapedFile;
    draft.captures[0].sha256 = sha256(escapedBytes);
    write(root, UI_EVIDENCE_DRAFT_FILE, `${JSON.stringify(draft, null, 2)}\n`);

    const result = inspectUiEvidence(root);
    expect(result.status).toBe("fail");
    expect(result.violations).toContainEqual(
      expect.objectContaining({ rule: "ui-evidence", message: expect.stringContaining("invalid capture path") }),
    );
  });

  test("baseline acceptance requires named responsibility, reason, and changed-surface summary", () => {
    const plan = validPlan({ themes: ["light"] });
    const root = authoredWorkspace(plan);
    addAcceptedEvidence(root, plan);

    expect(() =>
      acceptUiEvidence({
        root,
        reviewer: "Avery Reviewer",
        responsibility: "",
        reason: "",
        changedSurfaceSummary: "",
      }),
    ).toThrow(/responsibility is required/);
  });

  test("a reviewed capture session cannot be accepted again as a new baseline", () => {
    const plan = validPlan({ themes: ["light"] });
    const root = authoredWorkspace(plan);
    addAcceptedEvidence(root, plan);

    expect(() =>
      acceptUiEvidence({
        root,
        reviewer: "Avery Reviewer",
        responsibility: "quality-engineer",
        reason: "Second acceptance",
        changedSurfaceSummary: "Home: unchanged captures.",
      }),
    ).toThrow(/regenerate screenshots/);
  });
});
