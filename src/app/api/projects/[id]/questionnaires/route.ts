import { json, route, readJson } from "@/lib/http";
import { latestQuestionnaire, saveQuestionnaire } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) =>
  json({ questionnaire: latestQuestionnaire((await params).id) ?? null }));

export const POST = route(async (req: Request, { params }: Ctx) => {
  const body = await readJson(req);
  const q = saveQuestionnaire((await params).id, String(body.title ?? ""), Array.isArray(body.questions) ? body.questions : []);
  return json({ questionnaire: q }, 201);
});
