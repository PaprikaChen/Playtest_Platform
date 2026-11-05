import fs from "node:fs";

export interface TranscriptSegment { text: string; start_ms: number; end_ms: number }
export interface TranscriptResult { provider: string; placeholder: boolean; segments: TranscriptSegment[] }

/**
 * Post-session transcription of the full recording.
 * TRANSCRIBE_PROVIDER=assemblyai (needs ASSEMBLYAI_API_KEY) or "none".
 * Without a key we return no segments; live browser captions and typed
 * comments still reach the questionnaire.
 */
export async function transcribeRecording(filePath: string | null): Promise<TranscriptResult> {
  const provider = process.env.TRANSCRIBE_PROVIDER ?? (process.env.ASSEMBLYAI_API_KEY ? "assemblyai" : "none");
  if (provider !== "assemblyai" || !filePath || !fs.existsSync(filePath)) {
    return { provider: "none", placeholder: true, segments: [] };
  }
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
    body: JSON.stringify({ audio_url: upload_url, language_detection: true }),
  });
  if (!create.ok) throw new Error(`AssemblyAI transcript request failed: ${create.status}`);
  const { id } = (await create.json()) as { id: string };

  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`${base}/transcript/${id}`, { headers });
    const body = (await res.json()) as { status: string; error?: string };
    if (body.status === "error") throw new Error(`AssemblyAI error: ${body.error}`);
    if (body.status === "completed") {
      const sres = await fetch(`${base}/transcript/${id}/sentences`, { headers });
      const { sentences } = (await sres.json()) as { sentences: { text: string; start: number; end: number }[] };
      return {
        provider: "assemblyai",
        placeholder: false,
        segments: sentences.map((s) => ({ text: s.text, start_ms: s.start, end_ms: s.end })),
      };
    }
  }
  throw new Error("AssemblyAI transcription timed out.");
}
