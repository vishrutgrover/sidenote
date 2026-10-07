import { expect, test } from "@playwright/test";

const cards = (page: import("@playwright/test").Page) => page.locator('a[href^="/view/"]').filter({ has: page.locator("p") });

test.beforeEach(async ({ page }) => {
  await page.goto("/meetings");
  await expect(page.getByText("Weekly Product Sync")).toBeVisible();
});

test("lists the sample meetings, newest first, under day headings", async ({ page }) => {
  await expect(cards(page)).toHaveCount(6);
  await expect(cards(page).first()).toContainText("Weekly Product Sync");
  await expect(cards(page).last()).toContainText("Interview: Backend Engineer");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Yesterday" })).toBeVisible();
});

test("search finds a meeting by title or participant and can be cleared", async ({ page }) => {
  await page.getByLabel("Search meetings").fill("acme");
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText("Customer Call: Acme Logistics");
  await page.getByLabel("Search meetings").fill("Okafor"); // a participant, not in any title
  await expect(cards(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(cards(page)).toHaveCount(6);
});

test("a search with no results explains itself and offers a reset", async ({ page }) => {
  await page.getByLabel("Search meetings").fill("zeppelin");
  await expect(page.getByText("No meetings match")).toBeVisible();
  await page.getByRole("button", { name: "Clear search and filters" }).click();
  await expect(cards(page)).toHaveCount(6);
});

test("filter by participant shows a removable chip", async ({ page }) => {
  await page.getByRole("button", { name: /Filters/ }).click();
  await page.getByRole("button", { name: "Participants" }).click();
  await page.getByLabel(/Daniel Okafor/).check();
  await expect(cards(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Filters \(1\)/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Remove filter With Daniel Okafor" }).click();
  await expect(cards(page)).toHaveCount(6);
});

test("filter by date range and by tag", async ({ page }) => {
  await page.getByRole("button", { name: /Filters/ }).click();
  await page.getByLabel("Today").check();
  await expect(cards(page)).toHaveCount(1);
  await page.getByLabel("Any time").check();
  await page.getByRole("button", { name: "Tags" }).click();
  await page.getByLabel(/planning/).check();
  await expect(cards(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Clear all filters" }).click();
  await expect(cards(page)).toHaveCount(6);
});

test("sort oldest first reverses the list", async ({ page }) => {
  await page.getByLabel("Sort").selectOption("oldest");
  await expect(cards(page).first()).toContainText("Interview: Backend Engineer");
});

test("channels: Uploads is empty for sample data, All Meetings brings everything back", async ({ page }) => {
  await page.getByRole("button", { name: /Uploads/ }).click();
  await expect(page.getByText(/haven't recorded a meeting yet/)).toBeVisible();
  await page.getByRole("button", { name: /All Meetings/ }).click();
  await expect(cards(page)).toHaveCount(6);
});

test("opening a card goes to that meeting", async ({ page }) => {
  await cards(page).first().click();
  await expect(page).toHaveURL(/\/view\/\d+$/);
});
