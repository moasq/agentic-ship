import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

export const UI_PLAN_FILE = ".agents/ui/plan.json";
export const UI_PLAN_EXAMPLE_FILE = ".agents/ui/plan.example.json";
export const UI_EVIDENCE_DIR = ".agents/ui/evidence";
export const UI_EVIDENCE_DRAFT_FILE = `${UI_EVIDENCE_DIR}/draft.json`;
export const UI_REVIEW_FILE = `${UI_EVIDENCE_DIR}/manifest.json`;
export const UI_GALLERY_FILE = `${UI_EVIDENCE_DIR}/index.html`;

const REQUIRED_VIEWPORT_WIDTHS = [320, 768, 1440];
const AUTHORED_DIRS = [
  "src/components/aceternity",
  "src/components/blocks",
  "src/components/features",
  "src/components/magicui",
  "src/components/twentyfirst",
];
const PLAIN_ENGINE_PAGES = new Set([
  "src/app/page.jsx",
  "src/app/page.tsx",
  "src/app/blog/page.jsx",
  "src/app/blog/page.tsx",
]);
const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?|css|mdx)$/;
const APP_VISUAL_EXTENSION = /\.(?:[cm]?[jt]sx|css|mdx)$/;
const VISUAL_ASSET_EXTENSION = /\.(?:avif|gif|jpe?g|png|svg|webp|woff2?)$/;
const SUPPORT_FILE = /(?:\.fixture|\.stories|\.test|\.spec)\.[cm]?[jt]sx?$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HASH = /^[a-f0-9]{64}$/;
const THEMES = new Set(["light", "dark"]);
const OWNERS = new Set(["frontend-builder", "quality-engineer"]);
const PROVENANCE = new Set([
  "live-site",
  "video",
  "primary-documentation",
  "product-research",
  "existing-ui",
]);

function toPosix(root, file) {
  return relative(root, file).split(sep).join("/");
}

function walk(directory, files = []) {
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, files);
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function push(errors, path, condition, message) {
  if (!condition) errors.push({ path, message });
}

function exactKeys(value, path, allowed, errors) {
  if (!object(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push({ path: `${path}.${key}`, message: "is not a supported field" });
  }
}

function validateNonEmptyStrings(value, path, errors, { minimum = 1 } = {}) {
  push(errors, path, Array.isArray(value), "must be an array");
  if (!Array.isArray(value)) return;
  push(errors, path, value.length >= minimum, `must contain at least ${minimum} item(s)`);
  value.forEach((item, index) => push(errors, `${path}[${index}]`, nonEmpty(item), "must be a non-empty string"));
}

function uniqueStrings(items) {
  return new Set(items).size === items.length;
}

function validateDirectionExploration(exploration, errors) {
  push(errors, "$.directionExploration", object(exploration), "must be an object");
  if (!object(exploration)) return;
  exactKeys(
    exploration,
    "$.directionExploration",
    ["candidates", "selectedDirection", "refinementVariants", "selectedVariant"],
    errors,
  );

  push(
    errors,
    "$.directionExploration.candidates",
    Array.isArray(exploration.candidates) && exploration.candidates.length >= 3,
    "must record at least three candidate directions",
  );
  const candidateIds = [];
  const candidateDescriptions = [];
  if (Array.isArray(exploration.candidates)) {
    for (const [index, candidate] of exploration.candidates.entries()) {
      const base = `$.directionExploration.candidates[${index}]`;
      push(errors, base, object(candidate), "must be an object");
      if (!object(candidate)) continue;
      exactKeys(candidate, base, ["id", "thesis", "composition", "typography", "palette", "signatureElement"], errors);
      push(errors, `${base}.id`, nonEmpty(candidate.id) && SLUG.test(candidate.id), "must be a kebab-case id");
      if (typeof candidate.id === "string") candidateIds.push(candidate.id);
      for (const field of ["thesis", "composition", "typography", "palette", "signatureElement"]) {
        push(errors, `${base}.${field}`, nonEmpty(candidate[field]), "must be a non-empty material direction decision");
      }
      candidateDescriptions.push(
        [candidate.thesis, candidate.composition, candidate.typography, candidate.palette, candidate.signatureElement]
          .map((value) => String(value ?? "").trim().toLowerCase())
          .join("\0"),
      );
    }
    push(errors, "$.directionExploration.candidates", uniqueStrings(candidateIds), "candidate ids must be unique");
    push(
      errors,
      "$.directionExploration.candidates",
      uniqueStrings(candidateDescriptions),
      "candidate decisions must not duplicate one another",
    );
  }

  const selection = exploration.selectedDirection;
  push(errors, "$.directionExploration.selectedDirection", object(selection), "must be an object");
  if (object(selection)) {
    exactKeys(selection, "$.directionExploration.selectedDirection", ["id", "rationale", "rejections"], errors);
    push(
      errors,
      "$.directionExploration.selectedDirection.id",
      nonEmpty(selection.id) && candidateIds.includes(selection.id),
      "must select a recorded candidate id",
    );
    push(errors, "$.directionExploration.selectedDirection.rationale", nonEmpty(selection.rationale), "must explain the selection");
    push(
      errors,
      "$.directionExploration.selectedDirection.rejections",
      Array.isArray(selection.rejections) && selection.rejections.length >= 2,
      "must record why at least two alternatives were rejected",
    );
    const rejectionIds = [];
    if (Array.isArray(selection.rejections)) {
      for (const [index, rejection] of selection.rejections.entries()) {
        const base = `$.directionExploration.selectedDirection.rejections[${index}]`;
        push(errors, base, object(rejection), "must be an object");
        if (!object(rejection)) continue;
        exactKeys(rejection, base, ["id", "reason"], errors);
        push(
          errors,
          `${base}.id`,
          nonEmpty(rejection.id) && candidateIds.includes(rejection.id) && rejection.id !== selection.id,
          "must name a non-selected candidate",
        );
        if (typeof rejection.id === "string") rejectionIds.push(rejection.id);
        push(errors, `${base}.reason`, nonEmpty(rejection.reason), "must explain the rejection");
      }
      push(errors, "$.directionExploration.selectedDirection.rejections", uniqueStrings(rejectionIds), "must not reject the same direction twice");
      const alternatives = candidateIds.filter((id) => id !== selection.id).sort();
      push(
        errors,
        "$.directionExploration.selectedDirection.rejections",
        canonical([...rejectionIds].sort()) === canonical(alternatives),
        "must account for every non-selected candidate",
      );
    }
  }

  push(
    errors,
    "$.directionExploration.refinementVariants",
    Array.isArray(exploration.refinementVariants) && exploration.refinementVariants.length >= 2,
    "must record at least two refinements of the selected direction",
  );
  const variantIds = [];
  if (Array.isArray(exploration.refinementVariants)) {
    for (const [index, variant] of exploration.refinementVariants.entries()) {
      const base = `$.directionExploration.refinementVariants[${index}]`;
      push(errors, base, object(variant), "must be an object");
      if (!object(variant)) continue;
      exactKeys(variant, base, ["id", "change", "tradeoff"], errors);
      push(errors, `${base}.id`, nonEmpty(variant.id) && SLUG.test(variant.id), "must be a kebab-case id");
      if (typeof variant.id === "string") variantIds.push(variant.id);
      push(errors, `${base}.change`, nonEmpty(variant.change), "must describe the material refinement");
      push(errors, `${base}.tradeoff`, nonEmpty(variant.tradeoff), "must name the refinement's tradeoff");
    }
    push(errors, "$.directionExploration.refinementVariants", uniqueStrings(variantIds), "variant ids must be unique");
  }
  push(errors, "$.directionExploration.selectedVariant", object(exploration.selectedVariant), "must be an object");
  if (object(exploration.selectedVariant)) {
    exactKeys(exploration.selectedVariant, "$.directionExploration.selectedVariant", ["id", "rationale"], errors);
    push(
      errors,
      "$.directionExploration.selectedVariant.id",
      nonEmpty(exploration.selectedVariant.id) && variantIds.includes(exploration.selectedVariant.id),
      "must select a recorded refinement id",
    );
    push(
      errors,
      "$.directionExploration.selectedVariant.rationale",
      nonEmpty(exploration.selectedVariant.rationale),
      "must explain the refinement selection",
    );
  }
}

/**
 * Runtime validation mirrors the committed JSON schema without needing a schema
 * compiler at install time. Errors are path-addressed so plan authors can repair the
 * artifact instead of weakening the completion gate.
 */
export function validateUiPlan(plan) {
  const errors = [];
  push(errors, "$", object(plan), "must be an object");
  if (!object(plan)) return errors;

  exactKeys(
    plan,
    "$",
    [
      "schemaVersion",
      "product",
      "actors",
      "journey",
      "contentHierarchy",
      "directionExploration",
      "visualThesis",
      "signatureElement",
      "surfaces",
      "viewports",
      "references",
      "tokens",
      "motionBudget",
      "componentSources",
      "responsiveIntent",
      "accessibilityConstraints",
      "antiGoals",
      "dataPolicy",
    ],
    errors,
  );

  push(errors, "$.schemaVersion", plan.schemaVersion === 1, "must equal 1");
  push(errors, "$.product", object(plan.product), "must be an object");
  if (object(plan.product)) {
    exactKeys(plan.product, "$.product", ["name", "audience"], errors);
    push(errors, "$.product.name", nonEmpty(plan.product.name), "must be a non-empty string");
    push(errors, "$.product.audience", nonEmpty(plan.product.audience), "must be a non-empty string");
  }
  validateNonEmptyStrings(plan.actors, "$.actors", errors);
  if (Array.isArray(plan.actors)) push(errors, "$.actors", uniqueStrings(plan.actors), "must not contain duplicates");
  validateNonEmptyStrings(plan.journey, "$.journey", errors);
  validateNonEmptyStrings(plan.contentHierarchy, "$.contentHierarchy", errors, { minimum: 2 });
  if (Array.isArray(plan.contentHierarchy)) {
    push(errors, "$.contentHierarchy", uniqueStrings(plan.contentHierarchy), "must describe a unique priority at each level");
  }
  validateDirectionExploration(plan.directionExploration, errors);
  push(errors, "$.visualThesis", nonEmpty(plan.visualThesis), "must be a non-empty string");
  push(errors, "$.signatureElement", nonEmpty(plan.signatureElement), "must be a non-empty string");

  push(errors, "$.surfaces", Array.isArray(plan.surfaces) && plan.surfaces.length > 0, "must contain at least one surface");
  if (Array.isArray(plan.surfaces)) {
    const surfaceIds = [];
    for (const [surfaceIndex, surface] of plan.surfaces.entries()) {
      const base = `$.surfaces[${surfaceIndex}]`;
      push(errors, base, object(surface), "must be an object");
      if (!object(surface)) continue;
      exactKeys(surface, base, ["id", "route", "owner", "states", "themes", "interactions"], errors);
      push(errors, `${base}.id`, nonEmpty(surface.id) && SLUG.test(surface.id), "must be a kebab-case id");
      if (typeof surface.id === "string") surfaceIds.push(surface.id);
      push(
        errors,
        `${base}.route`,
        nonEmpty(surface.route) &&
          surface.route.startsWith("/") &&
          !surface.route.startsWith("//") &&
          !surface.route.includes("\\") &&
          !/[?#]/.test(surface.route),
        "must be a local pathname starting with one /; state query belongs in the state",
      );
      push(errors, `${base}.owner`, OWNERS.has(surface.owner), "must name frontend-builder or quality-engineer");

      push(errors, `${base}.states`, Array.isArray(surface.states) && surface.states.length > 0, "must declare at least one state");
      if (Array.isArray(surface.states)) {
        const stateIds = [];
        for (const [stateIndex, state] of surface.states.entries()) {
          const statePath = `${base}.states[${stateIndex}]`;
          push(errors, statePath, object(state), "must be an object");
          if (!object(state)) continue;
          exactKeys(state, statePath, ["id", "description", "query", "marker"], errors);
          push(errors, `${statePath}.id`, nonEmpty(state.id) && SLUG.test(state.id), "must be a kebab-case id");
          if (typeof state.id === "string") stateIds.push(state.id);
          push(errors, `${statePath}.description`, nonEmpty(state.description), "must explain the state");
          push(errors, `${statePath}.query`, typeof state.query === "string", "must be a query string (empty is allowed)");
          push(errors, `${statePath}.marker`, object(state.marker), "must identify a visible state marker");
          if (object(state.marker)) {
            exactKeys(state.marker, `${statePath}.marker`, ["role", "name"], errors);
            push(errors, `${statePath}.marker.role`, nonEmpty(state.marker.role), "must name an accessible role");
            push(errors, `${statePath}.marker.name`, nonEmpty(state.marker.name), "must name the marker");
          }
        }
        push(errors, `${base}.states`, uniqueStrings(stateIds), "state ids must be unique within the surface");
      }

      push(
        errors,
        `${base}.themes`,
        Array.isArray(surface.themes) && surface.themes.length >= 1 && surface.themes.length <= 2,
        "must explicitly declare one or both supported themes",
      );
      if (Array.isArray(surface.themes)) {
        push(errors, `${base}.themes`, surface.themes.every((theme) => THEMES.has(theme)), "supports only light and dark");
        push(errors, `${base}.themes`, uniqueStrings(surface.themes), "must not contain duplicates");
      }

      push(errors, `${base}.interactions`, Array.isArray(surface.interactions), "must be an array; use [] when none exist");
      if (Array.isArray(surface.interactions)) {
        const interactionIds = [];
        for (const [interactionIndex, interaction] of surface.interactions.entries()) {
          const interactionPath = `${base}.interactions[${interactionIndex}]`;
          push(errors, interactionPath, object(interaction), "must be an object");
          if (!object(interaction)) continue;
          exactKeys(interaction, interactionPath, ["id", "role", "name", "purpose"], errors);
          push(errors, `${interactionPath}.id`, nonEmpty(interaction.id) && SLUG.test(interaction.id), "must be a kebab-case id");
          if (typeof interaction.id === "string") interactionIds.push(interaction.id);
          push(errors, `${interactionPath}.role`, nonEmpty(interaction.role), "must name an accessible role");
          push(errors, `${interactionPath}.name`, nonEmpty(interaction.name), "must name the control");
          push(errors, `${interactionPath}.purpose`, nonEmpty(interaction.purpose), "must explain the interaction's purpose");
        }
        push(errors, `${base}.interactions`, uniqueStrings(interactionIds), "interaction ids must be unique within the surface");
      }
    }
    push(errors, "$.surfaces", uniqueStrings(surfaceIds), "surface ids must be unique");
  }

  push(errors, "$.viewports", Array.isArray(plan.viewports) && plan.viewports.length >= 3, "must contain at least three viewports");
  if (Array.isArray(plan.viewports)) {
    const names = [];
    for (const [index, viewport] of plan.viewports.entries()) {
      const base = `$.viewports[${index}]`;
      push(errors, base, object(viewport), "must be an object");
      if (!object(viewport)) continue;
      exactKeys(viewport, base, ["name", "width", "height"], errors);
      push(errors, `${base}.name`, nonEmpty(viewport.name) && SLUG.test(viewport.name), "must be a kebab-case name");
      if (typeof viewport.name === "string") names.push(viewport.name);
      push(errors, `${base}.width`, Number.isInteger(viewport.width) && viewport.width >= 320 && viewport.width <= 3840, "must be an integer from 320 to 3840");
      push(errors, `${base}.height`, Number.isInteger(viewport.height) && viewport.height >= 480 && viewport.height <= 2160, "must be an integer from 480 to 2160");
    }
    push(errors, "$.viewports", uniqueStrings(names), "viewport names must be unique");
    for (const width of REQUIRED_VIEWPORT_WIDTHS) {
      push(errors, "$.viewports", plan.viewports.some((viewport) => viewport?.width === width), `must include width ${width}`);
    }
  }

  push(errors, "$.references", Array.isArray(plan.references) && plan.references.length > 0, "must contain at least one attributed reference");
  if (Array.isArray(plan.references)) {
    for (const [index, reference] of plan.references.entries()) {
      const base = `$.references[${index}]`;
      push(errors, base, object(reference), "must be an object");
      if (!object(reference)) continue;
      exactKeys(reference, base, ["title", "url", "provenance", "lesson"], errors);
      push(errors, `${base}.title`, nonEmpty(reference.title), "must name the source");
      push(errors, `${base}.url`, nonEmpty(reference.url) && /^https:\/\//.test(reference.url), "must be an https URL");
      push(errors, `${base}.provenance`, PROVENANCE.has(reference.provenance), "must use a supported provenance category");
      push(errors, `${base}.lesson`, nonEmpty(reference.lesson), "must record a transferable lesson");
    }
  }

  push(errors, "$.tokens", object(plan.tokens), "must be an object");
  if (object(plan.tokens)) {
    exactKeys(plan.tokens, "$.tokens", ["typography", "palette", "density", "shapeLanguage"], errors);
    for (const field of ["typography", "palette", "density", "shapeLanguage"]) {
      push(errors, `$.tokens.${field}`, nonEmpty(plan.tokens[field]), "must be a non-empty string");
    }
  }
  push(errors, "$.motionBudget", object(plan.motionBudget), "must be an object");
  if (object(plan.motionBudget)) {
    exactKeys(plan.motionBudget, "$.motionBudget", ["maxSimultaneousPieces", "purpose"], errors);
    push(
      errors,
      "$.motionBudget.maxSimultaneousPieces",
      Number.isInteger(plan.motionBudget.maxSimultaneousPieces) &&
        plan.motionBudget.maxSimultaneousPieces >= 0 &&
        plan.motionBudget.maxSimultaneousPieces <= 2,
      "must be an integer from 0 to 2; unlimited motion is invalid",
    );
    push(errors, "$.motionBudget.purpose", nonEmpty(plan.motionBudget.purpose), "must explain what motion is for");
  }
  push(
    errors,
    "$.componentSources",
    Array.isArray(plan.componentSources) && plan.componentSources.length > 0,
    "must contain at least one source decision",
  );
  if (Array.isArray(plan.componentSources)) {
    for (const [index, source] of plan.componentSources.entries()) {
      const base = `$.componentSources[${index}]`;
      push(errors, base, object(source), "must be an object");
      if (!object(source)) continue;
      exactKeys(source, base, ["need", "source", "decision"], errors);
      for (const field of ["need", "source", "decision"]) {
        push(errors, `${base}.${field}`, nonEmpty(source[field]), "must be a non-empty string");
      }
    }
  }
  push(errors, "$.responsiveIntent", object(plan.responsiveIntent), "must be an object");
  if (object(plan.responsiveIntent)) {
    exactKeys(plan.responsiveIntent, "$.responsiveIntent", ["narrow", "tablet", "desktop"], errors);
    for (const field of ["narrow", "tablet", "desktop"]) {
      push(errors, `$.responsiveIntent.${field}`, nonEmpty(plan.responsiveIntent[field]), "must be a non-empty string");
    }
  }
  validateNonEmptyStrings(plan.accessibilityConstraints, "$.accessibilityConstraints", errors);
  validateNonEmptyStrings(plan.antiGoals, "$.antiGoals", errors);
  push(errors, "$.dataPolicy", plan.dataPolicy === "public-or-synthetic-only", "must equal public-or-synthetic-only");
  return errors;
}

export function validateReviewManifest(manifest) {
  const errors = [];
  push(errors, "$", object(manifest), "must be an object");
  if (!object(manifest)) return errors;
  exactKeys(
    manifest,
    "$",
    ["schemaVersion", "acceptedAt", "captureSession", "planFingerprint", "sourceFingerprint", "evidenceFingerprint", "review", "captures"],
    errors,
  );
  push(errors, "$.schemaVersion", manifest.schemaVersion === 1, "must equal 1");
  push(errors, "$.acceptedAt", nonEmpty(manifest.acceptedAt) && !Number.isNaN(Date.parse(manifest.acceptedAt)), "must be an ISO date-time");
  push(errors, "$.captureSession", nonEmpty(manifest.captureSession), "must identify the capture session");
  for (const field of ["planFingerprint", "sourceFingerprint", "evidenceFingerprint"]) {
    push(errors, `$.${field}`, typeof manifest[field] === "string" && HASH.test(manifest[field]), "must be a sha256 hash");
  }
  push(errors, "$.review", object(manifest.review), "must be an object");
  if (object(manifest.review)) {
    exactKeys(manifest.review, "$.review", ["reviewer", "responsibility", "reason", "changedSurfaceSummary"], errors);
    for (const field of ["reviewer", "responsibility", "reason", "changedSurfaceSummary"]) {
      push(errors, `$.review.${field}`, nonEmpty(manifest.review[field]), "must be a non-empty string");
    }
  }
  push(errors, "$.captures", Array.isArray(manifest.captures) && manifest.captures.length > 0, "must contain reviewed captures");
  if (Array.isArray(manifest.captures)) {
    for (const [index, capture] of manifest.captures.entries()) {
      const base = `$.captures[${index}]`;
      push(errors, base, object(capture), "must be an object");
      if (!object(capture)) continue;
      exactKeys(capture, base, ["id", "file", "sha256"], errors);
      push(errors, `${base}.id`, nonEmpty(capture.id), "must identify the capture");
      push(
        errors,
        `${base}.file`,
        isSyntacticallySafeCapturePath(capture.file),
        "must live under the review capture directory",
      );
      push(errors, `${base}.sha256`, typeof capture.sha256 === "string" && HASH.test(capture.sha256), "must be a sha256 hash");
    }
  }
  return errors;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function planFingerprint(plan) {
  return sha256(canonical(plan));
}

export function detectAuthoredUi(root) {
  const authoredComponent = AUTHORED_DIRS.some((directory) =>
    walk(resolve(root, directory)).some((file) => SOURCE_EXTENSION.test(file) && !SUPPORT_FILE.test(file)),
  );
  if (authoredComponent) return true;

  const appRoot = resolve(root, "src/app");
  return walk(appRoot).some((file) => {
    const repoPath = toPosix(root, file);
    if (!/(?:^|\/)page\.[cm]?[jt]sx?$/.test(repoPath)) return false;
    if (!PLAIN_ENGINE_PAGES.has(repoPath)) return true;
    const body = readFileSync(file, "utf8");
    return /components\/(?:blocks|features|magicui|aceternity|twentyfirst)/.test(body);
  });
}

export function authoredUiFiles(root) {
  const candidates = new Set();
  for (const directory of AUTHORED_DIRS) {
    for (const file of walk(resolve(root, directory))) {
      if (SOURCE_EXTENSION.test(file) || VISUAL_ASSET_EXTENSION.test(file)) candidates.add(file);
    }
  }
  for (const file of walk(resolve(root, "src/app"))) {
    if (APP_VISUAL_EXTENSION.test(file)) candidates.add(file);
  }
  for (const file of [resolve(root, "src/lib/site.ts"), resolve(root, "mdx-components.tsx")]) {
    if (existsSync(file)) candidates.add(file);
  }
  for (const file of walk(resolve(root, "public"))) {
    if (VISUAL_ASSET_EXTENSION.test(file)) candidates.add(file);
  }
  return [...candidates].sort((left, right) => toPosix(root, left).localeCompare(toPosix(root, right)));
}

export function sourceFingerprint(root) {
  const hash = createHash("sha256");
  const files = authoredUiFiles(root);
  for (const file of files) {
    const body = readFileSync(file);
    hash.update(toPosix(root, file));
    hash.update("\0");
    hash.update(String(body.byteLength));
    hash.update("\0");
    hash.update(body);
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function expectedCaptureMatrix(plan) {
  const expected = [];
  for (const surface of plan.surfaces) {
    for (const state of surface.states) {
      for (const theme of surface.themes) {
        for (const viewport of plan.viewports) {
          expected.push({
            id: [surface.id, state.id, theme, viewport.name].join("--"),
            surfaceId: surface.id,
            stateId: state.id,
            theme,
            viewport: { name: viewport.name, width: viewport.width, height: viewport.height },
          });
        }
      }
    }
  }
  return expected;
}

function evidenceRecord(capture) {
  return {
    id: capture.id,
    file: capture.file,
    sha256: capture.sha256,
    audit: capture.audit,
    interactions: capture.interactions,
  };
}

export function evidenceFingerprint(draft) {
  return sha256(canonical([...draft.captures].sort((left, right) => left.id.localeCompare(right.id)).map(evidenceRecord)));
}

function readJson(root, repoPath) {
  const absolute = resolve(root, repoPath);
  if (!existsSync(absolute)) return { value: null, error: "missing" };
  try {
    return { value: JSON.parse(readFileSync(absolute, "utf8")), error: null };
  } catch (error) {
    return { value: null, error: error.message };
  }
}

function isSyntacticallySafeCapturePath(repoPath) {
  return (
    nonEmpty(repoPath) &&
    repoPath.startsWith(`${UI_EVIDENCE_DIR}/captures/`) &&
    !repoPath.includes("\\") &&
    !repoPath.split("/").includes("..") &&
    repoPath !== `${UI_EVIDENCE_DIR}/captures/`
  );
}

function capturePath(root, repoPath) {
  if (!isSyntacticallySafeCapturePath(repoPath)) return null;
  const captureRoot = resolve(root, UI_EVIDENCE_DIR, "captures");
  const absolute = resolve(root, repoPath);
  const fromCaptureRoot = relative(captureRoot, absolute);
  if (!fromCaptureRoot || fromCaptureRoot === ".." || fromCaptureRoot.startsWith(`..${sep}`)) return null;
  return absolute;
}

function captureViolations(root, plan, draft) {
  const violations = [];
  if (!object(draft)) return [{ rule: "ui-evidence", message: `${UI_EVIDENCE_DRAFT_FILE} must contain a JSON object` }];
  if (draft.schemaVersion !== 1) violations.push({ rule: "ui-evidence", message: "capture draft schemaVersion must equal 1" });
  if (!nonEmpty(draft.captureSession)) violations.push({ rule: "ui-evidence", message: "capture draft must identify its capture session" });
  if (draft.planFingerprint !== planFingerprint(plan)) violations.push({ rule: "ui-evidence-stale", message: "capture evidence was generated from a different UI plan" });
  if (draft.sourceFingerprint !== sourceFingerprint(root)) violations.push({ rule: "ui-evidence-stale", message: "capture evidence is stale relative to authored UI inputs" });
  if (!Array.isArray(draft.captures)) {
    violations.push({ rule: "ui-evidence", message: "capture draft must contain captures" });
    return violations;
  }

  const expected = expectedCaptureMatrix(plan);
  const byId = new Map(draft.captures.map((capture) => [capture?.id, capture]));
  for (const item of expected) {
    const capture = byId.get(item.id);
    if (!capture) {
      violations.push({ rule: "ui-evidence-missing", message: `required capture ${item.id} is missing` });
      continue;
    }
    if (capture.surfaceId !== item.surfaceId || capture.stateId !== item.stateId || capture.theme !== item.theme) {
      violations.push({ rule: "ui-evidence-mismatch", message: `${item.id} does not match its declared surface, state, and theme` });
    }
    if (canonical(capture.viewport) !== canonical(item.viewport)) {
      violations.push({ rule: "ui-evidence-mismatch", message: `${item.id} does not match its declared viewport` });
    }
    const absolute = capturePath(root, capture.file);
    if (!absolute) {
      violations.push({ rule: "ui-evidence", message: `${item.id} has an invalid capture path` });
      continue;
    }
    if (!existsSync(absolute) || !statSync(absolute).isFile()) {
      violations.push({ rule: "ui-evidence-missing", message: `${capture.file} is missing` });
      continue;
    }
    const actualHash = sha256(readFileSync(absolute));
    if (capture.sha256 !== actualHash) {
      violations.push({ rule: "ui-evidence-mismatch", message: `${capture.file} changed after capture` });
    }
    if (capture.audit?.passed !== true) {
      violations.push({ rule: "ui-browser-audit", message: `${item.id} did not pass the browser accessibility and overflow audit` });
    }
    if (!Array.isArray(capture.interactions) || capture.interactions.some((interaction) => interaction.keyboardReachable !== true)) {
      violations.push({ rule: "ui-browser-audit", message: `${item.id} has a declared interaction that was not keyboard reachable` });
    }
  }
  if (draft.captures.length !== expected.length) {
    violations.push({ rule: "ui-evidence-mismatch", message: `capture draft has ${draft.captures.length} entries; expected ${expected.length}` });
  }
  return violations;
}

/**
 * Completion-gate inspection. It deliberately has no environment or option that turns
 * failures into success: the only repair path is a valid plan, regenerated captures,
 * and an evidence-bearing review.
 */
export function inspectUiEvidence(root) {
  if (!detectAuthoredUi(root)) return { status: "not_applicable", violations: [] };

  const violations = [];
  const planRead = readJson(root, UI_PLAN_FILE);
  if (planRead.error) {
    return {
      status: "fail",
      violations: [{ rule: "ui-plan", message: planRead.error === "missing" ? `${UI_PLAN_FILE} is required for authored UI` : `${UI_PLAN_FILE} is invalid JSON: ${planRead.error}` }],
    };
  }
  const planErrors = validateUiPlan(planRead.value);
  for (const error of planErrors) violations.push({ rule: "ui-plan", message: `${error.path} ${error.message}` });
  if (planErrors.length > 0) return { status: "fail", violations };

  const draftRead = readJson(root, UI_EVIDENCE_DRAFT_FILE);
  if (draftRead.error) {
    violations.push({
      rule: "ui-evidence",
      message: draftRead.error === "missing" ? `${UI_EVIDENCE_DRAFT_FILE} is required; run the visual capture command` : `${UI_EVIDENCE_DRAFT_FILE} is invalid JSON: ${draftRead.error}`,
    });
  } else {
    violations.push(...captureViolations(root, planRead.value, draftRead.value));
  }

  const reviewRead = readJson(root, UI_REVIEW_FILE);
  if (reviewRead.error) {
    violations.push({
      rule: "ui-review",
      message: reviewRead.error === "missing" ? `${UI_REVIEW_FILE} is required; review and accept regenerated evidence` : `${UI_REVIEW_FILE} is invalid JSON: ${reviewRead.error}`,
    });
  } else {
    for (const error of validateReviewManifest(reviewRead.value)) {
      violations.push({ rule: "ui-review", message: `${error.path} ${error.message}` });
    }
    if (!draftRead.error) {
      const currentPlanFingerprint = planFingerprint(planRead.value);
      const currentSourceFingerprint = sourceFingerprint(root);
      const currentEvidenceFingerprint = evidenceFingerprint(draftRead.value);
      if (reviewRead.value.planFingerprint !== currentPlanFingerprint) {
        violations.push({ rule: "ui-review-stale", message: "accepted review belongs to a different UI plan" });
      }
      if (reviewRead.value.sourceFingerprint !== currentSourceFingerprint) {
        violations.push({ rule: "ui-review-stale", message: "accepted review is stale relative to authored UI inputs" });
      }
      if (reviewRead.value.evidenceFingerprint !== currentEvidenceFingerprint) {
        violations.push({ rule: "ui-review-stale", message: "accepted review does not match the current capture evidence" });
      }
      if (reviewRead.value.captureSession !== draftRead.value.captureSession) {
        violations.push({ rule: "ui-review-stale", message: "accepted review belongs to an older capture session" });
      }
      const reviewedCaptures = canonical(reviewRead.value.captures ?? []);
      const currentCaptures = canonical(
        [...(draftRead.value.captures ?? [])]
          .sort((left, right) => left.id.localeCompare(right.id))
          .map(({ id, file, sha256: captureHash }) => ({ id, file, sha256: captureHash })),
      );
      if (reviewedCaptures !== currentCaptures) {
        violations.push({ rule: "ui-review-stale", message: "accepted review capture list does not match current evidence" });
      }
    }
  }

  return { status: violations.length === 0 ? "pass" : "fail", violations };
}

function safeCaptureName(value) {
  if (!nonEmpty(value) || !SLUG.test(value)) throw new Error(`Unsafe capture name: ${value}`);
  return value;
}

function stateUrl(baseUrl, surface, state) {
  const base = new URL(`${baseUrl.replace(/\/$/, "")}/`);
  const url = new URL(surface.route, base);
  if (url.origin !== base.origin) throw new Error(`Surface ${surface.id} resolved outside the local capture origin`);
  if (state.query) {
    const query = state.query.startsWith("?") ? state.query.slice(1) : state.query;
    url.search = query;
  }
  return url.href;
}

async function documentAudit(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
    };
    const accessibleName = (element) => {
      const labelledBy = (element.getAttribute("aria-labelledby") ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent)
        .join(" ");
      return [element.getAttribute("aria-label"), labelledBy, element.getAttribute("title"), element.textContent]
        .filter(Boolean)
        .join(" ")
        .trim();
    };
    const hasGeneratedSemanticText = (element) => {
      const nodes = [element, ...element.querySelectorAll("*")];
      return nodes.some((node) =>
        ["::before", "::after"].some((pseudo) => {
          const content = getComputedStyle(node, pseudo).content;
          return content && !new Set(["none", "normal", "\"\"", "''"]).has(content);
        }),
      );
    };
    const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter(visible);
    const levels = headings.map((heading) => Number(heading.tagName.slice(1)));
    const violations = [];
    const mainCount = document.querySelectorAll("main").length;
    if (mainCount !== 1) violations.push(`expected one main landmark, found ${mainCount}`);
    if (levels.filter((level) => level === 1).length !== 1) violations.push("expected exactly one visible h1");
    if (levels.some((level, index) => index > 0 && level > levels[index - 1] + 1)) violations.push("heading order skips a level");
    if ([...document.querySelectorAll("img")].filter(visible).some((image) => !image.hasAttribute("alt"))) {
      violations.push("a visible image is missing an alt attribute");
    }
    if (
      [...document.querySelectorAll("button, a[href], [role='button'], [role='link']")]
        .filter(visible)
        .some((element) => !accessibleName(element) && !element.querySelector("img[alt]:not([alt=''])"))
    ) {
      violations.push("a visible button or link has no accessible name");
    }
    if (
      [...document.querySelectorAll("h1, h2, h3, h4, h5, h6, button, a[href], [role='button'], [role='link']")]
        .filter(visible)
        .some(hasGeneratedSemanticText)
    ) {
      violations.push("a semantic heading or control exposes generated pseudo-element text that can duplicate its accessible name");
    }
    if (
      [...document.querySelectorAll("input:not([type='hidden']), select, textarea")]
        .filter(visible)
        .some((element) => !element.labels?.length && !element.getAttribute("aria-label") && !element.getAttribute("aria-labelledby"))
    ) {
      violations.push("a visible form control has no label");
    }
    if (!document.documentElement.lang) violations.push("the document language is missing");
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) {
      violations.push(`horizontal overflow: ${document.documentElement.scrollWidth}px content in ${document.documentElement.clientWidth}px viewport`);
    }
    return { passed: violations.length === 0, violations };
  });
}

async function keyboardReachability(page, interaction) {
  const locator = page.getByRole(interaction.role, { name: interaction.name, exact: true });
  const count = await locator.count();
  if (count !== 1) return { id: interaction.id, keyboardReachable: false, message: `expected one named control, found ${count}` };
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  const limit = Math.max(
    10,
    await page.locator("a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])").count(),
  );
  for (let index = 0; index < limit + 2; index += 1) {
    await page.keyboard.press("Tab");
    const reached = await locator.evaluate((element) => element === document.activeElement || element.contains(document.activeElement)).catch(() => false);
    if (reached) return { id: interaction.id, keyboardReachable: true, message: "reached by Tab navigation" };
  }
  return { id: interaction.id, keyboardReachable: false, message: "not reached by Tab navigation" };
}

function captureGallery(captures) {
  const cards = captures
    .map(
      (capture) => `
      <article>
        <h2>${capture.id}</h2>
        <img src="${capture.file.replace(`${UI_EVIDENCE_DIR}/`, "")}" alt="Visual review capture for ${capture.id}">
        <p>${capture.audit.passed ? "Browser audit passed" : capture.audit.violations.join("; ")}</p>
      </article>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UI visual review evidence</title>
<style>
  body { margin: 0 auto; max-width: 90rem; padding: 2rem; font: 16px/1.5 system-ui; background: #f5f5f5; color: #171717; }
  main { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 24rem), 1fr)); gap: 1.5rem; }
  article { padding: 1rem; background: white; border: 1px solid #d4d4d4; }
  img { display: block; width: 100%; height: auto; border: 1px solid #e5e5e5; }
  h1 { grid-column: 1 / -1; } h2 { font-size: 1rem; overflow-wrap: anywhere; }
</style>
<main><h1>UI visual review evidence</h1>${cards}</main>
</html>\n`;
}

export async function captureUiEvidence({ root, baseUrl, chromium }) {
  const planRead = readJson(root, UI_PLAN_FILE);
  if (planRead.error) throw new Error(`${UI_PLAN_FILE} is ${planRead.error === "missing" ? "missing" : `invalid: ${planRead.error}`}`);
  const planErrors = validateUiPlan(planRead.value);
  if (planErrors.length > 0) throw new Error(`UI plan is invalid:\n${planErrors.map((error) => `  ${error.path} ${error.message}`).join("\n")}`);
  if (!chromium) throw new Error("Playwright Chromium is unavailable");

  const plan = planRead.value;
  const capturesDirectory = resolve(root, UI_EVIDENCE_DIR, "captures");
  mkdirSync(capturesDirectory, { recursive: true });
  const browser = await chromium.launch();
  const captures = [];
  const failures = [];
  try {
    for (const surface of plan.surfaces) {
      for (const state of surface.states) {
        for (const theme of surface.themes) {
          for (const viewport of plan.viewports) {
            const id = [surface.id, state.id, theme, viewport.name].map(safeCaptureName).join("--");
            const context = await browser.newContext({
              colorScheme: theme,
              reducedMotion: "reduce",
              viewport: { width: viewport.width, height: viewport.height },
            });
            await context.addInitScript((selectedTheme) => {
              localStorage.setItem("theme", selectedTheme);
              document.documentElement.classList.toggle("dark", selectedTheme === "dark");
              document.documentElement.style.colorScheme = selectedTheme;
            }, theme);
            const page = await context.newPage();
            try {
              const response = await page.goto(stateUrl(baseUrl, surface, state), { waitUntil: "domcontentloaded" });
              if (!response?.ok()) throw new Error(`route returned ${response?.status() ?? "no response"}`);
              await page.evaluate(async (selectedTheme) => {
                document.documentElement.classList.toggle("dark", selectedTheme === "dark");
                document.documentElement.style.colorScheme = selectedTheme;
                await document.fonts.ready;
                // A below-the-fold lazy image never loads while the page sits at
                // the top: its decode() never settles, so the capture hangs at 0%
                // CPU forever, and a fullPage shot of it would be blank anyway.
                // Force eager so the evidence actually contains the image, then
                // bound every wait so one stubborn image cannot stall the run.
                for (const image of document.images) {
                  if (image.loading === "lazy") image.loading = "eager";
                }
                await Promise.all(
                  [...document.images]
                    .filter((image) => !image.complete)
                    .map((image) =>
                      Promise.race([
                        image.decode().catch(() => undefined),
                        new Promise((settle) => setTimeout(settle, 3000)),
                      ]),
                    ),
                );
              }, theme);
              await page.addStyleTag({
                content:
                  "*, *::before, *::after { animation-delay: 0s !important; animation-duration: 0s !important; caret-color: transparent !important; scroll-behavior: auto !important; transition: none !important; } nextjs-portal { display: none !important; }",
              });
              await page.getByRole(state.marker.role, { name: state.marker.name, exact: true }).waitFor({ state: "visible" });
              const audit = await documentAudit(page);
              const interactions = [];
              for (const interaction of surface.interactions) interactions.push(await keyboardReachability(page, interaction));
              await page.evaluate(() => window.scrollTo(0, 0));
              const repoFile = `${UI_EVIDENCE_DIR}/captures/${id}.png`;
              const absoluteFile = resolve(root, repoFile);
              await page.screenshot({ path: absoluteFile, fullPage: true, animations: "disabled" });
              const capture = {
                id,
                surfaceId: surface.id,
                stateId: state.id,
                theme,
                viewport: { name: viewport.name, width: viewport.width, height: viewport.height },
                file: repoFile,
                sha256: sha256(readFileSync(absoluteFile)),
                audit,
                interactions,
              };
              captures.push(capture);
              if (!audit.passed || interactions.some((interaction) => !interaction.keyboardReachable)) failures.push(id);
            } catch (error) {
              failures.push(`${id}: ${error.message}`);
            } finally {
              await context.close();
            }
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  const draft = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    captureSession: randomUUID(),
    planFingerprint: planFingerprint(plan),
    sourceFingerprint: sourceFingerprint(root),
    captures: captures.sort((left, right) => left.id.localeCompare(right.id)),
  };
  mkdirSync(resolve(root, UI_EVIDENCE_DIR), { recursive: true });
  writeFileSync(resolve(root, UI_EVIDENCE_DRAFT_FILE), `${JSON.stringify(draft, null, 2)}\n`);
  writeFileSync(resolve(root, UI_GALLERY_FILE), captureGallery(draft.captures));
  if (failures.length > 0 || captures.length !== expectedCaptureMatrix(plan).length) {
    throw new Error(`Visual capture did not satisfy the plan:\n${failures.map((failure) => `  ${failure}`).join("\n")}`);
  }
  return draft;
}

export function acceptUiEvidence({ root, reviewer, responsibility, reason, changedSurfaceSummary }) {
  for (const [name, value] of Object.entries({ reviewer, responsibility, reason, changedSurfaceSummary })) {
    if (!nonEmpty(value)) throw new Error(`${name} is required to accept visual evidence`);
  }
  const planRead = readJson(root, UI_PLAN_FILE);
  if (planRead.error) throw new Error(`${UI_PLAN_FILE} must be valid before review acceptance`);
  const planErrors = validateUiPlan(planRead.value);
  if (planErrors.length > 0) throw new Error("The UI plan is invalid; acceptance cannot repair it");
  const draftRead = readJson(root, UI_EVIDENCE_DRAFT_FILE);
  if (draftRead.error) throw new Error(`${UI_EVIDENCE_DRAFT_FILE} must be regenerated before review acceptance`);
  const captureErrors = captureViolations(root, planRead.value, draftRead.value);
  if (captureErrors.length > 0) throw new Error(`Capture evidence is incomplete or stale:\n${captureErrors.map((item) => `  ${item.message}`).join("\n")}`);

  const previousRead = readJson(root, UI_REVIEW_FILE);
  if (!previousRead.error && previousRead.value?.captureSession === draftRead.value.captureSession) {
    throw new Error("This capture session was already reviewed; regenerate screenshots before accepting another visual update");
  }

  const captures = [...draftRead.value.captures]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(({ id, file, sha256: captureHash }) => ({ id, file, sha256: captureHash }));
  const manifest = {
    schemaVersion: 1,
    acceptedAt: new Date().toISOString(),
    captureSession: draftRead.value.captureSession,
    planFingerprint: planFingerprint(planRead.value),
    sourceFingerprint: sourceFingerprint(root),
    evidenceFingerprint: evidenceFingerprint(draftRead.value),
    review: {
      reviewer: reviewer.trim(),
      responsibility: responsibility.trim(),
      reason: reason.trim(),
      changedSurfaceSummary: changedSurfaceSummary.trim(),
    },
    captures,
  };
  const reviewErrors = validateReviewManifest(manifest);
  if (reviewErrors.length > 0) throw new Error(`Review manifest is invalid:\n${reviewErrors.map((error) => `  ${error.path} ${error.message}`).join("\n")}`);
  mkdirSync(dirname(resolve(root, UI_REVIEW_FILE)), { recursive: true });
  writeFileSync(resolve(root, UI_REVIEW_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
