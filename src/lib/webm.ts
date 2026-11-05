import { Decoder, Reader, tools } from "ts-ebml";

/**
 * MediaRecorder writes WebM without a duration or cue index, which makes
 * seeking (and therefore "replay this moment") unreliable. Rewrite the
 * header with duration + cues so the browser can seek to any timestamp.
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
