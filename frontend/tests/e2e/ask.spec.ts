import { expect, test, type Page } from "@playwright/test";

const API = "http://localhost:8100";
const box = (page: Page) => page.getByLabel("Question");

test.afterEach(async ({ request }) => {
  await request.delete(`${API}/api/chat`);
  const meetings = await (await request.get(`${API}/api/meetings`)).json();
  for (const m of meetings) await request.delete(`${API}/api/meetings/${m.id}/chat`);
});

test.describe("about one meeting", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/meetings");
    await page.locator('a[href^="/view/"]').filter({ hasText: "Weekly Product Sync" }).first().click();
    await page.getByRole("tab", { name: "Ask Sidenote" }).click();
  });

  test("a suggestion is answered from the meeting, with citations that jump the player", async ({ page }) => {
    await page.getByRole("button", { name: "What are the action items?" }).click();
    await expect(page.getByText("Draft skip-button design and new permission copy")).toBeVisible();
    await expect(page.getByText("Built-in answer")).toBeVisible();

    await box(page).fill("What was decided about the export redesign?");
    await box(page).press("Enter");
    await expect(page.getByText("Thinking…")).toBeVisible().catch(() => {}); // may be too quick to see
    const cite = page.getByRole("button", { name: /^\d\d:\d\d [A-Z]/ }).first(); // a source chip
    await expect(cite).toBeVisible();
    await cite.click();
    await page.getByRole("tab", { name: "Transcript" }).click();
    await expect(page.getByLabel("Time")).not.toContainText("00:00 /");
  });

  test("the conversation is kept after a reload and can be cleared", async ({ page }) => {
    await box(page).fill("Summarize this meeting");
    await box(page).press("Enter");
    await expect(page.getByText(/search rollout/i).first()).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "Ask Sidenote" }).click();
    await expect(page.getByText("Summarize this meeting").first()).toBeVisible();
    await page.getByRole("button", { name: /New chat/ }).click();
    await expect(page.getByText("Ask anything about this meeting")).toBeVisible();
  });

  test("switching tabs keeps the transcript search", async ({ page }) => {
    await page.getByRole("tab", { name: "Transcript" }).click();
    await page.getByLabel("Find in transcript").fill("budget");
    await page.getByRole("tab", { name: "Ask Sidenote" }).click();
    await page.getByRole("tab", { name: "Transcript" }).click();
    await expect(page.getByLabel("Find in transcript")).toHaveValue("budget");
  });

  test("the model picker shows what is configured and only built-in without keys", async ({ page }) => {
    const picker = page.getByLabel("AI model");
    await expect(picker.locator("optgroup")).toHaveCount(1);
    await expect(picker).toHaveValue("mock|heuristic");
  });

  test("blank questions are not sent", async ({ page }) => {
    await box(page).fill("   ");
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});

test.describe("about all meetings", () => {
  test("answers draw on several meetings and every source opens its meeting at that moment", async ({ page }) => {
    await page.goto("/ask");
    await expect(page.getByText(/how can I help today/)).toBeVisible();
    await box(page).fill("Who is worried about Safari or onboarding drop-off?");
    await box(page).press("Enter");
    const sources = page.getByLabel("Sources").first();
    await expect(sources.getByRole("link").first()).toBeVisible();
    expect(await sources.getByRole("link").count()).toBeGreaterThan(1);
    const link = sources.getByRole("link", { name: /Engineering Standup/ }).first();
    await link.click();
    await expect(page).toHaveURL(/\/view\/\d+\?t=\d+/);
    await expect(page.getByRole("heading", { name: "Engineering Standup" })).toBeVisible();
    await expect(page.getByLabel("Time")).not.toContainText("00:00 /"); // opened at the cited moment
  });

  test("a question with no match says so", async ({ page }) => {
    await page.goto("/ask");
    await box(page).fill("zeppelin altitude regulations");
    await box(page).press("Enter");
    await expect(page.getByText(/couldn't find anything about that in your meetings/)).toBeVisible();
  });

  test("the sidebar leads here", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Ask Sidenote" }).click();
    await expect(page).toHaveURL(/\/ask$/);
  });
});
