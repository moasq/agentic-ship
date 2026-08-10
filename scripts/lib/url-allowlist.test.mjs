// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import { catalogOrigins, classifyOpenUrl } from "./url-allowlist.mjs";

// A catalog shaped like .agents/connections/providers.json — https surfaces plus one
// http surface that must be ignored, so the allowlist can never authorize an insecure
// origin just because a provider listed one.
const catalog = {
  providers: {
    convex: {
      docsUrl: "https://docs.convex.dev/cli",
      agentTool: { setupUrl: "https://dashboard.convex.dev/" },
      projectProvisioning: { setupUrl: "https://dashboard.convex.dev/" },
    },
    stripe: {
      docsUrl: "https://docs.stripe.com/stripe-cli",
      agentTool: { setupUrl: "https://dashboard.stripe.com/" },
    },
    insecure: { docsUrl: "http://insecure.example.com/" },
  },
};
const origins = catalogOrigins(catalog);

test("catalogOrigins collects only https origins, deduped, and drops http surfaces", () => {
  assert.deepEqual(
    [...origins].sort(),
    ["https://dashboard.convex.dev", "https://dashboard.stripe.com", "https://docs.convex.dev", "https://docs.stripe.com"],
  );
  assert.equal(origins.has("http://insecure.example.com"), false);
});

test("a catalog origin over https is allowed", () => {
  const verdict = classifyOpenUrl("https://dashboard.convex.dev/deep/link?x=1", origins);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.url.origin, "https://dashboard.convex.dev");
});

test("a non-catalog origin is refused", () => {
  const verdict = classifyOpenUrl("https://evil.com/", origins);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, "origin-not-allowed");
  assert.equal(verdict.origin, "https://evil.com");
});

test("a userinfo prefix cannot smuggle a disallowed host past the allowlist", () => {
  // The real host here is evil.com; everything before @ is userinfo. URL.origin sees
  // through it, so this must be refused as evil.com, not accepted as convex.
  const verdict = classifyOpenUrl("https://dashboard.convex.dev@evil.com/x", origins);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, "origin-not-allowed");
  assert.equal(verdict.origin, "https://evil.com");
});

test("a look-alike subdomain is a different origin and is refused", () => {
  const verdict = classifyOpenUrl("https://dashboard.convex.dev.evil.com/", origins);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, "origin-not-allowed");
  assert.equal(verdict.origin, "https://dashboard.convex.dev.evil.com");
});

test("an explicit port makes it a different origin and is refused", () => {
  const verdict = classifyOpenUrl("https://dashboard.convex.dev:8443/", origins);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, "origin-not-allowed");
});

test("http is rejected before the origin is even consulted, even for an allowed host", () => {
  const verdict = classifyOpenUrl("http://dashboard.convex.dev/", origins);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, "not-https");
  assert.equal(verdict.protocol, "http:");
});

test("a non-https scheme on an allowed host is refused", () => {
  assert.equal(classifyOpenUrl("ftp://dashboard.convex.dev/x", origins).reason, "not-https");
  assert.equal(classifyOpenUrl("javascript:alert(1)", origins).reason, "not-https");
});

test("an unparseable URL is refused", () => {
  const verdict = classifyOpenUrl("not a url", origins);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, "invalid-url");
});
