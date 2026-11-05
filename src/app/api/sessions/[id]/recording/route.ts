import fs from "node:fs";
import { route } from "@/lib/http";
import { recordingPath } from "@/lib/paths";
import { getSession, HttpError, requireTesterSession } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

// Range-capable so the <video> element can seek to replay moments.
// Testers pass ?t=<invite token>; creator access is unauthenticated in the alpha (local only).
export const GET = route(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const token = new URL(req.url).searchParams.get("t");
  const s = token ? requireTesterSession(id, token) : getSession(id);
  if (!s) throw new HttpError(404, "Session not found.");
  const file = recordingPath(id);
  if (!fs.existsSync(file)) throw new HttpError(404, "No recording for this session.");

  const size = fs.statSync(file).size;
  const type = s.recording_mime?.split(";")[0] || "video/webm";
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    const stream = fs.createReadStream(file, { start, end });
    return new Response(stream as unknown as ReadableStream, {
      status: 206,
      headers: { "content-type": type, "content-length": String(end - start + 1), "content-range": `bytes ${start}-${end}/${size}`, "accept-ranges": "bytes", "cache-control": "private, no-store" },
    });
  }
  return new Response(fs.createReadStream(file) as unknown as ReadableStream, {
    headers: { "content-type": type, "content-length": String(size), "accept-ranges": "bytes", "cache-control": "private, no-store" },
  });
});
