import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NumberTicker } from "@/components/magicui/number-ticker";

export type WaitlistState = "idle" | "submitting" | "added" | "already" | "error" | "not-connected";

export type WaitlistFormProps = {
  /** Signups so far. `null` while loading or when the backend is not connected. */
  count: number | null;
  state: WaitlistState;
  action: (formData: FormData) => void;
  heading?: string;
  blurb?: string;
};

const MESSAGES: Record<WaitlistState, string | null> = {
  idle: null,
  submitting: null,
  added: "You are on the list.",
  already: "That email is already on the list.",
  error: "Could not save that. Check the address and try again.",
  "not-connected": "Backend not connected yet — run `npx convex dev`, then reload.",
};

/**
 * Props in, JSX out. No data fetching, no hooks: this block renders standalone with
 * mock props in any preview, and the feature wrapper owns the Convex calls.
 */
export function WaitlistForm({
  count,
  state,
  action,
  heading = "Get it when it ships",
  blurb = "One email when the bundle is ready. Nothing else, ever.",
}: WaitlistFormProps) {
  const message = MESSAGES[state];
  const disabled = state === "submitting" || state === "not-connected";

  return (
    <Card className="mx-auto w-full max-w-lg p-6">
      <h2 className="font-semibold text-xl tracking-tight">{heading}</h2>
      <p className="mt-1.5 text-muted-foreground text-sm">{blurb}</p>

      <form action={action} className="mt-5 flex flex-col gap-2.5 sm:flex-row">
        <label htmlFor="waitlist-email" className="sr-only">
          Email address
        </label>
        <input
          id="waitlist-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          maxLength={254}
          placeholder="you@company.com"
          disabled={disabled}
          className="h-10 flex-1 rounded-[--radius] border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-50"
        />
        <Button type="submit" disabled={disabled}>
          {state === "submitting" ? "Adding…" : "Join"}
        </Button>
      </form>

      <div className="mt-3 flex min-h-5 items-center justify-between gap-3 text-sm">
        <span aria-live="polite" className={state === "error" ? "text-destructive" : "text-muted-foreground"}>
          {message}
        </span>
        {count !== null && (
          <span className="shrink-0 font-mono text-muted-foreground text-xs">
            {/* The vendor file ships text-black/dark:text-white; the token wins via cn()
                at the call site — components/magicui/ stays diffable against upstream. */}
            <NumberTicker value={count} className="font-mono text-muted-foreground text-xs" /> waiting
          </span>
        )}
      </div>
    </Card>
  );
}
