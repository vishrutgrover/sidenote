import { expect, test } from "@playwright/test";

const API = "http://localhost:8100";

test.describe("Home", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 2 }).first()).toContainText("Vishrut");
  });

  test("greets you, shows the assistant cards, recent meetings and Try More", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText(/Good (Morning|Afternoon|Evening|Night), Vishrut/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1); // one page title only
    await expect(page.getByRole("link", { name: /Daily Brief/ })).toContainText("The team reviewed");
    await expect(page.getByRole("region", { name: "Meetings" }).getByRole("list").getByRole("link")).toHaveCount(5);
    await expect(page.getByText("Desktop App")).toBeVisible();
    await page.getByRole("tab", { name: "Upcoming" }).click();
    await expect(page.getByText("No upcoming meetings", { exact: true }).first()).toBeVisible();
  });

  test("the Tasks card matches the Tasks page", async ({ page }) => {
    const card = page.getByRole("main").getByRole("link", { name: /^Tasks/ });
    await expect(card).toContainText("open for you");
    const n = Number(/(\d+) open/.exec((await card.textContent())!)![1]);
    await card.click();
    await expect(page).toHaveURL(/\/tasks$/);
    await expect(page.getByText(`${n} open of ${n}`)).toBeVisible();
  });

  test("a recent meeting opens", async ({ page }) => {
    await page.getByRole("region", { name: "Meetings" }).getByRole("list").getByRole("link").first().click();
    await expect(page).toHaveURL(/\/view\/\d+$/);
  });

  test("Quick Start adds a meeting from pasted text", async ({ page, request }) => {
    await page.getByRole("button", { name: /Paste Transcript/ }).click();
    await page.getByPlaceholder("E.g. Product team sync").fill("E2E from home");
    await page.getByLabel("Transcript text").fill("Ana: Hello from the home page.");
    await page.getByRole("button", { name: "Add meeting" }).click();
    await expect(page.getByRole("heading", { name: "E2E from home" })).toBeVisible();
    const meetings = await (await request.get(`${API}/api/meetings`)).json();
    for (const m of meetings.filter((m: { title: string }) => m.title.startsWith("E2E"))) await request.delete(`${API}/api/meetings/${m.id}`);
  });

  test("the Ask panel answers about all meetings", async ({ page, request }) => {
    await page.getByLabel("Question").fill("Summarize my last meeting");
    await page.getByLabel("Question").press("Enter");
    await expect(page.getByLabel("Ask Sidenote").getByText(/Weekly Product Sync/).first()).toBeVisible();
    await request.delete(`${API}/api/chat`);
  });
});

test.describe("Tasks", () => {
  let before: { id: number; is_done: boolean }[] = [];
  test.beforeEach(async ({ request }) => {
    before = await (await request.get(`${API}/api/action-items`)).json();
  });
  test.afterEach(async ({ request }) => {
    for (const t of before) await request.patch(`${API}/api/action-items/${t.id}`, { data: { is_done: t.is_done } }); // leave the sample data as it was
  });

  test("my open tasks first, All Tasks shows more, and a tick moves a task to Done and back", async ({ page }) => {
    await page.goto("/tasks");
    await expect(page.getByRole("checkbox").first()).toBeVisible();
    const mineCount = await page.getByRole("checkbox").count();
    expect(mineCount).toBeGreaterThan(0);
    await page.getByRole("tab", { name: "All Tasks" }).click();
    await expect.poll(() => page.getByRole("checkbox").count()).toBeGreaterThan(mineCount);

    await page.getByRole("tab", { name: "My Tasks" }).click();
    await expect.poll(() => page.getByRole("checkbox").count()).toBe(mineCount); // wait for the list to switch
    const box = page.getByRole("checkbox").first();
    const label = await box.getAttribute("aria-label");
    const task = /^Mark "(.*)" done$/.exec(label!)![1];
    await box.check();
    await page.getByRole("radio", { name: "Done" }).click();
    await expect(page.getByText(task)).toBeVisible();

    await page.getByLabel(`Mark "${task}" not done`).uncheck(); // put it back
    await page.getByRole("radio", { name: "Open" }).click();
    await expect(page.getByText(task)).toBeVisible();
  });

  test("a task opens its meeting at the right moment", async ({ page }) => {
    await page.goto("/tasks");
    await page.getByTitle("Open at this moment").first().click();
    await expect(page).toHaveURL(/\/view\/\d+\?t=\d+/);
    await expect(page.getByLabel("Time")).not.toContainText("00:00 /");
  });
});

test.describe("Settings", () => {
  test("opens on Language & Appearance and switches theme, which survives a reload", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings\/appearance$/);
    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(19, 19, 20)");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("radio", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("sections navigate, can be searched, and unfinished ones say so", async ({ page }) => {
    await page.goto("/settings/appearance");
    await page.getByLabel("Search settings").fill("cook");
    await expect(page.getByRole("navigation", { name: "Settings sections" }).getByRole("link")).toHaveCount(1);
    await page.getByRole("link", { name: "Cookies" }).click();
    await expect(page.getByText("Cookies is coming soon")).toBeVisible();
    await page.getByLabel("Search settings").fill("zzz");
    await expect(page.getByText("No settings match")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Team" })).toBeDisabled();
    await page.getByRole("link", { name: "Back to the app" }).click();
    await expect(page).toHaveURL(/\/meetings$/);
  });

  test("an unknown section says so", async ({ page }) => {
    await page.goto("/settings/nope");
    await expect(page.getByText("That settings page does not exist")).toBeVisible();
  });

  test("AI settings list the provider and show the AI calls that were made", async ({ page, request }) => {
    const meetings = await (await request.get(`${API}/api/meetings`)).json();
    await request.post(`${API}/api/meetings/${meetings[0].id}/ask`, { data: { question: "Summarize this meeting" } });
    await page.goto("/settings/ai");
    await expect(page.getByText("Built-in (no API key)").first()).toBeVisible();
    await expect(page.getByRole("table")).toContainText("Question");
    await expect(page.getByRole("table")).toContainText("heuristic");
    await request.delete(`${API}/api/meetings/${meetings[0].id}/chat`);
  });

  test("the sidebar's Settings link leads here", async ({ page }) => {
    await page.goto("/meetings");
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings\/appearance$/);
  });
});

test.describe("Notifications", () => {
  test("a dot for new activity, a list of what is ready, and the dot is gone afterwards", async ({ page }) => {
    await page.goto("/meetings");
    const bell = page.getByRole("button", { name: /^Notifications/ });
    await expect(bell).toHaveAccessibleName("Notifications, new");
    await bell.click();
    const menu = page.getByRole("dialog", { name: "Notifications" });
    await expect(menu).toContainText("is ready");
    await expect(menu).toContainText("open tasks for you");
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(page.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
  });

  test("choosing a notification opens that meeting", async ({ page }) => {
    await page.goto("/meetings");
    await page.getByRole("button", { name: /^Notifications/ }).click();
    await page.getByRole("dialog", { name: "Notifications" }).getByText(/is ready/).first().click();
    await expect(page).toHaveURL(/\/view\/\d+$/);
  });
});

test.describe("placeholder pages", () => {
  for (const [path, name] of [["analytics", "Analytics"], ["voice-agents", "Voice Agents"], ["integrations", "Integrations"], ["ai-skills", "AI Skills"]]) {
    test(`${name} is honest about being unfinished, inside the normal layout`, async ({ page }) => {
      await page.goto(`/${path}`);
      await expect(page.getByText(`${name} is coming soon`)).toBeVisible();
      await expect(page.getByRole("link", { name: "Meetings" })).toBeVisible(); // the sidebar is still there
    });
  }
});
