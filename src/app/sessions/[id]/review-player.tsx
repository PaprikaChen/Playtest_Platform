"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { fmtTime } from "@/lib/format";
import { Panel } from "@/components/ui";
import type { Question, RecallPrompt, Utterance } from "@/lib/types";

type Q = Question & { answer: { text: string; rating: number | null } | null; prompts: (RecallPrompt & { used: boolean; quote: string; moment_ms: number })[] };

export function ReviewPlayer({ sessionId, projectId, hasRecording, audioOnly, durationMs, utterances, questions }: { sessionId: string; projectId: string; hasRecording: boolean; audioOnly: boolean; durationMs: number; utterances: Utterance[]; questions: Q[] }) {
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
    // Go to the game page explicitly: router.back() leaves the app when the review was opened from a link.
    if (res.ok) router.push(`/projects/${projectId}`);
  }

  const active = utterances.findLast((u) => u.start_ms <= current);
  const kind = (u: Utterance) => (u.source === "typed" ? "Typed" : u.source === "voice" ? "Spoken" : "Live caption");
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
        <Panel flush title="Recording" tag={audioOnly ? "voice only" : "screen + voice, one timeline"}>
          {hasRecording ? (
            <video ref={video} src={`/api/sessions/${sessionId}/recording`} controls preload="metadata" className={`w-full bg-stage ${audioOnly ? "h-14" : "aspect-video"}`}
              onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime * 1000)} />
          ) : (
            <div className="grid aspect-video place-items-center bg-background text-sm text-muted">No recording: the tester turned capture off, or it failed</div>
          )}
          {durationMs > 0 && utterances.length > 0 && (
            <div className="border-t border-line px-5 py-4">
              <div className="mb-2 flex items-baseline gap-3">
                <h3 className="text-sm font-semibold">Moments</h3>
                <span className="tag">click to jump</span>
                <span className="ml-auto flex gap-3 text-xs text-muted">
                  <span className="flex items-center gap-1"><i className="inline-block size-2 rounded-full bg-accent" />Spoken</span>
                  <span className="flex items-center gap-1"><i className="inline-block size-2 rounded-full bg-warn" />Typed</span>
                </span>
              </div>
              <div className="relative h-8 rounded-lg bg-background" role="list" aria-label="Moments on the timeline">
                <div className="absolute inset-y-0 left-0 rounded-lg bg-accent/10" style={{ width: `${Math.min(100, (current / durationMs) * 100)}%` }} />
                {utterances.map((u) => (
                  <button key={u.id} type="button" role="listitem" title={`${fmtTime(u.start_ms)} ${kind(u)}: ${u.text}`} aria-label={`${fmtTime(u.start_ms)} ${kind(u)}: ${u.text}`}
                    onClick={() => seek(Math.max(0, u.start_ms - 2000))} disabled={!hasRecording}
                    className={`absolute top-1.5 h-5 w-2 -translate-x-1/2 rounded-full transition-transform hover:scale-125 ${u.source === "typed" ? "bg-warn" : "bg-accent"} ${active?.id === u.id ? "ring-2 ring-foreground/40" : ""}`}
                    style={{ left: `${Math.min(99.5, (u.start_ms / durationMs) * 100)}%` }} />
                ))}
              </div>
              <div className="num mt-1 flex justify-between text-[11px] text-muted"><span>0:00</span><span>{fmtTime(durationMs)}</span></div>
            </div>
          )}
        </Panel>

        <Panel title="Answers" tag="questionnaire responses">
          <ol className="space-y-5">
            {questions.map((q, i) => (
              <li key={q.id} className="space-y-2">
                <h3 className="flex gap-2.5 text-[15px] font-medium"><span className="num text-muted">{i + 1}</span>{q.prompt}</h3>
                <div className="space-y-2 pl-6">
                  {q.type === "rating" && (
                    <p className="flex items-center gap-1" aria-label={`Rating ${q.answer?.rating ?? "none"} of 5`}>
                      {[1, 2, 3, 4, 5].map((n) => <span key={n} className={`h-2 w-6 rounded-full ${q.answer?.rating && n <= q.answer.rating ? "bg-accent" : "bg-line"}`} />)}
                      <span className="num ml-2 text-sm font-medium">{q.answer?.rating ?? "–"} / 5</span>
                    </p>
                  )}
                  <p className="whitespace-pre-wrap text-sm">{q.answer?.text || <span className="text-muted">No answer</span>}</p>
                  {q.prompts.length > 0 && (
                    <div className="rounded-xl bg-background p-2">
                      <p className="px-1.5 pb-1 text-xs text-muted">Reminders shown</p>
                      {q.prompts.map((p) => (
                        <button key={p.id} type="button" onClick={() => seek(p.replay_start_ms)} disabled={!hasRecording}
                          className="flex w-full items-baseline gap-2 rounded-lg px-1.5 py-1 text-left text-sm hover:bg-surface">
                          <span className="num shrink-0 text-xs font-semibold text-accent-strong">{fmtTime(p.moment_ms)}</span>
                          <span className="truncate italic">“{p.quote}”</span>
                          <span className={`pill ml-auto shrink-0 ${p.state === "inserted" ? "bg-ok-soft text-ok" : p.state === "dismissed" ? "bg-surface text-muted" : "bg-accent-soft text-accent-strong"}`}>{p.state === "inserted" ? "Used" : p.state === "dismissed" ? "Dismissed" : "Shown"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <aside className="space-y-6">
        <Panel title="Timeline" tag="everything said or typed" action={<span className="pill num bg-background text-muted">{utterances.length}</span>} flush divided>
          <ol className="max-h-[60vh] divide-y divide-line overflow-y-auto">
            {utterances.length === 0 && <li className="p-5 text-sm text-muted">Nothing said or typed in this session</li>}
            {utterances.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => seek(Math.max(0, u.start_ms - 2000))} disabled={!hasRecording}
                  className={`w-full px-5 py-3 text-left text-sm hover:bg-background ${active?.id === u.id ? "bg-accent-soft/60" : ""}`}>
                  <span className="mb-0.5 flex items-center gap-2 text-xs">
                    <span className="num font-semibold text-accent-strong">{fmtTime(u.start_ms)}</span>
                    <span className={`pill ${u.source === "typed" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent-strong"}`}>{kind(u)}</span>
                  </span>
                  {u.text}
                </button>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel title="Data" tag="export or delete">
          <div className="space-y-2">
            <a className="btn-ghost w-full" href={`/api/sessions/${sessionId}/export`}>Download session (.zip)</a>
            <button className="btn-danger w-full" onClick={remove}>Delete session now</button>
          </div>
        </Panel>
      </aside>
    </div>
  );
}
