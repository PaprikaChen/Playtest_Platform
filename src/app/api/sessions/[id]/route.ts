import { json, route } from "@/lib/http";
import { deleteSession, getSession, HttpError } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  if (!getSession(id)) throw new HttpError(404, "Session not found.");
  deleteSession(id);
  return json({ ok: true });
});
