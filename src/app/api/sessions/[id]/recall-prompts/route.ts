import { json, route, testerToken, readJson } from "@/lib/http";
import { isProcessing, processSession } from "@/lib/processing";
import { getQuestionnaire, listAnswers, listPrompts, listUtterances, requireTesterSession, setPromptState } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const s = requireTesterSession(id, testerToken(req));
  // Recovery: processing runs in-process, so a server restart can orphan it. Resume on read.
  if (s.status !== "recording" && !["done", "failed"].includes(s.prompts_status) && !isProcessing(id)) void processSession(id);
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
    // Saved drafts, so a reload restores the tester's answers.
    answers: listAnswers(id).map((a) => ({ questionId: a.question_id, text: a.text, rating: a.rating, promptIds: JSON.parse(a.prompt_ids_json) })),
  });
});

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  requireTesterSession(id, testerToken(req));
  const body = await readJson(req);
  setPromptState(id, String(body.promptId), String(body.state), body.insertedAs == null ? null : String(body.insertedAs));
  return json({ ok: true });
});
