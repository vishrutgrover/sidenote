import { expect, test } from "@playwright/test";

test("the shell loads and shows the logged-in user from the backend", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Meetings/ })).toBeVisible();
  await expect(page.getByText("Vishrut Grover")).toBeVisible(); // proves the browser can call the API
});

test("the collapsed sidebar is remembered after a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.getByText("Vishrut Grover")).toBeHidden();
  await page.reload();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
});

test("a saved dark theme is applied before the page is interactive", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(19, 19, 20)"); // #131314, the dark background sampled from the reference
});

test("the system colour scheme is followed when nothing is saved", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await context.close();
});
