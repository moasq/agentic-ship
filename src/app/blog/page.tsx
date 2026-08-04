import type { Metadata } from "next";
import Link from "next/link";
import { getArticles } from "@/lib/blog";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Blog",
  description: `Articles from ${site.name}.`,
  alternates: { canonical: "/blog" },
};

/**
 * The article index — engine surface, not content. It derives entirely from the typed
 * list in src/lib/blog.ts; publishing an article is the seo-blog skill's job, and this
 * page needs no edits when one lands.
 */
export default function BlogIndex() {
  const articles = getArticles();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16 sm:py-24">
      <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">Blog</h1>

      <ul className="mt-12 space-y-8">
        {articles.map((article) => (
          <li key={article.slug}>
            <article>
              <time dateTime={article.publishedAt} className="font-mono text-muted-foreground text-xs tabular-nums">
                {article.publishedAt}
              </time>
              <h2 className="mt-1.5 font-semibold text-xl tracking-tight">
                <Link href={`/blog/${article.slug}`} className="hover:text-primary">
                  {article.title}
                </Link>
              </h2>
              <p className="mt-2 text-muted-foreground text-sm/6">{article.description}</p>
            </article>
          </li>
        ))}
      </ul>

      {articles.length === 0 && (
        <p className="mt-12 text-muted-foreground text-sm">
          No articles yet. Write the first one with the <code className="font-mono">seo-blog</code> skill.
        </p>
      )}
    </main>
  );
}
