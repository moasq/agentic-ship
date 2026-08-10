/**
 * The origin allowlist used by `pnpm open:url` (scripts/open-url.mjs), extracted so the
 * security-critical decision is unit-testable without running the script (which parses
 * argv and dispatches a browser at import time).
 *
 * The rule: the agent may only open a URL whose ORIGIN appears in the connection catalog
 * (a provider's docsUrl or a setupUrl), and only over https. Anything that arrived from
 * a provider response, a web page, or a user is not openable. These functions are pure —
 * no I/O, no process.exit — so open-url.mjs stays the single caller that maps a verdict
 * to its exact messages and exit codes.
 */

/** Collect the set of https origins the connection catalog authorizes opening. */
export function catalogOrigins(catalog) {
  const origins = new Set();
  for (const provider of Object.values(catalog?.providers ?? {})) {
    for (const candidate of [provider.docsUrl, provider.agentTool?.setupUrl, provider.projectProvisioning?.setupUrl]) {
      if (typeof candidate === "string" && candidate.startsWith("https://")) {
        origins.add(new URL(candidate).origin);
      }
    }
  }
  return origins;
}

/**
 * Decide whether `raw` may be opened, given the allowed origins.
 * Returns { ok: true, url } or { ok: false, reason, ... }. The order of checks matches
 * open-url.mjs exactly: parseable → https → origin in the allowlist.
 *
 * Origin comparison is what defeats the tricky cases: a userinfo prefix
 * (https://dashboard.convex.dev@evil.com) has origin https://evil.com, a look-alike
 * subdomain (https://dashboard.convex.dev.evil.com) is a different origin, and http is
 * rejected before the origin is ever consulted. URL.origin is scheme+host+port, so none
 * of these can masquerade as an allowed catalog origin.
 */
export function classifyOpenUrl(raw, allowedOrigins) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid-url" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "not-https", protocol: url.protocol };
  if (!allowedOrigins.has(url.origin)) return { ok: false, reason: "origin-not-allowed", origin: url.origin };
  return { ok: true, url };
}
