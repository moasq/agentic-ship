---
name: writing-guidelines
description: Write and review documentation, README content, wiki articles, and any reader-facing prose in this repository or a product workspace. Use when asked to "write docs", "write an article", "build a wiki page", "review my docs", "check writing style", or when finishing any document longer than a commit message.
---

# Writing guidelines

Docs succeed because of hundreds of small decisions. This skill carries the Vercel docs
handbook (vendored under `references/`) and binds it to this stack: which rules apply
verbatim, which are replaced by house rules, and the order of the writing loop.

## The writing loop

1. **Plan first.** Before drafting a page, write five lines: overview, goal, audience,
   content plan, open questions. The goal takes a testable verb (configure, explain,
   debug). Pick one content type per page: tutorial, how-to, reference, conceptual,
   troubleshooting, or landing. One page does one job.
2. **Draft against the handbook.** `references/guidelines.md` is the full rule set;
   apply everything the scope table below does not override.
3. **Review with the checklist.** `references/review-checklist.md` is a self-contained
   review prompt. Run it over the finished draft and report findings in `file:line`
   form. It also names the AI-tell patterns to flag: summary-style transitions,
   spec-sheet voice, stop-start fragments, personified artifacts.
4. **Humanize.** Run the `humanizer` skill over the final prose in embedded mode. It is
   the last pass, after content is settled, so it edits voice rather than facts.

## What binds here, what does not

Most of the handbook transfers verbatim: active voice, direct address, imperative
steps, sentences under 20 words, sentence-case headings, descriptive subheadings,
summary-first pages and sections, acronyms spelled out on first use, list and code-block
discipline, descriptive `snake_case` placeholders, no em dashes, no banned words
(`easy`, `simple`, `quick`), no filler (`very`, `just`, `really`).

These upstream rules are Vercel product conventions and do **not** bind:

- **Curly quotes and the `…` ellipsis character**: this stack writes plain markdown for
  terminals, GitHub, and diff review, and the `humanizer` skill treats curly quotes as
  an AI tell. Straight quotes and three dots win. This is the one deliberate conflict
  between the two vendored sources, resolved here.
- **`meta.contentType`, `meta.navLabel`, `<Steps/>`, non-breaking spaces, dashboard
  deep-link formats, the ACME demo account, `vercel/examples`, and model-string
  requirements**: all specific to Vercel's docs platform. Declare the content type in
  the plan instead of frontmatter, and use the components this stack actually ships.
- **"Use only enterprise models" and PR-disclosure process rules**: team policy for
  Vercel employees, recorded in the reference, not enforced here.

House rules that always win over the handbook:

- Command names in prose must exist: `pnpm check:commands` fails on a documented
  `pnpm <name>` with no matching script (AGENTS.md).
- Shell-isms never appear in authored commands; Node scripts behind `pnpm` names do the
  work on every platform (AGENTS.md).
- Product articles under `src/app/blog/` follow the `seo-blog` skill for metadata,
  structured data, and publication mechanics; this skill governs their prose quality.
- Engineering decision records follow the `documentation-and-adrs` skill; this skill
  governs how those records read.

## Where writing lands in this repository

- `README.md` is the front door: what the toolkit is, the stack, install, commands.
- `docs/` is the wiki: one article per subject, named after the reader's question,
  opening with a one-paragraph answer. Articles link each other by relative path.
- Skills and role briefs are agent-facing: the same prose rules apply, but their
  structure is fixed by AGENTS.md (declaration there, procedure in the skill).

## Review output format

Group findings by file, one line each, tersest form that still names the fix:

```text
docs/stack.md:12 - passive voice ("the queue is updated by...")
docs/stack.md:40 - heading is title case; use sentence case
docs/tracking.md:8 - banned word "easy"; describe the concrete step
```

A clean file reports `pass`. Skip explanations unless the fix is not obvious from the
finding.
