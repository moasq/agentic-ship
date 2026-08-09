---
name: visual-qa
description: Capture, inspect, repair, and accept deterministic visual evidence after authored UI changes. Use before declaring UI complete, when screenshots or UI evidence are missing or stale, when responsive/theme/state behavior needs review, or when a visual gate is red.
---

# Visual QA

Turn a visual direction into reviewable evidence. Automated checks prove coverage and
basic browser integrity; the reviewer proves that the rendered product expresses the
declared direction without generic generated-page residue.

## Authority and required inputs

Read the **Component rules**, **Styling rules**, and UI-quality rules in
[`AGENTS.md`](../../../AGENTS.md). They are authoritative. Use this skill as the
post-implementation procedure, and use [`testing`](../testing/SKILL.md) for the gate
order and repair loop.

Before capture, require this frontend handoff:

- a valid [UI plan](../../contracts/ui-plan.schema.json);
- changed surface ids and source summary;
- declared routes, deterministic states, themes, viewports, and interactions;
- accessibility constraints, anti-goals, reference decisions, and the signature
  element;
- confirmation that captures use only public or synthetic content.

If the plan is absent or invalid, return to
[`visual-direction`](../visual-direction/SKILL.md). Do not reverse-engineer intent from
the finished screenshot.

Load [`references/review-policy.md`](references/review-policy.md) when capturing,
accepting, diagnosing stale evidence, or integrating the completion gate. Load the
[operational anti-slop rubric](../visual-direction/references/anti-slop-rubric.md) for
the subjective rendered review.

## Procedure

### 1. Reproduce the declared scope

Run the plan check first:

```text
pnpm ui:plan check
```

Start the application in a separate terminal with deterministic local fixtures:

```text
pnpm dev
```

Do not capture production, authenticated personal state, changing vendor data, secrets,
or real customer content. A polished production screenshot is not worth creating an
unreviewable data artifact.

### 2. Generate the evidence matrix

Capture from the local server:

```text
pnpm ui:review capture --base-url http://localhost:3000
```

The command must complete every route × state × theme × viewport combination declared
by the plan. It records stable screenshot names, browser-audit results, content hashes,
and an inspectable gallery at `.agents/ui/evidence/index.html`. A partial matrix is a
failed capture, not a smaller baseline.

### 3. Inspect objective failures

Repair browser-audit failures before judging aesthetics. Inspect:

- route and state marker reachability;
- one main landmark and coherent heading order;
- named images, controls, and labeled form fields;
- semantic labels without duplicated generated pseudo-text;
- horizontal reflow at every declared width;
- keyboard reachability for every declared meaningful interaction;
- explicit theme rendering and every applicable loading, empty, error, and success
  state.

Use evidence from the rendered DOM and the exact failing capture. Follow the testing
skill's repair loop; never relax an assertion merely because a visual implementation
made it inconvenient.

### 4. Review direction and product specificity

Open the gallery and apply every dimension in the anti-slop rubric. Record each as
`pass`, `concern`, or `blocker`, with a concrete reason. Do not total the results or
invent an aesthetic score.

Compare narrow, tablet, and desktop together. Confirm that the surface re-composes
rather than only stacking, that the same content priority survives every theme and
state, and that the signature element remains singular. Catalog polish, build success,
or a clean automated audit cannot substitute for this review.

### 5. Repair and regenerate

For every blocker, name:

1. the surface and state;
2. the observable mismatch with the plan;
3. the source-level repair;
4. the capture that will prove it.

Make the bounded repair, run relevant focused tests, and capture the whole declared
matrix again. Do not edit screenshot bytes, manifest hashes, or browser-audit JSON by
hand. Do not accept a previous capture session as evidence for a new visual decision.

### 6. Accept with accountable evidence

After objective checks pass and subjective blockers are resolved, accept the newly
generated evidence:

```text
pnpm ui:review accept --reviewer "<name>" --responsibility "<role or area>" --reason "<why the result matches the plan>" --changed "<surface-by-surface summary>"
```

The reviewer, responsibility, reason, and changed-surface summary must be specific
enough for another person to understand the decision from the manifest. “Update
baseline” is not a reason.

### 7. Prove completion

Run:

```text
pnpm ui:review check
pnpm check:ui
pnpm verify
```

Run `pnpm verify:full` before a PR, release, or deploy. If any authored UI input, plan
decision, screenshot, or review record changes afterward, regenerate and review the
evidence rather than bypassing the stale result.

## Handoff

Return the quality receipt with:

- plan, capture-session, source, and evidence fingerprints;
- gallery path and number of captures reviewed;
- objective browser-audit result;
- subjective rubric blockers resolved and concerns retained;
- reviewer identity, responsibility, reason, and changed-surface summary;
- focused test output and final gate output.
