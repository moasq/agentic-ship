import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface HeroProps {
  eyebrow: string;
  title: string;
  description: string;
  primaryCta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
}

/**
 * Props in, JSX out. No data fetching, no store access — this renders standalone
 * with mock props so it can be screenshotted and iterated on in isolation.
 */
export function Hero({
  eyebrow,
  title,
  description,
  primaryCta,
  secondaryCta,
}: HeroProps) {
  return (
    <section className="border-b border-border">
      <div className="mx-auto flex max-w-3xl flex-col items-start gap-6 px-6 py-24 sm:py-32">
        <Badge variant="secondary" className="font-mono text-xs tracking-wide">
          {eyebrow}
        </Badge>
        <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="max-w-prose text-lg text-muted-foreground">{description}</p>
        <div className="flex flex-wrap gap-3">
          {/* This shadcn style is built on Base UI, which composes with `render`
              rather than `asChild`. Read the component before assuming its API. */}
          <Button size="lg" render={<a href={primaryCta.href} />}>
            {primaryCta.label}
          </Button>
          {secondaryCta ? (
            <Button
              size="lg"
              variant="outline"
              render={
                <a
                  href={secondaryCta.href}
                  rel="noopener noreferrer"
                  target="_blank"
                />
              }
            >
              {secondaryCta.label}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
