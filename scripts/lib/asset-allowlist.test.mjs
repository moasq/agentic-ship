// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import { ALLOWED_IMAGE_HOSTS, checkAssetUrl } from "./asset-allowlist.mjs";

// Mirrors the one line in scripts/fetch-asset.mjs's redirect loop: resolve the Location
// against the current URL, then re-run the gate. This is what "every hop re-checked"
// means, so the tests exercise the exact composition the loop uses.
const resolveHop = (location, base) => checkAssetUrl(new URL(location, base).href, ALLOWED_IMAGE_HOSTS);

test("an allowlisted host over https passes", () => {
  const result = checkAssetUrl("https://images.unsplash.com/photo-123", ALLOWED_IMAGE_HOSTS);
  assert.equal(result.error, undefined);
  assert.equal(result.url.hostname, "images.unsplash.com");
});

test("a host outside the allowlist is refused", () => {
  const result = checkAssetUrl("https://evil.com/photo.jpg", ALLOWED_IMAGE_HOSTS);
  assert.match(result.error, /not in the source allowlist/);
  assert.equal(result.url, undefined);
});

test("http is refused even for an allowlisted host (no silent downgrade)", () => {
  const result = checkAssetUrl("http://images.unsplash.com/photo.jpg", ALLOWED_IMAGE_HOSTS);
  assert.match(result.error, /https only/);
});

test("an unparseable URL is refused", () => {
  assert.match(checkAssetUrl("::::not-a-url", ALLOWED_IMAGE_HOSTS).error, /not a valid URL/);
});

test("a redirect to a disallowed host is refused on that hop", () => {
  // First hop is fine (same allowed host); the check only matters because the SECOND hop
  // leaves the allowlist. Re-validating every hop is what catches it.
  const allowedBase = "https://images.unsplash.com/photo-1";
  assert.equal(resolveHop("/photo-2.jpg", allowedBase).error, undefined); // relative, same host — ok
  assert.match(resolveHop("https://evil.com/steal.jpg", allowedBase).error, /not in the source allowlist/);
});

test("a scheme-relative redirect off the allowlisted host is refused", () => {
  // //evil.com resolves against the https base to https://evil.com — a classic way to
  // hop hosts without an obvious absolute URL.
  const result = resolveHop("//evil.com/steal.jpg", "https://images.unsplash.com/photo-1");
  assert.match(result.error, /not in the source allowlist/);
});

test("a redirect that downgrades to http is refused", () => {
  const result = resolveHop("http://images.unsplash.com/photo-2.jpg", "https://images.unsplash.com/photo-1");
  assert.match(result.error, /https only/);
});

test("a multi-hop chain fails the moment any hop leaves the allowlist", () => {
  // allowed -> allowed(pexels) -> evil: the final hop must be the one that refuses.
  const hop1 = resolveHop("https://images.pexels.com/a.jpg", "https://images.unsplash.com/start");
  assert.equal(hop1.error, undefined);
  const hop2 = resolveHop("https://evil.com/a.jpg", hop1.url.href);
  assert.match(hop2.error, /not in the source allowlist/);
});
