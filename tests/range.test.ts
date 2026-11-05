import { describe, expect, it } from "vitest";
import { parseRange } from "@/lib/range";

describe("parseRange", () => {
  it("handles normal, open-ended and clamped ranges", () => {
    expect(parseRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=500-", 1000)).toEqual({ start: 500, end: 999 });
    expect(parseRange("bytes=900-5000", 1000)).toEqual({ start: 900, end: 999 });
  });
  it("handles suffix ranges (last N bytes)", () => {
    expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=-5000", 1000)).toEqual({ start: 0, end: 999 });
  });
  it("rejects unsatisfiable ranges instead of crashing", () => {
    expect(parseRange("bytes=100-50", 1000)).toBe("unsatisfiable");
    expect(parseRange("bytes=1000-", 1000)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", 1000)).toBe("unsatisfiable");
    expect(parseRange("bytes=0-1", 0)).toBe("unsatisfiable");
  });
  it("ignores absent, malformed and multi-range headers (serve whole file)", () => {
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange("bytes=-", 1000)).toBeNull();
    expect(parseRange("items=0-1", 1000)).toBeNull();
    expect(parseRange("bytes=0-1,5-9", 1000)).toBeNull();
  });
});
