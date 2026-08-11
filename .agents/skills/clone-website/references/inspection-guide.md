# Inspection guide

> Reference of the `clone-website` skill: the recon checklists, browser extraction
> scripts, and the component spec template. Adapted from the MIT-licensed
> `JCodesMore/ai-website-cloner-template` (see `skills.lock.json`).

## Visual audit checklist

Screenshots — full-page desktop 1440 and mobile 390 (768 when layout warrants), plus:
every distinct page in scope, each supported theme, key interaction states (hover,
open menus, modals), loading/skeleton, empty, and error states. Scroll the whole page
before shooting so lazy content and entrance animations have fired.

Design tokens to extract:

- **Colors** — background, text (primary/secondary/muted), accent, border, hover,
  error/success/warning surfaces. Read the CSS bundle's custom properties first;
  confirm against computed styles.
- **Typography** — every (family, size/line-height, weight, letter-spacing) triple
  actually used; which elements carry the display face vs the UI face vs mono.
- **Spacing** — the scale in use (4/8/12/16/24/32…), section paddings, grid gaps.
- **Radius, shadows, borders** — buttons, cards, inputs, overlays; hairline colors.
- **Breakpoints** — where the layout actually shifts, found by resizing, not assumed
  from framework defaults.
- **Iconography** — library or custom, sizes, stroke widths.
- **Buttons and inputs** — every variant's exact height, padding, radius, shadow.

## Technical stack analysis

- Framework markers: `__NEXT_DATA__`, `__NUXT__`, `ng-version`.
- CSS approach: utility classes (Tailwind), CSS Modules hashes, styled-components.
- Font loading: `@font-face` in the bundles names families, weights and files —
  usually faster and more complete than sampling the DOM.
- Animation source: CSS `@keyframes` in the bundle vs JS-driven (elements whose
  computed `animationName` is set on load vs styles that change only on trigger).
- Smooth-scroll libraries: `.lenis`, `.locomotive-scroll`, custom scroll containers.
- Image strategy: `next/image` params, srcset widths, lazy vs priority.

## Behavior sweep — order matters

1. **Scroll first, touch nothing.** Slowly top to bottom. Watch for: header
   morph (record the trigger scroll position and both states), entrance animations
   (which elements, what motion, stagger), auto-advancing tabs/accordions driven by
   IntersectionObserver, scroll-snap containers, parallax layers, scroll-linked
   progress. If things change while only scrolling, the section is scroll-driven.
2. **Then click** every interactive-looking element. Tabs and pills: click each one
   and extract the content of **every** state, not just the default. Note transition
   type and duration between states.
3. **Then hover** buttons, cards, links, nav items — record property before → after
   and the transition timing.
4. **Then resize** at 1440 / 768 / 390 and note which sections restack and roughly
   where.

Record everything in `BEHAVIORS.md` with trigger, before/after computed values, and
transition. "The nav changes on scroll" is not a record; "at scrollY ≈ 80 the header
swaps to a fixed pill, maxWidth 1440→896, gains shadow X, 300ms ease" is.

## Extraction scripts

Run these in the page context via the browser tool. Never hand-measure what a script
can read.

Asset discovery (owned mode feeds the download script; reference mode feeds the
substitution list):

```javascript
JSON.stringify({
  images: [...document.querySelectorAll('img')].map(img => ({
    src: img.currentSrc || img.src, alt: img.alt,
    w: img.naturalWidth, h: img.naturalHeight,
    parent: img.parentElement?.className,
    siblingImgs: img.parentElement ? img.parentElement.querySelectorAll('img').length : 0,
    position: getComputedStyle(img).position, z: getComputedStyle(img).zIndex,
  })),
  videos: [...document.querySelectorAll('video')].map(v => ({
    src: v.src || v.querySelector('source')?.src, poster: v.poster,
    autoplay: v.autoplay, loop: v.loop, muted: v.muted,
  })),
  bgImages: [...document.querySelectorAll('*')]
    .filter(el => { const b = getComputedStyle(el).backgroundImage; return b && b !== 'none'; })
    .map(el => ({ url: getComputedStyle(el).backgroundImage.slice(0, 200),
                  el: el.tagName + '.' + String(el.className).split(' ')[0] })),
  svgCount: document.querySelectorAll('svg').length,
  canvases: document.querySelectorAll('canvas').length,
  favicons: [...document.querySelectorAll('link[rel*="icon"]')].map(l => l.href),
});
```

A section that looks like one image is often layers — background wash + foreground
mockup + positioned overlays. Enumerate every `<img>` and background-image inside the
container; a missed overlay is why a clone looks empty with "correct" CSS.

Per-component computed styles (replace `SELECTOR`; run once per component container):

```javascript
(function (selector) {
  const el = document.querySelector(selector);
  if (!el) return JSON.stringify({ error: 'not found: ' + selector });
  const props = [
    'fontSize','fontWeight','fontFamily','lineHeight','letterSpacing','color',
    'textTransform','backgroundColor','background','padding','margin',
    'width','height','maxWidth','minWidth','display','flexDirection',
    'justifyContent','alignItems','gap','gridTemplateColumns','gridTemplateRows',
    'borderRadius','border','boxShadow','overflow','position','top','right',
    'bottom','left','zIndex','opacity','transform','transition','cursor',
    'objectFit','mixBlendMode','filter','backdropFilter','whiteSpace',
  ];
  function styles(e) {
    const cs = getComputedStyle(e), out = {};
    for (const p of props) {
      const v = cs[p];
      if (v && v !== 'none' && v !== 'normal' && v !== 'auto' && v !== '0px' &&
          v !== 'rgba(0, 0, 0, 0)') out[p] = v;
    }
    return out;
  }
  function walk(e, depth) {
    if (depth > 4) return null;
    const kids = [...e.children];
    return {
      tag: e.tagName.toLowerCase(),
      classes: String(e.className || '').split(' ').slice(0, 5).join(' '),
      text: e.childNodes.length === 1 && e.childNodes[0].nodeType === 3
        ? e.textContent.trim().slice(0, 200) : null,
      styles: styles(e),
      img: e.tagName === 'IMG'
        ? { src: e.src, alt: e.alt, w: e.naturalWidth, h: e.naturalHeight } : null,
      children: kids.slice(0, 20).map(k => walk(k, depth + 1)).filter(Boolean),
    };
  }
  return JSON.stringify(walk(el, 0), null, 2);
})('SELECTOR');
```

Multi-state extraction: capture state A with the script, trigger the change (scroll
past the threshold, click the tab, hover), capture state B on the same element. The
diff **is** the behavior spec: "property X: A → B, trigger T, transition C".

## Component spec template

One file per section or sub-component at
`docs/research/<site-key>/<page-key>/components/<name>.spec.md`. Fill every heading;
write "N/A" only after actually checking (even footers have hover states).

```markdown
# <ComponentName> Specification

## Overview
- Target file: src/components/<...>/<ComponentName>.tsx
- Screenshot: docs/design-references/<site-key>/<page-key>/<shot>.png
- Interaction model: static | click-driven | scroll-driven | time-driven
- Rights mode: owned-clone | reference-rebuild

## DOM structure
<hierarchy — what contains what>

## Computed styles (exact getComputedStyle values)
### Container
- display / padding / maxWidth / ... exact values, mapped to which token
### <Child N>
- fontSize / color / ... exact values

## States & behaviors
### <Behavior name>
- Trigger: <exact mechanism and threshold>
- State A: <values>  → State B: <values>
- Transition: <duration, easing, properties>
- Implementation: <CSS transition | IntersectionObserver | animation-timeline | JS>

## Per-state content (tabs, carousels)
### State "<name>": <content that state shows>

## Assets
<files in the asset namespace — or, reference mode, the sourced substitute + license>

## Content
<owned mode: verbatim text. Reference mode: the re-voiced product copy, plus
"Divergences:" — the deliberate composition departures this rebuild makes>

## Responsive
- 1440: <layout>  · 768: <changes>  · 390: <changes>  · shift at ~<N>px
```

## Expensive-lesson list

- Scroll-driven built as click-tabs (or vice versa) — rewrite, not a tweak. Decide
  the interaction model before writing any component.
- Only the default tab/state extracted — click them all first.
- Overlay/layered images missed — check every container's full tree.
- A `<video>` or canvas rebuilt as elaborate DOM — check the census first.
- "Looks like `text-lg`" — extract the value; the line-height is where that guess
  dies.
- Desktop-only inspection — the clone then breaks at 390.
- Native scroll shipped when the original runs a smooth-scroll library — users feel
  it immediately.
- Builders dispatched without a spec file — they fill gaps by guessing, and the
  guesses all look plausible until the side-by-side.
