---
name: seo-blog
description: Add and maintain SEO-ready MDX articles — metadata, structured data, sitemap, OG images, internal linking. Use when writing a blog post or auditing a page's search surface.
---

# SEO and Blog

Native Next.js only. No CMS, no Contentlayer (unmaintained), no runtime dependency to
keep alive. Articles are MDX files in `content/blog/`.

## Per-article frontmatter

```yaml
---
title: "Under 60 characters, the primary keyword near the front"
description: "140 to 160 characters. This is the search snippet, write it as one."
publishedAt: "2026-08-03"
updatedAt: "2026-08-03"
slug: "kebab-case-frozen-at-publish"
image: "/blog/<slug>/hero.jpg"
imageAlt: "Describes what the image shows"
tags: ["nextjs", "ai"]
draft: false
---
```

The slug is frozen once published. Changing it breaks every inbound link; if it truly
must change, add a redirect.

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
- `src/app/robots.ts` — points at the sitemap
- OG images generated with `next/og` from the article title, so every post gets a
  branded card with zero manual work

## Checklist the skill enforces before publishing

- [ ] Exactly one `<h1>`, and it is the article title
- [ ] Title <= 60 characters, description 140–160
- [ ] Slug is final
- [ ] Hero image present with alt text
- [ ] At least two internal links to other pages on the site
- [ ] JSON-LD renders and validates
- [ ] Post appears in `/sitemap.xml` after build
- [ ] `pnpm build` passes

## Writing rules

Answer the question in the first hundred words — search users and language models both
reward it. One idea per section. Descriptive headings, not clever ones. Show a real
example rather than describing one.
