import { json, route } from "@/lib/http";
import { createInvite, latestQuestionnaire, listInvites } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) => json({ invites: listInvites((await params).id) }));

export const POST = route(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const qid = body.questionnaireId ?? latestQuestionnaire(id)?.id ?? "";
  return json({ invite: createInvite(id, String(body.buildId ?? ""), String(qid)) }, 201);
});
