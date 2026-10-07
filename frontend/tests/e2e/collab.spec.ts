import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const API = "http://localhost:8100";
const TEXT = [
  "[00:00:00] Ana: We should launch the pricing page on Friday.",
  "[00:00:20] Ben: I'll write the announcement before Friday.",
  "[00:00:40] Ana: Great, the budget is approved.",
].join("\n");
let id: number;

test.beforeEach(async ({ page, request }: { page: Page; request: APIRequestContext }) => {
  id = (await (await request.post(`${API}/api/meetings`, { multipart: { title: "E2E collab", transcript: TEXT } })).json()).id;
  await page.goto(`/view/${id}`);
  await expect(page.getByText("General Summary")).toBeVisible({ timeout: 15000 });
});
test.afterEach(async ({ request }) => {
  await request.delete(`${API}/api/meetings/${id}`);
});

const line = (page: Page, text: string) => page.locator("[data-line]").filter({ hasText: text });
const rail = (page: Page, name: string) => page.getByRole("navigation", { name: "Meeting tools" }).getByRole("button", { name });

test("comment on a line: it appears in the panel, shows a count on the line, and survives a reload", async ({ page }) => {
  await line(page, "write the announcement").hover();
  await page.getByRole("button", { name: "Comment on 00:20" }).click();
  await expect(page.getByLabel("Commenting on")).toContainText("00:20");
  await page.getByLabel("Comment", { exact: true }).fill("Who reviews this?");
  await page.getByLabel("Comment", { exact: true }).press("Enter");
  await expect(page.getByRole("list", { name: "Comments" })).toContainText("Who reviews this?");
  await expect(line(page, "write the announcement").getByRole("button", { name: "1 comment, open" })).toBeVisible();

  await page.reload();
  await rail(page, "Comments").click();
  await expect(page.getByRole("list", { name: "Comments" })).toContainText("Who reviews this?");
  await page.getByRole("button", { name: "Delete comment" }).click();
  await expect(page.getByRole("list", { name: "Comments" })).not.toContainText("Who reviews this?");
  await expect(page.getByRole("button", { name: /comment, open/ })).toHaveCount(0);
});

test("comments default to the line playing now", async ({ page }) => {
  await line(page, "Great, the budget").click(); // jump to 00:40
  await rail(page, "Comments").click();
  await expect(page.getByLabel("Commenting on")).toContainText("00:40");
});

test("make a soundbite from a line, play just that range, rename it and delete it", async ({ page }) => {
  await line(page, "We should launch").hover();
  await page.getByRole("button", { name: "Make a soundbite from 00:00" }).click();
  await expect(page.getByLabel("Start time")).toHaveValue("00:00");
  await page.getByLabel("Title").fill("Launch plan");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Soundbite saved")).toBeVisible();
  const list = page.getByRole("list", { name: "Soundbites" });
  await expect(list).toContainText("Launch plan");
  await expect(list).toContainText("We should launch the pricing page on Friday.");

  await page.getByRole("button", { name: 'Play "Launch plan"' }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible({ timeout: 12000 }); // stopped by itself at the end of the clip

  await page.getByRole("button", { name: 'Rename "Launch plan"' }).click();
  await page.getByLabel("Soundbite title").fill("Pricing launch");
  await page.getByLabel("Soundbite title").press("Enter");
  await expect(list).toContainText("Pricing launch");
  await page.getByRole("button", { name: 'Delete "Pricing launch"' }).click();
  await expect(page.getByText(/No soundbites yet/)).toBeVisible();
});

test("a soundbite with a bad time is refused with a reason", async ({ page }) => {
  await rail(page, "Soundbites").click();
  await page.getByRole("button", { name: "New soundbite" }).click();
  await page.getByLabel("Title").fill("Too long");
  await page.getByLabel("End time").fill("09:00");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "long" })).toBeVisible();
});

test("the star bookmarks the playing moment; the panel lists, jumps and deletes it", async ({ page }) => {
  await line(page, "Great, the budget").click();
  await page.getByRole("button", { name: "Bookmark this moment" }).click();
  await expect(page.getByText("Bookmarked 00:40")).toBeVisible();
  await rail(page, "Bookmarks").click();
  const list = page.getByRole("list", { name: "Bookmarks" });
  await expect(list).toContainText("00:40");
  await line(page, "We should launch").click();
  await list.getByText("00:40").click();
  await expect(page.getByLabel("Time")).toContainText("00:40");
  await page.getByRole("button", { name: "Delete bookmark at 00:40" }).click();
  await expect(page.getByText(/No bookmarks yet/)).toBeVisible();
});

test("download the transcript as CSV and the summary as Markdown", async ({ page }) => {
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await page.getByRole("radio", { name: "CSV" }).click();
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", { name: "Download" }).click();
  const csv = await csvDownload;
  expect(csv.suggestedFilename()).toBe("e2e-collab-transcript.csv");
  const text = readFileSync((await csv.path())!, "utf8");
  expect(text.split(/\r?\n/)[0]).toBe("speaker,start_sec,end_sec,text");
  expect(text).toContain("We should launch the pricing page on Friday.");

  await page.getByRole("button", { name: "Download", exact: true }).click();
  await page.getByRole("tab", { name: "Summary" }).click();
  await page.getByRole("radio", { name: "MD" }).click();
  const mdDownload = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", { name: "Download" }).click();
  const md = await mdDownload;
  expect(md.suggestedFilename()).toBe("e2e-collab-summary.md");
  expect(readFileSync((await md.path())!, "utf8")).toMatch(/^# E2E collab/);
});

test("download options change what is in the file", async ({ page }) => {
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await page.getByRole("radio", { name: "TXT" }).click();
  await page.getByLabel("Include timestamps").uncheck();
  await page.getByLabel("Show speaker names").uncheck();
  const d = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", { name: "Download" }).click();
  const text = readFileSync((await (await d).path())!, "utf8");
  expect(text.split("\n")[0]).toBe("We should launch the pricing page on Friday.");
});
