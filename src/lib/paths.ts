import path from "node:path";

export const DATA_DIR = process.env.PLAYTEST_DATA_DIR ?? path.join(process.cwd(), "data");
export const buildDir = (buildId: string) => path.join(DATA_DIR, "builds", buildId);
export const sessionDir = (sessionId: string) => path.join(DATA_DIR, "sessions", sessionId);
export const chunkPath = (sessionId: string, seq: number) =>
  path.join(sessionDir(sessionId), "chunks", `${String(seq).padStart(6, "0")}.part`);
export const recordingPath = (sessionId: string) => path.join(sessionDir(sessionId), "recording.webm");

/** Resolve `rel` inside `root`, refusing anything that escapes it. */
export function safeJoin(root: string, rel: string): string | null {
  const target = path.resolve(root, rel);
  const base = path.resolve(root) + path.sep;
  return target.startsWith(base) ? target : null;
}
