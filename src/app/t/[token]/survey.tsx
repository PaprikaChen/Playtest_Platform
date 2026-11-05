"use client";
import { useEffect, useRef, useState } from "react";
import { ClipPlayer } from "@/components/clip-player";
import { fmtTime } from "@/lib/format";
import type { Question } from "@/lib/types";

interface Prompt { id: string; question_id: string; quote: string; hint: string; source: string; start_ms: number; replay_start_ms: number; replay_end_ms: number; state: string }
interface Status { session: string; transcript: string; prompts: string; provider: string | null; error: string | null }
interface Ans { text: string; rating: number | null; promptIds: string[] }

export function Survey({ token, sessionId, projectName, audioOnly, onSubmitted }: { token: string; sessionId: string; projectName: string; audioOnly: boolean; onSubmitted: () => void }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [title, setTitle] = useState("");
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [hasRecording, setHasRecording] = useState(false);
  const [answers, setAnswers] = useState<Record<string, Ans>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const headers = { "content-type": "application/json", "x-invite-token": token };

  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const loaded = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    let stop = false;
    let delay = 2000;
    async function poll() {
      const res = await fetch(`/api/sessions/${sessionId}/recall-prompts`, { headers: { "x-invite-token": token } }).catch(() => null);
      if (stop) return;
      if (res?.ok) {
        const body = await res.json();
        setQuestions(body.questionnaire.questions);
        setTitle(body.questionnaire.title);
        setStatus(body.status);
        setHasRecording(body.hasRecording);
        setPrompts(body.prompts);
        if (!loaded.current) {
          // Restore saved drafts once (after a reload); never overwrite what the tester is typing.
          loaded.current = true;
          setAnswers(Object.fromEntries((body.answers as (Ans & { questionId: string })[]).map(({ questionId, ...a }) => [questionId, a])));
        }
        if (["done", "failed"].includes(body.status.prompts)) return;
      }
      // Keep polling while the page is open (long transcripts can take minutes), backing off to 10 s.
      setTimeout(poll, delay);
      delay = Math.min(10000, delay * 1.5);
    }
    void poll();
    return () => { stop = true; };
  }, [sessionId, token]);

  // Autosave drafts 1 s after the last edit.
  useEffect(() => {
    if (!loaded.current || !dirty.current) return;
    const t = setTimeout(async () => {
      setSaved("saving");
      const res = await fetch(`/api/sessions/${sessionId}/answers`, {
        method: "POST", headers: { "content-type": "application/json", "x-invite-token": token },
        body: JSON.stringify({ submit: false, answers: Object.entries(answers).map(([questionId, a]) => ({ questionId, ...a })) }),
      }).catch(() => null);
      setSaved(res?.ok ? "saved" : "error");
    }, 1000);
    return () => clearTimeout(t);
  }, [answers, sessionId, token]);

  const ans = (qid: string): Ans => answers[qid] ?? { text: "", rating: null, promptIds: [] };
  const setAns = (qid: string, patch: Partial<Ans>) => {
    dirty.current = true;
    setAnswers((all) => ({ ...all, [qid]: { ...(all[qid] ?? { text: "", rating: null, promptIds: [] }), ...patch } }));
  };

  function setPromptState(p: Prompt, state: "inserted" | "dismissed" | "shown") {
    setPrompts((ps) => ps.map((x) => (x.id === p.id ? { ...x, state } : x)));
    void fetch(`/api/sessions/${sessionId}/recall-prompts`, { method: "PATCH", headers, body: JSON.stringify({ promptId: p.id, state }) });
  }
  function insert(p: Prompt) {
    const a = ans(p.question_id);
    const line = `At ${fmtTime(p.start_ms)} I said “${p.quote}”. `;
    setAns(p.question_id, { text: a.text ? `${a.text.trimEnd()}\n${line}` : line, promptIds: [...new Set([...a.promptIds, p.id])] });
    setPromptState(p, "inserted");
  }

  async function submit() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/sessions/${sessionId}/answers`, {
      method: "POST", headers,
      body: JSON.stringify({ submit: true, answers: questions.map((q) => ({ questionId: q.id, ...ans(q.id) })) }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json()).error);
    onSubmitted();
  }

  const pending = status && !["done", "failed"].includes(status.prompts);
  const answeredCount = questions.filter((q) => { const a = ans(q.id); return a.text.trim() || a.rating; }).length;
  const src = `/api/sessions/${sessionId}/recording?t=${encodeURIComponent(token)}`;
  return (
    <main className="mx-auto max-w-3xl px-4 pt-10 pb-32">
      <header className="mb-6">
        <p className="tag [overflow-wrap:anywhere]">Game: <span className="font-medium text-foreground">{projectName}</span></p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight [overflow-wrap:anywhere]">{title || "Questionnaire"}</h1>
        <div className={`mt-4 flex gap-2.5 rounded-xl p-3.5 text-sm ${pending ? "bg-warn-soft text-warn" : status?.prompts === "failed" ? "bg-bad-soft text-bad" : "bg-accent-soft text-accent-strong"}`}>
          <span aria-hidden className="mt-0.5">{pending ? "⏳" : status?.prompts === "failed" ? "⚠️" : "💡"}</span>
          <p>
            {pending && "Finding the moments you commented on… You can start answering (and even submit) now; reminders will appear under each question when ready."}
            {status?.prompts === "done" && <>Reminders are based only on what you said or typed. They&apos;re suggestions: insert, edit or dismiss them. Nothing is filled in for you.{status.provider?.includes("placeholder") && <span className="opacity-70"> (Alpha: keyword matching stands in for the AI model.)</span>}</>}
            {status?.prompts === "failed" && "Reminders couldn't be generated this time. Your answers still work as normal."}
          </p>
        </div>
      </header>

      <ol className="space-y-5">
        {questions.map((q, i) => {
          const qp = prompts.filter((p) => p.question_id === q.id && p.state !== "dismissed");
          const a = ans(q.id);
          const answered = Boolean(a.text.trim() || a.rating);
          return (
            <li key={q.id} className="card p-0 overflow-hidden">
              <div className="p-5 space-y-3">
                <h2 className="flex gap-3 text-[15px] font-medium leading-snug">
                  <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${answered ? "bg-ok text-white" : "bg-background text-muted border border-line"}`}>{answered ? "✓" : i + 1}</span>
                  {q.prompt}
                </h2>
                {q.type === "rating" && (
                  <div className="flex flex-wrap items-center gap-1.5 pl-9" role="radiogroup" aria-label="Rating">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={a.rating === n} onClick={() => setAns(q.id, { rating: n })}
                        className={`size-10 rounded-lg border text-sm font-medium transition-colors ${a.rating === n ? "bg-accent text-white border-accent" : "border-line bg-surface hover:border-accent/40"}`}>{n}</button>
                    ))}
                    <span className="ml-2 text-xs text-muted">1 poor, 5 great</span>
                  </div>
                )}
                <div className="pl-9">
                  <textarea className="input min-h-[5.5rem]" rows={q.type === "rating" ? 2 : 3} value={a.text} onChange={(e) => setAns(q.id, { text: e.target.value })}
                    placeholder={q.type === "rating" ? "Why? (optional)" : "Your answer"} aria-label={`Answer to question ${i + 1}`} />
                </div>
              </div>

              {qp.length > 0 && (
                <div className="border-t border-line bg-background/60 px-5 py-4">
                  <p className="mb-2.5 flex items-baseline gap-2 pl-9"><span className="text-sm font-semibold">From your playtest</span><span className="tag">moments you mentioned, replay or add</span></p>
                  <ul className="space-y-2.5 pl-9">
                    {qp.map((p) => (
                      <li key={p.id} className={`flex gap-3 rounded-lg border bg-surface p-2.5 transition-colors ${p.state === "inserted" ? "border-ok/40" : "border-line"}`}>
                        {hasRecording && (
                          <div className="w-40 shrink-0 sm:w-48">
                            <ClipPlayer src={src} poster={audioOnly ? undefined : `/api/sessions/${sessionId}/thumbnail?ms=${p.start_ms}&t=${encodeURIComponent(token)}`}
                              startMs={p.replay_start_ms} endMs={p.replay_end_ms} momentMs={p.start_ms} audioOnly={audioOnly} />
                          </div>
                        )}
                        <div className="flex min-w-0 flex-1 flex-col">
                          <p className="text-sm leading-snug">
                            <span className="num mr-1.5 text-xs font-semibold text-accent-strong">{fmtTime(p.start_ms)}</span><span className="mr-1.5 text-xs text-muted">{p.source === "typed" ? "you typed" : "you said"}</span>
                            <span className="italic">“{p.quote}”</span>
                          </p>
                          <p className="mt-1 text-xs text-muted">{p.hint}</p>
                          <div className="mt-auto flex gap-1.5 pt-2">
                            <button type="button" className="btn-ghost py-1 text-xs" disabled={p.state === "inserted"} onClick={() => insert(p)}>{p.state === "inserted" ? "Added ✓" : "Add to my answer"}</button>
                            <button type="button" className="btn py-1 text-xs text-muted hover:text-foreground" onClick={() => setPromptState(p, "dismissed")}>Dismiss</button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <footer className="fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{answeredCount} of {questions.length} answered</p>
            <p className="text-xs text-muted truncate">{error ? <span className="text-bad">{error}</span> : saved === "saving" ? "Saving draft…" : saved === "saved" ? "Draft saved. You can safely reload this page." : saved === "error" ? "Couldn't save draft; check your connection." : "Answers save automatically."}</p>
          </div>
          <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-background sm:block" aria-hidden>
            <div className="h-full rounded-full bg-ok transition-all" style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }} />
          </div>
          <button className="btn-primary px-5 py-2.5" disabled={busy || !questions.length} onClick={submit}>{busy ? "Submitting…" : "Submit feedback"}</button>
        </div>
      </footer>
    </main>
  );
}
