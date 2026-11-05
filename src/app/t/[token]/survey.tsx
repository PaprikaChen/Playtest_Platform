"use client";
import { useEffect, useRef, useState } from "react";
import { ClipPlayer } from "@/components/clip-player";
import { fmtTime } from "@/components/ui";
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
  const src = `/api/sessions/${sessionId}/recording?t=${encodeURIComponent(token)}`;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-5">
      <div>
        <p className="text-xs text-muted">{projectName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{title || "Questionnaire"}</h1>
      </div>
      <div className={`rounded-lg p-3 text-sm ${pending ? "bg-warn-soft text-warn" : status?.prompts === "failed" ? "bg-bad-soft text-bad" : "bg-accent-soft text-accent"}`}>
        {pending && "Finding the moments you commented on… You can start answering (and even submit) now; reminders will appear under each question when ready."}
        {status?.prompts === "done" && `Reminders are based only on what you said or typed. They're suggestions: insert, edit or dismiss them. Nothing is filled in for you.${status.provider?.includes("placeholder") ? " (Alpha: keyword-matching placeholder instead of the AI model.)" : ""}`}
        {status?.prompts === "failed" && "Reminders couldn't be generated this time. Your answers still work as normal."}
      </div>

      {questions.map((q, i) => {
        const qp = prompts.filter((p) => p.question_id === q.id && p.state !== "dismissed");
        const a = ans(q.id);
        return (
          <section key={q.id} className="card space-y-3">
            <h2 className="font-medium"><span className="text-muted mr-1">{i + 1}.</span>{q.prompt}</h2>

            {qp.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {qp.map((p) => (
                  <div key={p.id} className={`rounded-lg border p-2.5 space-y-2 ${p.state === "inserted" ? "border-ok/40 bg-ok-soft/50" : "border-accent/30 bg-accent-soft/40"}`}>
                    {hasRecording && <ClipPlayer src={src} startMs={p.replay_start_ms} endMs={p.replay_end_ms} momentMs={p.start_ms} audioOnly={audioOnly} />}
                    <p className="text-sm">
                      <span className="text-xs text-muted font-mono mr-1">{fmtTime(p.start_ms)} {p.source === "typed" ? "you typed" : "you said"}</span>
                      <span className="italic">“{p.quote}”</span>
                    </p>
                    <p className="text-xs text-muted">{p.hint}</p>
                    <div className="flex gap-2">
                      <button type="button" className="btn-ghost py-1 text-xs" disabled={p.state === "inserted"} onClick={() => insert(p)}>{p.state === "inserted" ? "Added ✓" : "Add to my answer"}</button>
                      <button type="button" className="btn-ghost py-1 text-xs" onClick={() => setPromptState(p, "dismissed")}>Dismiss</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {q.type === "rating" && (
              <div className="flex gap-1.5" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={a.rating === n} onClick={() => setAns(q.id, { rating: n })}
                    className={`size-10 rounded-lg border text-sm font-medium ${a.rating === n ? "bg-accent text-white border-accent" : "border-line bg-surface hover:bg-background"}`}>{n}</button>
                ))}
                <span className="self-center text-xs text-muted ml-2">1 = poor · 5 = great</span>
              </div>
            )}
            <textarea className="input" rows={q.type === "rating" ? 2 : 4} value={a.text} onChange={(e) => setAns(q.id, { text: e.target.value })}
              placeholder={q.type === "rating" ? "Why? (optional)" : "Your answer"} aria-label={`Answer to question ${i + 1}`} />
          </section>
        );
      })}
      {error && <p className="text-sm text-bad">{error}</p>}
      <p className="text-xs text-muted text-center">{saved === "saving" ? "Saving draft…" : saved === "saved" ? "Draft saved. You can safely reload this page." : saved === "error" ? "Couldn't save draft; check your connection." : ""}</p>
      <button className="btn-primary w-full py-2.5" disabled={busy || !questions.length} onClick={submit}>{busy ? "Submitting…" : "Submit feedback"}</button>
    </main>
  );
}
