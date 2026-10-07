import { expect, test, type Page } from "@playwright/test";

const time = (page: Page) => page.getByLabel("Time");
/** The current position in seconds, read from the "mm:ss / mm:ss" label. */
const seconds = async (page: Page) => {
  const [m, sec] = (await time(page).textContent())!.slice(0, 5).split(":").map(Number);
  return m * 60 + sec;
};
const line = (page: Page, text: string | RegExp) => page.locator("[data-line]").filter({ hasText: text });

test.beforeEach(async ({ page }) => {
  await page.goto("/meetings");
  await page.locator('a[href^="/view/"]').filter({ hasText: "Weekly Product Sync" }).first().click();
  await expect(page.getByRole("heading", { name: "Weekly Product Sync" })).toBeVisible();
});

test("shows the meeting details and every transcript line with its speaker", async ({ page }) => {
  await expect(page.getByText(/Vishrut Grover · .* · 2 min/)).toBeVisible();
  await expect(page.locator("[data-line]")).toHaveCount(12);
  await expect(page.getByText("Maya Chen").first()).toBeVisible();
  await expect(time(page)).toContainText("00:00 / 01:5"); // the length comes from the real recording
});

test("clicking a line jumps there and marks it as current", async ({ page }) => {
  await page.getByText("Drop-off is a problem.").click();
  await expect(time(page)).toContainText("00:49");
  await expect(line(page, "Drop-off is a problem.")).toHaveAttribute("aria-current", "true");
  await expect(page.locator("[aria-current=true]")).toHaveCount(1);
});

test("playing really plays the recording and the transcript follows it", async ({ page }) => {
  await page.getByText("Drop-off is a problem.").click(); // 00:49, a line that lasts ~14 s
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(time(page)).not.toContainText("00:49 /", { timeout: 5000 }); // the clock moved on from the click position
  await expect.poll(() => seconds(page), { timeout: 8000 }).toBeGreaterThanOrEqual(51);
  await page.getByRole("button", { name: "Pause" }).click();
  await page.waitForTimeout(500); // the audio element reports its final position just after pausing
  const paused = await time(page).textContent();
  await page.waitForTimeout(800);
  expect(await time(page).textContent()).toBe(paused);
});

test("the seek bar moves the position and the highlighted line", async ({ page }) => {
  await page.getByLabel("Seek").fill("92");
  await expect(time(page)).toContainText("01:32");
  await expect(line(page, "Now the sprint")).toHaveAttribute("aria-current", "true");
});

test("skip buttons and keyboard shortcuts", async ({ page }) => {
  await page.getByRole("button", { name: "Forward 10 seconds" }).click();
  await expect(time(page)).toContainText("00:10");
  await page.getByRole("button", { name: "Back 10 seconds" }).click();
  await expect(time(page)).toContainText("00:00");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(time(page)).toContainText("00:10");
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
});

test("skip and the arrow keys move from where the audio is now, not from the start", async ({ page }) => {
  await page.getByRole("button", { name: "Play" }).click();
  await expect.poll(() => seconds(page), { timeout: 8000 }).toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Pause" }).click();
  await page.waitForTimeout(400);
  const before = await seconds(page);
  await page.getByRole("button", { name: "Forward 10 seconds" }).click();
  await expect.poll(() => seconds(page)).toBeGreaterThanOrEqual(before + 10);
  expect(await seconds(page)).toBeLessThanOrEqual(before + 12); // 10 s on from where it was, not 10 s from zero
  await page.getByRole("button", { name: "Back 10 seconds" }).click();
  await expect.poll(() => seconds(page)).toBeLessThanOrEqual(before + 2);
});

test("speed cycles through the options", async ({ page }) => {
  const speed = page.getByTitle("Playback speed");
  await expect(speed).toHaveText("1×");
  await speed.click();
  await expect(speed).toHaveText("1.25×");
  for (let i = 0; i < 3; i++) await speed.click();
  await expect(speed).toHaveText("0.75×");
});

test("find highlights matches, counts them and steps through them", async ({ page }) => {
  await page.getByLabel("Find in transcript").fill("onboarding");
  await expect(page.getByText(/^1 of \d+$/)).toBeVisible();
  const marks = page.locator("mark");
  expect(await marks.count()).toBeGreaterThan(1);
  await expect(marks.first()).toContainText(/onboarding/i);
  await page.getByRole("button", { name: "Next match" }).click();
  await expect(page.getByText(/^2 of \d+$/)).toBeVisible();
  await page.getByLabel("Find in transcript").press("Escape");
  await expect(marks).toHaveCount(0);
});

test("typing a space in the find box does not start playback", async ({ page }) => {
  await page.getByLabel("Find in transcript").fill("search rollout");
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  await expect(page.getByText("No matches")).toHaveCount(0);
});

test("find with no hits says so", async ({ page }) => {
  await page.getByLabel("Find in transcript").fill("zeppelin");
  await expect(page.getByText("No matches")).toBeVisible();
});

test("the recording supports byte ranges, which Safari needs to seek", async ({ request }) => {
  const meetings = await (await request.get("http://localhost:8100/api/meetings")).json();
  const r = await request.get(`http://localhost:8100${meetings[0].media_url}`, { headers: { Range: "bytes=0-9" } });
  expect(r.status()).toBe(206);
});

test("an unknown meeting shows a friendly page", async ({ page }) => {
  await page.goto("/view/99999");
  await expect(page.getByText("This meeting does not exist")).toBeVisible();
  await page.getByRole("link", { name: "Back to meetings" }).click();
  await expect(page).toHaveURL(/\/meetings$/);
});

test("back arrow and breadcrumb return to the library", async ({ page }) => {
  await page.getByRole("link", { name: "Back to meetings" }).click();
  await expect(page).toHaveURL(/\/meetings$/);
});
