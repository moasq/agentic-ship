/**
 * Your product's identity — the ONE place to name it. Metadata, OG tags and the blog
 * derive from here; nothing else in the repo hardcodes a product name.
 *
 * Fill these in first. Leaving them as-is is the web equivalent of shipping
 * "Untitled Document".
 */
export const site = {
  name: "My App",
  title: "My App — what it does, in one line",
  description: "One or two sentences someone would actually read in a search result. 140 to 160 characters is the target.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
} as const;
