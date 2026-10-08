import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test("no page is wider than a phone screen", async ({ page }) => {
  for (const path of ["/", "/meetings", "/tasks", "/people", "/ask", "/settings", "/view/1"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const widest = await page.evaluate(() => Math.max(...[...document.querySelectorAll("body *")].map((e) => e.getBoundingClientRect().right)));
    expect(widest, path).toBeLessThanOrEqual(391);
  }
});

test("the menu button opens the sidebar and a link closes it", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByLabel("Main navigation");
  await expect(nav).not.toBeInViewport();
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(nav).toBeInViewport();
  await nav.getByRole("link", { name: "People" }).click();
  await expect(page).toHaveURL(/\/people/);
  await expect(nav).not.toBeInViewport();
});
