import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API = "http://localhost:8100";
const TEXT = "[00:00:00] Ana: We should launch on Friday.\n[00:00:15] Ben: I'll write the announcement.";
const cards = (page: Page) => page.locator('a[href^="/view/"]').filter({ has: page.locator("p") });

/** Remove whatever these tests created, even if a test failed half way. */
async function cleanUp(request: APIRequestContext) {
  const meetings = await (await request.get(`${API}/api/meetings`)).json();
  for (const m of meetings.filter((m: { title: string }) => m.title.startsWith("E2E"))) await request.delete(`${API}/api/meetings/${m.id}`);
}
async function create(request: APIRequestContext, title: string) {
  return (await (await request.post(`${API}/api/meetings`, { multipart: { title, transcript: TEXT } })).json()).id as number;
}
test.afterEach(async ({ request }) => cleanUp(request));

test("paste a transcript, land on the new meeting, and find it in the library", async ({ page }) => {
  await page.goto("/meetings");
  await page.getByRole("button", { name: "More ways to add a meeting" }).click();
  await page.getByRole("menuitem", { name: /Paste transcript/ }).click();
  await page.getByPlaceholder("E.g. Product team sync").fill("E2E pasted call");
  await page.getByLabel("Transcript text").fill(TEXT);
  await page.getByRole("button", { name: "Add meeting" }).click();
  await expect(page).toHaveURL(/\/view\/\d+$/);
  await expect(page.getByRole("heading", { name: "E2E pasted call" })).toBeVisible();
  await expect(page.getByText("General Summary")).toBeVisible({ timeout: 15000 }); // notes arrive after the background step
  await expect(page.getByText("Ana", { exact: true }).first()).toBeVisible();
  await page.goto("/meetings");
  await expect(cards(page).first()).toContainText("E2E pasted call");
});

test("upload a .vtt file; the file name becomes the title", async ({ page }) => {
  await page.goto("/meetings");
  await page.getByRole("button", { name: /^Capture/ }).click();
  const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nAna: Hello from a subtitle file\n\n00:00:05.000 --> 00:00:08.000\nBen: Hi Ana\n";
  await page.getByLabel("Transcript file").setInputFiles({ name: "E2E-kickoff.vtt", mimeType: "text/vtt", buffer: Buffer.from(vtt) });
  await expect(page.getByText("E2E-kickoff.vtt")).toBeVisible();
  await page.getByRole("button", { name: "Add meeting" }).click();
  await expect(page.getByRole("heading", { name: "E2E-kickoff" })).toBeVisible();
  await expect(page.locator("[data-line]").filter({ hasText: "Hello from a subtitle file" })).toBeVisible();
});

test("bad input is explained inside the dialog and nothing is created", async ({ page }) => {
  await page.goto("/meetings");
  await page.getByRole("button", { name: /^Capture/ }).click();
  await page.getByLabel("Transcript file").setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("x") });
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(".txt, .vtt or .json");
  await expect(page.getByRole("button", { name: "Add meeting" })).toBeDisabled();

  await page.getByLabel("Transcript file").setInputFiles({ name: "E2E-broken.json", mimeType: "application/json", buffer: Buffer.from('[{"text": "no start time"}]') });
  await page.getByRole("button", { name: "Add meeting" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Bad transcript line");
  await expect(page.getByRole("dialog")).toBeVisible(); // still open, so the user can fix it
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/meetings");
  await expect(cards(page)).toHaveCount(6);
});

test("the dialog closes with Escape or a click outside, and starts fresh next time", async ({ page }) => {
  await page.goto("/meetings");
  await page.getByRole("button", { name: /^Capture/ }).click();
  await page.getByPlaceholder("E.g. Product team sync").fill("half typed");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /^Capture/ }).click();
  await expect(page.getByPlaceholder("E.g. Product team sync")).toHaveValue("");
  await page.mouse.click(5, 5); // on the backdrop
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("rename a meeting and change its people from the library menu", async ({ page, request }) => {
  await create(request, "E2E rename me");
  await page.goto("/meetings");
  await page.getByRole("button", { name: "Actions for E2E rename me" }).click();
  await page.getByRole("menuitem", { name: "Rename and people" }).click();
  await page.getByRole("dialog").getByLabel("Title").fill("E2E renamed");
  await page.getByLabel("Add a person").fill("Cara");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Remove Ben" }).click();
  await expect(page.getByText(/stay in the transcript as Unknown/)).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Meeting updated")).toBeVisible();
  await expect(cards(page).first()).toContainText("E2E renamed");

  await cards(page).first().click();
  await expect(page.getByRole("heading", { name: "E2E renamed" })).toBeVisible();
  await expect(page.getByText("Unknown").first()).toBeVisible(); // Ben's line is kept, with no speaker
});

test("an empty title is refused before anything is sent", async ({ page, request }) => {
  const id = await create(request, "E2E keep title");
  await page.goto(`/view/${id}`);
  await page.getByRole("button", { name: "Actions for E2E keep title" }).click();
  await page.getByRole("menuitem", { name: "Rename and people" }).click();
  await page.getByRole("dialog").getByLabel("Title").fill("   ");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("title cannot be empty");
});

test("delete asks first, Cancel keeps it, Delete removes it", async ({ page, request }) => {
  await create(request, "E2E delete me");
  await page.goto("/meetings");
  await expect(cards(page)).toHaveCount(7);
  await page.getByRole("button", { name: "Actions for E2E delete me" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("dialog")).toContainText("cannot be undone");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(cards(page)).toHaveCount(7);

  await page.getByRole("button", { name: "Actions for E2E delete me" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText('Deleted "E2E delete me"')).toBeVisible();
  await expect(cards(page)).toHaveCount(6);
});

test("deleting from the meeting page returns to the library, and the old link is gone", async ({ page, request }) => {
  const id = await create(request, "E2E delete from page");
  await page.goto(`/view/${id}`);
  await page.getByRole("button", { name: "Actions for E2E delete from page" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/meetings$/);
  await page.goto(`/view/${id}`);
  await expect(page.getByText("This meeting does not exist")).toBeVisible();
});

test("copy link puts this meeting's address on the clipboard", async ({ page, context, request }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const id = await create(request, "E2E copy link");
  await page.goto("/meetings");
  await page.getByRole("button", { name: "Actions for E2E copy link" }).click();
  await page.getByRole("menuitem", { name: "Copy link" }).click();
  await expect(page.getByText("Link copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`http://localhost:3100/view/${id}`);
});

test("sharing and live capture are honest about being unfinished", async ({ page, request }) => {
  await create(request, "E2E share");
  await page.goto("/meetings");
  await page.getByRole("button", { name: "Actions for E2E share" }).click();
  await page.getByRole("menuitem", { name: "Share" }).click();
  await expect(page.getByText("Sharing with teammates is coming soon")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "More ways to add a meeting" }).click();
  await page.getByRole("menuitem", { name: /Start recording/ }).click();
  await expect(page.getByText("Recording is coming soon")).toBeVisible();
});
