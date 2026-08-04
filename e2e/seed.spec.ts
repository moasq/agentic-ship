import { test, expect } from "@playwright/test";

/**
 * Seed spec — the bootstrap example the official Playwright agents (planner,
 * generator, healer) use as their template: `npx playwright init-agents --loop=claude`.
 *
 * It shows one full round trip: navigate, wait for real content, assert. New specs
 * follow this shape — role-based locators, web-first assertions, zero sleep().
 */
test("the app serves and renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
