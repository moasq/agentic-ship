import { site } from "@/lib/site";
import { getArticles } from "@/lib/blog";

/**
 * llms.txt — the site as an answer engine sees it.
 *
 * Generated from the same typed sources as everything else (site.ts + the article
 * index), so it cannot go stale separately: it has no separate existence. This is the
 * AEO counterpart of sitemap.xml — sitemaps are for crawlers that rank, llms.txt is
 * for models that cite.
 */
export const dynamic = "force-static";

export function GET() {
  const articles = getArticles();

  const lines = [
    `# ${site.name}`,
    "",
    `> ${site.description}`,
    "",
    `Site: ${site.url}`,
    "",
    "## Pages",
    "",
    `- [Home](${site.url}): ${site.title}`,
    `- [Blog](${site.url}/blog): articles`,
    ...articles.map((a) => `- [${a.title}](${site.url}/blog/${a.slug}): ${a.description}`),
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
