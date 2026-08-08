import { existsSync, readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Next loads `.env.local` for the application; this process does not. Without it the
 * specs cannot answer the same question the app can — "is a backend connected?" — and
 * the authenticated pack would skip itself on a machine where it should have run.
 * Values already in the environment win, so CI stays in charge of its own config.
 */
for (const line of existsSync(".env.local") ? readFileSync(".env.local", "utf8").split("\n") : []) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (!match) continue;
  const [, key, raw] = match;
  if (process.env[key] === undefined) process.env[key] = raw.trim().replace(/^["']|["']$/g, "");
}

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
  /**
   * Capped below Playwright's default (half the cores).
   *
   * The landing page carries a continuously animating canvas and scroll-driven motion,
   * so several Chromium instances rendering it at once starve each other's main thread
   * and `page.goto` waits past 30s for a `load` that the server answered in ~20ms. It
   * shows up as the first N landing tests failing together, N being the worker count —
   * a machine problem wearing a test failure's clothes, and the sort of thing that
   * makes people add retries.
   *
   * Three is measured, not guessed: green here at load average 40 on ten cores, where
   * five failed repeatedly. The suite still finishes in about ninety seconds.
   */
  workers: 3,
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
