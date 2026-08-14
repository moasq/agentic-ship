# Better Auth hardening

> Reference of the `convex-structure` skill: production-hardening decisions for the
> wired Better Auth seam (`convex/auth.ts` on `@convex-dev/better-auth`). Written for
> this stack; the option facts are Better Auth's own configuration surface
> (https://www.better-auth.com/docs — verified against the pinned 1.6.26).
> Wiring itself: `better-auth-wiring.md`. Go-live gates: `production-preflight`.

Better Auth ships with safe defaults — CSRF checks on, PKCE automatic on OAuth,
`httpOnly`/`secure`/`sameSite: lax` cookies, rate limiting on in production, account
enumeration countermeasures built in. Hardening is therefore mostly a matter of NOT
disabling protections, plus a handful of deliberate upgrades below. Every value here
is config on the existing seam; none of it adds an endpoint or a custom flow (Auth
rules, AGENTS.md).

## Secret

- `BETTER_AUTH_SECRET` is set by `pnpm setup:auth` — generated, pushed straight into
  Convex env, never printed. Rotating it invalidates existing sessions; do it through
  the same command, deliberately.
- Better Auth rejects placeholder secrets in production and warns under 32 chars.
  Never satisfy that warning by hand-writing a weak value; `pnpm secret` exists for
  ad-hoc generation.

## Rate limiting

On by default in production, window 10s / max 100, with stricter built-in rules for
the sensitive endpoints (`/sign-in`, `/sign-up`, `/change-password`, `/change-email`:
3 per 10s). Two decisions matter here:

- **Storage.** The default in-memory store resets per instance — meaningless on
  serverless. Set `rateLimit.storage: "database"` in `convex/auth.ts` so counts
  persist in the adapter's storage and apply across instances.
- **Tightening.** `rateLimit.customRules` takes per-path overrides (e.g. sign-in
  `{ window: 60, max: 5 }`). Tighten before launch rather than after the first
  credential-stuffing run. Never set a rule to `false` to "fix" a flaky e2e — test
  environments are not production (`testing` skill owns test-data tiers).

## Origins

- `trustedOrigins` must list every real browser origin (prod domain, preview domains
  as a wildcard like `https://*.netlify.app` only if previews genuinely need auth).
  Better Auth validates `callbackURL`/`redirectTo`/`origin` against this list and
  403s the rest — that validation is the open-redirect defense, so keep the list
  tight; a wildcard is a decision, not a convenience.
- `SITE_URL` (set by `pnpm setup:auth`) is the `baseURL` and is automatically
  trusted.

## Sessions and cookies

- Defaults (7-day expiry, 24h refresh) fit this product shape; shorten `expiresIn`
  for higher-stakes products rather than inventing custom logout logic.
- `session.cookieCache` trades a DB read per request for a signed (or `"jwe"`
  encrypted) cookie snapshot with a short `maxAge`. On Convex the read is cheap and
  reactive — enable the cache only if auth-read volume is a measured problem, and
  prefer `"jwe"` if the session carries anything sensitive.
- Do not touch `advanced.disableCSRFCheck` or downgrade cookie attributes. A
  `sameSite: "strict"` upgrade is available where cross-site entry links to
  authenticated pages don't matter.

## OAuth providers

- The all-or-none credential-pair rule (Auth rules, AGENTS.md) is the enumeration
  defense at the UI layer; `pnpm health` reports half-set pairs.
- If the product ever stores provider tokens to call APIs on the user's behalf, set
  `account.encryptOAuthTokens: true` (AES-256-GCM at rest) at the same moment — not
  later.

## Audit trail

Better Auth's `databaseHooks` fire inside the auth flow: `session.create.after`
(sign-in), `session.delete.before` (revocation), `user.update.after` (email change —
compare `oldData.email`), `account.create.after` (provider link). Wire them to an
internal Convex mutation writing an `authEvents` table (indexed by user, capped or
TTL'd) when the product needs an audit trail — that keeps auditing inside the
backend, in domain code, with no third-party log sink. A `before` hook returning
`false` blocks the operation; use that only for policy, never for rate limiting
(above) or validation better done in domain code.

## What NOT to add

- No custom credential endpoints, no hand-rolled lockout counters, no CAPTCHA
  middleware bolted in front of the proxy route — Better Auth's rate limiting and
  enumeration defenses already cover the class, and a second mechanism is a second
  attack surface (one seam, Auth rules).
- No IP-reputation logic in application code. If the product outgrows this, that
  pressure is a platform decision (host-level WAF), not a `convex/auth.ts` patch.

## Checklist (pre-launch delta on top of `pnpm preflight`)

- [ ] `rateLimit.storage: "database"` set; sensitive-endpoint limits reviewed
- [ ] `trustedOrigins` lists exactly the real origins — no stray wildcard
- [ ] Cookie attributes untouched or strictly upgraded
- [ ] `encryptOAuthTokens` on if provider tokens are stored
- [ ] Audit hooks wired if the product promises an account-activity view
