---
name: seo-blog
description: Add and maintain SEO-ready MDX articles — metadata, structured data, sitemap, OG images, internal linking. Use when writing a blog post or auditing a page's search surface.
---

# SEO and Blog

> Downstream contract: paths like `src/` and `convex/` refer to the product workspace that adopts Agentic Ship, not this tool repo.

Native Next.js only — `@next/mdx`, first-party. No CMS, no Contentlayer (unmaintained),
no runtime dependency to keep alive.

## How this repo publishes (implemented, not planned)

An article is `src/app/blog/(articles)/<slug>/page.mdx`. The `(articles)` route group
carries the reading layout; `/blog` is the index. Styling comes from the root
`mdx-components.tsx`, which maps every MDX element to tokens — articles never carry
their own classes.

**There is no frontmatter.** Metadata lives in exactly two places:

1. The `page.mdx` exports Next's own `metadata` object — title, description, canonical,
   OpenGraph. Same API as every other route, checked by TypeScript.
2. `src/lib/blog.ts` holds the typed `ARTICLES` index — slug, title, description,
   publishedAt. The index page and `sitemap.ts` derive from it; an entry only counts
   when its `page.mdx` actually exists.

Publishing = add the folder with `page.mdx` + add the `ARTICLES` entry. Both or it is
not published.

The slug is frozen once published. Changing it breaks every inbound link; if it truly
must change, add a redirect.

Titles under 60 characters with the primary keyword near the front; descriptions 140 to
160 characters, written as the search snippet they are.

## Metadata

Use the Metadata API — `generateMetadata` per route, never hand-written `<meta>` tags.
Every article needs title, description, canonical URL, OpenGraph, and Twitter card.
The root layout sets a title template so pages only supply their own title.

## Structured data

Emit JSON-LD as a typed object, not a hand-written script string:

- `Article` on every post — headline, description, datePublished, dateModified, author
- `BreadcrumbList` on nested routes
- `Organization` once, in the root layout

## Machine surfaces

- `src/app/sitemap.ts` — generated from the article list, never hand-maintained
- `src/app/robots.ts` — points at the sitemap and **allows AI crawlers by name**
  (GPTBot, ClaudeBot, Claude-User, PerplexityBot, Google-Extended — the file is the
  authoritative list). Deliberate: being cited by answer engines is distribution.
  Opting out = editing that one list.
- `src/app/llms.txt/route.ts` — the AEO counterpart of the sitemap, generated from the
  SAME typed article index + `site.ts`, so it cannot go stale separately
- `src/app/opengraph-image.tsx` — the share card as code (`next/og`), derived from
  `site.ts`; never a stale export
- All of it is **asserted in the rendered response** by `pnpm test:e2e` — title,
  description, OG tags, robots, llms.txt, sitemap, the OG image answering 200.
  Metadata that exists in code but not in the response is the classic failure.

## AEO — writing to be cited, not just ranked

- Headings phrased as the **question people actually ask**; the direct answer in the
  first paragraph under each — standalone, quotable, no "as we'll see below".
- Stable anchors on every H2/H3; renamed headings keep old anchors via explicit ids.
- Real dates: `publishedAt` in the index, surfaced as `<time>` and in JSON-LD.
  Answer engines weight freshness and specificity over volume.
- One idea per section. A section an engine can quote whole is a section that gets
  cited.

## Core Web Vitals

Performance is a ranking input. The budget check is manual until CI wiring is earned:

```bash
npx -y @lhci/cli autorun --collect.url=http://localhost:3100 --collect.startServerCommand="pnpm start --port 3100"
```

Targets: LCP < 2.5s · CLS < 0.1 · INP < 200ms. A blown budget is a defect, not a vibe.

## Checklist the skill enforces before publishing

- [ ] Exactly one `<h1>`, and it is the article title
- [ ] Title <= 60 characters, description 140–160
- [ ] Slug is final
- [ ] Hero image present with alt text
- [ ] At least two internal links to other pages on the site
- [ ] JSON-LD renders; validate at search.google.com/test/rich-results (manual, needs
      a deployed or tunneled URL)
- [ ] Post appears in `/sitemap.xml` after build
- [ ] `pnpm verify` green, then `pnpm test:e2e` — the SEO surface is asserted in the
      **rendered response** there, and response-vs-code drift is the classic failure

## Writing rules

Answer the question in the first hundred words — search users and language models both
reward it. One idea per section. Descriptive headings, not clever ones. Show a real
example rather than describing one.
