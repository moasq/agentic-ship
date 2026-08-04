import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * The article index. Publishing is two steps, both required:
 *   1. create src/app/blog/(articles)/<slug>/page.mdx
 *   2. add its entry to ARTICLES below
 *
 * The list is typed, so a typo is a build error rather than a missing page, and the
 * sitemap is generated from it — there is no third place to forget.
 *
 * Server-only: reads the filesystem, so import it from Server Components, sitemap.ts,
 * and other build-time code only.
 */
export type Article = {
  slug: string;
  title: string;
  description: string;
  publishedAt: string; // ISO date, used for <time> and structured data
};

const BLOG_DIR = join(process.cwd(), "src", "app", "blog", "(articles)");

// Empty on purpose. The seo-blog skill writes the first entry with its article.
const ARTICLES: Article[] = [];

/** Only articles whose page.mdx actually exists — an entry alone never publishes. */
export function getArticles(): Article[] {
  return ARTICLES.filter((article) => existsSync(join(BLOG_DIR, article.slug, "page.mdx"))).sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );
}

/** Directories with a page.mdx but no ARTICLES entry — a real article nobody links to. */
export function getOrphanedSlugs(): string[] {
  if (!existsSync(BLOG_DIR)) return [];
  const known = new Set(ARTICLES.map((a) => a.slug));
  return readdirSync(BLOG_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(BLOG_DIR, entry.name, "page.mdx")))
    .map((entry) => entry.name)
    .filter((slug) => !known.has(slug));
}
