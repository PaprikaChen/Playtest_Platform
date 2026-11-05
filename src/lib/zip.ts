import JSZip from "jszip";

export const ZIP_LIMITS = {
  maxFiles: 2000,
  maxUncompressedBytes: 200 * 1024 * 1024,
  maxZipBytes: 100 * 1024 * 1024,
};

export interface ValidatedEntry {
  path: string; // normalised path relative to the build root
  file: JSZip.JSZipObject;
}

export interface ZipValidation {
  ok: true;
  entries: ValidatedEntry[];
  entryPath: string;
  totalBytes: number;
}

export interface ZipError {
  ok: false;
  error: string;
}

const IGNORED = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)(\/|$)/;

/**
 * Validate a web-build ZIP without executing anything from it.
 * Rejects absolute paths, `..` segments, too many files and zip bombs, and
 * requires an index.html at the root or inside a single top-level folder.
 */
export async function validateBuildZip(data: Uint8Array): Promise<ZipValidation | ZipError> {
  if (data.byteLength > ZIP_LIMITS.maxZipBytes) return { ok: false, error: "ZIP is larger than 100 MB." };
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    return { ok: false, error: "File is not a readable ZIP archive." };
  }

  const files = Object.values(zip.files).filter((f) => !f.dir && !IGNORED.test(f.name));
  if (files.length === 0) return { ok: false, error: "ZIP is empty." };
  if (files.length > ZIP_LIMITS.maxFiles) return { ok: false, error: `ZIP has more than ${ZIP_LIMITS.maxFiles} files.` };

  let totalBytes = 0;
  for (const f of files) {
    // JSZip normalises "../x" to "x"; check the raw name so we reject instead of silently rewriting.
    const raw = (f as unknown as { unsafeOriginalName?: string }).unsafeOriginalName ?? f.name;
    const name = raw.replace(/\\/g, "/");
    if (name.startsWith("/") || /^[a-zA-Z]:/.test(name) || name.split("/").includes("..")) {
      return { ok: false, error: `Unsafe path in ZIP: ${f.name}` };
    }
    // JSZip exposes the declared size; we also enforce it while extracting.
    const declared = (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    totalBytes += declared;
    if (totalBytes > ZIP_LIMITS.maxUncompressedBytes) return { ok: false, error: "Uncompressed build is larger than 200 MB." };
  }

  // Strip a single shared top-level folder ("MyGame/index.html" -> "index.html").
  const names = files.map((f) => f.name.replace(/\\/g, "/"));
  const tops = new Set(names.map((n) => (n.includes("/") ? n.split("/")[0] : "")));
  const prefix = tops.size === 1 && !tops.has("") ? `${[...tops][0]}/` : "";
  const entries = files.map((file, i) => ({ path: names[i].slice(prefix.length), file }));

  const entry = entries.find((e) => e.path.toLowerCase() === "index.html");
  if (!entry) return { ok: false, error: "No index.html found at the top level of the build." };

  return { ok: true, entries, entryPath: entry.path, totalBytes };
}

/**
 * Inflate one entry as a stream, aborting as soon as it exceeds `budget` bytes.
 * Declared sizes in the ZIP header can lie (zip bombs), so we never trust them
 * for allocation: the whole entry is never buffered past the limit.
 */
export function readEntryCapped(file: JSZip.JSZipObject, budget: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parts: Uint8Array[] = [];
    let size = 0;
    let done = false;
    // internalStream is public JSZip API (v3) but missing from its type definitions.
    type Stream = { on(ev: string, fn: (x: never) => void): Stream; pause(): Stream; resume(): Stream };
    const stream = (file as unknown as { internalStream(t: "uint8array"): Stream }).internalStream("uint8array");
    stream
      .on("data", (chunk: Uint8Array) => {
        if (done) return;
        size += chunk.byteLength;
        if (size > budget) {
          done = true;
          stream.pause();
          reject(new ZipLimitError("Uncompressed build is larger than 200 MB."));
          return;
        }
        parts.push(chunk);
      })
      .on("error", (e: Error) => { if (!done) { done = true; reject(e); } })
      .on("end", () => { if (!done) { done = true; resolve(Buffer.concat(parts)); } })
      .resume();
  });
}

export class ZipLimitError extends Error {}
