"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { fmtTime } from "@/components/ui";
import type { Question, RecallPrompt, Utterance } from "@/lib/types";

type Q = Question & { answer: { text: string; rating: number | null } | null; prompts: (RecallPrompt & { used: boolean; quote: string; moment_ms: number })[] };

export function ReviewPlayer({ sessionId, hasRecording, audioOnly, utterances, questions }: { sessionId: string; hasRecording: boolean; audioOnly: boolean; utterances: Utterance[]; questions: Q[] }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [current, setCurrent] = useState(0);

  function seek(ms: number) {
    const v = video.current;
    if (!v) return;
    v.currentTime = ms / 1000;
    void v.play();
    v.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  async function remove() {
    if (!confirm("Delete this session's recording, transcript and answers now? This cannot be undone.")) return;
    const res = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
    if (res.ok) router.back();
  }

  const active = utterances.findLast((u) => u.start_ms <= current);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6 min-w-0">
        <div className="card p-0 overflow-hidden">
          {hasRecording ? (
            <video ref={video} src={`/api/sessions/${sessionId}/recording`} controls preload="metadata" className={`w-full bg-black ${audioOnly ? "h-14" : "aspect-video"}`}
              onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime * 1000)} />
          ) : (
            <div className="aspect-video grid place-items-center text-sm text-muted bg-background">No recording for this session (tester declined capture or it failed).</div>
          )}
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Questionnaire answers</h2>
          {questions.map((q, i) => (
            <div key={q.id} className="card space-y-2">
              <h3 className="font-medium"><span className="text-muted mr-1">{i + 1}.</span>{q.prompt}</h3>
              {q.type === "rating" && <p className="text-sm">Rating: <b>{q.answer?.rating ?? "—"}</b> / 5</p>}
              <p className="text-sm whitespace-pre-wrap">{q.answer?.text || <span className="text-muted">No answer</span>}</p>
              {q.prompts.length > 0 && (
                <div className="pt-2 border-t border-line space-y-1">
                  <p className="text-xs text-muted">Recall prompts shown for this question</p>
                  {q.prompts.map((p) => (
                    <button key={p.id} type="button" onClick={() => seek(p.replay_start_ms)} disabled={!hasRecording}
                      className="w-full text-left text-sm flex gap-2 items-baseline rounded px-1.5 py-1 hover:bg-background">
                      <span className="font-mono text-xs text-accent shrink-0">▶ {fmtTime(p.moment_ms)}</span>
                      <span className="italic truncate">“{p.quote}”</span>
                      <span className={`ml-auto pill shrink-0 ${p.state === "inserted" ? "bg-ok-soft text-ok" : p.state === "dismissed" ? "bg-background text-muted" : "bg-accent-soft text-accent"}`}>{p.state === "inserted" ? "used" : p.state}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      </div>

      <aside className="space-y-4">
        <div className="card p-0">
          <div className="px-4 py-3 border-b border-line flex justify-between items-baseline">
            <h2 className="h2">Timeline</h2>
            <span className="text-xs text-muted">{utterances.length} comments</span>
          </div>
          <ol className="max-h-[60vh] overflow-y-auto divide-y divide-line">
            {utterances.length === 0 && <li className="p-4 text-sm text-muted">No comments or transcript.</li>}
            {utterances.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => seek(Math.max(0, u.start_ms - 2000))} disabled={!hasRecording}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-background ${active?.id === u.id ? "bg-accent-soft/60" : ""}`}>
                  <div className="flex justify-between text-xs text-muted mb-0.5">
                    <span>{u.source === "typed" ? "✎ typed" : u.source === "voice" ? "🎙 transcript" : "🎙 live caption"}</span>
                    <span className="font-mono text-accent">{fmtTime(u.start_ms)}</span>
                  </div>
                  {u.text}
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="card space-y-2">
          <h2 className="h2">Data</h2>
          <a className="btn-ghost w-full" href={`/api/sessions/${sessionId}/export`}>Download session (.zip)</a>
          <button className="btn-danger w-full" onClick={remove}>Delete session now</button>
        </div>
      </aside>
    </div>
  );
}
