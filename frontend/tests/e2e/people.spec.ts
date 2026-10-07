import { expect, test } from "@playwright/test";

const API = "http://localhost:8100";

test("lists everyone with meeting counts and marks you", async ({ page }) => {
  await page.goto("/people");
  const list = page.getByRole("main").getByRole("list");
  await expect(list.getByRole("link")).toHaveCount(7);
  await expect(list.getByRole("link").first()).toContainText("Vishrut Grover");
  await expect(list.getByRole("link").first()).toContainText("You");
  await expect(list.getByRole("link").first()).toContainText("6 meetings");
  await expect(list.getByRole("link", { name: /Maya Chen/ })).toContainText("3 meetings");
});

test("search by name or email, and an empty result explains itself", async ({ page }) => {
  await page.goto("/people");
  await page.getByLabel("Search people").fill("priya.nair@");
  await expect(page.getByRole("main").getByRole("list").getByRole("link")).toHaveCount(1);
  await expect(page.getByRole("main").getByRole("list")).toContainText("Priya Nair");
  await page.getByLabel("Search people").fill("nobody here");
  await expect(page.getByText("No one matches")).toBeVisible();
});

test("a profile shows talk time, meetings and open tasks, and links back into the meetings", async ({ page }) => {
  await page.goto("/people");
  await page.getByRole("link", { name: /Maya Chen/ }).click();
  await expect(page.getByRole("heading", { name: "Maya Chen" })).toBeVisible();
  await expect(page.getByText("Total talk time")).toBeVisible();
  const meetings = page.getByRole("region", { name: "Meetings" });
  await expect(meetings.getByRole("link")).toHaveCount(3);
  await expect(meetings.getByRole("link").first()).toContainText("Weekly Product Sync");
  await expect(page.getByRole("region", { name: "Open tasks" })).toContainText("Draft skip-button design and new permission copy");
  await meetings.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/view\/\d+$/);
});

test("the numbers on a profile agree with the transcripts", async ({ page, request }) => {
  const people = await (await request.get(`${API}/api/people`)).json();
  const maya = people.find((p: { name: string }) => p.name === "Maya Chen");
  const detail = await (await request.get(`${API}/api/people/${maya.id}`)).json();
  await page.goto(`/people/${maya.id}`);
  await expect(page.getByText(String(detail.wpm), { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Meetings" }).getByRole("link").first()).toContainText(`${detail.meetings[0].share_pct}%`);
});

test("ticking an open task on a profile saves it and removes it from the list's open count", async ({ page, request }) => {
  const people = await (await request.get(`${API}/api/people`)).json();
  const maya = people.find((p: { name: string }) => p.name === "Maya Chen");
  const before = await (await request.get(`${API}/api/people/${maya.id}`)).json();
  const task = before.open_tasks[0];
  await page.goto(`/people/${maya.id}`);
  await page.getByLabel(`Mark "${task.text}" done`).check();
  await expect.poll(async () => (await (await request.get(`${API}/api/people/${maya.id}`)).json()).open_tasks.length).toBe(before.open_tasks.length - 1);
  await request.patch(`${API}/api/action-items/${task.id}`, { data: { is_done: false } }); // leave the sample data as it was
});

test("people named in a meeting link to their profile", async ({ page }) => {
  await page.goto("/meetings");
  await page.locator('a[href^="/view/"]').filter({ hasText: "Weekly Product Sync" }).first().click();
  await page.getByRole("link", { name: "Maya Chen" }).first().click();
  await expect(page).toHaveURL(/\/people\/\d+$/);
  await expect(page.getByRole("heading", { name: "Maya Chen" })).toBeVisible();
});

test("an unknown person shows a friendly page", async ({ page }) => {
  await page.goto("/people/99999");
  await expect(page.getByText("This person does not exist")).toBeVisible();
  await page.getByRole("link", { name: "Back to people" }).click();
  await expect(page).toHaveURL(/\/people$/);
});

test("the sidebar leads to People", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "People" }).click();
  await expect(page).toHaveURL(/\/people$/);
});
