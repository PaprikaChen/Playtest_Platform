import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeSeekable } from "@/lib/webm";

const fixture = path.join(__dirname, "fixtures", "recording-raw.webm");

describe.runIf(fs.existsSync(fixture))("makeSeekable", () => {
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
