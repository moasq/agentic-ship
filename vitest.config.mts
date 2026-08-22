import { defineConfig } from "vitest/config";

/**
 * Tool contracts run in Node with no product app, browser, or provider required.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/**/*.test.mjs"],
    testTimeout: 20_000,
  },
});
