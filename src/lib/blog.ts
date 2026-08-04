import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * The article index, derived from the filesystem — there is no second list to keep in
 * sync and no CMS to keep alive. A directory under src/app/blog containing a page.mdx
 * IS a published article.
 *
 * Server-only: this reads the filesystem, so it may only be imported from Server
 * Components, `sitemap.ts`, and other build-time code.
 */
export type Article = {
  slug: string;
  title: string;
  description: string;
  publishedAt: string; // ISO date, used for <time> and structured data
};

// The `(articles)` route group carries the reading layout without appearing in the URL,
// so /blog stays the index and /blog/<slug> is an article.
const BLOG_DIR = join(process.cwd(), "src", "app", "blog", "(articles)");

/**
 * Article metadata lives here rather than in frontmatter: `page.mdx` files export
 * Next's own `metadata` object, and a build-time index cannot import from a route
 * without pulling the whole page into the build. One typed list, checked by TypeScript,
 * beats a parser plus a schema.
 */
const ARTICLES: Article[] = [
  {
    slug: "why-ai-sites-look-the-same",
    title: "Why every AI-generated site looks the same",
    description:
      "Four defaults account for most of the sameness in AI-built interfaces. Each one is a single line to override, and this is what to replace them with.",
    publishedAt: "2026-08-04",
  },
];

export function getArticles(): Article[] {
  const published = ARTICLES.filter((article) => existsSync(join(BLOG_DIR, article.slug, "page.mdx")));
  return published.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/** Directories with a page.mdx but no entry in ARTICLES — a real article nobody links to. */
export function getOrphanedSlugs(): string[] {
  if (!existsSync(BLOG_DIR)) return [];
  const known = new Set(ARTICLES.map((a) => a.slug));
  return readdirSync(BLOG_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(BLOG_DIR, entry.name, "page.mdx")))
    .map((entry) => entry.name)
    .filter((slug) => !known.has(slug));
}
