import { json, route, testerToken } from "@/lib/http";
import { assembleRecording, processSession } from "@/lib/processing";
import { getSession, requireTesterSession, updateSession } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

// Idempotent: calling twice returns the current processing status.
export const POST = route(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const s = requireTesterSession(id, testerToken(req));
  if (s.status !== "recording") return json({ status: s.status, alreadyCompleted: true });

  const body = await req.json().catch(() => ({}));
  const chunkCount = Math.max(0, Number(body.chunkCount) || 0);
  const { bytes, missing } = assembleRecording(id, chunkCount, Math.round(Number(body.durationMs) || 0));
  updateSession(id, {
    status: "processing",
    ended_at: Date.now(),
    duration_ms: Math.round(Number(body.durationMs) || 0),
    recording_mime: bytes ? String(body.mime ?? "video/webm") : null,
    recording_bytes: bytes || null,
    processing_error: missing.length ? `Missing ${missing.length} recording chunk(s): ${missing.slice(0, 10).join(", ")}` : null,
  });
  // Fire and forget: the questionnaire polls for prompts and works without them.
  void processSession(id);
  return json({ status: getSession(id)!.status, missingChunks: missing }, 202);
});
