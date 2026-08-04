import { defineConfig, devices } from "@playwright/test";

/**
 * Gate G3 — the app in a real browser.
 *
 * Runs against a production build (`pnpm start`), not the dev server: dev-only
 * forgiveness (lazy compilation, relaxed headers) hides exactly the failures this
 * gate exists to catch.
 *
 * Retries in CI only — a test that needs a retry locally is flaky, and flaky gets
 * fixed, not retried until green.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry", // the trace is the healer's evidence
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm build && pnpm start --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
