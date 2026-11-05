import { json, route, testerToken } from "@/lib/http";
import { addUtterances, HttpError, requireTesterSession } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

// Typed comments and live captions, timestamped relative to recording start.
export const POST = route(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const s = requireTesterSession(id, testerToken(req));
  if (s.status !== "recording") throw new HttpError(409, "Session already ended.");
  const body = await req.json().catch(() => ({}));
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 200).map((i: Record<string, unknown>) => ({
    source: i.source === "voice-live" ? ("voice-live" as const) : ("typed" as const),
    text: String(i.text ?? ""),
    start_ms: Number(i.start_ms),
    end_ms: Number(i.end_ms ?? i.start_ms),
  }));
  addUtterances(id, items);
  return json({ ok: true, added: items.length });
});
