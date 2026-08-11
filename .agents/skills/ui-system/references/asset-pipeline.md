# Asset pipeline

> Reference of the `ui-system` skill. Load when adding any visual asset: it sources
> and treats images, illustrations, icons, and 3D so a site feels alive instead of
> stock. Formerly the standalone `asset-pipeline` skill; older prompts naming that
> skill mean this file.

> Downstream contract: paths like `src/` and `convex/` refer to the product workspace that adopts Agentic Ship, not this tool repo.

Ten random stock photos look like a template. Ten photos under one consistent treatment
look like a brand. The treatment matters more than the photo.

For substantial interface work, take the asset role and treatment from the selected
`.agents/ui/plan.json`. Use `visual-direction` when that decision is absent; do not let
an available image invent the page's direction after implementation has started.

## Sources

| Asset | Source | Why | Rule |
| --- | --- | --- | --- |
| Photography | Unsplash, Pexels | free for commercial use, no attribution required, both have APIs an agent can drive | download and serve through `next/image` — never hotlink |
| Illustration | unDraw | permissive license, recolorable to the brand accent via URL parameter | one illustration style per site |
| Icons | Lucide | ships with shadcn, so consistency is free | one set, one stroke width |
| 3D | Spline embed | the practical default for web 3D | below the fold, lazy-loaded, only if it earns its bytes. **The shipped CSP blocks all iframes** (`frame-ancestors 'none'`, no `frame-src`) — embedding one is a deliberate CSP change owned by the `frontend-security` skill, never a quiet edit |

## Finding the image in the first place

`pnpm asset` takes a URL; it does not find one. That half is a judgment loop, and
skipping it is how a page ends up with a technically-licensed photo that fights its
own palette.

**Never invent a photo ID.** Unsplash and Pexels CDN paths look guessable
(`photo-1504253163759-c23fccaebb55`) and are not — a fabricated one 404s, and a
plausible-looking 404 in a build is worse than no image. Get real IDs by reading a
search page:

```text
WebFetch https://unsplash.com/s/photos/<search terms>
  → "list the full https://images.unsplash.com/photo- URLs on this page"
```

Then run this loop, which is short and worth doing every time:

1. **Search for the treatment, not the subject.** "aerial earth" returns saturated
   farmland and dark canyons; "clouds from above pale minimal" returns something that
   can sit under text. Describe the tonal register you need — pale, low-contrast,
   airy, high-key — because that is what decides whether the image works, and the
   subject usually is not what makes it fail.
2. **Preview before committing.** Fetch two to four candidates small
   (`?w=900&q=70&fm=jpg`) and actually look at them. Cheap, and it is where most
   candidates die.
3. **Judge against the tokens, not in the abstract.** Hold the candidate against the
   ground and text colours it will sit behind. A photo whose dominant hue already
   lives in the palette reads as an extension of the design; one that does not reads
   as stock, however good it is on its own.
4. **Fetch the winner at final resolution through `pnpm asset`**, so it crosses the
   allowlist and lands in `public/images/`.
5. **Record it in `credits.md` immediately** (below), while the source URL is still
   in hand.

Two failure modes worth naming, because both have happened here:

- **Choosing on subject alone.** An excellent photograph of the right subject in the
  wrong tonal register is still the wrong photograph. Reject it and search again;
  the second search is cheaper than the redesign.
- **Recording a photographer you did not verify.** A bare CDN URL does not carry
  attribution, and the canonical photo page is not always resolvable from it. Write
  down what you confirmed and say plainly that the name is unresolved. Neither
  licence requires attribution, so an honest gap costs nothing and an invented
  credit is a fabricated record.

Outside reference for ratio and pixel-size conventions per use case (avatar,
headshot, hero, wallpaper): the community `unsplash-asset-images` skill
(`mengto/skills`, MIT) is a reasonable cheatsheet. It is a hand-curated list rather
than a search, and its download step is manual, so treat it as a sizing reference —
not a replacement for this loop.

## Downloading

```bash
pnpm asset "https://images.unsplash.com/photo-…" hero-workspace
```

Saves to `public/images/<name>.<ext>`, then serve it through `next/image`. Pure Node,
so it behaves the same on macOS, Linux and Windows — the same reason every Agentic Ship
operation is a `pnpm` script rather than a shell one-liner
(`references/platform-notes.md` in the workspace-health skill).

The script refuses anything outside the source allowlist, which mirrors
`images.remotePatterns` in `next.config.ts`. Adding a source is a **human decision**:
update `next.config.ts` first — and the CSP `img-src` with it — then the script's list.
Refusing beats silently trusting a new host.

Keep `public/images/credits.md` — one line per asset: file, source URL, licence — even
when attribution is not required. Create it with the first asset; it costs nothing and
it answers the question a client will eventually ask.

## Treatment — the part that creates "life"

Apply the same grade to every image in a project:

1. One aspect ratio family (16:9 for wide, 4:5 for portrait, 1:1 for avatars).
2. One radius, taken from `--radius`.
3. One overlay or duotone derived from the brand tokens, at one opacity.
4. One hover behavior, if any.

## Performance rules

- `next/image` everywhere, with explicit `width`/`height` or `fill` plus a sized
  container. No raw `<img>`.
- The hero image gets `priority`. Nothing else does.
- Remote hosts must be listed in `next.config.ts` under `images.remotePatterns` — and
  the CSP `img-src` must allow them too. Both, or images silently fail.
- Target: LCP under 2.5s. A 3D hero that pushes past that is a decoration, not a
  feature — move it down the page.

## Alt text

Every image needs alt text that describes function, not appearance. Decorative images
get `alt=""` so screen readers skip them. This is an accessibility requirement and an
SEO signal at the same time.
