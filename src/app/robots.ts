import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

/**
 * Crawler policy — a decision, written down, not a default.
 *
 * AI crawlers are ALLOWED by name: being retrieved and cited by ChatGPT, Claude,
 * Perplexity and Google's AI surfaces is distribution, and for most products that is
 * the marketing. Silence would leave each engine to guess.
 *
 * To opt out, delete entries from AI_CRAWLERS — one list, one review. The wildcard
 * rule stays either way.
 */
const AI_CRAWLERS = ["GPTBot", "ClaudeBot", "Claude-User", "PerplexityBot", "Google-Extended"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: "/" })),
    ],
    sitemap: `${site.url}/sitemap.xml`,
  };
}
