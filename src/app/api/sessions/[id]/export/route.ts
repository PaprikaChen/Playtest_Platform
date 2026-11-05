import fs from "node:fs";
import JSZip from "jszip";
import { route } from "@/lib/http";
import { recordingPath } from "@/lib/paths";
import { getQuestionnaire, getSession, HttpError, listAnswers, listPrompts, listUtterances } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const s = getSession(id);
  if (!s) throw new HttpError(404, "Session not found (it may have expired after 7 days).");
  const zip = new JSZip();
  if (fs.existsSync(recordingPath(id))) zip.file("recording.webm", fs.readFileSync(recordingPath(id)));
  zip.file("transcript.json", JSON.stringify(listUtterances(id), null, 2));
  zip.file("questionnaire.json", JSON.stringify(getQuestionnaire(s.questionnaire_id), null, 2));
  zip.file("answers.json", JSON.stringify(listAnswers(id), null, 2));
  zip.file("recall_prompts.json", JSON.stringify(listPrompts(id), null, 2));
  zip.file("session.json", JSON.stringify(s, null, 2));
  const buf = await zip.generateAsync({ type: "uint8array" });
  return new Response(buf as unknown as BodyInit, {
    headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${id}.zip"` },
  });
});
