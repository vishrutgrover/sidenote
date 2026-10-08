import { expect, test, type Page } from "@playwright/test";

const dialog = (page: Page) => page.getByRole("dialog", { name: "Search meetings" });
const search = (page: Page) => page.getByLabel("Search", { exact: true });
/** Open a page, wait until React is running on it (the data has loaded), then press the shortcut. A key
 *  pressed before the page is ready would be lost, which a person cannot do but a test can. */
async function openSearch(page: Page, path = "/meetings") {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("ControlOrMeta+k");
  await expect(dialog(page)).toBeVisible();
}
const rows = (page: Page) => dialog(page).getByRole("listbox").getByRole("option");

test("Cmd/Ctrl+K opens the search from any page and Escape closes it", async ({ page }) => {
  await page.goto("/meetings");
  await expect(dialog(page)).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("ControlOrMeta+k");
  await expect(dialog(page)).toBeVisible();
  await expect(search(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);

  await page.goto("/ask");
  await page.getByRole("button", { name: "Open global search" }).click();
  await expect(dialog(page)).toBeVisible();
});

test("it also works on a meeting page, where the shell is not shown", async ({ page }) => {
  await page.goto("/meetings");
  await page.locator('a[href^="/view/"]').first().click();
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("ControlOrMeta+k");
  await expect(dialog(page)).toBeVisible();
});

test("finds a meeting by something said in it, shows the matching line and opens at that moment", async ({ page }) => {
  await openSearch(page);
  await search(page).fill("dispatchers");
  const result = dialog(page).getByText("Customer Call: Acme Logistics");
  await expect(result).toBeVisible();
  await expect(dialog(page).locator("mark").first()).toContainText("dispatchers");
  await expect.poll(() => rows(page).count()).toBeGreaterThanOrEqual(2); // the meeting and its matching lines
  await search(page).press("ArrowDown");
  await search(page).press("Enter");
  await expect(page).toHaveURL(/\/view\/\d+\?t=\d+/);
  await expect(page.getByRole("heading", { name: "Customer Call: Acme Logistics" })).toBeVisible();
  await expect(page.getByLabel("Time")).not.toContainText("00:00 /");
  await expect(dialog(page)).toHaveCount(0);
});

test("finds by a participant's name, and Enter opens the first result", async ({ page }) => {
  await openSearch(page);
  await search(page).fill("Okafor");
  await expect(rows(page).first()).toBeVisible();
  await search(page).press("Enter");
  await expect(page).toHaveURL(/\/view\/\d+$/);
});

test("Title only ignores what was said, and sort reverses the order", async ({ page }) => {
  await openSearch(page);
  await search(page).fill("the");
  await expect(rows(page).first()).toBeVisible();
  const newest = await dialog(page).locator("strong").allTextContents();
  await dialog(page).getByLabel("Sort results").selectOption("oldest");
  await expect.poll(async () => (await dialog(page).locator("strong").allTextContents()).join("|")).not.toBe(newest.join("|"));

  await search(page).fill("dispatchers");
  await expect(dialog(page).getByText("Customer Call: Acme Logistics")).toBeVisible();
  await dialog(page).getByLabel("Title only").check();
  await expect(dialog(page).getByText(/No results for/)).toBeVisible();
});

test("no results, special characters and a clear button", async ({ page }) => {
  await openSearch(page);
  await search(page).fill("zeppelin");
  await expect(dialog(page).getByText(/No results for/)).toBeVisible();
  await search(page).fill('"; DROP TABLE meetings; -- * ( AND');
  await expect(dialog(page).getByRole("alert")).toHaveCount(0); // no server error
  await dialog(page).getByRole("button", { name: "Clear" }).click();
  await expect(search(page)).toHaveValue("");
  await expect(dialog(page).getByText(/Search titles, people/)).toBeVisible();
});

test("the Ask Sidenote shortcut goes to the chat page", async ({ page }) => {
  await openSearch(page);
  await dialog(page).getByRole("link", { name: /Ask Sidenote anything/ }).click();
  await expect(page).toHaveURL(/\/ask$/);
  await expect(dialog(page)).toHaveCount(0);
});
