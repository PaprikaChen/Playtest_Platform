import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Decoder, Reader, tools } from "ts-ebml";
import { execFileP, ffmpegPath } from "./media";

/**
 * Remux a MediaRecorder WebM losslessly (ffmpeg -c copy): clusters are re-cut
 * to start at video keyframes and Cues/Duration are rebuilt, so <video> can
 * seek anywhere. MediaRecorder's own clusters usually start with audio or
 * delta frames; cues pointing at those make Chrome fail the seek with
 * PIPELINE_ERROR_DECODE, which showed as "Recording unavailable" on replay.
 */
export async function remuxSeekable(input: Buffer, workDir: string): Promise<Buffer> {
  const tag = crypto.randomBytes(4).toString("hex");
  const inPath = path.join(workDir, `remux-${tag}.in.webm`);
  const outPath = path.join(workDir, `remux-${tag}.out.webm`);
  fs.mkdirSync(workDir, { recursive: true });
  fs.writeFileSync(inPath, input);
  try {
    // Output must be a file: the webm muxer needs a seekable target to write cues.
    await execFileP(await ffmpegPath(), ["-v", "error", "-y", "-i", inPath, "-c", "copy", outPath]);
    const out = fs.readFileSync(outPath);
    if (out.byteLength < 4 || out.readUInt32BE(0) !== 0x1a45dfa3) throw new Error("ffmpeg remux produced an invalid file.");
    return out;
  } finally {
    fs.rmSync(inPath, { force: true });
    fs.rmSync(outPath, { force: true });
  }
}

/**
 * Fallback when ffmpeg fails: rewrite the header with duration + cues so the
 * file is at least partially seekable. Cues keep MediaRecorder's cluster
 * boundaries, so seeks can still fail past the first keyframes (see above).
 */
export function makeSeekable(input: Buffer, fallbackDurationMs = 0): Buffer {
  const decoder = new Decoder();
  const reader = new Reader();
  reader.logging = false;
  reader.drop_default_duration = false;
  const ab = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer;
  for (const el of decoder.decode(ab)) reader.read(el);
  reader.stop();
  if (!reader.metadataSize) throw new Error("Recording has no readable WebM metadata.");
  // ts-ebml can't always infer duration (e.g. very short clips); fall back to the
  // client-measured length. Default TimestampScale is 1 ms, so units match.
  const duration = reader.duration || fallbackDurationMs;
  if (!duration) throw new Error("Could not determine recording duration.");

  // ts-ebml returns `Buffer.concat(...).buffer`; for small headers that is Node's
  // shared 8 KB pool slab, which contains unrelated bytes. Disable pooling so the
  // returned ArrayBuffer is exactly the header.
  const pool = Buffer.poolSize;
  let header: ArrayBuffer;
  try {
    Buffer.poolSize = 0;
    header = tools.makeMetadataSeekable(reader.metadatas, duration, reader.cues);
  } finally {
    Buffer.poolSize = pool;
  }
  const out = Buffer.concat([Buffer.from(header), input.subarray(reader.metadataSize)]);
  // Sanity check: output must start with the EBML magic number.
  if (out.readUInt32BE(0) !== 0x1a45dfa3) throw new Error("Seekable rewrite produced an invalid header.");
  return out;
}
