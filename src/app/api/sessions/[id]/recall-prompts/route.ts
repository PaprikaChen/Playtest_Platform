import { run } from "@/lib/db";
import { json, route, testerToken } from "@/lib/http";
import { getQuestionnaire, HttpError, listPrompts, listUtterances, requireTesterSession } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const s = requireTesterSession(id, testerToken(req));
  const utterances = new Map(listUtterances(id).map((u) => [u.id, u]));
  // The quote always comes from the stored utterance, never from model output.
  const prompts = listPrompts(id).map((p) => {
    const u = utterances.get(p.utterance_id)!;
    return { ...p, quote: u.text, source: u.source, start_ms: u.start_ms };
  });
  return json({
    status: { session: s.status, transcript: s.transcript_status, prompts: s.prompts_status, provider: s.ai_provider, error: s.processing_error },
    questionnaire: getQuestionnaire(s.questionnaire_id),
    prompts,
    hasRecording: Boolean(s.recording_bytes),
  });
});

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  requireTesterSession(id, testerToken(req));
  const body = await req.json().catch(() => ({}));
  if (!["shown", "inserted", "dismissed"].includes(body.state)) throw new HttpError(400, "Invalid state.");
  run("UPDATE recall_prompts SET state=? WHERE id=? AND session_id=?", body.state, String(body.promptId), id);
  return json({ ok: true });
});
