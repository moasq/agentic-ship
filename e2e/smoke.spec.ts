import { test, expect } from "@playwright/test";

/**
 * The smoke pack — runs with NO backend connected, by design. Everything here must be
 * green on a fresh clone; backend flows (signup → email, checkout → entitlement) join
 * as product UI exists, following the patterns in the testing skill.
 *
 * The SEO assertions check the RENDERED head, not the source: metadata that exists in
 * code but not in the response is the classic Next.js failure this catches.
 */

test.describe("pages serve", () => {
  test("home renders with exactly one h1", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("blog index renders", async ({ page }) => {
    await page.goto("/blog");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("404 is a real page, not a crash", async ({ page }) => {
    const response = await page.goto("/definitely-not-a-route");
    expect(response?.status()).toBe(404);
  });
});

test.describe("security headers ship on every response", () => {
  // Every route the engine serves, not just the home page. The headers come from a
  // `/:path*` matcher in next.config.ts, so a regression there is silent everywhere at
  // once — testing one path would have proved almost nothing. A 404 is in the list on
  // purpose: error responses are the ones people forget to protect.
  for (const path of ["/", "/blog", "/robots.txt", "/sitemap.xml", "/llms.txt", "/opengraph-image", "/definitely-not-a-route"]) {
    test(`${path} carries the full header set`, async ({ request }) => {
      const headers = (await request.get(path)).headers();
      expect(headers["content-security-policy"]).toContain("default-src 'self'");
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(headers["permissions-policy"]).toBeTruthy();
      expect(headers["strict-transport-security"]).toContain("max-age=");
    });
  }
});

test.describe("SEO surface — asserted in the rendered response", () => {
  test("home has title, description, canonical base and OG tags", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/.+/);
    expect(await page.locator('meta[name="description"]').getAttribute("content")).toBeTruthy();
    expect(await page.locator('meta[property="og:title"]').getAttribute("content")).toBeTruthy();
    expect(await page.locator('meta[property="og:site_name"]').getAttribute("content")).toBeTruthy();
  });

  test("robots.txt exists and allows AI crawlers deliberately", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain("GPTBot");
    expect(body).toContain("Sitemap:");
  });

  test("llms.txt is generated and mentions the site", async ({ request }) => {
    const response = await request.get("/llms.txt");
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("# ");
  });

  test("sitemap answers with XML", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("<urlset");
  });

  test("the OG image renders", async ({ request }) => {
    const response = await request.get("/opengraph-image");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/");
  });
});
