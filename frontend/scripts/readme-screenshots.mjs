// Takes the screenshots used in the README.
//   Run both servers first (make run, make run-frontend), then:  make screenshots
// It drives a real headless Chromium: open a page, click what a person would click, save the viewport as a PNG.
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "../docs/media";
const site = process.env.SITE ?? "http://localhost:3000";

const browser = await chromium.launch();

async function shot(name, theme, steps) {
  // a fresh browser profile per picture, so one picture's state never leaks into the next
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  const page = await context.newPage();
  await page.addInitScript((t) => localStorage.setItem("theme", t), theme); // the app reads this key on load
  await steps(page);
  await page.waitForTimeout(700); // let animations and fetches settle
  await page.screenshot({ path: `${out}/${name}.png` });
  await context.close();
}
const open = (page, path) => page.goto(site + path, { waitUntil: "networkidle" });

await shot("home", "light", (p) => open(p, "/"));
await shot("library", "light", (p) => open(p, "/meetings"));
await shot("meeting", "dark", async (p) => {
  await open(p, "/view/1");
  await p.getByText("Drop-off is a problem.").click();
});
await shot("ask", "light", async (p) => {
  await open(p, "/ask");
  await p.getByRole("button", { name: "Who is worried about Safari?" }).click();
  await p.waitForTimeout(900);
});
await shot("search", "dark", async (p) => {
  await open(p, "/meetings");
  await p.keyboard.press("Control+k");
  await p.getByLabel("Search", { exact: true }).fill("safari");
  await p.waitForTimeout(900);
});
await shot("people", "light", (p) => open(p, "/people/2"));

await browser.close();
