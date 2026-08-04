import type { MDXComponents } from "mdx/types";

/**
 * Required at the project root by `@next/mdx`. Every MDX element renders through here,
 * which is how articles inherit the design system instead of arriving unstyled.
 *
 * Tokens only — no raw hex, no arbitrary values. Same rule as any other component.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: ({ children }) => <h1 className="mt-2 font-semibold text-3xl tracking-tight sm:text-4xl">{children}</h1>,
    h2: ({ children }) => <h2 className="mt-10 font-semibold text-2xl tracking-tight">{children}</h2>,
    h3: ({ children }) => <h3 className="mt-8 font-semibold text-lg tracking-tight">{children}</h3>,
    p: ({ children }) => <p className="mt-4 text-base/7 text-muted-foreground">{children}</p>,
    ul: ({ children }) => <ul className="mt-4 list-disc space-y-1.5 pl-5 text-base/7 text-muted-foreground">{children}</ul>,
    ol: ({ children }) => <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-base/7 text-muted-foreground">{children}</ol>,
    a: ({ children, href }) => (
      <a href={href} className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
        {children}
      </a>
    ),
    blockquote: ({ children }) => (
      <blockquote className="mt-6 border-primary/40 border-l-2 pl-4 text-muted-foreground italic">{children}</blockquote>
    ),
    code: ({ children }) => (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">{children}</code>
    ),
    pre: ({ children }) => (
      <pre className="mt-6 overflow-x-auto rounded-[--radius] border bg-muted/50 p-4 font-mono text-sm">{children}</pre>
    ),
    hr: () => <hr className="mt-10 border-border" />,
    ...components,
  };
}
