---
name: ui-system
description: Establish and enforce the project's visual system — design tokens, typography, radius, spacing, dark mode. Use when starting a project, changing the theme, or when generated UI starts looking like every other AI-built site.
---

# UI System

This skill implements the tokens, type, density, shape and themes selected in the
validated UI plan. Use `visual-direction` first for substantial interface work; a
coherent token system cannot rescue an unexamined composition by itself.

## Why AI sites look identical

Four defaults frequently signal an unexamined visual system:

1. The untouched shadcn neutral palette.
2. Inter, Geist, Space Grotesk, or Poppins as the primary face.
3. `rounded-lg` on everything.
4. Violet-to-blue gradient on white.

Changing those four removes common residue, but does not prove the hierarchy, content,
assets, responsive intent or composition are product-specific. The visual-direction
rubric owns that review.

## 1. Tokens live in exactly one place

Tailwind v4 is CSS-first. There is **no `tailwind.config.js`**. Everything lives in the
`@theme` block in `src/app/globals.css`. If a config file appears, migrate its contents
into `@theme` and delete it.

Replacing the shipped palette has two equivalent routes — pick by who is driving:

- **A human at a browser:** generate with [tweakcn](https://tweakcn.com), export the
  CSS variables, paste them into the `:root` and `.dark` blocks.
- **An agent, headless:** follow `references/palette-recipes.md` — named, fully
  specified oklch palettes plus the derivation rules for building a new one from a
  single brand hue. No GUI in the loop, same paste target.

Every shadcn and MagicUI component inherits the variables automatically — that is the
entire trick. Either route ends the same way: the `@theme` block holds a palette
chosen for THIS product. Shipping the default is defect #1 on the list above.

Rules:

- Colors, radii, spacing, and fonts are referenced through tokens only.
- Raw hex or Tailwind arbitrary values in components are a defect, not a shortcut.
- Pick one `--radius` and let the derived scale do the rest.

## 2. Typography

Two families maximum, plus one mono.

**Banned as primary faces:** Inter, Geist, Space Grotesk, Poppins.

Pairings that work, all free for commercial use:

| Direction | Display | Body / mono | Licence note |
| --- | --- | --- | --- |
| Engineering brand | IBM Plex Sans | IBM Plex Mono | OFL, committed — the default; builds offline |
| Product / SaaS | General Sans | Source Serif 4 for accents | General Sans is Fontshare: NOT committed, every machine (and CI) must fetch it — a real cost, weigh it |
| Editorial landing | Instrument Serif (large sizes only) | Instrument Sans | both OFL, committed |

Load through `next/font/local` in `src/app/layout.tsx`, from files committed under
`src/fonts/ofl/`. **Never `next/font/google`**: it fetches the face during `next build`,
so a host with no egress cannot build at all — that broke CI in this repo once
(`.agents/heal-ledger.md`), and `pnpm health` warns if the remote loader reappears.

Fetch a face with `pnpm font --ofl "<Family>" <weights>`, which prints the exact block to
paste. Only OFL faces may be committed; Fontshare faces are not redistributable and stay
gitignored, fetched per machine by `pnpm font <slug>`. Licences and the full pairing
detail: `references/font-pairings.md`.

Expose each family as a CSS variable and map those variables to `--font-sans`,
`--font-mono` and `--font-heading` in `@theme`. Components never name a family.

## 3. Implement the selected composition

Read `.agents/ui/plan.json` and validate it before implementation:

```text
pnpm ui:plan check
```

Then preserve the plan's hierarchy, responsive intent, motion purpose and signature
element while applying the system:

1. **Never raw-prompt UI.** Layer curated sources: shadcn for structure, MagicUI for
   motion, Aceternity and 21st.dev for marketing sections. "Make it look modern"
   produces the average of the internet. Search them through their MCP servers —
   `component-picker` owns which one answers what.
2. **References inform decisions, not copying.** The plan records take/avoid lessons;
   research screenshots never become product assets.
3. **Ration the motion.** At most one or two animated pieces per viewport, on an
   otherwise calm base.
4. **One signature element per page** — a bento grid, one gradient field, or one 3D
   moment. Not all three.

## 4. Dark mode

Both themes get equal care. Do not invert the light palette and ship it; check contrast
on real components and make sure the accent still works on the dark ground.

## 5. Checklist before declaring the system done

- [ ] `@theme` block contains the project palette, not the shadcn default
- [ ] Primary face is not on the banned list
- [ ] `--radius` chosen deliberately
- [ ] Dark mode reviewed on a real page, not just tokens
- [ ] No raw hex anywhere under `src/`
- [ ] Selected visual plan still matches the rendered hierarchy and signature element
- [ ] `pnpm verify` green — the definition of done, same as every completion
