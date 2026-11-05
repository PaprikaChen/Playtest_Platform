import fs from "node:fs";
import path from "node:path";
import { route } from "@/lib/http";
import { ffmpeg } from "@/lib/media";
import { recordingPath, sessionDir } from "@/lib/paths";
import { getSession, HttpError, requireTesterSession } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

/**
 * JPEG frame of the recording at ?ms=, rendered once with ffmpeg and cached.
 * Browsers render <video> thumbnails unreliably with preload="metadata", and
 * loading the whole video once per recall card is wasteful.
 */
export const GET = route(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("t");
  const s = token ? requireTesterSession(id, token) : getSession(id);
  if (!s || !s.recording_bytes || s.capture_mode === "mic") throw new HttpError(404, "No video for this session.");
  const ms = Math.max(0, Math.min(Number(url.searchParams.get("ms")) || 0, (s.duration_ms ?? 0) - 100));
  const bucket = Math.round(ms / 250) * 250; // cache per quarter second
  const cache = path.join(sessionDir(id), "thumbs", `${bucket}.jpg`);
  if (!fs.existsSync(cache)) {
    const jpg = await ffmpeg(["-ss", (bucket / 1000).toFixed(2), "-i", recordingPath(id), "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "5", "-f", "image2", "-c:v", "mjpeg", "pipe:1"]);
    if (!jpg.length) throw new HttpError(404, "No frame at that time.");
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    fs.writeFileSync(cache, jpg);
  }
  return new Response(fs.readFileSync(cache), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" } });
});
