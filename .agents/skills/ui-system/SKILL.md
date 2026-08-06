---
name: ui-system
description: Establish and enforce the project's visual system — design tokens, typography, radius, spacing, dark mode. Use when starting a project, changing the theme, or when generated UI starts looking like every other AI-built site.
---

# UI System

Hosted builders sell a design harness. This skill is that harness. Its whole job is to
make every generation land inside one consistent visual system instead of drifting
toward the defaults that make AI-built sites recognisable at a glance.

## Why AI sites look identical

Roughly ninety percent of the sameness comes from four defaults, all of which this
skill overrides:

1. The untouched shadcn neutral palette.
2. Inter, Geist, Space Grotesk, or Poppins as the primary face.
3. `rounded-lg` on everything.
4. Violet-to-blue gradient on white.

Override those four and the site stops reading as generated, before a single custom
component is written.

## 1. Tokens live in exactly one place

Tailwind v4 is CSS-first. There is **no `tailwind.config.js`**. Everything lives in the
`@theme` block in `src/app/globals.css`. If a config file appears, migrate its contents
into `@theme` and delete it.

Generate a palette with [tweakcn](https://tweakcn.com), export the CSS variables, paste
them into the `:root` and `.dark` blocks. Every shadcn and MagicUI component inherits
them automatically — that is the entire trick.

Rules:

- Colors, radii, spacing, and fonts are referenced through tokens only.
- Raw hex or Tailwind arbitrary values in components are a defect, not a shortcut.
- Pick one `--radius` and let the derived scale do the rest.

## 2. Typography

Two families maximum, plus one mono.

**Banned as primary faces:** Inter, Geist, Space Grotesk, Poppins.

Pairings that work, all free for commercial use:

| Direction | Display | Body / mono |
| --- | --- | --- |
| Engineering brand | IBM Plex Sans | IBM Plex Mono |
| Product / SaaS | General Sans | Source Serif 4 for accents |
| Editorial landing | Instrument Serif (large sizes only) | a quiet grotesk |

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

## 3. Composition rules

Distilled from how people who build good AI-assisted UI actually work:

1. **Never raw-prompt UI.** Layer curated sources: shadcn for structure, MagicUI for
   motion, 21st.dev for marketing sections. "Make it look modern" produces the
   average of the internet.
2. **References in, adjectives out.** Feed screenshots or links to specific designs
   rather than describing a vibe.
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
- [ ] `pnpm build` passes
