# Final Plan Format

Loaded by the orchestrator at the Report step. The consolidated plan is ONE self-contained markdown file optimized for a downstream LLM (or human) to execute — the single user-facing artifact. It never references the state file or any subagent; a reader who has never heard of this skill can apply every change.

Structure (XML-tagged sections for parser-friendliness):

````markdown
# Plain-Language Plan — <YYYY-MM-DD>

<context>
- Project root: <absolute repo path>
- Generated: <ISO-8601 timestamp>
- Files reviewed: <N>
- Total findings: <N> (high: <N>, medium: <N>, low: <N>)
- Top issues: <bullet list of the 2–3 most frequent pl-NN violations>
</context>

<instructions>
You are an implementation agent. Apply the rewrites below to the cited files in the order given (highest severity first within each file).

For each finding:
1. Open the cited file at the cited line.
2. Confirm the **Original** text still matches at that line (citations may have drifted since this plan was generated — if the line moved, search for the snippet and apply to its current location; if the snippet is gone, skip and note it).
3. Replace it with the **Rewrite** text exactly.
4. Do not modify surrounding prose unless explicitly listed.
5. Move to the next finding.

Hard constraints:
- Do NOT introduce new content beyond the rewrites listed.
- Do NOT modify code fences, inline code, URLs, file paths, or proper nouns.
- Do NOT apply findings in <manual_review> — surface them to the user instead.
</instructions>

<changes>

## <file path 1>

### Finding 1 — pl-NN <rule name> (severity: high)
- **Line:** <N>
- **Original:** "<exact original text>"
- **Rewrite:** "<exact replacement text>"
- **Why:** <one-sentence rule justification>

### Finding 2 — ...

## <file path 2>

...

</changes>

<manual_review>
Findings whose rewrite carries `[Manual review required — ...]`. List each with its citation, quoted original, and the reason it needs a human — never place these in <changes>.
</manual_review>

<verification>
After applying all changes:
- [ ] Each cited file still parses (no broken markdown, no orphaned references).
- [ ] No code blocks or inline code were modified.
- [ ] Proper nouns and technical terms are preserved.
</verification>
````

Rules when generating this file:
- Sort within each file: high → medium → low. Across files: alphabetically by path.
- Route every `[Manual review required — ...]` finding to `<manual_review>`; omit the section when there are none.
