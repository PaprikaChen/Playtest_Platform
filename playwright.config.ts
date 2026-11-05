import path from "node:path";
import { defineConfig } from "@playwright/test";

const PORT = 3100;
const speech = path.resolve(__dirname, "e2e/fixtures/speech.wav");

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    // Real Chrome (not bundled Chromium) so the Web Speech API works.
    channel: process.env.CI ? undefined : "chrome",
    permissions: ["microphone"],
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream", // auto-accept mic/screen prompts
        "--use-fake-device-for-media-stream", // fake mic device…
        `--use-file-for-fake-audio-capture=${speech}`, // …that plays synthesized speech
        "--auto-accept-this-tab-capture", // getDisplayMedia({preferCurrentTab}) captures this tab
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
  webServer: {
    // Isolated data dir and port so E2E never touches dev data.
    // Env goes through `env`, not a VAR=x command prefix, so this also runs on Windows.
    command: `npx next dev -p ${PORT}`,
    // RECALL_PROVIDER is pinned to the keyword mock: Next loads .env.local on its own,
    // so a developer's real API key would otherwise leak into E2E (nondeterministic
    // summaries renamed the card buttons and failed the suite, and it spends tokens).
    env: { ...process.env, PLAYTEST_DATA_DIR: ".e2e-data", NEXT_DIST_DIR: ".next-e2e", RECALL_PROVIDER: "mock" },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
