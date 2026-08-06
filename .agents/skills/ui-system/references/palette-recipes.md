# Palette recipes — the headless route

tweakcn is a GUI; an agent working headlessly cannot drive it. This file is the
deterministic equivalent: the shipped palette in `src/app/globals.css` is a
**parameterized template**, and a new palette is that template with different
parameters. No tool in the loop, no taste required at generation time — the taste is
encoded here once.

The paste target is identical either way: the `:root` and `.dark` blocks in
`src/app/globals.css`. Nothing else changes.

## How the shipped palette is built

One brand hue (`H = 175`, a green-teal) carries the whole system. Every neutral is
hue-tinted toward it at very low chroma — that undertone is why the neutrals "belong"
with the accent instead of reading as generic grey. Lightness and chroma sit in fixed
tiers per role:

| Role | Light mode | Dark mode | Rule |
| --- | --- | --- | --- |
| `--background` | `oklch(0.985 0.003 H±25)` | `oklch(0.17 0.012 H)` | near-white / near-black, faint undertone |
| `--foreground` | `oklch(0.205 0.012 H)` | `oklch(0.93 0.008 H±20)` | ink, never pure black or white |
| `--card` / `--popover` | pure white | `oklch(0.215 0.014 H)` | one step off the background in dark |
| `--primary` | `oklch(0.48 0.09 H)` | `oklch(0.74 0.11 H)` | **lifted in dark** — same hue, more L and C, or it dies on the dark ground |
| `--primary-foreground` | = light background | = dark background | text on primary |
| `--secondary` / `--muted` | `oklch(0.955 0.008 H−15)` | `oklch(0.27 0.016 H)` | surfaces, one tier of tint |
| `--accent` | `oklch(0.93 0.02 H−7)` | `oklch(0.3 0.026 H)` | hover/selected surface |
| `--border` / `--input` | `oklch(0.9 0.008 H−15)` | `oklch(1 0 0 / 12–16%)` | dark borders are white-alpha, not a color |
| `--ring` | = primary | = primary | focus follows the accent |
| `--destructive` | `oklch(0.55 0.2 27)` | `oklch(0.7 0.17 22)` | **stays red regardless of H** |
| `--chart-1..5` | chart-1 = primary; 2–5 rotate hue ±20–80 at similar L/C | same, lifted | distinguishable, not rainbow |
| `--sidebar*` | mirror their non-sidebar twins | same | never a second design system |

## The procedure (deterministic)

1. **Pick `H`** from the product-character table below — or from the brand's existing
   color converted to oklch (any converter; the hue angle is all you take from it).
2. **Shift every hue** in both blocks by `(H − 175)`. The shipped file uses hues in
   the 150–178 band; they all move together, keeping their relative offsets. Leave
   `--destructive` (27/22) and `--radius` alone; re-derive `--chart-2..5` as
   `H±20…±80`.
3. **Set the chroma character.** The shipped values are the "confident" middle.
   Quiet/editorial brand → multiply every chroma by 0.7. Vivid/consumer brand →
   multiply by 1.3, capping `--primary` chroma at 0.14 in light mode — past that,
   large filled surfaces start to glow.
4. **Verify, don't trust:** `--foreground` on `--background` and
   `--primary-foreground` on `--primary` must clear WCAG AA (4.5:1) in BOTH modes —
   check with any oklch contrast tool. Dark mode is a re-derivation, never an
   inversion (the dark rules above are different, not mirrored). Then `pnpm verify`.

## Named parameter sets

Four ready hues, chosen to be far from each other and from the shipped teal. Apply via
the procedure above — each is `(H, character)`:

| Name | H | Character | Reads as | Fits |
| --- | --- | --- | --- | --- |
| `ember` | 45 | confident | warm copper/amber | tools, commerce, crafts, food |
| `moss` | 120 | quiet | mossy green, drier than the shipped teal | health, sustainability, docs |
| `harbor` | 245 | confident | deep slate blue | b2b, fintech, infrastructure |
| `orchid` | 335 | vivid | magenta-rose | creative tools, consumer, events |

The shipped default (`H = 175`, confident) is a fifth valid choice — for a real
product, on purpose, not because nobody decided.

## Guardrails (the AI-signal list, applied to palettes)

- Shipping the untouched default on a client project is defect #1 from the skill —
  a palette must be **chosen**, even when the choice is the default.
- `H` between 250 and 290 flirts with the violet-to-blue-gradient signal: a solid
  primary there is fine; a `H`-to-blue gradient on white is the cliché itself. Skip
  the gradient, keep the hue.
- One hue system per product. A second brand hue is a decision for a human, not a
  variation for an agent.
- Chroma above 0.14 on large light-mode surfaces, or un-lifted primaries in dark
  mode, are the two ways a derived palette goes wrong silently — step 4 catches both.
