"use client";
import { useEffect, useRef, useState } from "react";
import { fmtTime } from "./ui";

/**
 * Plays one slice of the session recording (e.g. 5 s before → 5 s after a comment).
 * Shows the frame at `momentMs` as a thumbnail until played.
 */
export function ClipPlayer({ src, startMs, endMs, momentMs, audioOnly }: { src: string; startMs: number; endMs: number; momentMs: number; audioOnly?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onMeta = () => { v.currentTime = momentMs / 1000; };
    const onTime = () => {
      if (v.currentTime * 1000 >= endMs) { v.pause(); setPlaying(false); }
    };
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("timeupdate", onTime);
    return () => { v.removeEventListener("loadedmetadata", onMeta); v.removeEventListener("timeupdate", onTime); };
  }, [momentMs, endMs]);

  function play() {
    const v = ref.current;
    if (!v) return;
    v.currentTime = startMs / 1000;
    void v.play().then(() => setPlaying(true)).catch(() => setError(true));
  }

  if (error) return <div className="text-xs text-muted">Recording unavailable.</div>;
  return (
    <div className="relative rounded-lg overflow-hidden bg-black/90 aspect-video w-full">
      <video ref={ref} src={src} preload="metadata" playsInline className={`w-full h-full object-contain ${audioOnly ? "opacity-0" : ""}`} onError={() => setError(true)} onPause={() => setPlaying(false)} />
      {audioOnly && <div className="absolute inset-0 grid place-items-center text-white/70 text-xs">🎙 audio only</div>}
      <button type="button" onClick={playing ? () => ref.current?.pause() : play}
        className="absolute inset-0 flex items-end justify-between p-2 text-white text-xs bg-gradient-to-t from-black/60 to-transparent opacity-90 hover:opacity-100">
        <span className="rounded bg-black/60 px-1.5 py-0.5 font-medium">{playing ? "❚❚ Pause" : `▶ Replay ${fmtTime(startMs)}–${fmtTime(endMs)}`}</span>
        <span className="rounded bg-black/60 px-1.5 py-0.5 font-mono">{fmtTime(momentMs)}</span>
      </button>
    </div>
  );
}
