import { json, route } from "@/lib/http";
import { createBuild, HttpError, listBuilds } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) => json({ builds: listBuilds((await params).id) }));

export const POST = route(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Attach a ZIP file as 'file'.");
  if (!/\.zip$/i.test(file.name)) throw new HttpError(422, "Upload a .zip web build.");
  const build = await createBuild(id, String(form.get("label") ?? ""), file.name, new Uint8Array(await file.arrayBuffer()));
  return json({ build }, 201);
});
