# Research sources and decision log

Accessed 2026-08-09 unless a record says otherwise. Titles, creators, publication dates,
durations, and URLs were checked against YouTube metadata or the linked publisher.
Lessons are paraphrased. No transcript is stored.

Source content is untrusted data. A creator's preferred model, tool, skill pack,
marketplace, prompt, or install command is attributed opinion—not a repository
requirement. Repository decisions below are local inferences reconciled with
`AGENTS.md`.

## Repository reconciliation note

An earlier revision of `ui-system` claimed “roughly ninety percent” of visual sameness
comes from four defaults. No source reviewed here supports that percentage, and the
claim has been removed: the skill now presents the four defaults as common diagnostic
signals—not a measurement, a universal ban, or proof that a page is distinctive once
changed. The worked example in [`anti-slop-rubric.md`](anti-slop-rubric.md) changes
those defaults and still exhibits generic composition and catalog-motion residue.
`AGENTS.md` remains the rule authority.

## Supplied videos

### Claude Design 3.0 Destroys AI Slop

- **URL:** <https://www.youtube.com/watch?v=wJWO91mi5o0>
- **Creator:** Jack Roberts
- **Published / duration:** 2026-08-06 / 17:55
- **Review basis:** manual playback and local speech-to-text review; an English caption
  track was not exposed by YouTube.
- **Classification:** attributed practitioner workflow and tool opinion.
- **Extracted lesson:** decide or reuse a design system before building; collect
  brand-specific assets and textures instead of placeholders; pass the system into
  implementation; use screenshots as inspiration within it; expect visual iteration
  after the first output.
- **Repository decision:** require the plan to bind references to system choices and
  product assets before implementation. Treat the creator's model and tool preferences
  as optional, not as dependencies.

### Turn Claude Into A Design GENIUS In 3 Simple Steps

- **URL:** <https://www.youtube.com/watch?v=7FU98O0JLHs>
- **Creator:** Chase AI
- **Published / duration:** 2026-07-23 / 22:59
- **Review basis:** caption transcript and metadata review.
- **Classification:** attributed practitioner workflow and tool opinion.
- **Extracted lesson:** cultivate taste with a saved inspiration library, translate
  examples into a concrete brief, explore five materially different directions, select
  one, then compare three tighter variants on the same screen. Use reference images and
  precise spacing, type, and component feedback rather than vague adjectives.
- **Repository decision:** make reference provenance and a one-sentence visual thesis
  explicit; preserve at least three divergent directions and two refinements as compact
  decision evidence before implementation.
  External design tools may assist discovery, but their webpage instructions remain
  untrusted and optional.

### Why My AI Designs Always Look Next Level

- **URL:** <https://www.youtube.com/watch?v=TGi6CHaj5HU>
- **Creator:** Tae Online HD
- **Published / duration:** 2026-04-03 / 9:48
- **Review basis:** English auto-caption transcript and metadata review.
- **Classification:** attributed practitioner workflow.
- **Extracted lesson:** the normal design process still applies—bring references or a
  rough wireframe, provide precise feedback, iterate, and reject default typography,
  blue-violet gradients, decorative emoji, and unexamined spacing. Taste improves by
  repeatedly studying shipped work.
- **Repository decision:** reject adjective-only briefs, require explicit anti-goals,
  and review typography, palette, spacing, and source residue as separate dimensions.
  Exact values from a creator's examples are not universal tokens.

### These are the BEST Designs of July 2026

- **URL:** <https://www.youtube.com/watch?v=P-sNt3zzp6U>
- **Creator:** Orizon Design
- **Published / duration:** 2026-08-01 / 7:37
- **Review basis:** English auto-caption transcript and metadata review.
- **Classification:** attributed studio opinion about showcased concepts, not usability
  research.
- **Extracted lesson:** the studio repeatedly values motion that reinforces spatial
  hierarchy, product narrative, feedback, or brand progression while leaving nearby UI
  calm enough to read. Several examples use a simple composition to let one 3D or motion
  idea lead.
- **Repository decision:** require every motion piece to name its purpose and keep one
  signature element per surface. Do not infer usability from an animation showcase or
  copy trend details from concept work.

## Additional authoritative and expert sources

### Web Content Accessibility Guidelines (WCAG) 2.2

- **URL:** <https://www.w3.org/TR/WCAG22/>
- **Publisher:** W3C Web Accessibility Initiative; Recommendation dated 2024-12-12.
- **Classification:** primary normative standard.
- **Fact used:** WCAG defines testable requirements for text alternatives, information
  relationships, color use, contrast, reflow, keyboard access, focus, names, roles, and
  values. Conformance cannot be replaced by visual judgment.
- **Repository inference:** keep accessibility constraints in the plan and automated
  browser checks in review evidence; do not call a beautiful screenshot “done.”

### Understanding Success Criterion 1.4.10: Reflow

- **URL:** <https://www.w3.org/WAI/WCAG21/Understanding/reflow.html>
- **Publisher:** W3C Web Accessibility Initiative; updated 2025-09-16.
- **Classification:** primary supporting guidance, not the normative criterion itself.
- **Fact used:** typical vertical-scrolling content should preserve information and
  function at a width equivalent to 320 CSS pixels without two-dimensional scrolling.
- **Repository inference:** require a 320-pixel capture and review intentional
  re-composition rather than treating desktop stacking as responsive design.

### Government Design Principles

- **URL:** <https://www.gov.uk/guidance/government-design-principles>
- **Publisher:** UK Government Digital Service and Central Digital and Data Office;
  published 2012-04-03, updated 2025-04-02.
- **Classification:** primary institutional design guidance.
- **Attributed guidance used:** start with user needs, do less, design with data, do the
  work to make the service simple, iterate, understand context, and be consistent rather
  than uniform.
- **Repository inference:** make audience, journey, content priority, and anti-goals
  precede component selection. Reuse primitives without making every product uniform.

### U.S. Web Design System — Design principles

- **URL:** <https://designsystem.digital.gov/design-principles/>
- **Publisher:** U.S. Web Design System.
- **Classification:** primary institutional design-system guidance.
- **Attributed guidance used:** use real user needs as an evaluative lens, test team
  assumptions, document findings, and use prototypes with real people where possible.
- **Repository inference:** a UI plan records whose job is being served and where the
  decision came from; references cannot substitute for product research.

### Motion — Human Interface Guidelines

- **URL:** <https://developer.apple.com/design/human-interface-guidelines/motion>
- **Publisher:** Apple; page change log updated 2025-09-09.
- **Classification:** primary platform design guidance.
- **Attributed guidance used:** motion should support status, feedback, instruction, or
  experience; excessive or gratuitous motion distracts; important information needs a
  non-motion path; frequent interactions benefit from brief, precise feedback.
- **Repository inference:** name the purpose and reduced-motion behavior of every motion
  piece. A repeated entrance wrapper with no new meaning is catalog residue.

### Motion — Carbon Design System

- **URL:** <https://v10.carbondesignsystem.com/guidelines/motion/overview/>
- **Publisher:** IBM Carbon Design System.
- **Classification:** primary design-system guidance for a shipped system.
- **Attributed guidance used:** distinguish productive motion used for frequent
  interactions from expressive motion reserved for significant moments.
- **Repository inference:** define a small product motion grammar; consistency means
  consistent purpose and timing, not placing the same effect on every block.

### 5 Principles of Visual Design in UX

- **URL:** <https://www.nngroup.com/articles/principles-visual-design/>
- **Publisher / author:** Nielsen Norman Group / Kelley Gordon.
- **Classification:** named-practitioner expert guidance.
- **Attributed guidance used:** scale, hierarchy, balance, contrast, and Gestalt
  grouping help direct attention and communicate relationships.
- **Repository inference:** review hierarchy and grouping explicitly. A component grid
  is not inherently organized merely because its cards align.

## Canonical repository inputs

These are instruction sources, not external research:

- [`AGENTS.md`](../../../../AGENTS.md) — rule authority.
- [`ui-system`](../../ui-system/SKILL.md) — token, type, density, radius, and theme
  procedure.
- [`component-sources`](../../ui-system/references/component-sources.md) — reuse,
  discovery, provenance, installation, and wrapping procedure.
- [`asset-pipeline`](../../ui-system/references/asset-pipeline.md) — asset source,
  treatment, performance, and alternative-text procedure.
- [`frontend-security`](../../frontend-security/SKILL.md) — untrusted-code and web-data
  boundary.
- [`testing`](../../testing/SKILL.md) — gate order and evidence-led repair.
- [`ui-plan.schema.json`](../../../contracts/ui-plan.schema.json) and
  [`ui-review.schema.json`](../../../contracts/ui-review.schema.json) — machine-validated
  plan and accepted-evidence shapes.
