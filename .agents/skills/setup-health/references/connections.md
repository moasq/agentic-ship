# Connection Reference — every probe, every fallback

Deep reference for the setup-health skill. One section per connection: what it is, how
to probe it, what failure means, and the fallback that keeps work moving.

## shadcn MCP

- **What:** official component-registry access for agents. Official since shadcn CLI 3.0.
- **Probe:** list registries (cheap, read-only).
- **Failure meaning:** npx cache broken, network down, or registry outage.
- **Fallback:** `npx shadcn@latest add <component>` by hand; browse ui.shadcn.com.
- **Upstream:** https://ui.shadcn.com/docs/mcp

## Next.js DevTools MCP

- **What:** first-party Next.js agent tooling (Next 16.2+): live build/runtime/type
  errors, route metadata, Server Action inspection, browser log forwarding.
- **Probe:** get build errors against the running dev server.
- **Failure meaning:** dev server not running, or Next < 16.2.
- **Fallback:** read `node_modules/next/dist/docs/` directly — it always matches the
  installed version; watch the dev-server terminal for errors.
- **Upstream:** https://nextjs.org/docs/app/guides/mcp

## MagicUI MCP

- **What:** MagicUI's animated components exposed to the agent. Official, MIT.
- **Probe:** list components.
- **Fallback:** MagicUI is also a shadcn-compatible registry — `@magicui` is pinned in
  `components.json`, so the shadcn MCP/CLI covers installs without this server.
- **Upstream:** https://github.com/magicuidesign/mcp

## Context7

- **What:** current docs for libraries that change fast (Tailwind v4, Zustand 5, Better
  Auth). Counteracts stale training data.
- **Probe:** resolve `zustand`.
- **Fallback:** open the official docs in a browser; pin exact versions in prompts.
  For Better Auth specifically: https://better-auth.com/llms.txt
- **Upstream:** https://github.com/upstash/context7

## 21st MCP (optional, off by default)

- **What:** remote server for 21st.dev community blocks. Needs `TWENTYFIRST_API_KEY`.
- **Probe:** search `button`. Missing key or 401 → **WARN, not FAIL** — optional by
  design; the bundle's promise is fewer subscriptions.
- **Fallback:** browse 21st.dev, copy the component's install prompt. Works with zero
  setup. Review pasted code per the frontend-security skill before committing.
- **Upstream:** https://github.com/21st-dev/magic-mcp

## Convex CLI / deployment

- **What:** the backend connection. `npx convex dev` provisions, syncs, regenerates types.
- **Probe:** `npx convex dev --once` exits 0.
- **Repair sequence (in order, re-test after each):**
  1. `npx convex dev --once` — writes env vars when a project exists.
  2. `npx convex login` — opens a browser. **Human step: say so and wait.**
  3. `npx convex dev --once` — offers to create/link a project after login.
- **Fallback:** create or link at https://dashboard.convex.dev, paste the deployment
  name into `.env.local`, re-run. Docs: https://docs.convex.dev/quickstart
- **Env contract:** `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`,
  `NEXT_PUBLIC_CONVEX_SITE_URL` in `.env.local`; action secrets in Convex env only.

## Convex MCP

- **What:** live deployment introspection (tables, function specs, logs, run).
  Declared in `.mcp.json` (`npx convex mcp start`) so **every** tool gets it; the
  `convex@claude-plugins-official` plugin carries a namespaced second copy for Claude —
  seeing both is expected.
- **Probe:** status / list tables.
- **Failure meaning:** usually no connected deployment yet — a stage, not an outage.
- **Fallback:** the dashboard. Neither blocks development.
- **Upstream:** https://docs.convex.dev/ai/convex-mcp-server

## Stripe / Resend / PostHog / Render MCPs (remote, OAuth)

- **What:** the four vendor remote servers, straight from each vendor's own plugin
  config: `mcp.stripe.com` · `mcp.resend.com/mcp` · `mcp.posthog.com/mcp` ·
  `mcp.render.com/mcp`. Declared in `.mcp.json`; Codex reaches them through the
  `mcp-remote` bridge (TOML in `agent-compatibility.md`).
- **Auth:** browser OAuth on first use — **human step: say so and wait.** No API key to
  leak; nothing for `.env.local`.
- **Probe:** one cheap list each — products / domains / projects / services.
- **Failure meaning:** not yet authorized (human step pending), or no account yet —
  `pnpm onboard` stages cover both. On an **unclaimed Stripe sandbox**, probe the CLI
  (`stripe whoami`), not the MCP — Stripe's own guidance.
- **Fallback:** each vendor's dashboard. None of them blocks development.

## Better Auth (official skills + docs MCP)

- **What:** the `better-auth/skills` official skill pack (`better-auth-best-practices`)
  plus better-auth.com's llms.txt and docs MCP.
- **Presence check:** an installed better-auth skill visible to the agent. Missing →
  WARN with the install command from the AI-resources page:
  https://better-auth.com/docs/ai-resources/skills
- **Fallback:** https://better-auth.com/llms.txt pasted into context; the Convex
  adapter guide at https://labs.convex.dev/better-auth/framework-guides/next
- **Version rule:** `better-auth` stays inside the `~1.6.x` pin from
  `skills.lock.json` — the Convex adapter lags majors. Drift → `upstream-sync`.

## Registries (components.json)

- **Probe:** every URL under `registries` returns HTTP 200.
- **Failure meaning:** registry moved or down.
- **Fallback:** stop using it and report. **Never hand-write a substitute component
  silently** — that is how bundles drift from upstream.

## Claude Code plugins

- **Declared:** `nextjs@nextjs` (marketplace inside vercel/next.js) plus
  `convex` / `stripe` / `resend` / `posthog` / `render` from `claude-plugins-official`.
- **Probe:** plugin listed by the harness.
- **Fallback:** manual install —
  `/plugin marketplace add vercel/next.js` · `/plugin install nextjs@nextjs` ·
  `/plugin install <name>@claude-plugins-official` for the rest.
- **Non-Claude agents:** plugins don't exist there — see
  `references/agent-compatibility.md` for the per-tool equivalents.
