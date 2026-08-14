---
name: plain-language
description: >-
  Invoked by /plain-language. Reviews project text for plain-language
  compliance and produces structured findings with rewrites. Does not
  auto-activate on natural-language requests.
allowed-tools: Read Write Bash Glob Grep Task Agent TaskCreate TaskUpdate
disable-model-invocation: true
---

Audit project prose against the pl-01..pl-33 rule catalog and produce one findings document with verified rewrites. This skill is read-only over the reviewed files: it recommends, it never edits. The state file is for your own resumability, not human review.

Mirror the four phases below in the host's todo tool so the user sees progress.

## Non-negotiables (read first)

- **Never modify reviewed files.** Findings and rewrites go in the plan document only.
- **Explicit invocation only.** This skill runs when the user invokes `/plain-language` — never auto-activate.
- **Classify every finding** FALSIFIABLE (cites exact prose on a specific line that Grep can confirm) or OPINION (tone, audience fit, ambiguity — interpretation-dependent).
- **Grep-verify every FALSIFIABLE citation** against the cited file before it enters the draft. No match → drop the finding and count it as a dropped hallucination.
- **One output file.** The consolidated plan is the single user-facing artifact; your end-of-run reply names only its path, never the state file or intermediate details.

## Scope

- **Review:** prose in `.md`, `.mdx`, `.markdown`, `.txt`, `.rst`, `.adoc`, `.org`, `.wiki` files; UI strings; error messages.
- **Skip:** code inside fences and backticks, variable names, import statements, configuration values, URLs, file paths.
- **Preserve technical terms:** flag jargon only when a simpler alternative exists without losing precision.
- **Exclude:** dotdirs, `node_modules/`, `vendor/`, `dist/`, `build/`, `coverage/`, `__pycache__/`, `target/`, `venv/`, anything in `.gitignore`.
- **Never scan the skill's own directory.** Always work from the user's project root. A bare `/plain-language` reviews all in-scope prose from the project root; ask only when the project root is ambiguous or the user named files that don't exist.
- Plain language checks readability, not doc/code accuracy — doc/code drift detection is out of scope.

## State file

Working state lives at `.agent-state/plain-language/plain-language-YYYY-MM-DD.md` (today's date; house path — upstream uses `.agents/local/state/`, but in this repository `.agent-state/` is the one gitignored home for runtime state). Never shown to the user, never committed.

**On start:**
1. Create `.agent-state/plain-language/` if it does not exist.
2. Glob `.agent-state/plain-language/plain-language-*.md`. If the newest file has unchecked items, resume against it. If today's file exists and is complete, create `...-YYYY-MM-DD-2.md` (then `-3`, and so on). Otherwise create today's file. Deleting the file forces a fresh run.

**Format** — a markdown checklist grouped by batch:

```markdown
# Plain Language — 2026-07-17

## Batch 1
- [ ] README.md
- [ ] docs/setup.md

## Batch 2
- [ ] docs/api.md

## Findings draft
- [pl-09] Use active voice — docs/setup.md:42 — sev:high — grep:`is initialized by` — "The database is initialized by the setup script" → "The setup script initializes the database"
```

Only the orchestrator writes this file — tick items and append each worker's findings under `## Findings draft` as workers return; workers never touch it. The draft in the state file is what Phase 3 reviews, so a resumed run keeps its findings.

## Phase 1 — Discovery (mechanical, no subagents)

Enumerate prose files in scope with Glob or a shell lister inline — prefer `rg --files`, falling back to `fd --type f`, then plain `find . -type f`, when a tool isn't installed — applying the Scope exclusions. Group into batches of 3–5 files and write the checklist to the state file. Do not stop to summarize — proceed straight to Phase 2.

## Phase 2 — Review (parallel by batch)

Dispatch one worker subagent per unchecked batch, up to 5 concurrent, **all of a wave's Agent calls in a single message** so they run in parallel. More batches than the cap → successive waves. Workers use the host's cheap-model alias (e.g. `model: haiku` — never a pinned version). Workers run from the user's project root, so expand every `references/…` path in their briefs to its absolute path under this skill's directory before dispatching.

Brief each worker: *"You are a plain-language reviewer applying the pl-\* rule catalog to one batch of prose files. You flag violations and propose verified rewrites; you never modify source files."* Each worker:

1. Loads `references/rules-quick-ref.md` (the pl-01..pl-33 catalog) and `references/severity-rubric.md` (high/medium/low definitions). Load on demand: `references/word-substitutions.md` when judging word choice, `references/active-voice-guide.md` when passive voice appears, `references/before-and-after-examples.md` when a rewrite needs restructuring rather than a word swap.
2. Reads its batch files — issue the Read/Grep calls for a batch in one turn, not file by file.
3. For each violation: classifies FALSIFIABLE or OPINION, and for FALSIFIABLE runs Grep with an exact pattern against the cited file — no match means drop the finding and count the drop.
4. Verifies each rewrite inline: it must resolve the flagged rule, introduce no new violation, preserve technical accuracy, and read naturally in context. If the worker cannot verify a rewrite, it writes `[Manual review required — unverified rewrite]` in place of the rewrite rather than guessing.
5. Assigns severity from the rubric and returns findings as compact markdown bullets, one line each, plus its dropped-hallucination count.

The rule catalog and rubric are worker reading — the orchestrator never loads them.

**Finding format** (OPINION findings omit `grep:`):

```
- [pl-09] Use active voice — docs/setup.md:42 — sev:high — grep:`is initialized by` — "The database is initialized by the setup script" → "The setup script initializes the database"
- [pl-14] Use contractions — docs/faq.md:12 — sev:low — "It is not necessary to restart" → "You don't need to restart"
```

One finding per rule violation, always with a line number. Files with no findings still count toward the files-reviewed total.

The orchestrator appends each worker's findings to the draft (grouped by file, ordered by line) and ticks the batch's checkboxes. A failed worker is logged and its batch redispatched once; if it fails again, mark the batch `[x] (skipped — worker failed)` and continue.

## Phase 3 — Adversarial review (one round)

Dispatch one reviewer subagent on the host's default model with the full findings draft and repo read access. Its prompt is `references/adversarial-review-prompt.md`. The reviewer re-runs cited greps itself, drops hallucinated citations, challenges false positives and severity inflation, verifies rewrites, and flags missing findings, returning a KEEP/REVISE/DROP verdict list.

Apply the verdicts to the draft: delete DROPs, apply REVISEs, fold in any added findings. Depth = 1 — no second round, no re-review of the corrections.

## Phase 4 — Report

Write the consolidated plan from the reviewed findings using the template in `references/final-plan-format.md` (load it now, not earlier). Path resolution:

1. `docs/` exists at the repo root → `docs/reviews/YYYY-MM-DD-plain-language-plan.md` (house path: `docs/` here is a curated wiki, so dated audit plans live under `docs/reviews/`, created if missing; upstream writes into `docs/` directly).
2. Otherwise → `YYYY-MM-DD-plain-language-plan.md` at the repo root.

`YYYY-MM-DD` is `date +%Y-%m-%d` — distinct from the state file's date only in that a plan is always written fresh, never resumed. Findings still tagged `[Manual review required — ...]` go in the plan's `<manual_review>` appendix, never its `<changes>` section. Your reply to the user names this path and nothing else.

## Failure modes to avoid

- Do not flag text inside code fences, inline backticks, URLs, or file paths — even when it reads like prose.
- Do not flag precise domain jargon, regulated language that must appear verbatim, or proper nouns.
- Do not collapse two rule violations into one finding, or emit a finding without a line number.
- Do not let a worker emit an unverified FALSIFIABLE finding — the grep gate is per finding, not per file.
- Do not smuggle an unverified rewrite into the plan's change list — the sentinel routes it to manual review.
- Do not surface the state file, batch structure, or subagent details to the user.

## Done

The run is done when every state-file checkbox is ticked and the plan file is written. Reply with the plan path. Do not commit, do not modify reviewed files, do not delete the state file.
