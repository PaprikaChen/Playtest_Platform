import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { validateBuildZip } from "@/lib/zip";

async function zipOf(files: Record<string, string>) {
  const z = new JSZip();
  for (const [k, v] of Object.entries(files)) z.file(k, v);
  return z.generateAsync({ type: "uint8array" });
}

describe("validateBuildZip", () => {
  it("accepts a root index.html", async () => {
    const r = await validateBuildZip(await zipOf({ "index.html": "<html>", "game.js": "1" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entryPath).toBe("index.html");
  });

  it("strips a single top-level folder", async () => {
    const r = await validateBuildZip(await zipOf({ "MyGame/index.html": "<html>", "MyGame/js/a.js": "1" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entries.map((e) => e.path).sort()).toEqual(["index.html", "js/a.js"]);
  });

  it("ignores macOS metadata", async () => {
    const r = await validateBuildZip(await zipOf({ "index.html": "x", "__MACOSX/._index.html": "x", ".DS_Store": "x" }));
    expect(r.ok && r.entries.length).toBe(1);
  });

  it("rejects missing index.html", async () => {
    const r = await validateBuildZip(await zipOf({ "game.js": "1" }));
    expect(r).toEqual({ ok: false, error: expect.stringContaining("index.html") });
  });

  it("rejects path traversal", async () => {
    const z = new JSZip();
    z.file("index.html", "x");
    z.file("../evil.js", "x", { createFolders: false });
    const r = await validateBuildZip(await z.generateAsync({ type: "uint8array" }));
    expect(r.ok).toBe(false);
  });

  it("rejects non-zip data", async () => {
    const r = await validateBuildZip(new TextEncoder().encode("not a zip"));
    expect(r.ok).toBe(false);
  });
});
