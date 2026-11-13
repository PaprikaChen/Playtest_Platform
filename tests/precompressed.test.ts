import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodePrecompressed, PrecompressedError } from "@/lib/precompressed";

describe("decodePrecompressed (Unity/Godot .br / .gz build files)", () => {
  const plain = Buffer.from("wasm bytes ".repeat(1000));

  it("decompresses .br and .gz and reports the inner extension", () => {
    expect(decodePrecompressed("Build/game.wasm.br", zlib.brotliCompressSync(plain), 1e6)).toEqual({ body: plain, ext: ".wasm" });
    expect(decodePrecompressed("Build/game.data.gz", zlib.gzipSync(plain), 1e6)).toEqual({ body: plain, ext: ".data" });
  });

  it("passes other files through untouched", () => {
    expect(decodePrecompressed("index.html", plain, 10)).toEqual({ body: plain, ext: ".html" });
  });

  it("refuses a file that inflates past the limit instead of exhausting memory", () => {
    const bomb = zlib.gzipSync(Buffer.alloc(5_000_000)); // ~5 KB on disk, 5 MB inflated
    expect(() => decodePrecompressed("x.data.gz", bomb, 1_000_000)).toThrow(PrecompressedError);
    expect(() => decodePrecompressed("x.data.gz", bomb, 1_000_000)).toThrow(/too large/);
  });

  it("rejects corrupt data with a clear error", () => {
    expect(() => decodePrecompressed("x.wasm.br", Buffer.from("not brotli"), 1e6)).toThrow(/Corrupt/);
  });
});
