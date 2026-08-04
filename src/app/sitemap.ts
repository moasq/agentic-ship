import type { MetadataRoute } from "next";
import { getArticles } from "@/lib/blog";
import { site } from "@/lib/site";

const siteUrl = site.url;

// Generated from the filesystem, never hand-maintained. Publishing an article is
// creating its page.mdx — the sitemap follows, with no second list to forget.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/blog`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    ...getArticles().map((article) => ({
      url: `${siteUrl}/blog/${article.slug}`,
      lastModified: new Date(article.publishedAt),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
