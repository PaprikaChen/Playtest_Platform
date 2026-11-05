import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const SHOTS = path.resolve(__dirname, "../docs/screenshots");
const ZIP = path.resolve(__dirname, "../samples/lantern-hop.zip");
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });

test("creator setup → tester plays with screen + mic → recall questionnaire → developer review", async ({ page, context }) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const log: Record<string, unknown> = {};

  // ---------- creator ----------
  await page.goto("/");
  await page.getByLabel("Game name").fill("Lantern Hop");
  await page.getByLabel("What are you testing?").fill("Levels 1–2, new jump tuning");
  await page.getByRole("button", { name: "Create game" }).click();
  await page.waitForURL(/\/projects\//);

  await page.getByLabel("Build name").fill("v0.3 jump tuning");
  await page.locator('input[type="file"]').setInputFiles(ZIP);
  await expect(page.getByText(/Published “v0.3 jump tuning”/)).toBeVisible();
  await page.getByRole("link", { name: /^Questions/ }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Saved as version 1/)).toBeVisible();
  await page.getByRole("link", { name: /^Share & builds/ }).click();
  await page.getByRole("button", { name: "Create link" }).click();
  const link = page.getByRole("link", { name: "Open" }).first();
  await expect(link).toBeVisible();
  const invitePath = (await link.getAttribute("href"))!;
  await shot(page, "e2e-1-creator-setup");

  // ---------- tester: consent ----------
  const tester = await context.newPage();
  // Keep a handle on the screen stream so the test can simulate "Stop sharing".
  await tester.addInitScript(() => {
    const orig = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getDisplayMedia = async (o) => ((window as unknown as { __screen: MediaStream }).__screen = await orig(o));
  });
  const sessionsCreated: string[] = [];
  tester.on("request", (r) => r.method() === "POST" && r.url().endsWith("/api/sessions") && sessionsCreated.push(r.url()));
  await tester.goto(invitePath);
  await tester.getByLabel("Your name or nickname").fill("Sam");
  await tester.getByLabel(/I agree to the recording/).check();
  await shot(tester, "e2e-2-tester-consent");
  // Double-click must not start two sessions.
  await tester.getByRole("button", { name: "Start playtest" }).dblclick();

  // ---------- tester: play ----------
  await expect(tester.getByText("Recording", { exact: true })).toBeVisible({ timeout: 60_000 });
  const game = tester.frameLocator('iframe[title="Game"]');
  await expect(game.locator("canvas")).toBeVisible();
  await game.locator("canvas").click();
  const t0 = Date.now();
  // Move right and jump for a few seconds so the recording has real gameplay.
  for (let i = 0; i < 6; i++) {
    await tester.keyboard.down("ArrowRight");
    await tester.keyboard.press("Space");
    await tester.waitForTimeout(400);
    await tester.keyboard.up("ArrowRight");
  }
  const box = tester.getByPlaceholder("Type a comment, press Enter");
  await box.click();
  await box.pressSequentially("the door is hard to see");
  await box.press("Enter");
  // Simulate the tester clicking Chrome's "Stop sharing" at ~8 s; the mic must keep recording.
  await tester.waitForTimeout(Math.max(0, 8_000 - (Date.now() - t0)));
  await tester.evaluate(() => {
    const track = (window as unknown as { __screen: MediaStream }).__screen.getVideoTracks()[0];
    track.stop();
    track.dispatchEvent(new Event("ended"));
  });
  await expect(tester.getByText(/Your voice is still being recorded/)).toBeVisible();
  await expect(tester.getByText("Recording", { exact: true })).toBeVisible();
  // Let the synthesized speech (≈26 s) play through the fake mic.
  await tester.waitForTimeout(Math.max(0, 24_000 - (Date.now() - t0)));
  await shot(tester, "e2e-3-tester-playing");
  // Notes panel can be hidden to give the game the full width, and brought back.
  await tester.getByRole("button", { name: "Hide notes" }).click();
  await expect(tester.locator("#notes-panel")).toBeHidden();
  await tester.getByRole("button", { name: "Show notes" }).click();
  await expect(tester.locator("#notes-panel")).toBeVisible();
  log.sidePanel = await tester.locator("aside").innerText();

  await tester.getByRole("button", { name: "Finish and answer questions" }).click();
  await tester.waitForURL(/\/survey\//, { timeout: 60_000 });
  const sessionId = tester.url().split("/").pop()!;

  // ---------- tester: questionnaire ----------
  await expect(tester.getByText(/Reminders are based only on what you said/)).toBeVisible({ timeout: 60_000 });
  const cards = tester.getByRole("button", { name: "Add to my answer" });
  log.recallCards = await cards.count();
  expect(log.recallCards).toBeGreaterThan(0);
  // Voice → transcript → recall card: something the tester only *said* must appear as a card.
  await expect(tester.getByText("you said").first()).toBeVisible();
  log.spokenCards = await tester.locator("p", { hasText: "you said" }).allInnerTexts();
  expect((log.spokenCards as string[]).join(" ").toLowerCase()).toMatch(/too hard|floaty|where to go/);
  await cards.first().click();
  // Server-rendered thumbnails (ffmpeg) must actually load for visible cards.
  const thumb = tester.locator('img[alt^="Frame at"]').first();
  await expect(thumb).toBeVisible();
  await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0);
  await shot(tester, "e2e-4-recall-questionnaire");

  // Drafts autosave and survive a reload.
  const firstAnswer = tester.getByLabel("Answer to question 1");
  await firstAnswer.fill("After the first platform I had no idea where the door was.");
  await expect(tester.getByText(/Draft saved/)).toBeVisible({ timeout: 10_000 });
  await tester.reload();
  await expect(tester.getByLabel("Answer to question 1")).toHaveValue(/no idea where the door was/);

  // Recording must be seekable and contain both video and audio.
  const media = await tester.evaluate(async (sid) => {
    const token = location.pathname.split("/")[2];
    const v = document.createElement("video");
    v.src = `/api/sessions/${sid}/recording?t=${token}`;
    v.muted = true;
    document.body.appendChild(v);
    await new Promise((r, j) => { v.onloadedmetadata = r; v.onerror = () => j(new Error("media error")); });
    v.currentTime = Math.min(18, v.duration - 3); // after the screen share stopped at ~8 s
    await new Promise((r) => (v.onseeked = r));
    await v.play();
    await new Promise((r) => setTimeout(r, 1500));
    const anyV = v as unknown as { webkitAudioDecodedByteCount: number; webkitVideoDecodedByteCount: number };
    const out = { duration: v.duration, width: v.videoWidth, audioBytes: anyV.webkitAudioDecodedByteCount, videoBytes: anyV.webkitVideoDecodedByteCount };
    v.remove();
    return out;
  }, sessionId);
  log.media = media;
  // Audio continued after the screen share stopped at ~8 s, so the file covers the whole session.
  expect(media.duration).toBeGreaterThan(20);
  expect(sessionsCreated).toHaveLength(1);
  expect(media.width).toBeGreaterThan(0);
  expect(media.audioBytes).toBeGreaterThan(0);

  await tester.getByRole("button", { name: "Submit feedback" }).click();
  await expect(tester.getByText(/Thanks for playtesting/)).toBeVisible();

  // ---------- developer review ----------
  await page.goto(`/sessions/${sessionId}`);
  await expect(page.getByRole("heading", { name: "Sam" })).toBeVisible();
  const timeline = page.locator("aside ol li");
  log.timeline = await timeline.allInnerTexts();
  expect((log.timeline as string[]).some((t) => t.includes("Spoken") && /jump is way too hard/i.test(t))).toBe(true);
  await shot(page, "e2e-5-developer-review");

  fs.writeFileSync(path.join(SHOTS, "e2e-run.json"), JSON.stringify(log, null, 2));
  console.log(JSON.stringify(log, null, 2));
});
