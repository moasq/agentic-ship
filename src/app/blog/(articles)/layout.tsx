import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Articles are `page.mdx` files, so the reading column and the back link live here
 * rather than being repeated in every article's markdown.
 */
export default function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1">
      <div className="mx-auto w-full max-w-2xl px-6 pt-10">
        <Link href="/blog" className="font-mono text-muted-foreground text-xs hover:text-foreground">
          ← writing
        </Link>
      </div>
      <div className="mx-auto w-full max-w-2xl px-6 pt-6 pb-20">{children}</div>
    </div>
  );
}
