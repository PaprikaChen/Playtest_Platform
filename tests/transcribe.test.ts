import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodePcm16k, groupWords, normalizeLanguage, transcribeRecording } from "@/lib/ai/transcribe";

const FIX = path.join(__dirname, "..", "e2e", "fixtures");

describe("groupWords", () => {
  const w = (text: string, s: number, e: number) => ({ text, start_ms: s, end_ms: e });

  it("splits on pauses and sentence punctuation", () => {
    const out = groupWords([w(" this", 0, 200), w(" jump", 250, 500), w(" is", 520, 600), w(" hard.", 620, 900), w(" the", 3000, 3200), w(" door", 3250, 3500)]);
    expect(out).toEqual([
      { text: "this jump is hard.", start_ms: 0, end_ms: 900 },
      { text: "the door", start_ms: 3000, end_ms: 3500 },
    ]);
  });

  it("caps very long segments", () => {
    const words = Array.from({ length: 40 }, (_, i) => w(" word", i * 500, i * 500 + 400));
    expect(groupWords(words, { maxMs: 5000 }).every((s) => s.end_ms - s.start_ms <= 5000)).toBe(true);
  });

  it("joins CJK without spaces", () => {
    expect(groupWords([w("這個跳躍太難了", 2140, 3620), w(",我一直掉下去。", 3620, 5120)])[0].text).toBe("這個跳躍太難了,我一直掉下去。");
  });

  it("normalises browser languages", () => {
    expect(normalizeLanguage("zh-CN")).toBe("zh");
    expect(normalizeLanguage("en_US")).toBe("en");
    expect(normalizeLanguage("")).toBeUndefined();
    expect(normalizeLanguage("not a lang")).toBeUndefined();
  });
});

/** Ground truth: speech onsets from signal energy (the fixtures have digital silence between phrases). */
function speechOnsets(pcm: Float32Array, minSilenceMs = 1000): number[] {
  const frame = 160; // 10 ms at 16 kHz
  const onsets: number[] = [];
  let silent = Infinity;
  for (let i = 0; i + frame <= pcm.length; i += frame) {
    let e = 0;
    for (let j = i; j < i + frame; j++) e += pcm[j] * pcm[j];
    const loud = Math.sqrt(e / frame) > 0.01;
    if (loud && silent >= minSilenceMs) onsets.push((i / 16000) * 1000);
    silent = loud ? 0 : silent + 10;
  }
  return onsets;
}

// Real model run (downloads ~80 MB once into .models/). Skip with SKIP_ASR=1.
describe.skipIf(process.env.SKIP_ASR === "1")("local Whisper transcription accuracy", () => {
  it("English: correct words, each phrase starts within 1 s of the real speech onset", { timeout: 300_000 }, async () => {
    const file = path.join(FIX, "speech.wav");
    const truth = speechOnsets(await decodePcm16k(file));
    const r = await transcribeRecording(file, "en-US");
    expect(r.provider).toBe("local");
    const text = r.segments.map((s) => s.text).join(" ").toLowerCase();
    for (const phrase of ["where to go after the first platform", "jump is way too hard", "controls feel a little floaty"]) expect(text).toContain(phrase);
    expect(r.segments).toHaveLength(truth.length);
    r.segments.forEach((s, i) => expect(Math.abs(s.start_ms - truth[i])).toBeLessThan(1000));
  });

  it("Chinese: transcribes Mandarin with timestamps within 1 s", { timeout: 300_000 }, async () => {
    const file = path.join(FIX, "speech-zh.wav");
    const truth = speechOnsets(await decodePcm16k(file));
    const r = await transcribeRecording(file, "zh-CN");
    const text = r.segments.map((s) => s.text).join("");
    expect(text).toMatch(/跳[跃躍]/);
    expect(text).toMatch(/[哪那][里裡]/);
    expect(Math.abs(r.segments[0].start_ms - truth[0])).toBeLessThan(1000);
  });
});
