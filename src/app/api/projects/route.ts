import { json, route, readJson } from "@/lib/http";
import { createProject, listProjects } from "@/lib/repo";

export const GET = route(() => json({ projects: listProjects() }));

export const POST = route(async (req: Request) => {
  const body = await readJson(req);
  return json({ project: createProject(String(body.name ?? ""), String(body.description ?? "")) }, 201);
});
