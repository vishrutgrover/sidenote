import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API = "http://localhost:8100";
const TRANSCRIPT = [
  "[00:00:00] Ana: We will launch the pricing page on Friday. Can you review it?",
  "[00:00:20] Ben: I'll write the announcement before Friday.",
  "[00:00:40] Ana: Great, the budget is 5000 dollars.",
].join("\n");

async function createMeeting(request: APIRequestContext) {
  const r = await request.post(`${API}/api/meetings`, { multipart: { title: "E2E notes", transcript: TRANSCRIPT } });
  return (await r.json()).id as number;
}
const time = (page: Page) => page.getByLabel("Time");

test.describe("on a sample meeting (read only)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/meetings");
    await page.locator('a[href^="/view/"]').filter({ hasText: "Weekly Product Sync" }).first().click();
    await expect(page.getByRole("heading", { name: "Search release" })).toBeVisible();
  });

  test("shows the summary, sections and moments that jump the player", async ({ page }) => {
    await expect(page.getByText(/The team reviewed the search rollout/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Onboarding drop-off" })).toBeVisible();
    await page.getByText("(00:11)").first().click();
    await expect(time(page)).toContainText("00:11");
  });

  test("action items are grouped by person with a to-do count", async ({ page }) => {
    const items = page.getByRole("region", { name: "Action items" });
    await expect(items.getByRole("heading", { name: "Maya Chen" })).toBeVisible();
    await expect(items.getByRole("heading", { name: "Arjun Rao" })).toBeVisible();
    await expect(items).toContainText("This call has 2 to dos left.");
  });

  test("Smart Search shows counts, lists lines for a filter and jumps to them", async ({ page }) => {
    const panel = page.getByRole("complementary", { name: "Smart Search" });
    await expect(panel.getByText("Sentiments")).toBeVisible();
    await expect(panel.getByText("Speaker talktime")).toBeVisible();
    await expect(panel.getByText("Maya Chen").first()).toBeVisible();
    await panel.getByRole("button", { name: /Questions/ }).click();
    await panel.getByRole("list").getByRole("button").first().click();
    await expect(time(page)).not.toContainText("00:00 /");
  });

  test("the rail button hides and shows the Smart Search panel", async ({ page }) => {
    await page.getByRole("button", { name: "Smart Search" }).click();
    await expect(page.getByRole("complementary", { name: "Smart Search" })).toHaveCount(0);
    await page.getByRole("button", { name: "Smart Search" }).click();
    await expect(page.getByRole("complementary", { name: "Smart Search" })).toBeVisible();
  });
});

test.describe("on a meeting made for the test", () => {
  let id: number;
  test.beforeEach(async ({ page, request }) => {
    id = await createMeeting(request);
    await page.goto(`/view/${id}`);
    await expect(page.getByRole("heading", { name: "General Summary" }).or(page.getByText("General Summary"))).toBeVisible({ timeout: 15000 });
  });
  test.afterEach(async ({ request }) => {
    await request.delete(`${API}/api/meetings/${id}`);
  });

  test("a new upload gets notes, tasks and tags automatically", async ({ page }) => {
    const items = page.getByRole("region", { name: "Action items" });
    await expect(items).toContainText("I'll write the announcement before Friday.");
    await expect(items.getByRole("heading", { name: "Ben" })).toBeVisible(); // "I'll" assigns it to the speaker
    await expect(page.getByRole("complementary", { name: "Smart Search" }).locator(".chip").first()).toBeVisible();
  });

  test("ticking, editing, reassigning, adding and deleting an action item all persist", async ({ page }) => {
    const items = page.getByRole("region", { name: "Action items" });
    await items.getByLabel(/^Mark ".*announcement.*" done$/).check();
    await page.reload();
    await expect(items.getByLabel(/^Mark ".*announcement.*" not done$/)).toBeChecked();

    await items.getByText("I'll write the announcement before Friday.").click();
    await items.getByLabel("Edit action item").fill("Write the press release");
    await items.getByLabel("Edit action item").press("Enter");
    await expect(items.getByText("Write the press release")).toBeVisible();

    await items.getByLabel("New action item").fill("Book the venue");
    await items.getByLabel("Assign to").selectOption({ label: "Ana" });
    await items.getByRole("button", { name: "Add" }).click();
    await expect(items.getByText("Book the venue")).toBeVisible();
    await expect(items.getByLabel("New action item")).toHaveValue("");

    await items.getByLabel('Delete "Book the venue"').click();
    await expect(items.getByText("Book the venue")).toHaveCount(0);
    await page.reload();
    await expect(items.getByText("Write the press release")).toBeVisible();
    await expect(items.getByText("Book the venue")).toHaveCount(0);
  });

  test("notes can be edited, cancelled and saved, and the edit survives a reload", async ({ page }) => {
    await page.getByRole("button", { name: /Edit/ }).click();
    await page.getByLabel("Summary text").fill("My own summary.");
    await page.getByRole("button", { name: /Cancel/ }).click();
    await expect(page.getByText("My own summary.")).toHaveCount(0);

    await page.getByRole("button", { name: /Edit/ }).click();
    await page.getByLabel("Summary text").fill("My own summary.");
    await page.getByRole("button", { name: /Save/ }).click();
    await expect(page.getByText("Notes saved")).toBeVisible();
    await page.reload();
    await expect(page.getByText("My own summary.")).toBeVisible();
  });

  test("regenerating rewrites the notes and says which provider did it", async ({ page }) => {
    await page.getByRole("button", { name: /Edit/ }).click();
    await page.getByLabel("Summary text").fill("Temporary text.");
    await page.getByRole("button", { name: /Save/ }).click();
    await expect(page.getByText("Temporary text.")).toBeVisible();
    await page.getByRole("button", { name: /Regenerate/ }).click();
    await expect(page.getByText("Notes rewritten (mock)")).toBeVisible();
    await expect(page.getByText("Temporary text.")).toHaveCount(0);
  });

  test("tags can be added and removed from Smart Search", async ({ page }) => {
    const panel = page.getByRole("complementary", { name: "Smart Search" });
    await panel.getByRole("button", { name: "Add tag" }).click();
    await panel.getByLabel("New tag").fill("E2E Tag");
    await panel.getByLabel("New tag").press("Enter");
    await expect(panel.getByText("e2e tag", { exact: true })).toBeVisible(); // stored lower-case
    await panel.getByRole("button", { name: "Remove tag e2e tag" }).click();
    await expect(panel.getByText("e2e tag", { exact: true })).toHaveCount(0);
  });

  test("ticking a task updates the Tasks count in Smart Search", async ({ page }) => {
    const panel = page.getByRole("complementary", { name: "Smart Search" });
    const before = await panel.getByRole("button", { name: /Tasks/ }).textContent();
    await page.getByRole("region", { name: "Action items" }).getByLabel("New action item").fill("One more");
    await page.getByRole("region", { name: "Action items" }).getByRole("button", { name: "Add" }).click();
    await expect(panel.getByRole("button", { name: /Tasks/ })).not.toHaveText(before!);
  });
});
