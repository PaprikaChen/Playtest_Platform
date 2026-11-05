import { json, route } from "@/lib/http";
import { createProject, listProjects } from "@/lib/repo";

export const GET = route(() => json({ projects: listProjects() }));

export const POST = route(async (req: Request) => {
  const body = await req.json().catch(() => ({}));
  return json({ project: createProject(String(body.name ?? ""), String(body.description ?? "")) }, 201);
});
