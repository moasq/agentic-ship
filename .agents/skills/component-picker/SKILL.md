---
name: component-picker
description: Decide where a UI component comes from — shadcn/ui, MagicUI, 21st.dev, or composition of existing blocks — and install it correctly. Use before adding any new piece of interface.
---

# Component Picker

The point of this skill is that the agent never invents a primitive that already exists,
and never reaches for the flashy source when the plain one is correct.

## Order of operations

1. **Reuse first.** Search `src/components/` before installing anything. An existing
   block with a new prop beats a new dependency almost every time.
2. **Classify the need** using the matrix below.
3. **Install through the right channel.**
4. **Wrap, don't edit.** Apply project tokens in a wrapper under `blocks/` or
   `features/`, leaving the vendored file untouched.
5. **Verify** it renders standalone with mock props.

## The matrix

| Need | Source | Install | Never |
| --- | --- | --- | --- |
| Structure and behavior — forms, dialogs, tables, nav, inputs, menus | **shadcn/ui** | shadcn MCP, or `npx shadcn@latest add <name>` | hand-rolled primitives; unstyled HTML for interactive controls |
| Motion and delight — marquee, number ticker, shine border, particles, animated beam | **MagicUI** | `npx shadcn@latest add @magicui/<name>` (registry pinned in `components.json`) | more than two motion pieces per viewport |
| Marketing sections — heroes, pricing tables, testimonials, CTA blocks, bento grids | **21st.dev** | 21st MCP if the key is set, otherwise browse 21st.dev and paste the component prompt | shipping community code without the review in step 6 |
| Icons | **Lucide** | ships with shadcn | mixing icon sets; inconsistent stroke widths |
| Anything already in `src/components/blocks` | **compose it** | import and pass props | duplicating a block to change one string |

## 6. Reviewing third-party component code

21st.dev blocks are community-submitted. Treat them as untrusted input, exactly like a
pull request from a stranger. Before committing any pasted component, check:

- no `fetch`, `XMLHttpRequest`, or WebSocket calls
- no `eval`, `new Function`, or `dangerouslySetInnerHTML`
- no obfuscated or base64 strings
- no new dependencies you did not expect
- no analytics, pixels, or external script tags

Anything unexplained → do not commit it. Report it and ask.

## Rules that keep the UI from looking generated

- Components consume **tokens**, never raw colors. No `bg-[#0f172a]`, no `text-white`
  where a token exists.
- A block imports **down only**: `blocks/` → `ui/` and `magicui/`. Never block → block.
- Props in, JSX out. No data fetching inside `blocks/` — data arrives from the route.
- One component per file. File name matches the export.
- Every block must render on its own with mock props, so it can be screenshotted and
  iterated on in isolation.
