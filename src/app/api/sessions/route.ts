import { json, route, readJson } from "@/lib/http";
import { createSession, HttpError } from "@/lib/repo";

const MODES = new Set(["screen+mic", "screen", "mic", "comments-only"]);

export const POST = route(async (req: Request) => {
  const body = await readJson(req);
  if (body.consent !== true) throw new HttpError(400, "Consent is required before recording.");
  const mode = MODES.has(body.captureMode) ? body.captureMode : "comments-only";
  const s = createSession(String(body.token ?? ""), String(body.testerName ?? ""), mode, body.idempotencyKey ? String(body.idempotencyKey) : null, body.language ? String(body.language) : null);
  return json({ session: { id: s.id, status: s.status } }, 201);
});
