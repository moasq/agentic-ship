# Font Pairings — details and licenses

Reference for the ui-system skill. The rule stands: two families max plus one mono, and
Inter / Geist / Space Grotesk / Poppins are banned as primary faces — they are the four
default faces of AI-generated sites.

## Pairing A — engineering brand (the ShipKit default)

- **IBM Plex Sans** (display + body) · **IBM Plex Mono** (code, labels, data)
- Why: one coherent superfamily, terminal-credible, excellent weights.
- License: OFL. Free for commercial use, may be self-hosted and redistributed.
- Load: `next/font/google` — downloaded at build, served from your deployment, no
  runtime Google request.

## Pairing B — product / SaaS

- **General Sans** (display) · **Source Serif 4** (body accents, pull quotes)
- License: General Sans is Fontshare (ITF) — free for commercial use but **not
  redistributable**: ship the fetch script, never the font files. Source Serif 4 is OFL.
- Load: General Sans via `next/font/local` after the fetch script downloads it;
  Source Serif 4 via `next/font/google`.

## Pairing C — editorial landing

- **Instrument Serif** (display only, 40px+) · a quiet grotesk for body
- Instrument Serif collapses at small sizes — display only, never body.
- License: OFL.

## Rules that apply to every pairing

- Map to tokens only: `--font-sans`, `--font-mono` (+ `--font-heading` when display ≠
  body). Components never name a family.
- `display: "swap"` always; subset to `latin` unless the content needs more.
- Two families + one mono is the ceiling. A third family is a defect.
- Weights: pick 3–4 per family, not the full range — every weight is payload.

## Changing the pairing

1. Update the loaders in `src/app/layout.tsx`.
2. Nothing else — components inherit through the tokens. If a component broke, it was
   naming a font family directly, which is the actual bug.
