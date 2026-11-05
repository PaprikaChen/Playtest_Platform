import { json, route, readJson } from "@/lib/http";
import { setInviteActive } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const body = await readJson(req);
  setInviteActive((await params).id, Boolean(body.active));
  return json({ ok: true });
});
