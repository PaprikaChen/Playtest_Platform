import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeSeekable, remuxSeekable } from "@/lib/webm";

const fixture = path.join(__dirname, "fixtures", "recording-raw.webm");

// ---------- minimal EBML parsing helpers (test-only) ----------
function readVint(b: Buffer, i: number, keepMarker = false): { value: number; length: number } {
  const first = b[i];
  let mask = 0x80, length = 1;
  while (length <= 8 && !(first & mask)) { mask >>= 1; length++; }
  let value = keepMarker ? first : first & (mask - 1);
  for (let k = 1; k < length; k++) value = value * 256 + b[i + k];
  return { value, length };
}

/** The track number declared with TrackType video (1) in the header. */
function videoTrackNumber(b: Buffer): number | null {
  // TrackEntry (0xAE): scan the header (before the first Cluster) for
  // TrackNumber (0xD7) / TrackType (0x83) pairs.
  const headerEnd = b.indexOf(Buffer.from([0x1f, 0x43, 0xb6, 0x75]));
  let i = 0;
  let current: number | null = null;
  while (i < (headerEnd < 0 ? b.length : headerEnd) - 1) {
    if (b[i] === 0xd7 && b[i + 1] === 0x81) current = b[i + 2]; // TrackNumber, 1-byte size
    if (b[i] === 0x83 && b[i + 1] === 0x81) {
      if (b[i + 2] === 1 && current != null) return current; // TrackType video
      current = null;
    }
    i++;
  }
  return null;
}

/** Whether the first video block of each cluster is a keyframe. */
function firstVideoBlockPerCluster(b: Buffer, videoTrack: number): boolean[] {
  const clusterId = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
  const starts: number[] = [];
  for (let i = b.indexOf(clusterId); i >= 0; i = b.indexOf(clusterId, i + 4)) starts.push(i);
  const out: boolean[] = [];
  for (const start of starts) {
    let i = start + 4;
    const size = readVint(b, i); i += size.length;
    const end = Math.min(i + size.value, b.length);
    while (i < end) {
      const id = b[i];
      if (id === 0xe7) { // cluster Timecode
        const s = readVint(b, i + 1); i += 1 + s.length + s.value;
      } else if (id === 0xa3) { // SimpleBlock: keyframe bit in the flags byte
        const s = readVint(b, i + 1);
        const body = i + 1 + s.length;
        const track = readVint(b, body);
        if (track.value === videoTrack) { out.push((b[body + track.length + 2] & 0x80) !== 0); break; }
        i = body + s.value;
      } else if (id === 0xa0) { // BlockGroup: keyframe = no ReferenceBlock (0xFB) inside
        const s = readVint(b, i + 1);
        const gStart = i + 1 + s.length;
        const gEnd = gStart + s.value;
        let j = gStart, track = -1, hasRef = false;
        while (j < gEnd) {
          if (b[j] === 0xa1) { // Block
            const bs = readVint(b, j + 1);
            track = readVint(b, j + 1 + bs.length).value;
            j += 1 + bs.length + bs.value;
          } else if (b[j] === 0xfb) { // ReferenceBlock
            hasRef = true;
            const rs = readVint(b, j + 1); j += 1 + rs.length + rs.value;
          } else {
            const idLen = readVint(b, j, true).length;
            const es = readVint(b, j + idLen); j += idLen + es.length + es.value;
          }
        }
        if (track === videoTrack) { out.push(!hasRef); break; }
        i = gEnd;
      } else {
        const idLen = readVint(b, i, true).length;
        const s = readVint(b, i + idLen);
        i += idLen + s.length + s.value;
      }
    }
  }
  return out;
}

describe.runIf(fs.existsSync(fixture))("remuxSeekable", () => {
  it("rebuilds the file so every cluster with video starts at a keyframe, with cues and duration", async () => {
    const out = await remuxSeekable(fs.readFileSync(fixture), path.join(__dirname, "fixtures"));
    expect(out.readUInt32BE(0)).toBe(0x1a45dfa3);
    // Cues present (what <video> uses to seek) and a Duration header.
    expect(out.includes(Buffer.from([0x1c, 0x53, 0xbb, 0x6b]))).toBe(true);
    expect(out.includes(Buffer.from([0x44, 0x89]))).toBe(true);
    // The bug: cues pointing at clusters that start with delta frames make Chrome
    // fail seeks with PIPELINE_ERROR_DECODE. ffmpeg cuts clusters at keyframes.
    const vt = videoTrackNumber(out);
    if (vt != null) {
      const firsts = firstVideoBlockPerCluster(out, vt);
      expect(firsts.length).toBeGreaterThan(0);
      expect(firsts.every(Boolean)).toBe(true);
    }
  });

  it("rejects non-webm input", async () => {
    await expect(remuxSeekable(Buffer.from("not a webm file at all"), path.join(__dirname, "fixtures"))).rejects.toThrow();
  });

  it("leaves no temp files behind", async () => {
    const dir = path.join(__dirname, "fixtures");
    await remuxSeekable(fs.readFileSync(fixture), dir);
    await remuxSeekable(Buffer.from("garbage"), dir).catch(() => {});
    expect(fs.readdirSync(dir).filter((f) => f.startsWith("remux-"))).toEqual([]);
  });
});

describe.runIf(fs.existsSync(fixture))("makeSeekable (fallback when ffmpeg is unavailable)", () => {
  it("produces a clean EBML header with no pooled-buffer garbage", () => {
    // Allocate small buffers first so the shared pool contains junk.
    Buffer.from('{"chunkCount":11,"junk":true}');
    const out = makeSeekable(fs.readFileSync(fixture), 2200);
    expect(out.readUInt32BE(0)).toBe(0x1a45dfa3);
    expect(out.includes(Buffer.from("chunkCount"))).toBe(false);
  });

  it("rejects non-webm input", () => {
    expect(() => makeSeekable(Buffer.from("not a webm file at all"))).toThrow();
  });
});
