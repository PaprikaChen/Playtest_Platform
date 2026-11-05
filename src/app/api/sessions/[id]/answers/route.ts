import { json, route, testerToken } from "@/lib/http";
import { HttpError, requireTesterSession, saveAnswer, updateSession } from "@/lib/repo";
import { tx } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const s = requireTesterSession(id, testerToken(req));
  if (s.status === "recording") throw new HttpError(409, "Finish the play session first.");
  if (s.submitted_at) throw new HttpError(409, "Questionnaire already submitted.");
  const body = await req.json().catch(() => ({}));
  const answers = Array.isArray(body.answers) ? body.answers : [];
  tx(() => {
    for (const a of answers) {
      saveAnswer(id, String(a.questionId), String(a.text ?? ""), a.rating == null ? null : Number(a.rating),
        Array.isArray(a.promptIds) ? a.promptIds.map(String) : []);
    }
  });
  if (body.submit) updateSession(id, { submitted_at: Date.now(), status: "submitted" });
  return json({ ok: true, saved: answers.length, submitted: Boolean(body.submit) });
});
