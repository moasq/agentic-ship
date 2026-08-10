# Font Pairings — details and licenses

Reference for the ui-system skill. The rule stands: two families max plus one mono, and
Inter / Geist / Space Grotesk / Poppins are banned as primary faces — they are the most
common default faces of AI-generated sites.

## Loading: always local, never `next/font/google`

Every pairing below loads through `next/font/local`. `next/font/google` fetches the face
during `next build` — not at runtime, but the build still needs the network, so it fails
outright on a host with no egress. That took out CI here once (`.agents/heal-ledger.md`)
and it would take out any air-gapped server. `pnpm health` warns if the remote loader
reappears in `layout.tsx`.

Licence decides where the files may live, and the fetcher enforces it:

| Command | Licence | Files |
| --- | --- | --- |
| `pnpm font --ofl "<Family>" <weights>` | OFL — redistributable | `src/fonts/ofl/`, **committed** |
| `pnpm font <slug> <weights>` | Fontshare (ITF) — **not** redistributable | `src/fonts/<slug>/`, gitignored, per machine |

Both print the exact `next/font/local` block to paste. OFL 1.1 requires the licence
text to ship beside committed files — `--ofl` fetches each family's own OFL.txt into
`src/fonts/ofl/<slug>-OFL.txt` automatically, and fails if the family is not actually
in Google's OFL set. Variable families are detected by content: one committed file
with a weight-range entry, never one identical copy per weight.

## Pairing A — engineering brand (the Agentic Ship default)

- **IBM Plex Sans** (display + body) · **IBM Plex Mono** (code, labels, data)
- Why: one coherent superfamily, terminal-credible, excellent weights.
- License: OFL. Free for commercial use, may be self-hosted and redistributed.
- Load: committed under `src/fonts/ofl/` — this is what ships.
  `pnpm font --ofl "IBM Plex Sans" 400,500,600,700` · `pnpm font --ofl "IBM Plex Mono" 400,500`

## Pairing B — product / SaaS

- **General Sans** (display) · **Source Serif 4** (body accents, pull quotes)
- License: General Sans is Fontshare (ITF) — free for commercial use but **not
  redistributable**: those files are never committed and every machine fetches its own
  with `pnpm font general-sans 500,600,700`. Source Serif 4 is OFL.
- Caveat worth knowing before you pick this one: a non-redistributable face means a
  fresh clone cannot build until someone runs `pnpm font` — the exact network dependency
  Pairing A exists to avoid. Fine on a laptop, a real cost in CI.
- Load: `pnpm font general-sans 500,600,700` · `pnpm font --ofl "Source Serif 4" 400,600`

## Pairing C — editorial landing

- **Instrument Serif** (display only, 40px+) · **Instrument Sans** (body)
- Same foundry, designed together; Instrument Serif collapses at small sizes —
  display only, never body.
- License: both OFL, committed —
  `pnpm font --ofl "Instrument Serif" 400` · `pnpm font --ofl "Instrument Sans" 400,500,600`

## Rules that apply to every pairing

- Map to tokens only: `--font-sans`, `--font-mono` (+ `--font-heading` when display ≠
  body). Components never name a family.
- `display: "swap"` always; subset to `latin` unless the content needs more.
- Two families + one mono is the ceiling. A third family is a defect.
- Weights: pick 3–4 per family, not the full range — every static weight is payload.
  (Variable families are one file regardless; the fetcher collapses them itself.)

## Changing the pairing

1. Fetch the faces (`pnpm font --ofl "<Family>" <weights>` for OFL, `pnpm font <slug>`
   for Fontshare). Delete the old files from `src/fonts/` — a face nobody loads is
   payload in the repo forever.
2. Paste the printed `next/font/local` block over the loaders in `src/app/layout.tsx`.
3. Nothing else — components inherit through the tokens. If a component broke, it was
   naming a font family directly, which is the actual bug.
4. `pnpm verify`. The banned-font check reads the `src:` paths, so a banned face caught
   here is caught before it ships.
