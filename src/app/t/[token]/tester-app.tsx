"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmtTime } from "@/lib/format";
import { MicMeter, useMicLevel } from "./mic-meter";
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
  // Off by default: the full recording is transcribed after the session; live captions send audio to the browser vendor.
  const [captions, setCaptions] = useState(false);
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
  const [panelOpen, setPanelOpen] = useState(true);
  const [canCaption, setCanCaption] = useState(false);
  useEffect(() => setCanCaption(speechRecognitionSupported()), []);

  const t0 = useRef(0);
  const draftStart = useRef<number | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const { level, silentForMs } = useMicLevel(liveStream);
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
      body: JSON.stringify({ token, testerName: name, consent, captureMode: cap.mode, idempotencyKey: idem.current, language: navigator.language }),
    });
    const body = await res.json();
    if (!res.ok) { cap.stream?.getTracks().forEach((t) => t.stop()); setStarting(false); return setError(body.error); }
    const sid = body.session.id as string;
    setSessionId(sid);
    setMode(cap.mode);
    stream.current = cap.stream;
    setLiveStream(cap.stream);
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
    const Option = ({ checked, onChange, title, desc, icon }: { checked: boolean; onChange: (v: boolean) => void; title: string; desc: React.ReactNode; icon: string }) => (
      <label className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${checked ? "border-accent/40 bg-accent-soft/50" : "border-line bg-surface"}`}>
        <span className="text-lg leading-none" aria-hidden>{icon}</span>
        <span className="flex-1">
          <span className="block text-sm font-medium">{title}</span>
          <span className="block text-xs text-muted mt-0.5">{desc}</span>
        </span>
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={title} />
      </label>
    );
    return (
      <main className="min-h-screen grid place-items-center p-4 sm:p-6">
        <div className="w-full max-w-lg">
          <div className="card p-6 sm:p-7 space-y-6">
            <header>
              <p className="tag">You&apos;re invited to playtest a game</p>
              <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight [overflow-wrap:anywhere]">{props.projectName}</h1>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="pill bg-accent-soft text-accent-strong">Build: {props.buildLabel}</span>
                {props.projectDescription && <span className="pill bg-background text-muted">Testing: {props.projectDescription}</span>}
              </div>
            </header>
            <ol className="grid grid-cols-2 gap-2 text-sm">
              <li className="rounded-xl bg-background p-3"><span className="text-xs font-semibold text-accent-strong">Step 1: Play</span><p className="mt-1">Think out loud while you play, or type quick notes.</p></li>
              <li className="rounded-xl bg-background p-3"><span className="text-xs font-semibold text-accent-strong">Step 2: Answer</span><p className="mt-1">{props.questionCount} short questions, with replays of what you said.</p></li>
            </ol>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">What gets recorded</legend>
              <Option icon="🖥" checked={wantScreen} onChange={setWantScreen} title="Screen" desc={<>When Chrome asks, choose <b>this tab</b>.</>} />
              <Option icon="🎙" checked={wantMic} onChange={setWantMic} title="Microphone" desc="Transcribed after the session so you can be reminded what you said." />
              {wantMic && canCaption && (
                <Option icon="💬" checked={captions} onChange={setCaptions} title="Live captions (optional)" desc="Shows captions while you play. Sends audio to your browser's speech service." />
              )}
              <p className="pt-1 text-xs text-muted">Only this game&apos;s developer can see your session. Everything is deleted automatically after 7 days, and nothing is filled in for you.</p>
            </fieldset>
            <div className="space-y-3">
              <div>
                <label className="label" htmlFor="tname">Your name or nickname</label>
                <input id="tname" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam" />
              </div>
              <label className="flex items-start gap-2.5 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I agree to the recording described above.</label>
              {error && <p className="text-sm text-bad">{error}</p>}
              <button className="btn-primary w-full py-3 text-[15px]" disabled={!consent || starting} onClick={start}>{starting ? "Waiting for screen & mic permission…" : "Start playtest"}</button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const hasMic = mode === "screen+mic" || mode === "mic";
  const quietTooLong = hasMic && recording && silentForMs > 90_000;
  return (
    <div className="h-screen flex flex-col lg:flex-row bg-stage">
      <section className="flex-1 min-h-0 flex flex-col">
        <div className="flex h-10 shrink-0 items-center gap-3 px-4 text-xs text-white/60">
          <span className="min-w-0 truncate">Game: <span className="font-medium text-white">{props.projectName}</span></span>
          <span className="hidden min-w-0 truncate md:inline">Build: <span className="text-white/80">{props.buildLabel}</span></span>
          <span className="ml-auto hidden sm:inline">Click the game to control it</span>
          {!panelOpen && (
            <span className="flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-white">
              <span className={`size-2 rounded-full ${recording ? "bg-rec animate-pulse" : "bg-white/40"}`} />
              <span className="num">{fmtTime(elapsed)}</span>
            </span>
          )}
          <button type="button" onClick={() => setPanelOpen(!panelOpen)} aria-expanded={panelOpen} aria-controls="notes-panel"
            className="rounded-md px-2 py-1 font-medium text-white/80 hover:bg-white/10 hover:text-white">{panelOpen ? "Hide notes" : "Show notes"}</button>
        </div>
        <iframe
          title="Game"
          src={props.gameUrl}
          // No allow-same-origin: game code runs in an opaque origin, isolated from the platform.
          sandbox="allow-scripts allow-pointer-lock"
          allow="autoplay; fullscreen; gamepad"
          className="flex-1 w-full border-0"
        />
      </section>
      <aside id="notes-panel" aria-hidden={!panelOpen} className={`w-full lg:w-[360px] shrink-0 bg-surface flex-col max-h-[50vh] lg:max-h-none lg:rounded-l-2xl overflow-hidden ${panelOpen ? "flex" : "hidden"}`}>
        <div className="px-4 pt-4 pb-3 border-b border-line space-y-2.5" aria-label="Recording status">
          <div className="flex items-center gap-2.5">
            <span className={`size-2.5 rounded-full ${recording ? "bg-rec animate-pulse" : "bg-line"}`} />
            <span className="text-sm font-semibold">{recording ? "Recording" : mode === "comments-only" ? "Comments only" : "Not recording"}</span>
            <span className="num text-sm text-muted" aria-label="Elapsed time">{fmtTime(elapsed)}</span>
            <span className="ml-auto flex items-center gap-2 text-xs text-muted">
              {hasMic && <span className="flex items-center gap-1.5" title="Microphone level">Mic <MicMeter level={level} /></span>}
              {mode !== "comments-only" && (
                <span title={`Uploaded ${upload.sent} part${upload.sent === 1 ? "" : "s"}`} className={upload.retrying ? "text-warn" : "text-ok"}>
                  {upload.retrying ? "Upload retrying" : upload.pending > 1 ? `Uploading ${upload.pending}` : "Upload OK"}
                </span>
              )}
            </span>
          </div>
          <p className="text-xs text-muted">
            {mode === "comments-only" ? "No screen or mic capture. Type your thoughts below." : mode === "screen" ? "Screen recorded. Type your thoughts below." : hasMic && level > 0.35 ? "Hearing you. Keep thinking out loud." : "Think out loud: what you notice, expect, or find confusing."}
          </p>
          {quietTooLong && <p className="text-xs rounded-lg bg-accent-soft text-accent-strong p-2">It&apos;s been quiet for a bit. What are you thinking right now?</p>}
          {captionStatus?.s === "unavailable" && <p className="text-xs text-warn">Live captions unavailable ({captionStatus.detail}). Your voice is still recorded.</p>}
          {warnings.map((w, i) => <p key={i} className="text-xs rounded-lg bg-warn-soft text-warn p-2">{w}</p>)}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <div className="flex items-baseline gap-2"><h2 className="text-sm font-semibold">Your notes</h2><span className="tag">pinned to the moment</span></div>
          {comments.length === 0 && (
            <div className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
              <p className="font-medium text-foreground">Nothing yet</p>
              <p className="mt-1">{hasMic ? "Speak, or type below. What you say is transcribed after the session." : "Type below whenever something stands out."}</p>
            </div>
          )}
          {comments.map((c) => (
            <div key={c.id} className="text-sm rounded-lg bg-background px-3 py-2">
              <div className="flex justify-between text-xs text-muted mb-0.5">
                <span>{c.source === "typed" ? "Typed" : "Said"}</span>
                <span className="num">{fmtTime(c.start_ms)}{c.state === "saving" ? ", saving" : c.state === "failed" ? ", will retry" : ""}</span>
              </div>
              {c.text}
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-line space-y-2.5">
          <label htmlFor="note" className="flex items-baseline gap-2"><span className="text-sm font-semibold">Add a note</span><span className="tag">timestamped when you start typing</span></label>
          <textarea
            id="note" className="input resize-none" rows={2} value={draft} placeholder="Type a comment, press Enter"
            onChange={(e) => { if (draftStart.current === null && e.target.value) draftStart.current = now(); if (!e.target.value) draftStart.current = null; setDraft(e.target.value); }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
          />
          <p className="text-[11px] text-muted"><span className="kbd">Enter</span> saves the note. Click the game to keep playing.</p>
          <button className="btn-primary w-full py-2.5" disabled={stage === "finishing"} onClick={finish}>
            {stage === "finishing" ? finishMsg || "Finishing…" : "Finish and answer questions"}
          </button>
        </div>
      </aside>
    </div>
  );
}
