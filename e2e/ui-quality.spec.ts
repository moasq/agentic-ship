import { expect, test, type Page } from "@playwright/test";

const productRoutes = ["/", "/blog"];
const viewports = [
  { name: "small phone", width: 320, height: 640 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

async function auditDocument(page: Page) {
  return page.evaluate(() => {
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
    };
    const name = (element: Element) =>
      [element.getAttribute("aria-label"), element.getAttribute("title"), element.textContent]
        .filter(Boolean)
        .join(" ")
        .trim();

    const imagesWithoutAlt = [...document.querySelectorAll("img")]
      .filter(visible)
      .filter((image) => !image.hasAttribute("alt")).length;
    const unnamedControls = [...document.querySelectorAll("button, a[href]")]
      .filter(visible)
      .filter((element) => !name(element) && !element.querySelector("img[alt]:not([alt=''])")).length;
    const unlabeledFields = [...document.querySelectorAll("input:not([type='hidden']), select, textarea")]
      .filter(visible)
      .filter((element) => {
        const control = element as HTMLInputElement;
        return control.labels?.length === 0 && !control.getAttribute("aria-label") && !control.getAttribute("aria-labelledby");
      }).length;
    const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter(visible);
    const headingLevels = headings.map((heading) => Number(heading.tagName.slice(1)));
    const headingSkips = headingLevels.filter((level, index) => index > 0 && level > headingLevels[index - 1] + 1);

    return {
      duplicateIds: [...new Set(duplicateIds)],
      headingSkips,
      imagesWithoutAlt,
      language: document.documentElement.lang,
      mainCount: document.querySelectorAll("main").length,
      unnamedControls,
      unlabeledFields,
    };
  });
}

test.describe("authored UI quality", () => {
  for (const route of productRoutes) {
    test(`${route} has a usable accessibility skeleton`, async ({ page }) => {
      await page.goto(route);
      expect(await auditDocument(page)).toEqual({
        duplicateIds: [],
        headingSkips: [],
        imagesWithoutAlt: 0,
        language: "en",
        mainCount: 1,
        unnamedControls: 0,
        unlabeledFields: 0,
      });
    });

    for (const viewport of viewports) {
      test(`${route} does not overflow at ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(route);
        const dimensions = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
      });
    }
  }

  test("the light and dark token surfaces are both wired", async ({ page }) => {
    await page.goto("/");
    const light = await page.locator("body").evaluate((body) => {
      const style = getComputedStyle(body);
      return { background: style.backgroundColor, foreground: style.color };
    });
    const dark = await page.locator("body").evaluate((body) => {
      document.documentElement.classList.add("dark");
      const style = getComputedStyle(body);
      return { background: style.backgroundColor, foreground: style.color };
    });

    expect(dark.background).not.toBe(light.background);
    expect(dark.foreground).not.toBe(light.foreground);
  });

  test("keyboard navigation reaches an available blog control", async ({ page }) => {
    await page.goto("/blog");
    const controls = page.locator(
      "a[href]:visible, button:not([disabled]):visible, input:not([disabled]):visible, select:not([disabled]):visible, textarea:not([disabled]):visible, [tabindex]:not([tabindex='-1']):visible",
    );

    if ((await controls.count()) === 0) {
      await expect(page.getByText(/No articles yet/)).toBeVisible();
      return;
    }

    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).not.toHaveCount(0);
    await expect(page.locator(":focus")).not.toHaveJSProperty("tagName", "BODY");
  });
});
