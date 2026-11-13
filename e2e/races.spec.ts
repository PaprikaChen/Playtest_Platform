import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Timing tests: act faster than debounces and refreshes, the way a real impatient user does.
// Each one reproduces a bug that the happy-path tests passed over by luck.

const ZIP = path.resolve(__dirname, "../samples/lantern-hop.zip");

async function gameWithInvite(page: Page, name: string) {
  await page.goto("/");
  await page.getByLabel("Game name").fill(name);
  await page.getByRole("button", { name: "Create game" }).click();
  await page.waitForURL(/\/projects\/.+\?tab=share/);
  await page.locator('input[type="file"]').setInputFiles(ZIP);
  await expect(page.getByText(/Published “Build 1”/)).toBeVisible();
  await page.getByRole("link", { name: /^Questions/ }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Saved as version 1/)).toBeVisible();
  await page.getByRole("link", { name: /^Share & builds/ }).click();
  await page.getByRole("button", { name: "Create link" }).click();
  return (await page.getByRole("link", { name: "Open" }).first().getAttribute("href"))!;
}

async function surveyWithOneCard(context: BrowserContext, invite: string) {
  const tester = await context.newPage();
  await tester.goto(invite);
  await tester.getByRole("checkbox", { name: "Screen" }).uncheck();
  await tester.getByRole("checkbox", { name: "Microphone" }).uncheck();
  await tester.getByLabel(/I agree to the recording/).check();
  await tester.getByRole("button", { name: "Start playtest" }).click();
  const note = tester.getByLabel(/Add a note/);
  await note.fill("this jump is too hard");
  await note.press("Enter");
  await expect(tester.getByText(/0:0\d$/)).toBeVisible(); // saved note shows its time without ", saving"
  await tester.getByRole("button", { name: "Finish and answer questions" }).click();
  await tester.waitForURL(/\/survey\//, { timeout: 60_000 });
  await expect(tester.getByText(/Reminders are based only/)).toBeVisible({ timeout: 60_000 });
  return tester;
}

test("creator: actions that refresh the page keep you on the same tab", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Game name").fill("Tab Stays");
  await page.getByRole("button", { name: "Create game" }).click();
  await page.waitForURL(/\?tab=share/);
  await page.locator('input[type="file"]').setInputFiles(ZIP);
  await expect(page.getByText(/Published “Build 1”/)).toBeVisible();
  // The upload triggers a server refresh; before the fix the page then jumped to "Questions".
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\?tab=share/);
  await expect(page.getByText(/Published “Build 1”/)).toBeVisible();
  await expect(page.getByRole("link", { name: /^Share & builds/ })).toHaveAttribute("aria-current", "page");
});

test("survey: never shows 'Draft saved' while an edit is unsent, and a fast reload keeps the edit", async ({ page, context }) => {
  const tester = await surveyWithOneCard(context, await gameWithInvite(page, "Fast Reload"));
  const answer = tester.getByLabel("Answer to question 2");
  await answer.fill("first draft");
  await expect(tester.getByText(/Draft saved/)).toBeVisible({ timeout: 10_000 });
  // Edit again and reload immediately, well inside the 1 s autosave window.
  await answer.fill("second draft, typed right before reload");
  await expect(tester.getByText(/Draft saved/)).toHaveCount(0); // label must not claim the new edit is saved
  await tester.reload();
  await expect(tester.getByLabel("Answer to question 2")).toHaveValue("second draft, typed right before reload");
});

test("survey: 'Add to my answer' then an immediate reload keeps both the text and the card state", async ({ page, context }) => {
  const tester = await surveyWithOneCard(context, await gameWithInvite(page, "Insert Reload"));
  await tester.getByRole("button", { name: "Add to my answer" }).first().click();
  await tester.reload();
  await expect(tester.getByRole("button", { name: "Added ✓" }).first()).toBeVisible();
  await expect(tester.getByLabel("Answer to question 2")).toHaveValue(/this jump is too hard/);
});

test("creator: double-clicking create/save buttons does the action once", async ({ page }) => {
  await page.goto("/");
  const name = `Double Click ${Date.now()}`; // unique per run: tests share one database across repeats
  await page.getByLabel("Game name").fill(name);
  await page.getByRole("button", { name: "Create game" }).dblclick();
  await page.waitForURL(/\?tab=share/);
  const games = await (await page.request.get("/api/projects")).json();
  expect(games.projects.filter((p: { name: string }) => p.name === name)).toHaveLength(1);

  await page.locator('input[type="file"]').setInputFiles(ZIP);
  await expect(page.getByText(/Published “Build 1”/)).toBeVisible();
  await page.getByRole("link", { name: /^Questions/ }).click();
  await page.getByRole("button", { name: "Save", exact: true }).dblclick();
  await expect(page.getByText(/Saved as version 1/)).toBeVisible();
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByText("Version 1", { exact: true })).toBeVisible(); // not "Version 2"

  await page.getByRole("link", { name: /^Share & builds/ }).click();
  await page.getByRole("button", { name: "Create link" }).dblclick();
  await page.waitForTimeout(1500);
  await expect(page.getByRole("button", { name: "Copy link" })).toHaveCount(1);
});

test("consent page: input made before the page's JavaScript loads is not lost (slow connection)", async ({ page, context }) => {
  const invite = await gameWithInvite(page, `Slow Hydration ${Date.now()}`);
  const tester = await context.newPage();
  // Hold the JS chunks back so the tester can act on the server-rendered HTML before React takes over.
  await tester.route(/\/_next\/static\/chunks\//, async (r) => { await new Promise((res) => setTimeout(res, 3000)); await r.continue(); });
  await tester.goto(invite, { waitUntil: "domcontentloaded" });
  await tester.getByLabel("Your name or nickname").fill("Early Bird");
  await tester.getByLabel(/I agree to the recording/).check();
  // Before the fix, the box looked checked but React's state stayed false: Start was disabled forever.
  await expect(tester.getByRole("button", { name: "Start playtest" })).toBeEnabled({ timeout: 15_000 });
  await expect(tester.getByLabel(/I agree to the recording/)).toBeChecked();
  await expect(tester.getByLabel("Your name or nickname")).toHaveValue("Early Bird");
});

test("survey: a server refresh right after submitting keeps the thank-you screen", async ({ page, context }) => {
  const tester = await surveyWithOneCard(context, await gameWithInvite(page, `Refresh After Submit ${Date.now()}`));
  await tester.getByRole("button", { name: "Submit feedback" }).click();
  await expect(tester.getByText(/Thanks for playtesting/)).toBeVisible();
  // The dev server (and any future router.refresh) re-renders the server part of the page. Before the fix the
  // server's "already submitted" view replaced the client's thank-you state; CI hit this intermittently.
  await tester.evaluate(() => (window as unknown as { next: { router: { refresh(): void } } }).next.router.refresh());
  await tester.waitForLoadState("networkidle");
  await expect(tester.getByText(/Thanks for playtesting/)).toBeVisible();
  // A real reload is still a returning visitor: they get the "already submitted" message.
  await tester.reload();
  await expect(tester.getByText(/already submitted/)).toBeVisible();
});
