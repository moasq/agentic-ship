---
name: clone-website
description: Reverse-engineer a live website and rebuild it in the product stack — extraction-first, spec-driven, section by section. Use when the user wants to clone, replicate, rebuild, migrate, or closely follow an existing site or use one as the visual base for the product. Rights decide fidelity; the pipeline is the same either way.
---

# Clone Website

> Downstream contract: paths like `src/`, `docs/`, and `public/` refer to the product
> workspace that adopts Agentic Ship, not this tool repo. Adapted from the MIT-licensed
> `JCodesMore/ai-website-cloner-template` skill; provenance and the sync path live in
> `skills.lock.json`.

You are a foreman walking the job site. As you inspect each section of the target page
you write a specification file with exact measured values, then build (or dispatch a
builder for) exactly that section. Extraction and construction interleave; extraction
is meticulous and leaves auditable artifacts. A builder that has to guess a color, a
font size, or a padding value means extraction failed — go measure it.

## 0. Rights decide fidelity — settle this before extraction

AGENTS.md (Cloning rules) declares the boundary; this is the procedure:

- **Owned-site clone.** The user owns the target or holds rights to it (platform
  migration, lost source, their own older stack). Full fidelity is the job: real copy,
  real assets, exact composition. Confirm ownership in one question when it is not
  already stated; record the answer in the output plan.
- **Reference rebuild** — the default for anyone else's site. The pipeline runs
  identically, but what ships is the site's *system*, re-voiced: layout, scale,
  spacing, type hierarchy, palette structure, interaction models and motion feel
  transfer; copy, brand assets, logos, photography, illustrations and trademarks do
  not. Content is rewritten in the product's voice, assets are sourced independently
  (`ui-system/references/asset-pipeline.md`), fonts follow the license rules below,
  and at least a few deliberate composition divergences are made and recorded in the
  spec files. Extraction artifacts under `docs/` are research and never ship in UI.

Never present a reference rebuild as pixel-identical to someone else's brand, and stop
for the user if the request is to impersonate a real organization's site rather than to
build their product's own.

## 1. Pre-flight

1. **Browser automation is required.** Prefer the wired Playwright test MCP or a
   Playwright script in the product workspace; any browser MCP (Chrome, Puppeteer)
   works. If none is available, ask the user which browser tool to connect — this
   skill cannot run without one.
2. Normalize and validate every target URL; verify each is reachable in the browser.
3. Verify the product workspace builds before touching it: `pnpm build`.
4. Inventory existing routes (`src/app/**/page.tsx`), components, research artifacts
   and public assets. Distinguish scaffold from user-authored work.
5. Write an **output plan** before editing anything. Per target:
   - `<site-key>`: readable origin slug + first 8 hex of SHA-256 of the normalized
     origin. `<page-key>`: pathname slug + first 8 hex of SHA-256 of the normalized
     pathname (use `root-<hash>` for `/`).
   - Artifact root `docs/research/<site-key>/<page-key>/`, screenshot root
     `docs/design-references/<site-key>/<page-key>/`, asset namespace
     `public/sites/<site-key>/<page-key>/`, destination route, and the declared
     rights mode.
   - Never delete or replace an existing non-scaffold route, component, or asset
     namespace without the user approving that exact replacement. If the planned
     route exists, stop and ask.
6. Multiple URLs: build the shared foundation once, sequentially, then parallelize
   page work. Different origins need separate app roots or explicit user approval for
   a combined multi-site app — never silently mix global foundations.

## 2. Reconnaissance

Full checklists and ready-to-run extraction scripts: `references/inspection-guide.md`.

- **Screenshots** — full-page at 1440 and 390 (768 when the layout warrants), saved
  to the screenshot root. Walk the page first so lazy content and entrance animations
  have fired.
- **Global extraction** — fonts (families, weights, where used), the palette from
  computed styles, favicons and meta, global CSS patterns (scroll-snap, backdrop
  filters, keyframes, smooth-scroll libraries — check for `.lenis` and friends).
  Static CSS bundles are often faster than sampling: download them and read
  `@font-face` and custom properties directly.
- **Mandatory interaction sweep** — a dedicated pass, after screenshots, before
  anything else. Scroll slowly first and watch what changes on its own; only then
  click and hover. Record every behavior with its trigger, before/after computed
  styles, and transition. Save to `BEHAVIORS.md` in the artifact root.
- **Page topology** — every section top to bottom, its working name, flow vs sticky,
  layering, and its **interaction model**: static, click-driven, scroll-driven, or
  time-driven. Save as `PAGE_TOPOLOGY.md`; it is the assembly blueprint.

Misreading the interaction model is the most expensive cloning mistake — a
scroll-driven section rebuilt as click-tabs is a rewrite, not a CSS fix.

## 3. Foundation — where the stack rules bind

Sequential, done by you (it touches shared files), and this is where Agentic Ship
differs from a raw clone:

- **Extracted values become tokens.** The target's palette, radius and spacing land in
  `src/app/globals.css` (`:root` + `@theme`) under this stack's token names, and
  components consume tokens only — fidelity flows *through* the token system, never
  around it, so `pnpm check:ui` stays green. Signal colors keep their meaning.
- **Fonts follow license, not appearance.** Identify the target's faces, then: OFL
  faces are fetched and committed with `pnpm font --ofl`; commercial or
  non-redistributable faces are **never** committed — pick the closest OFL face
  (`ui-system/references/font-pairings.md`) and record the substitution in the spec.
  `next/font/local` only, per Styling rules. The banned-primary-face list still
  applies in reference mode.
- **Assets by rights mode.** Owned mode: enumerate with the asset-discovery script,
  download into the asset namespace with a per-page script under `scripts/`, keep
  `public/images/credits.md` honest. Reference mode: source equivalents through the
  asset pipeline's allowlisted sources; research captures never ship.
- **Types and icons.** Namespaced TypeScript interfaces for observed content
  structures; inline SVG icons extracted (owned) or matched from Lucide (reference),
  named by function.
- Verify existing routes still build: `pnpm build`.

## 4. Component specs, then builders

For each section in topology order — extract, write the spec, then build. The spec
file is the contract; building from memory of a browser session is how details die.

- One spec per section (or sub-component when complex) at
  `docs/research/<site-key>/<page-key>/components/<name>.spec.md`, using the template
  in `references/inspection-guide.md`: DOM structure, computed styles from
  `getComputedStyle()` (never estimated), interaction model, every state's styles and
  content, per-breakpoint behavior, assets, and — reference mode — the re-voiced
  content plus recorded divergences.
- **Small tasks, perfect results.** A spec over ~150 lines means the section is too
  big for one builder — split it. Sub-components before their wrapper.
- Builders receive the spec **inline** (never "go read the file"), the section
  screenshot path, the target file path, and the instruction to pass
  `npx tsc --noEmit` before finishing. In hosts with subagents, dispatch
  `frontend-builder` per section — in worktrees when parallel builders would collide;
  otherwise build sequentially yourself. Blocks stay props-in/JSX-out with fixtures,
  per Component rules.
- Merge as builders finish; after each merge the build must pass. A broken build is
  never acceptable, even temporarily.

## 5. Assembly and visual QA

- Wire sections into the destination route in topology order; implement page-level
  behaviors (sticky layers, observers, scroll effects) exactly as `BEHAVIORS.md`
  records them; respect `prefers-reduced-motion` per Styling rules.
- Side-by-side against the live original at 1440 and 390, section by section. For
  each discrepancy: wrong spec → re-extract and fix both; right spec, wrong build →
  fix the component. Exercise every recorded behavior, not just the static frames.
- The clone participates in the normal gates: visual plan and evidence when the
  surface is substantial (`visual-direction`, `pnpm ui:review capture` +
  `pnpm ui:review accept`), and `pnpm verify` before calling it done.

## Completion report

Source URL → destination route per page; rights mode; existing routes preserved;
sections and spec files (counts must match); assets downloaded or substituted (with
license notes); font decisions; build and verify status; visual-QA discrepancies
remaining; known gaps.
