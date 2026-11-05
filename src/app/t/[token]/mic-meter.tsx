"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Live microphone level from the recording stream's audio track (Web Audio
 * analyser, ~15 updates/s). Lets testers see that their voice is captured now
 * that live captions are off by default.
 */
export function useMicLevel(stream: MediaStream | null) {
  const [level, setLevel] = useState(0);
  const [silentForMs, setSilentForMs] = useState(0);
  const lastVoice = useRef(0);

  useEffect(() => {
    const track = stream?.getAudioTracks()[0];
    if (!track) return;
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    lastVoice.current = performance.now();
    const id = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const x of buf) sum += x * x;
      const rms = Math.sqrt(sum / buf.length);
      // Map roughly -50 dB..-10 dB to 0..1.
      const v = Math.min(1, Math.max(0, (20 * Math.log10(rms + 1e-8) + 50) / 40));
      setLevel(v);
      const now = performance.now();
      if (v > 0.35) lastVoice.current = now;
      setSilentForMs(now - lastVoice.current);
    }, 66);
    return () => { clearInterval(id); src.disconnect(); void ctx.close(); };
  }, [stream]);

  return { level, silentForMs };
}

export function MicMeter({ level }: { level: number }) {
  const bars = 5;
  return (
    <span className="inline-flex h-4 items-end gap-[2px]" aria-label={level > 0.35 ? "Microphone: hearing you" : "Microphone: quiet"}>
      {Array.from({ length: bars }, (_, i) => {
        const on = level > (i + 0.5) / bars;
        return <span key={i} className={`w-[3px] rounded-sm transition-all duration-75 ${on ? "bg-ok" : "bg-line"}`} style={{ height: `${30 + i * 17}%` }} />;
      })}
    </span>
  );
}
