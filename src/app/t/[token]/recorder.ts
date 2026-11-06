"use client";

export type CaptureMode = "screen+mic" | "screen" | "mic" | "comments-only";

export interface CaptureResult {
  stream: MediaStream | null;
  mode: CaptureMode;
  warnings: string[];
}

/** Ask for screen + mic separately so one denial doesn't block the other. */
export async function requestCapture(wantScreen: boolean, wantMic: boolean): Promise<CaptureResult> {
  const warnings: string[] = [];
  let screen: MediaStream | null = null;
  let mic: MediaStream | null = null;
  if (wantScreen) {
    try {
      screen = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15 },
        audio: false,
        // Chrome hints: default to sharing this tab, where the game runs.
        preferCurrentTab: true,
        selfBrowserSurface: "include",
      } as DisplayMediaStreamOptions);
    } catch {
      warnings.push("Screen recording was not allowed, so no video will be saved.");
    }
  }
  if (wantMic) {
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      warnings.push("Microphone was not allowed, so only typed comments will be saved.");
    }
  }
  const tracks = [...(screen?.getVideoTracks() ?? []), ...(mic?.getAudioTracks() ?? [])];
  const mode: CaptureMode = screen && mic ? "screen+mic" : screen ? "screen" : mic ? "mic" : "comments-only";
  return { stream: tracks.length ? new MediaStream(tracks) : null, mode, warnings };
}

export function pickMime(hasVideo: boolean): string {
  const candidates = hasVideo
    ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    : ["audio/webm;codecs=opus", "audio/webm"];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

async function sha256(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface UploadStats { sent: number; pending: number; retrying: boolean; bytes: number }

/**
 * Sequential uploader with retries. Each chunk keeps its sequence number, so a
 * retried upload overwrites rather than duplicates on the server.
 */
export class ChunkUploader {
  private queue: { seq: number; blob: Blob }[] = [];
  private running = false;
  private idle: (() => void)[] = [];
  private consecutiveFailures = 0;
  stats: UploadStats = { sent: 0, pending: 0, retrying: false, bytes: 0 };
  nextSeq = 0;

  constructor(private sessionId: string, private token: string, private onChange: (s: UploadStats) => void) {}

  private emit() {
    this.stats.pending = this.queue.length;
    this.stats.retrying = this.consecutiveFailures > 0;
    this.onChange({ ...this.stats });
  }

  push(blob: Blob) {
    if (!blob.size) return;
    this.queue.push({ seq: this.nextSeq++, blob });
    this.emit();
    void this.pump();
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length) {
      const item = this.queue[0];
      try {
        const buf = await item.blob.arrayBuffer();
        const res = await fetch(`/api/sessions/${this.sessionId}/recording-chunks?seq=${item.seq}`, {
          method: "POST",
          headers: { "x-invite-token": this.token, "x-checksum": await sha256(buf), "content-type": "application/octet-stream" },
          body: buf,
        });
        if (!res.ok) throw new Error(String(res.status));
        this.queue.shift();
        this.stats.sent++;
        this.stats.bytes += buf.byteLength;
        this.consecutiveFailures = 0; // backoff restarts from 1 s after any success
      } catch {
        this.consecutiveFailures++;
        this.emit();
        await new Promise((r) => setTimeout(r, Math.min(8000, 1000 * 2 ** Math.min(this.consecutiveFailures - 1, 3))));
      }
      this.emit();
    }
    this.running = false;
    this.idle.splice(0).forEach((f) => f());
  }

  flush(): Promise<void> {
    if (!this.running && !this.queue.length) return Promise.resolve();
    return new Promise((r) => this.idle.push(r));
  }
}

/** Optional live captions via the browser's speech recognition (Chrome). */
type SR = {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start(): void; stop(): void;
};
export function speechRecognitionSupported() {
  return typeof window !== "undefined" && Boolean((window as unknown as Record<string, unknown>).webkitSpeechRecognition || (window as unknown as Record<string, unknown>).SpeechRecognition);
}

export type CaptionStatus = "listening" | "hearing" | "unavailable";

/**
 * Live captions. Returns stop(), which resolves after the recogniser has
 * delivered its last final result (or 2 s), so no phrase is lost at Finish.
 * Persistent errors (network, blocked service) stop retrying and report "unavailable".
 */
export function startLiveCaptions(
  now: () => number,
  onFinal: (text: string, startMs: number, endMs: number) => void,
  onStatus: (s: CaptionStatus, detail?: string) => void = () => {},
  lang?: string,
): () => Promise<void> {
  const W = window as unknown as Record<string, new () => SR>;
  const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  if (!Ctor) { onStatus("unavailable", "not supported in this browser"); return async () => {}; }
  let stopped = false;
  let phraseStart: number | null = null;
  let quickFailures = 0;
  let startedAt = 0;
  let ended: (() => void) | null = null;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = lang || navigator.language || "en-US";
  const begin = () => { startedAt = Date.now(); try { rec.start(); } catch { /* already started */ } };
  rec.onresult = (e) => {
    quickFailures = 0;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      // Chrome emits the first interim result ~0.5–1.5 s after speech begins.
      if (phraseStart === null) { phraseStart = Math.max(0, now() - 1000); onStatus("hearing"); }
      if (r.isFinal) {
        const text = r[0].transcript.trim();
        if (text) onFinal(text, phraseStart, now());
        phraseStart = null;
        onStatus("listening");
      }
    }
  };
  rec.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "aborted") return; // normal: silence or our own stop()
    if (e.error === "not-allowed" || e.error === "service-not-allowed") { stopped = true; onStatus("unavailable", e.error); return; }
    quickFailures++;
    if (quickFailures >= 3) { stopped = true; onStatus("unavailable", e.error); }
  };
  rec.onend = () => {
    if (stopped) { ended?.(); return; }
    // Back off if the recogniser keeps ending immediately.
    const delay = Date.now() - startedAt < 1000 ? 1000 : 0;
    setTimeout(begin, delay);
  };
  begin();
  onStatus("listening");
  return () => new Promise<void>((resolve) => {
    if (stopped) return resolve();
    stopped = true;
    ended = resolve;
    setTimeout(resolve, 2000);
    try { rec.stop(); } catch { resolve(); }
  });
}
