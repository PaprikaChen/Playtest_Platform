"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmtTime } from "@/components/ui";
import { ChunkUploader, pickMime, requestCapture, speechRecognitionSupported, startLiveCaptions, type CaptionStatus, type CaptureMode, type UploadStats } from "./recorder";

type Stage = "intro" | "playing" | "finishing";
interface Comment { id: number; text: string; start_ms: number; end_ms: number; source: "typed" | "voice-live"; state: "saving" | "saved" | "failed" }

export function TesterApp(props: { token: string; projectName: string; projectDescription: string; buildLabel: string; gameUrl: string; questionCount: number }) {
  const { token } = props;
  const [stage, setStage] = useState<Stage>("intro");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [wantScreen, setWantScreen] = useState(true);
  const [wantMic, setWantMic] = useState(true);
  const [captions, setCaptions] = useState(true);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [mode, setMode] = useState<CaptureMode>("comments-only");
  const [elapsed, setElapsed] = useState(0);
  const [upload, setUpload] = useState<UploadStats>({ sent: 0, pending: 0, retrying: false, bytes: 0 });
  const [starting, setStarting] = useState(false);
  const [captionStatus, setCaptionStatus] = useState<{ s: CaptionStatus; detail?: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [finishMsg, setFinishMsg] = useState("");
  const [canCaption, setCanCaption] = useState(false);
  useEffect(() => setCanCaption(speechRecognitionSupported()), []);

  const t0 = useRef(0);
  const draftStart = useRef<number | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const uploader = useRef<ChunkUploader | null>(null);
  const stopCaptions = useRef<() => Promise<void>>(async () => {});
  // Source of truth for comments (state is only for rendering), plus in-flight saves.
  const commentsRef = useRef<Comment[]>([]);
  const inflight = useRef(new Set<Promise<unknown>>());
  const nextCommentId = useRef(0);
  const idem = useRef(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()));
  const stopped = useRef(false);
  const now = useCallback(() => Math.round(performance.now() - t0.current), []);

  useEffect(() => {
    if (stage !== "playing") return;
    const id = setInterval(() => setElapsed(now()), 500);
    return () => clearInterval(id);
  }, [stage, now]);

  // Warn before leaving mid-session.
  useEffect(() => {
    if (stage !== "playing" && stage !== "finishing") return;
    const h = (e: BeforeUnloadEvent) => { if (!stopped.current) e.preventDefault(); };
    addEventListener("beforeunload", h);
    return () => removeEventListener("beforeunload", h);
  }, [stage]);

  const postComments = useCallback(async (sid: string, items: Comment[]) => {
    const res = await fetch(`/api/sessions/${sid}/comments`, {
      method: "POST", headers: { "content-type": "application/json", "x-invite-token": token },
      body: JSON.stringify({ items: items.map((c) => ({ text: c.text, start_ms: c.start_ms, end_ms: c.end_ms, source: c.source })) }),
    });
    return res.ok;
  }, [token]);

  const setCommentState = (id: number, state: Comment["state"]) => {
    commentsRef.current = commentsRef.current.map((c) => (c.id === id ? { ...c, state } : c));
    setComments(commentsRef.current);
  };

  const addComment = useCallback((c: Omit<Comment, "state" | "id">, sid: string) => {
    const item: Comment = { ...c, id: nextCommentId.current++, state: "saving" };
    commentsRef.current = [...commentsRef.current, item];
    setComments(commentsRef.current);
    const p = postComments(sid, [item]).catch(() => false).then((ok) => setCommentState(item.id, ok ? "saved" : "failed"));
    inflight.current.add(p);
    void p.finally(() => inflight.current.delete(p));
  }, [postComments]);

  async function start() {
    if (starting) return;
    setStarting(true);
    setError("");
    const cap = await requestCapture(wantScreen, wantMic);
    setWarnings(cap.warnings);
    const res = await fetch("/api/sessions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, testerName: name, consent, captureMode: cap.mode, idempotencyKey: idem.current }),
    });
    const body = await res.json();
    if (!res.ok) { cap.stream?.getTracks().forEach((t) => t.stop()); setStarting(false); return setError(body.error); }
    const sid = body.session.id as string;
    setSessionId(sid);
    setMode(cap.mode);
    stream.current = cap.stream;
    t0.current = performance.now();

    if (cap.stream) {
      const mime = pickMime(cap.stream.getVideoTracks().length > 0);
      const rec = new MediaRecorder(cap.stream, mime ? { mimeType: mime, videoBitsPerSecond: 1_500_000 } : undefined);
      uploader.current = new ChunkUploader(sid, token, setUpload);
      rec.ondataavailable = (e) => uploader.current?.push(e.data);
      rec.onstart = () => { t0.current = performance.now(); setRecording(true); };
      rec.onstop = () => setRecording(false);
      // If the tester stops sharing, keep recording the mic: MediaRecorder continues
      // with the remaining audio track and the video simply freezes on the last frame.
      cap.stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setWarnings((w) => [...w, cap.mode === "screen" ? "Screen sharing stopped, so the rest of the session has no video. Typed comments still work." : "Screen sharing stopped. Your voice is still being recorded and comments still work."]);
      });
      rec.start(5000);
      recorder.current = rec;
    }
    if (captions && cap.mode.includes("mic") && speechRecognitionSupported()) {
      stopCaptions.current = startLiveCaptions(
        now,
        (text, s, e) => addComment({ text, start_ms: s, end_ms: e, source: "voice-live" }, sid),
        (st, detail) => setCaptionStatus({ s: st, detail }),
      );
    }
    setStage("playing");
  }

  function submitComment() {
    const text = draft.trim();
    if (!text) return;
    const t = draftStart.current ?? now();
    addComment({ text, start_ms: t, end_ms: t, source: "typed" }, sessionId);
    setDraft("");
    draftStart.current = null;
  }

  async function finish() {
    setStage("finishing");
    const durationMs = now();
    // Wait for the recogniser's last phrase so nothing said right before Finish is lost.
    setFinishMsg("Saving your last comments…");
    await stopCaptions.current();
    const rec = recorder.current;
    if (rec && rec.state !== "inactive") {
      setFinishMsg("Saving the last part of the recording…");
      await new Promise<void>((r) => { rec.addEventListener("stop", () => r(), { once: true }); rec.stop(); });
    }
    stream.current?.getTracks().forEach((t) => t.stop());
    if (uploader.current) { setFinishMsg("Uploading recording…"); await uploader.current.flush(); }
    // Let in-flight saves settle, then retry only the ones that actually failed (no duplicates).
    await Promise.allSettled([...inflight.current]);
    const failed = commentsRef.current.filter((c) => c.state === "failed");
    if (failed.length && (await postComments(sessionId, failed).catch(() => false))) failed.forEach((c) => setCommentState(c.id, "saved"));
    setFinishMsg("Preparing your questionnaire…");
    const res = await fetch(`/api/sessions/${sessionId}/complete`, {
      method: "POST", headers: { "content-type": "application/json", "x-invite-token": token },
      body: JSON.stringify({ chunkCount: uploader.current?.nextSeq ?? 0, durationMs, mime: rec?.mimeType }),
    });
    if (!res.ok) { setFinishMsg("Could not finish the session. Check your connection and retry."); setStage("playing"); return; }
    stopped.current = true;
    window.location.replace(`/t/${token}/survey/${sessionId}`);
  }

  if (stage === "intro") {
    return (
      <main className="min-h-screen grid place-items-center p-6">
        <div className="card max-w-lg w-full space-y-5">
          <div>
            <p className="text-xs text-muted">You&apos;re invited to playtest</p>
            <h1 className="text-2xl font-semibold tracking-tight">{props.projectName}</h1>
            <p className="text-sm text-muted">{props.buildLabel}{props.projectDescription ? ` · ${props.projectDescription}` : ""}</p>
          </div>
          <ol className="text-sm space-y-1.5 list-decimal list-inside">
            <li>Play in your browser. Think out loud, or type comments whenever something stands out.</li>
            <li>When you&apos;re done, answer {props.questionCount} short questions. We&apos;ll remind you of what you said, and you can replay those moments.</li>
          </ol>
          <div className="rounded-lg bg-background p-3 space-y-2 text-sm">
            <p className="font-medium">What gets recorded</p>
            <label className="flex gap-2"><input type="checkbox" checked={wantScreen} onChange={(e) => setWantScreen(e.target.checked)} /> Screen (pick <b>this tab</b> when asked)</label>
            <label className="flex gap-2"><input type="checkbox" checked={wantMic} onChange={(e) => setWantMic(e.target.checked)} /> Microphone</label>
            {wantMic && canCaption && (
              <label className="flex gap-2 text-muted"><input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} /> Show live captions of what I say (uses the browser&apos;s speech service)</label>
            )}
            <p className="text-xs text-muted">Only the developer of this game can see your session. Recordings, transcript and answers are deleted automatically after 7 days. Nothing is filled in for you.</p>
          </div>
          <div>
            <label className="label" htmlFor="tname">Your name or nickname</label>
            <input id="tname" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam" />
          </div>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I agree to the recording described above.</label>
          {error && <p className="text-sm text-bad">{error}</p>}
          <button className="btn-primary w-full py-2.5" disabled={!consent || starting} onClick={start}>{starting ? "Waiting for screen & mic permission…" : "Start playtest"}</button>
        </div>
      </main>
    );
  }

  return (
    <div className="h-screen flex flex-col lg:flex-row">
      <section className="flex-1 min-h-0 bg-[#0f1220] flex flex-col">
        <iframe
          title="Game"
          src={props.gameUrl}
          // No allow-same-origin: game code runs in an opaque origin, isolated from the platform.
          sandbox="allow-scripts allow-pointer-lock"
          allow="autoplay; fullscreen; gamepad"
          className="flex-1 w-full border-0"
        />
      </section>
      <aside className="w-full lg:w-[340px] shrink-0 border-l border-line bg-surface flex flex-col max-h-[50vh] lg:max-h-none">
        <div className="p-4 border-b border-line space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className={`size-2.5 rounded-full ${recording ? "bg-bad animate-pulse" : "bg-muted"}`} />
            <span className="font-medium">{recording ? "Recording" : mode === "comments-only" ? "Comments only" : "Not recording"}</span>
            <span className="ml-auto font-mono text-muted">{fmtTime(elapsed)}</span>
          </div>
          <p className="text-xs text-muted">
            {mode === "comments-only" ? "No screen or mic capture." : `Mode: ${mode} · uploaded ${upload.sent} part${upload.sent === 1 ? "" : "s"}`}
            {upload.pending > 0 && ` · ${upload.pending} waiting`}
            {upload.retrying && " · connection problem, retrying…"}
          </p>
          {captionStatus && (
            <p className={`text-xs ${captionStatus.s === "unavailable" ? "text-warn" : "text-muted"}`}>
              {captionStatus.s === "hearing" ? "🎙 Hearing you…" : captionStatus.s === "listening" ? "🎙 Live captions on: speak any time" : `🎙 Live captions unavailable (${captionStatus.detail}). Your voice is still recorded.`}
            </p>
          )}
          {warnings.map((w, i) => <p key={i} className="text-xs rounded bg-warn-soft text-warn p-2">{w}</p>)}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {comments.length === 0 && <p className="text-sm text-muted">Say what you&apos;re thinking, or type a note below. Each note is pinned to this moment in the recording.</p>}
          {comments.map((c) => (
            <div key={c.id} className="text-sm rounded-lg bg-background p-2">
              <div className="flex justify-between text-xs text-muted mb-0.5">
                <span>{c.source === "typed" ? "✎ typed" : "🎙 said"}</span>
                <span className="font-mono">{fmtTime(c.start_ms)}{c.state === "saving" ? " · saving" : c.state === "failed" ? " · will retry" : ""}</span>
              </div>
              {c.text}
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-line space-y-2">
          <textarea
            className="input" rows={2} value={draft} placeholder="Type a comment, press Enter"
            onChange={(e) => { if (draftStart.current === null && e.target.value) draftStart.current = now(); if (!e.target.value) draftStart.current = null; setDraft(e.target.value); }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
          />
          <p className="text-[11px] text-muted">Timestamp is taken when you start typing. Click the game to return control to it.</p>
          <button className="btn-primary w-full" disabled={stage === "finishing"} onClick={finish}>
            {stage === "finishing" ? finishMsg || "Finishing…" : "I'm done playing → questionnaire"}
          </button>
        </div>
      </aside>
    </div>
  );
}
