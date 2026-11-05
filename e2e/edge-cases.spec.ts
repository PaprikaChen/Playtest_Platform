import path from "node:path";
import JSZip from "jszip";
import { expect, test, type Page } from "@playwright/test";

const ZIP = path.resolve(__dirname, "../samples/lantern-hop.zip");
const SHOTS = path.resolve(__dirname, "../docs/screenshots");

async function newGame(page: Page, name: string) {
  await page.goto("/");
  await page.getByLabel("Game name").fill(name);
  await page.getByRole("button", { name: "Create game" }).click();
  await page.waitForURL(/\/projects\//);
}

async function setUpInvite(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(ZIP);
  await expect(page.getByText(/Published “Build 1”/)).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Saved as version 1/)).toBeVisible();
  await page.getByRole("button", { name: "Create link" }).click();
  const open = page.getByRole("link", { name: "Open" }).first();
  await expect(open).toBeVisible();
  return (await open.getAttribute("href"))!;
}

test("invalid ZIP shows a clear error and publishes nothing", async ({ page }) => {
  await newGame(page, "Broken Build");
  const z = new JSZip();
  z.file("game.js", "console.log(1)");
  const buffer = Buffer.from(await z.generateAsync({ type: "uint8array" }));
  await page.locator('input[type="file"]').setInputFiles({ name: "broken.zip", mimeType: "application/zip", buffer });
  await expect(page.getByText(/No index.html found/)).toBeVisible();
  await expect(page.getByText("Needs a build and saved questions first.")).toBeVisible();
});

test("comments-only session: typed note becomes a recall card without video; review and delete work", async ({ page, context }) => {
  await newGame(page, "Notes Only");
  const invite = await setUpInvite(page);
  const tester = await context.newPage();
  await tester.goto(invite);
  await tester.getByRole("checkbox", { name: "Screen" }).uncheck();
  await tester.getByRole("checkbox", { name: "Microphone" }).uncheck();
  await tester.getByLabel("Your name or nickname").fill("Riley");
  await tester.getByLabel(/I agree to the recording/).check();
  await tester.getByRole("button", { name: "Start playtest" }).click();
  await expect(tester.getByText("Comments only", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(tester.getByText(/Upload/)).toHaveCount(0); // no upload status without capture
  const note = tester.getByLabel(/Add a note/);
  await note.fill("this jump is too hard");
  await note.press("Enter");
  await expect(tester.getByText("this jump is too hard")).toBeVisible();
  await tester.getByRole("button", { name: "Finish and answer questions" }).click();
  await tester.waitForURL(/\/survey\//, { timeout: 60_000 });
  await expect(tester.getByText(/Reminders are based only/)).toBeVisible({ timeout: 60_000 });
  await expect(tester.getByText("you typed").first()).toBeVisible();
  await expect(tester.locator('img[alt^="Frame at"]')).toHaveCount(0); // no video, so no thumbnails
  await tester.getByRole("button", { name: "Submit feedback" }).click();
  await expect(tester.getByText(/Thanks for playtesting/)).toBeVisible();
  // Re-opening the survey link after submit must not allow a second submission.
  await tester.reload();
  await expect(tester.getByText(/already submitted/)).toBeVisible();

  await page.reload();
  await page.getByRole("link", { name: "Review" }).first().click();
  await expect(page.getByText(/No recording/)).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete session now" }).click();
  await page.waitForURL(/\/projects\/prj_/);
  await expect(page.getByText(/No sessions yet/)).toBeVisible();
});

test("turned-off invite link blocks testers", async ({ page, context }) => {
  await newGame(page, "Closed Test");
  const invite = await setUpInvite(page);
  await page.getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByRole("button", { name: "Turn on" })).toBeVisible();
  const tester = await context.newPage();
  await tester.goto(invite);
  await expect(tester.getByText(/isn.t active/)).toBeVisible();
  const res = await tester.request.get(`${invite.replace("/t/", "/g/")}/index.html`);
  expect(res.status()).toBe(403);
});

test("game switcher lists games and switches between them", async ({ page }) => {
  await newGame(page, "Switch A");
  await newGame(page, "Switch B");
  await page.getByRole("button", { name: /Game/ }).first().click();
  const list = page.getByRole("listbox", { name: "Switch game" });
  await expect(list.getByRole("option", { name: /Switch A/ })).toBeVisible();
  await list.getByRole("option", { name: /Switch A/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Switch A" })).toBeVisible();
});

test("phone width: no horizontal scrolling on main screens", async ({ page, context }) => {
  await newGame(page, "Phone Check");
  const invite = await setUpInvite(page);
  await page.setViewportSize({ width: 375, height: 812 });
  const overflow = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  for (const url of ["/", page.url(), invite]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    expect(await overflow(page), `horizontal overflow on ${url}`).toBeLessThanOrEqual(1);
  }
  await page.screenshot({ path: path.join(SHOTS, "e2e-mobile-consent.png") });
  void context;
});
