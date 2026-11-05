import fs from "node:fs";
import path from "node:path";
import { ffmpeg } from "../media";

export interface TranscriptSegment { text: string; start_ms: number; end_ms: number }
export interface TranscriptResult { provider: string; placeholder: boolean; segments: TranscriptSegment[] }
export interface Word { text: string; start_ms: number; end_ms: number }

/**
 * Post-session transcription of the whole recording, with word-level timestamps
 * grouped into sentence-like segments (so replay can start within ~1 s of speech).
 *
 * TRANSCRIBE_PROVIDER:
 *   local      Whisper (onnx-community/whisper-base_timestamped) running in-process. Free, private, no key. Default.
 *   openai     OpenAI whisper-1 with word timestamps (OPENAI_API_KEY).
 *   assemblyai AssemblyAI (ASSEMBLYAI_API_KEY).
 *   none       Skip; typed comments and live captions only.
 */
export function configuredTranscriber(): string {
  if (process.env.TRANSCRIBE_PROVIDER) return process.env.TRANSCRIBE_PROVIDER;
  if (process.env.ASSEMBLYAI_API_KEY) return "assemblyai";
  return "local";
}

export async function transcribeRecording(filePath: string | null, language?: string | null): Promise<TranscriptResult> {
  const provider = configuredTranscriber();
  if (provider === "none" || !filePath || !fs.existsSync(filePath)) return { provider: "none", placeholder: true, segments: [] };
  const lang = normalizeLanguage(language);
  const words =
    provider === "local" ? await transcribeLocal(filePath, lang)
    : provider === "openai" ? await transcribeOpenAI(filePath, lang)
    : provider === "assemblyai" ? await transcribeAssemblyAI(filePath, lang)
    : (() => { throw new Error(`Unknown TRANSCRIBE_PROVIDER: ${provider}`); })();
  return { provider, placeholder: false, segments: groupWords(words) };
}

/** "zh-CN" -> "zh". Unknown or empty -> undefined (provider auto-detects or defaults). */
export function normalizeLanguage(lang?: string | null): string | undefined {
  const primary = lang?.toLowerCase().split(/[-_]/)[0];
  return primary && /^[a-z]{2}$/.test(primary) ? primary : undefined;
}

/**
 * Group words into segments: split on a pause ≥ 700 ms, on sentence-ending
 * punctuation, or once a segment reaches 12 s. Pure function, unit tested.
 */
export function groupWords(words: Word[], { gapMs = 700, maxMs = 12000 } = {}): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  let cur: Word[] = [];
  const cjk = (s: string) => /[　-鿿＀-￯]/.test(s);
  const flush = () => {
    if (!cur.length) return;
    const text = cur.reduce((acc, w) => {
      const t = w.text.trim();
      // No spaces between CJK tokens; spaces between other words.
      return !acc ? t : cjk(t) || cjk(acc.slice(-1)) || /^[,.!?;:，。！？；：]/.test(t) ? acc + t : `${acc} ${t}`;
    }, "").trim();
    if (text) out.push({ text, start_ms: cur[0].start_ms, end_ms: cur[cur.length - 1].end_ms });
    cur = [];
  };
  for (const w of words) {
    if (!w.text.trim()) continue;
    const prev = cur[cur.length - 1];
    if (prev && (w.start_ms - prev.end_ms >= gapMs || w.end_ms - cur[0].start_ms > maxMs)) flush();
    cur.push(w);
    if (/[.!?。！？]$/.test(w.text.trim())) flush();
  }
  flush();
  return out;
}

// ---------- audio decoding (ffmpeg-static; no system ffmpeg needed) ----------
/** Decode any recording (WebM/Opus, WAV…) to 16 kHz mono float32 PCM. */
export async function decodePcm16k(filePath: string): Promise<Float32Array> {
  const buf = await ffmpeg(["-i", filePath, "-vn", "-f", "f32le", "-ac", "1", "-ar", "16000", "-"]);
  // Copy into an aligned buffer: Float32Array needs a 4-byte-aligned offset.
  return new Float32Array(new Uint8Array(buf).buffer, 0, Math.floor(buf.byteLength / 4));
}

// ---------- local Whisper ----------
type Asr = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ chunks?: { text: string; timestamp: [number, number | null] }[] }>;
const globalForAsr = globalThis as unknown as { __playtestAsr?: Promise<Asr> };

function localAsr(): Promise<Asr> {
  if (!globalForAsr.__playtestAsr) {
    globalForAsr.__playtestAsr = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = process.env.PLAYTEST_MODEL_DIR ?? path.join(process.cwd(), ".models");
      const model = process.env.LOCAL_WHISPER_MODEL ?? "onnx-community/whisper-base_timestamped";
      return (await pipeline("automatic-speech-recognition", model, { dtype: "q8" })) as unknown as Asr;
    })();
    globalForAsr.__playtestAsr.catch(() => { globalForAsr.__playtestAsr = undefined; });
  }
  return globalForAsr.__playtestAsr;
}

const LANG_NAMES: Record<string, string> = { en: "english", zh: "chinese", ja: "japanese", ko: "korean", es: "spanish", fr: "french", de: "german" };

async function transcribeLocal(filePath: string, lang?: string): Promise<Word[]> {
  const [asr, audio] = await Promise.all([localAsr(), decodePcm16k(filePath)]);
  if (audio.length < 1600) return []; // < 0.1 s of audio
  const out = await asr(audio, {
    return_timestamps: "word",
    chunk_length_s: 30,
    stride_length_s: 5,
    ...(lang && LANG_NAMES[lang] ? { language: LANG_NAMES[lang], task: "transcribe" } : {}),
  });
  return (out.chunks ?? []).map((c) => ({
    text: c.text,
    start_ms: Math.round(c.timestamp[0] * 1000),
    end_ms: Math.round((c.timestamp[1] ?? c.timestamp[0]) * 1000),
  }));
}

// ---------- OpenAI ----------
async function transcribeOpenAI(filePath: string, lang?: string): Promise<Word[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set.");
  const form = new FormData();
  form.set("file", new Blob([fs.readFileSync(filePath)], { type: "audio/webm" }), path.basename(filePath));
  form.set("model", process.env.TRANSCRIBE_MODEL ?? "whisper-1");
  form.set("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  if (lang) form.set("language", lang);
  const res = await fetch(`${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/audio/transcriptions`, {
    method: "POST", headers: { authorization: `Bearer ${key}` }, body: form,
  });
  if (!res.ok) throw new Error(`OpenAI transcription failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { words?: { word: string; start: number; end: number }[] };
  return (body.words ?? []).map((w) => ({ text: w.word, start_ms: Math.round(w.start * 1000), end_ms: Math.round(w.end * 1000) }));
}

// ---------- AssemblyAI ----------
async function transcribeAssemblyAI(filePath: string, lang?: string): Promise<Word[]> {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) throw new Error("ASSEMBLYAI_API_KEY is not set.");
  const base = "https://api.assemblyai.com/v2";
  const headers = { authorization: key };
  const up = await fetch(`${base}/upload`, { method: "POST", headers, body: fs.readFileSync(filePath) });
  if (!up.ok) throw new Error(`AssemblyAI upload failed: ${up.status}`);
  const { upload_url } = (await up.json()) as { upload_url: string };
  const create = await fetch(`${base}/transcript`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ audio_url: upload_url, ...(lang ? { language_code: lang } : { language_detection: true }) }),
  });
  if (!create.ok) throw new Error(`AssemblyAI transcript request failed: ${create.status}`);
  const { id } = (await create.json()) as { id: string };
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`${base}/transcript/${id}`, { headers });
    const body = (await res.json()) as { status: string; error?: string; words?: { text: string; start: number; end: number }[] };
    if (body.status === "error") throw new Error(`AssemblyAI error: ${body.error}`);
    if (body.status === "completed") return (body.words ?? []).map((w) => ({ text: w.text, start_ms: w.start, end_ms: w.end }));
  }
  throw new Error("AssemblyAI transcription timed out.");
}
