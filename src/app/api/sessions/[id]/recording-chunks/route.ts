import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { run } from "@/lib/db";
import { json, route, testerToken } from "@/lib/http";
import { chunkPath } from "@/lib/paths";
import { HttpError, requireTesterSession } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };
const MAX_CHUNK = 25 * 1024 * 1024;

// Body is the raw media chunk. Re-sending the same seq is idempotent (overwrite).
export const POST = route(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const s = requireTesterSession(id, testerToken(req));
  if (s.status !== "recording") throw new HttpError(409, "Recording already completed.");
  const seq = Number(new URL(req.url).searchParams.get("seq"));
  if (!Number.isInteger(seq) || seq < 0 || seq > 100000) throw new HttpError(400, "Invalid seq.");
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.byteLength === 0 || buf.byteLength > MAX_CHUNK) throw new HttpError(400, "Chunk is empty or too large.");
  const checksum = crypto.createHash("sha256").update(buf).digest("hex");
  const claimed = req.headers.get("x-checksum");
  if (claimed && claimed !== checksum) throw new HttpError(422, "Checksum mismatch; please retry.");

  const file = chunkPath(id, seq);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  run(
    `INSERT INTO chunks (session_id,seq,bytes,checksum,created_at) VALUES (?,?,?,?,?)
     ON CONFLICT(session_id,seq) DO UPDATE SET bytes=excluded.bytes, checksum=excluded.checksum`,
    id, seq, buf.byteLength, checksum, Date.now(),
  );
  return json({ seq, bytes: buf.byteLength, checksum });
});
