"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClipPlayer } from "@/components/clip-player";
import { fmtTime } from "@/lib/format";
import type { Question } from "@/lib/types";

interface Prompt { id: string; question_id: string; quote: string; hint: string; summary: string; summary_revealed: number; also: string[]; source: string; start_ms: number; replay_start_ms: number; replay_end_ms: number; state: string }
/** A comment no question picked up, offered at the end so nothing the tester said is lost. */
interface Moment { id: string; quote: string; source: string; start_ms: number; replay_start_ms: number; replay_end_ms: number }
interface Status { session: string; transcript: string; prompts: string; provider: string | null; error: string | null }
interface Ans { text: string; rating: number | null; promptIds: string[] }

export function Survey({ token, sessionId, projectName, audioOnly, onSubmitted }: { token: string; sessionId: string; projectName: string; audioOnly: boolean; onSubmitted: () => void }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [title, setTitle] = useState("");
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [others, setOthers] = useState<Moment[]>([]);
  const [addedOther, setAddedOther] = useState<Record<string, number>>({}); // moment id -> question number it was added to
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
        setOthers(body.otherMoments ?? []);
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

  // Autosave drafts 1 s after the last edit. `unsaved` holds edits not yet confirmed by the server.
  const unsaved = useRef<Record<string, Ans> | null>(null);
  const save = useCallback(async (all: Record<string, Ans>, keepalive = false) => {
    const res = await fetch(`/api/sessions/${sessionId}/answers`, {
      method: "POST", headers: { "content-type": "application/json", "x-invite-token": token }, keepalive,
      body: JSON.stringify({ submit: false, answers: Object.entries(all).map(([questionId, a]) => ({ questionId, ...a })) }),
    }).catch(() => null);
    if (unsaved.current === all) unsaved.current = null;
    return Boolean(res?.ok);
  }, [sessionId, token]);

  useEffect(() => {
    if (!loaded.current || !dirty.current) return;
    unsaved.current = answers;
    const t = setTimeout(async () => setSaved((await save(answers)) ? "saved" : "error"), 1000);
    return () => clearTimeout(t);
  }, [answers, save]);

  // Reload/close inside the 1 s window must not lose the last edit: flush with a keepalive request.
  useEffect(() => {
    const flush = () => { if (unsaved.current) void save(unsaved.current, true); };
    addEventListener("pagehide", flush);
    return () => removeEventListener("pagehide", flush);
  }, [save]);

  const ans = (qid: string): Ans => answers[qid] ?? { text: "", rating: null, promptIds: [] };
  const setAns = (qid: string, patch: Partial<Ans>) => {
    dirty.current = true;
    setSaved("saving"); // never show "saved" while an edit is still waiting to be sent
    setAnswers((all) => ({ ...all, [qid]: { ...(all[qid] ?? { text: "", rating: null, promptIds: [] }), ...patch } }));
  };

  function setPromptState(p: Prompt, state: "inserted" | "dismissed" | "shown", insertedAs?: "quote" | "summary") {
    setPrompts((ps) => ps.map((x) => (x.id === p.id ? { ...x, state } : x)));
    // keepalive: an immediate reload must not cancel the card-state update.
    void fetch(`/api/sessions/${sessionId}/recall-prompts`, { method: "PATCH", headers, keepalive: true, body: JSON.stringify({ promptId: p.id, state, insertedAs }) });
  }
  // insertedAs tells the developer whether these words are the tester's quote or AI wording (decision 0005).
  function insert(p: Prompt, line: string, insertedAs: "quote" | "summary") {
    const a = ans(p.question_id);
    setAns(p.question_id, { text: a.text ? `${a.text.trimEnd()}\n${line}` : line, promptIds: [...new Set([...a.promptIds, p.id])] });
    setPromptState(p, "inserted", insertedAs);
  }
  const quoteLine = (p: { start_ms: number; quote: string }) => `At ${fmtTime(p.start_ms)} I said “${p.quote}”. `;
  // The AI wording is shown on request only, so it can't anchor the tester's answer by default.
  function reveal(p: Prompt) {
    setPrompts((ps) => ps.map((x) => (x.id === p.id ? { ...x, summary_revealed: 1 } : x)));
    void fetch(`/api/sessions/${sessionId}/recall-prompts`, { method: "PATCH", headers, keepalive: true, body: JSON.stringify({ promptId: p.id, reveal: true }) });
  }
  function addOther(m: Moment, questionIndex: number) {
    const q = questions[questionIndex];
    const a = ans(q.id);
    const line = quoteLine(m);
    setAns(q.id, { text: a.text ? `${a.text.trimEnd()}\n${line}` : line });
    setAddedOther((all) => ({ ...all, [m.id]: questionIndex + 1 }));
  }
  const questionNumber = (id: string) => questions.findIndex((q) => q.id === id) + 1;

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
            {status?.prompts === "done" && <>Reminders are based only on what you said or typed. They&apos;re suggestions: insert, edit or dismiss them. &ldquo;Help me put this in words&rdquo; shows an AI rewording of your own comment, which may be imperfect. Nothing is filled in for you.{status.provider?.includes("placeholder") && <span className="opacity-70"> (Alpha: keyword matching stands in for the AI model.)</span>}</>}
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
            <li key={q.id} id={`question-${i + 1}`} className="card scroll-mt-6 p-0 overflow-hidden">
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
                          {p.also.length > 0 && (
                            <p className="mt-1 text-xs text-muted">
                              Also relates to{" "}
                              {p.also.map((qid, k) => (
                                <span key={qid}>{k > 0 && ", "}<a className="font-medium text-accent-strong underline-offset-2 hover:underline" href={`#question-${questionNumber(qid)}`}>question {questionNumber(qid)}</a></span>
                              ))}
                            </p>
                          )}
                          {p.summary && p.summary_revealed === 1 && (
                            <p className="mt-1.5 rounded-lg bg-background px-2 py-1.5 text-xs">
                              <span className="pill mr-1.5 bg-accent-soft text-accent-strong" title="Written by AI from your own comment">One way to put it</span>
                              {p.summary}
                            </p>
                          )}
                          <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                            <button type="button" className="btn-ghost py-1 text-xs" disabled={p.state === "inserted"} onClick={() => insert(p, quoteLine(p), "quote")}>{p.state === "inserted" ? "Added ✓" : p.summary && p.summary_revealed === 1 ? "Add quote" : "Add to my answer"}</button>
                            {p.summary && p.summary_revealed !== 1 && p.state !== "inserted" && (
                              <button type="button" className="btn py-1 text-xs text-accent-strong hover:underline" onClick={() => reveal(p)} title="Shows an AI rewording of your own comment">Help me put this in words</button>
                            )}
                            {p.summary && p.summary_revealed === 1 && (
                              <button type="button" className="btn-ghost py-1 text-xs" disabled={p.state === "inserted"} onClick={() => insert(p, p.summary, "summary")} title="Inserts this wording into your answer; edit it to match what you mean.">Use this wording</button>
                            )}
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

      {others.length > 0 && questions.length > 0 && (
        <section className="card mt-5 p-5" aria-labelledby="others-title">
          <p className="flex flex-wrap items-baseline gap-2"><span id="others-title" className="text-sm font-semibold">Other things you mentioned</span><span className="tag">not matched to a question, add one if it helps</span></p>
          <ul className="mt-3 space-y-2.5">
            {others.map((m) => (
              <li key={m.id} className="flex gap-3 rounded-lg border border-line bg-surface p-2.5">
                {hasRecording && (
                  <div className="w-40 shrink-0 sm:w-48">
                    <ClipPlayer src={src} poster={audioOnly ? undefined : `/api/sessions/${sessionId}/thumbnail?ms=${m.start_ms}&t=${encodeURIComponent(token)}`}
                      startMs={m.replay_start_ms} endMs={m.replay_end_ms} momentMs={m.start_ms} audioOnly={audioOnly} />
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <p className="text-sm leading-snug [overflow-wrap:anywhere]">
                    <span className="num mr-1.5 text-xs font-semibold text-accent-strong">{fmtTime(m.start_ms)}</span><span className="mr-1.5 text-xs text-muted">{m.source === "typed" ? "you typed" : "you said"}</span>
                    <span className="italic">“{m.quote}”</span>
                  </p>
                  {addedOther[m.id] ? (
                    <p className="text-xs text-ok">Added to question {addedOther[m.id]} ✓</p>
                  ) : (
                    <select className="input w-auto max-w-full py-1 text-xs" aria-label={`Add “${m.quote}” to a question`} value=""
                      onChange={(e) => { if (e.target.value !== "") addOther(m, Number(e.target.value)); }}>
                      <option value="">Add to a question…</option>
                      {questions.map((q, k) => <option key={q.id} value={k}>{`${k + 1}. ${q.prompt}`}</option>)}
                    </select>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

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
