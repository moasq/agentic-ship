/**
 * The image-source allowlist and per-URL gate used by `pnpm asset`
 * (scripts/fetch-asset.mjs), extracted so the security-critical check is unit-testable
 * without running the script (which parses argv and performs network fetches at import
 * time).
 *
 * The gate runs against the URL you typed AND against every redirect Location, because
 * an allowlisted host that 302s elsewhere would otherwise walk the download straight
 * past the allowlist. `checkAssetUrl` is pure — no I/O — so fetch-asset.mjs remains the
 * only caller that resolves relative Location headers and drives the redirect loop.
 */

// Mirrors images.remotePatterns in next.config.ts. Extending this list is a human
// decision made there first — the two must not drift apart silently.
export const ALLOWED_IMAGE_HOSTS = new Set(["images.unsplash.com", "images.pexels.com"]);

/** Every URL crosses this gate — the one you typed and every redirect target. */
export function checkAssetUrl(candidate, allowed = ALLOWED_IMAGE_HOSTS) {
  let url;
  try {
    url = new URL(candidate);
  } catch {
    return { error: "not a valid URL." };
  }
  if (url.protocol !== "https:") return { error: `https only (got ${url.protocol}).` };
  if (!allowed.has(url.hostname)) {
    return {
      error:
        `${url.hostname} is not in the source allowlist (${[...allowed].join(", ")}).\n` +
        "      Adding a source is a human decision: update images.remotePatterns in next.config.ts first, then this script's list.",
    };
  }
  return { url };
}
