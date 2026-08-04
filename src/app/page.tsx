/**
 * Your home page. Replace all of it — nothing here is load-bearing.
 *
 * There is deliberately no starter design: a demo landing page is something you would
 * have to delete before you could start, and half of it would survive into production.
 */
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-md">
        <h1 className="font-semibold text-2xl tracking-tight">Ready.</h1>
        <p className="mt-2 text-muted-foreground text-sm/6">
          Open this folder in your coding agent and describe what you want to build. It will read{" "}
          <code className="font-mono text-xs">AGENTS.md</code> and follow the rules there.
        </p>
        <p className="mt-6 font-mono text-muted-foreground text-xs">
          pnpm health · pnpm onboard · pnpm verify
        </p>
      </div>
    </main>
  );
}
