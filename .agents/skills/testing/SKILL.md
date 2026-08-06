---
name: testing
description: The verification gates, test-data rules, and the self-healing loop — unit tests with vitest/convex-test, e2e with Playwright, tier-1 deterministic repair via pnpm heal, and the healer guardrails. Use when writing tests, when any gate is red, or when a repair is needed.
---

# Testing & self-healing

A failure is allowed to happen once. Gates catch it, the heal loop repairs it with
evidence, and the repair graduates into a rule (`.agents/heal-ledger.md`) so the class
cannot return.

## The gates, in order

| Gate | Command | Proves |
| --- | --- | --- |
| G0 | `pnpm health` | SSOT, pins, secrets, mirrors |
| G1 | `pnpm verify` | G0 + lint + the build |
| G2 | `pnpm test` | backend logic, in memory, no network |
| G3 | `pnpm test:e2e` | the app in a real browser: pages, headers, SEO surface |
| all | `pnpm verify:full` | G0–G3 in one command (CI runs the same gates, plus `pnpm check:mcp`, split across OS jobs) |
| launch | `pnpm preflight [--prod]` | production readiness — see the production-preflight skill |

A gate runs only when the ones above it are green. `pnpm verify` is the definition of
done for every completion; `verify:full` is for PRs and before a deploy.

CI splits the same gates across two jobs: G0–G2 plus the build on macOS, Linux and
Windows, and G3 on Linux. Every gate runs with no network beyond the install — fonts
are committed rather than fetched, which is what lets the production build inside
Playwright's `webServer` succeed on a runner with no egress.

## Writing unit tests (G2)

- Construct data **in the test that uses it** — factories, not fixture piles.
- The auth seam test (`convex/lib/auth.test.ts`) is the template: pure logic, fake ctx.
- Domain functions use `convex-test` (installed) against the in-memory backend **once
  `convex/_generated` exists**:

```ts
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const t = convexTest(schema);
await t.mutation(api.posts.create, { title: "x" });          // public surface
const asUser = t.withIdentity({ subject: "user_1" });        // authenticated calls
```

- Test the **rules**, not the plumbing: dedupe happens, ownership is enforced, internal
  functions are internal, over-length input is rejected. A test that would still pass
  with the rule deleted is not a test.

## Writing e2e tests (G3)

- `e2e/seed.spec.ts` is the bootstrap template; `smoke.spec.ts` is the always-green
  pack (no backend needed — it must pass on a fresh clone).
- Role-based locators (`getByRole`), web-first assertions, **zero `sleep()`**. A test
  that needs a wait needs a better assertion.
- Backend flows (sign-up → email in `deliveryEvents`, checkout 4242 → entitlement
  flips reload-free) join when product UI exists. Gate them:
  `test.skip(!process.env.NEXT_PUBLIC_CONVEX_URL, "needs a connected backend")`.
- Runs against a **production build** — dev-server forgiveness hides real failures.

## Test data — one rule per tier

| Tier | Mechanism | The rule |
| --- | --- | --- |
| unit | in-test factories | no shared fixture files, ever |
| seeded e2e | internal mutations in `convex/testing.ts` (create it with your first backend flow) | refuses to run unless the deployment env sets `ALLOW_TEST_SEED=1`; prod never sets it — `pnpm preflight --prod` fails if it does |
| vendor | Stripe sandbox + 4242 + test clocks · Resend test inboxes · separate PostHog project | vendor test surfaces only; never a "test row" convention in real tables |

## Self-healing

**Tier 1 — `pnpm heal`.** Deterministic repairs only: skills link, MCP mirror, env
scaffold, stale lockfile. Ends by re-running health as the receipt. If a script can
prove the fix, no model is involved.

**Tier 2 — the agent loop.** Evidence → localize → patch → re-verify. Rules:

1. Start from captured evidence: the failing assertion, the build output, the
   Playwright trace. Reproduce before diagnosing; never patch from a symptom
   description.
2. For e2e failures, use the official healer (`.agents/agents/playwright-test-healer.md`,
   reachable as `.claude/agents/` through the link; regenerate with
   `npx playwright init-agents --loop=claude` — also `--loop=codex`; other tools follow
   this skill directly). **Warning: `init-agents` overwrites `.mcp.json`; run
   `pnpm heal` afterwards to restore the mirror, and re-merge the server list.**
3. A heal may edit **tests** when the test is wrong, or **code** when the code is wrong
   — decided by the rule, not by which edit is easier. Never relax a rule to go green.
4. **Two failed attempts = stop.** Write the ledger entry, hand the human the evidence
   verbatim.
5. Never touch secrets, env values, pins, or anything on the health CRITICAL list.

**Tier 3 — memory.** Every tier-2 repair appends to `.agents/heal-ledger.md` in the
ledger's own four-field template — a `## YYYY-MM-DD short-name` heading, then `cause`,
`fix`, `prevention`, `status` (the template at the top of the ledger is normative).
A bug healed twice is a missing rule: graduate the prevention into `AGENTS.md`, a
health check, or a skill, and set `status: GRADUATED (where)` — naming where it went.

## What never self-heals

Secrets · OAuth and browser logins · DNS · Stripe live mode · prod beyond a rollback.
The loop's last duty is to stop and name the human step.
