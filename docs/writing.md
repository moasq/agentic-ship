# How are these docs written?

Five vendored skills and one gate. The `writing-guidelines` skill carries the Vercel
docs handbook and scopes it to this stack. The `humanizer` skill strips the tells of
AI-generated prose from every finished draft. The `documentation-and-adrs` skill
decides what gets recorded and where. The `crafting-effective-readmes` skill shapes
the README around its reader, and `/plain-language` audits everything for readability
with verified rewrites. `pnpm check:commands` then reads the result and fails the
build if any article promises a command that does not exist. Documentation here is
gated work product, not an afterthought.

## The loop

1. **Plan.** Five lines before any draft: overview, goal, audience, content plan, open
   questions. One content type per page: tutorial, how-to, reference, conceptual,
   troubleshooting, or landing.
2. **Draft against the handbook.** Active voice, direct address, sentences under 20
   words, sentence-case headings, summaries first, acronyms spelled out, descriptive
   placeholders, and no `easy`, `simple`, or `quick`.
3. **Review with the checklist.** The vendored review prompt reports findings in
   `file:line` form, including the AI tells the handbook names: summary-style
   transitions, spec-sheet voice, personified artifacts.
4. **Humanize.** The `humanizer` pass removes what the checklist missed: inflated
   significance, rule-of-three padding, vocabulary tells, em dashes, hedging, and
   generic upbeat endings. It edits voice, never facts; a rewrite may not contain a
   claim the source did not.

## Where the skills came from

All five arrived through the same door as every vendored skill. Each was found with
the skills.sh registry CLI, shallow-cloned, and content-reviewed in full. Its license
was copied into the skill directory, and its provenance (which repository, which
commit, which license) was recorded in [skills.lock.json](../skills.lock.json).

| Skill | Upstream | License |
| --- | --- | --- |
| `writing-guidelines` | vercel-labs/writing-guidelines, the source behind Vercel's 44K-install wrapper skill | MIT |
| `humanizer` | blader/humanizer, the English original of the registry's most-installed humanizer family | MIT |
| `documentation-and-adrs` | addyosmani/agent-skills, same author as the vendored accessibility skill | MIT |
| `crafting-effective-readmes` | softaworks/agent-toolkit, with the classic README references vendored and attributed | MIT |
| `plain-language` | ggwicz/skills, a grep-verified readability audit over the plainlanguage.gov rule set | MIT |

Two details from that review are worth knowing. Vercel's own installable skill
fetches its rules from the network on every use, and its repository carries no
license. This kit vendors the MIT source repository behind it instead, pinned and
offline. And the two vendored sources disagree on one rule: the handbook wants curly
quotes, the humanizer treats them as an AI tell. Straight quotes win here, because this stack writes plain
markdown for terminals and diffs; the resolution is recorded in the
`writing-guidelines` skill so nobody re-litigates it.

## What each skill owns

- `writing-guidelines`: prose quality everywhere a reader looks: this wiki, the
  README, PR bodies, product docs in a downstream workspace.
- `humanizer`: the final pass over any finished text, and a standalone tool when asked
  to make existing text sound human.
- `documentation-and-adrs`: decision records, why-comments, README and changelog
  structure. The `seo-blog` skill keeps sole ownership of the product blog pipeline:
  metadata, structured data, sitemaps.

The boundaries matter because overlapping doctrine is how documentation rots: two
skills with different opinions about one artifact produce documents that follow
neither. One rule, one home applies to prose exactly as it applies to code.
