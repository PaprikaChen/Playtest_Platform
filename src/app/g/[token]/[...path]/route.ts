import fs from "node:fs";
import { buildDir, safeJoin } from "@/lib/paths";
import { decodePrecompressed, PrecompressedError } from "@/lib/precompressed";
import { inviteByToken } from "@/lib/repo";
import { ZIP_LIMITS } from "@/lib/zip";

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
  const rel = parts.join("/"); // Next has already decoded each segment
  const file = safeJoin(buildDir(inv.build_id), rel);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "cache-control": "private, max-age=300",
    // Opaque-origin game frames need CORS to fetch their own assets.
    "access-control-allow-origin": "*",
    "x-content-type-options": "nosniff",
  };
  // Pre-compressed .br/.gz files are served decompressed, capped at the build's own size limit.
  let decoded: { body: Buffer; ext: string };
  try {
    decoded = decodePrecompressed(file, fs.readFileSync(file), ZIP_LIMITS.maxUncompressedBytes);
  } catch (e) {
    if (e instanceof PrecompressedError) return new Response(e.message, { status: 422 });
    throw e;
  }
  const { body, ext } = decoded;
  headers["content-type"] = TYPES[ext] ?? "application/octet-stream";
  return new Response(new Uint8Array(body), { headers });
}
