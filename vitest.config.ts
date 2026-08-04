import { defineConfig } from "vitest/config";

/**
 * Gate G2 — backend logic on test data, no network, no Convex account.
 *
 * The edge-runtime environment matches the Convex runtime far more closely than jsdom
 * or node: no Node globals that would not exist in a Convex function, same Web APIs.
 * convex-test (installed) runs your domain functions against an in-memory backend once
 * `convex/_generated` exists — the testing skill documents that pattern.
 */
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts", "src/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
