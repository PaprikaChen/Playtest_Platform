import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const execFileP = promisify(execFile);

/** Path to the bundled ffmpeg (ffmpeg-static), so no system install is needed. */
export async function ffmpegPath(): Promise<string> {
  const mod = (await import("ffmpeg-static")) as unknown as { default: string | null };
  if (!mod.default) throw new Error("ffmpeg-static binary not available on this platform.");
  return mod.default;
}

/** Run ffmpeg and return stdout as a Buffer. */
export async function ffmpeg(args: string[]): Promise<Buffer> {
  const { stdout } = await execFileP(await ffmpegPath(), ["-v", "error", ...args], { encoding: "buffer", maxBuffer: 1024 * 1024 * 1024 });
  return stdout as Buffer;
}
