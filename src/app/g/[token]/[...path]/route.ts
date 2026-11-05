import fs from "node:fs";
import path from "node:path";
import { buildDir, safeJoin } from "@/lib/paths";
import { inviteByToken } from "@/lib/repo";

type Ctx = { params: Promise<{ token: string; path: string[] }> };

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp", ".ico": "image/x-icon",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".mp4": "video/mp4", ".webm": "video/webm",
  ".ttf": "font/ttf", ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain", ".data": "application/octet-stream",
  ".pck": "application/octet-stream", ".unityweb": "application/octet-stream",
};

/**
 * Serves extracted build files, gated by an active invite token.
 * The tester page embeds this in a sandboxed iframe without allow-same-origin,
 * so game code runs in an opaque origin and cannot call platform APIs.
 * Static files only: nothing from the build is ever executed on the server.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { token, path: parts } = await params;
  const inv = inviteByToken(token);
  if (!inv) return new Response("Invite not found or disabled.", { status: 403 });
  const rel = parts.map(decodeURIComponent).join("/");
  const file = safeJoin(buildDir(inv.build_id), rel);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "cache-control": "private, max-age=300",
    // Opaque-origin game frames need CORS to fetch their own assets.
    "access-control-allow-origin": "*",
    "x-content-type-options": "nosniff",
  };
  // Unity/Godot pre-compressed builds: foo.wasm.br -> wasm with br encoding.
  let ext = path.extname(file).toLowerCase();
  if (ext === ".br" || ext === ".gz") {
    headers["content-encoding"] = ext === ".br" ? "br" : "gzip";
    ext = path.extname(file.slice(0, -ext.length)).toLowerCase();
  }
  headers["content-type"] = TYPES[ext] ?? "application/octet-stream";
  return new Response(fs.readFileSync(file), { headers });
}
