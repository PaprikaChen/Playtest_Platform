"use client";
import { useEffect, useRef, useState } from "react";
import { fmtTime } from "@/lib/format";

/**
 * Plays one slice of the session recording (e.g. 5 s before → 5 s after a comment).
 * `poster` is a server-rendered frame at the moment; the video is only fetched on play.
 */
export function ClipPlayer({ src, startMs, endMs, momentMs, audioOnly, poster }: { src: string; startMs: number; endMs: number; momentMs: number; audioOnly?: boolean; poster?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"idle" | "playing" | "paused" | "error">("idle");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onTime = () => {
      const t = v.currentTime * 1000;
      setProgress(Math.min(1, Math.max(0, (t - startMs) / (endMs - startMs))));
      if (t >= endMs) { v.pause(); setState("paused"); }
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [startMs, endMs]);

  function toggle() {
    const v = ref.current;
    if (!v) return;
    if (state === "playing") { v.pause(); setState("paused"); return; }
    if (state === "idle" || v.currentTime * 1000 >= endMs - 50) v.currentTime = startMs / 1000;
    void v.play().then(() => setState("playing")).catch(() => setState("error"));
  }

  if (state === "error") return <div className="aspect-video w-full rounded-lg bg-background grid place-items-center text-xs text-muted">Recording unavailable</div>;
  return (
    <div className="group relative aspect-video w-full overflow-hidden rounded-lg bg-stage">
      <video
        ref={ref}
        src={src}
        preload="none"
        playsInline
        className={`h-full w-full object-contain ${audioOnly ? "opacity-0" : ""}`}
        onError={() => state !== "idle" && setState("error")}
      />
      {poster && state === "idle" && (
        // eslint-disable-next-line @next/next/no-img-element -- server-rendered frame from our own API
        <img src={poster} alt={`Frame at ${fmtTime(momentMs)}`} loading="lazy" className="absolute inset-0 h-full w-full object-contain" />
      )}
      {audioOnly && <div className="absolute inset-0 grid place-items-center text-white/60 text-xs">🎙 audio only</div>}
      <button type="button" onClick={toggle} aria-label={state === "playing" ? "Pause clip" : `Replay ${fmtTime(startMs)} to ${fmtTime(endMs)}`}
        className="absolute inset-0 grid place-items-center cursor-pointer">
        <span className={`grid size-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition ${state === "playing" ? "opacity-0 group-hover:opacity-100" : "opacity-100 group-hover:scale-105"}`}>
          {state === "playing" ? "❚❚" : "▶"}
        </span>
      </button>
      <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 num text-[11px] font-medium text-white">{fmtTime(momentMs)}</span>
      <span className="pointer-events-none absolute bottom-0 left-0 h-0.5 bg-white/80" style={{ width: `${progress * 100}%` }} />
    </div>
  );
}
