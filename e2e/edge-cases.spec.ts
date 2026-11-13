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
  await page.getByRole("link", { name: /^Questions/ }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Saved as version 1/)).toBeVisible();
  await page.getByRole("link", { name: /^Share & builds/ }).click();
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
  await page.getByRole("link", { name: /^Feedback/ }).click();
  await page.getByRole("link", { name: "Review" }).first().click();
  await expect(page.getByText(/No recording/)).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete session now" }).click();
  await page.waitForURL(/\/projects\/prj_/);
  await expect(page.getByRole("link", { name: /^Feedback 0/ })).toBeVisible();
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

test("turning a link off mid-session stops the tester with a clear message, not a hang", async ({ page, context }) => {
  await newGame(page, "Closed Mid Session");
  const invite = await setUpInvite(page);
  const tester = await context.newPage();
  await tester.goto(invite);
  await tester.getByRole("checkbox", { name: "Screen" }).uncheck();
  await tester.getByRole("checkbox", { name: "Microphone" }).uncheck();
  await tester.getByLabel(/I agree to the recording/).check();
  await tester.getByRole("button", { name: "Start playtest" }).click();
  await expect(tester.getByText("Comments only", { exact: true })).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByRole("button", { name: "Turn on" })).toBeVisible();

  await tester.getByRole("button", { name: "Finish and answer questions" }).click();
  // (Next adds its own empty role="alert" route announcer, so match the text.)
  await expect(tester.getByRole("alert").filter({ hasText: /turned off by the developer/ })).toBeVisible({ timeout: 30_000 });
  await expect(tester.getByRole("button", { name: "Finish and answer questions" })).toBeEnabled();
});

test("recall cards: AI wording only on request, one card per comment, unmatched comments offered at the end", async ({ page, context }) => {
  // RECALL_PROVIDER=fixture adds a fixed summary to notes tagged #summary (playwright.config.ts).
  await newGame(page, `AI Wording ${Date.now()}`);
  const invite = await setUpInvite(page);
  const tester = await context.newPage();
  await tester.goto(invite);
  await tester.getByRole("checkbox", { name: "Screen" }).uncheck();
  await tester.getByRole("checkbox", { name: "Microphone" }).uncheck();
  await tester.getByLabel(/I agree to the recording/).check();
  await tester.getByRole("button", { name: "Start playtest" }).click();
  const note = tester.getByLabel(/Add a note/);
  for (const text of ["this jump is too hard #summary", "I wonder who drew the lanterns"]) {
    await note.fill(text);
    await note.press("Enter");
    await expect(tester.getByText(text)).toBeVisible();
  }
  await expect(tester.getByText(/, saving/)).toHaveCount(0);
  await tester.getByRole("button", { name: "Finish and answer questions" }).click();
  await tester.waitForURL(/\/survey\//, { timeout: 60_000 });
  await expect(tester.getByText(/Reminders are based only/)).toBeVisible({ timeout: 60_000 });

  // One card for the jump comment (under "too difficult"), pointing at the controls question instead of repeating.
  await expect(tester.getByText("“this jump is too hard #summary”")).toHaveCount(1);
  await expect(tester.locator("#question-2").getByText(/Also relates to/)).toContainText("question 3");

  // The AI wording is hidden until asked for, and stays open after a reload.
  await expect(tester.getByText("One way to put it")).toHaveCount(0);
  await tester.getByRole("button", { name: "Help me put this in words" }).click();
  await expect(tester.getByText("One way to put it")).toBeVisible();
  await tester.reload();
  await expect(tester.getByText("One way to put it")).toBeVisible();
  await tester.getByRole("button", { name: "Use this wording" }).click();
  await expect(tester.getByLabel("Answer to question 2")).toHaveValue(/In my words: this jump is too hard/);
  await expect(tester.getByRole("button", { name: "Added ✓" })).toBeVisible();

  // The unmatched comment is offered at the end and can be added to any question.
  const others = tester.getByRole("region", { name: "Other things you mentioned" });
  await expect(others).toContainText("I wonder who drew the lanterns");
  await others.getByRole("combobox").selectOption({ label: "4. What did you enjoy most?" });
  await expect(others).toContainText("Added to question 4 ✓");
  await expect(tester.getByLabel("Answer to question 4")).toHaveValue(/I wonder who drew the lanterns/);
  await tester.getByText("Other things you mentioned").scrollIntoViewIfNeeded();
  await tester.screenshot({ path: path.join(SHOTS, "e2e-7-recall-cards-on-request.png"), fullPage: true });
  // Phone width: the new card links and the "Add to a question" picker must not cause sideways scrolling.
  await tester.setViewportSize({ width: 375, height: 812 });
  expect(await tester.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await tester.screenshot({ path: path.join(SHOTS, "e2e-7-recall-cards-on-request-375.png"), fullPage: true });
  await tester.setViewportSize({ width: 1440, height: 900 });
  await tester.getByRole("button", { name: "Submit feedback" }).click();
  await expect(tester.getByText(/Thanks for playtesting/)).toBeVisible();

  await page.reload();
  await page.getByRole("link", { name: /^Feedback/ }).click();
  await page.getByRole("link", { name: "Review" }).first().click();
  await expect(page.getByText("Includes AI wording")).toBeVisible();
  await expect(page.getByText("Used AI wording")).toBeVisible();
  await expect(page.getByText("opened by tester")).toBeVisible();
  await page.getByText("Includes AI wording").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SHOTS, "e2e-6-ai-wording-review.png") });
});

test("game switcher lists games and switches between them", async ({ page }) => {
  const id = Date.now(); // unique per run: tests share one database across repeats
  await newGame(page, `Switch A ${id}`);
  await newGame(page, `Switch B ${id}`);
  await page.getByRole("button", { name: /Game/ }).first().click();
  const list = page.getByRole("listbox", { name: "Switch game" });
  await expect(list.getByRole("option", { name: `Switch A ${id}` })).toBeVisible();
  await list.getByRole("option", { name: `Switch A ${id}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Switch A ${id}` })).toBeVisible();
});

test("game files: nested folder, Unicode names, pre-compressed .br", async ({ page }) => {
  await newGame(page, "Asset Paths");
  const zlib = await import("node:zlib");
  const z = new JSZip();
  z.file("MyGame/index.html", "<html><body>ok</body></html>");
  z.file("MyGame/assets/角色 sprite.png", new Uint8Array([137, 80, 78, 71]));
  z.file("MyGame/Build/game.wasm.br", zlib.brotliCompressSync(Buffer.from("WASMDATA")));
  const buffer = Buffer.from(await z.generateAsync({ type: "uint8array" }));
  await page.locator('input[type="file"]').setInputFiles({ name: "nested.zip", mimeType: "application/zip", buffer });
  await expect(page.getByText(/Published “Build 1” \(3 files\)/)).toBeVisible();
  await page.getByRole("link", { name: /^Questions/ }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Saved as version 1/)).toBeVisible();
  await page.getByRole("link", { name: /^Share & builds/ }).click();
  await page.getByRole("button", { name: "Create link" }).click();
  const invite = (await page.getByRole("link", { name: "Open" }).first().getAttribute("href"))!;
  const g = invite.replace("/t/", "/g/");
  expect((await page.request.get(`${g}/index.html`)).status()).toBe(200);
  const png = await page.request.get(`${g}/assets/${encodeURIComponent("角色 sprite.png")}`);
  expect(png.status()).toBe(200);
  expect(png.headers()["content-type"]).toBe("image/png");
  const wasm = await page.request.get(`${g}/Build/game.wasm.br`);
  expect(wasm.status()).toBe(200);
  expect(wasm.headers()["content-type"]).toBe("application/wasm");
  expect(await wasm.text()).toBe("WASMDATA"); // served with Content-Encoding: br, decoded by the client
  expect((await page.request.get(`${g}/${encodeURIComponent("../../playtest.sqlite")}`)).status()).toBe(404);
});

test("phone width: no horizontal scrolling on main screens, even with very long names", async ({ page, context }) => {
  await newGame(page, "A really really long game name that keeps going SuperLongWordWithoutSpacesToBreakLayouts");
  const invite = await setUpInvite(page);
  await page.setViewportSize({ width: 375, height: 812 });
  const overflow = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  for (const url of ["/", page.url(), page.url() + "?tab=questions", page.url() + "?tab=share", invite]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    expect(await overflow(page), `horizontal overflow on ${url}`).toBeLessThanOrEqual(1);
  }
  await page.screenshot({ path: path.join(SHOTS, "e2e-mobile-consent.png") });
  void context;
});
