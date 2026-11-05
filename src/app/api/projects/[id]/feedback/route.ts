import { json, route } from "@/lib/http";
import { listSessions, requireProject } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const project = requireProject((await params).id);
  return json({ project, sessions: listSessions(project.id) });
});
