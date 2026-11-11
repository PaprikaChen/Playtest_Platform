import path from "node:path";
import zlib from "node:zlib";

export class PrecompressedError extends Error {}

/**
 * Unity/Godot pre-compressed build files (foo.wasm.br, foo.data.gz). Next.js strips a
 * Content-Encoding header set by a route handler, so they are decompressed server-side
 * and served as plain bytes. `maxBytes` caps the inflated size: a small crafted file
 * must not be able to inflate into gigabytes of server memory.
 */
export function decodePrecompressed(file: string, body: Buffer, maxBytes: number): { body: Buffer; ext: string } {
  const ext = path.extname(file).toLowerCase();
  if (ext !== ".br" && ext !== ".gz") return { body, ext };
  try {
    const opts = { maxOutputLength: maxBytes };
    const out = ext === ".br" ? zlib.brotliDecompressSync(body, opts) : zlib.gunzipSync(body, opts);
    return { body: out, ext: path.extname(file.slice(0, -ext.length)).toLowerCase() };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE" || e instanceof RangeError) {
      throw new PrecompressedError(`Compressed file is too large once decompressed (limit ${Math.round(maxBytes / 1048576)} MB).`);
    }
    throw new PrecompressedError("Corrupt compressed file in build.");
  }
}
