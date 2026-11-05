"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Question } from "@/lib/types";

export function BuildUpload({ projectId }: { projectId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setMsg(null);
    const form = new FormData();
    form.set("file", file);
    form.set("label", label);
    const res = await fetch(`/api/projects/${projectId}/builds`, { method: "POST", body: form });
    const body = await res.json();
    setBusy(false);
    if (input.current) input.current.value = "";
    if (!res.ok) return setMsg({ ok: false, text: body.error });
    setMsg({ ok: true, text: `Published “${body.build.label}” (${body.build.file_count} files).` });
    setLabel("");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <input className="input" placeholder="Build label, e.g. v0.3 jump tuning" value={label} onChange={(e) => setLabel(e.target.value)} />
      <label className={`block rounded-lg border-2 border-dashed border-line p-4 text-center text-sm cursor-pointer hover:border-accent/50 ${busy ? "opacity-60" : ""}`}>
        <input ref={input} type="file" accept=".zip" className="sr-only" disabled={busy}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <span className="font-medium">{busy ? "Validating & publishing…" : "Choose a web-build .zip"}</span>
        <span className="block text-xs text-muted mt-1">Needs index.html · ≤ 2000 files · ≤ 200 MB unpacked</span>
      </label>
      {msg && <p className={`text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
    </div>
  );
}

type Draft = { id?: string; type: Question["type"]; prompt: string };
const DEFAULT_QUESTIONS: Draft[] = [
  { type: "text", prompt: "Was there any moment where you felt confused or didn't know what to do?" },
  { type: "text", prompt: "Which part felt too difficult or frustrating, and why?" },
  { type: "rating", prompt: "How responsive did the controls feel?" },
  { type: "text", prompt: "What did you enjoy most?" },
];

export function QuestionnaireEditor({ projectId, initial }: { projectId: string; initial: { title: string; version: number; questions: Question[] } | null }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "Playtest questionnaire");
  const [qs, setQs] = useState<Draft[]>(initial?.questions ?? DEFAULT_QUESTIONS);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const update = (i: number, patch: Partial<Draft>) => { setMsg(""); setQs(qs.map((q, j) => (j === i ? { ...q, ...patch } : q))); };

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/projects/${projectId}/questionnaires`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, questions: qs }),
    });
    const body = await res.json();
    setBusy(false);
    setMsg(res.ok ? `Saved as version ${body.questionnaire.version}.` : body.error);
    if (res.ok) router.refresh();
  }

  const savedJson = JSON.stringify(initial ? { title: initial.title, qs: initial.questions.map(({ type, prompt }) => ({ type, prompt })) } : null);
  const dirty = savedJson !== JSON.stringify({ title, qs: qs.map(({ type, prompt }) => ({ type, prompt })) });

  return (
    <div className="space-y-3">
      <input className="input font-medium" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Questionnaire title" />
      <ol className="divide-y divide-line rounded-xl border border-line">
        {qs.map((q, i) => (
          <li key={i} className="group flex items-start gap-3 px-3 py-2.5">
            <span className="mt-2 w-5 shrink-0 text-right text-xs font-semibold text-muted">{i + 1}</span>
            <textarea
              className="min-h-9 flex-1 resize-none rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none [field-sizing:content] hover:border-line focus:border-accent focus:bg-surface"
              rows={1} value={q.prompt} placeholder="Ask about a moment, a feeling, a mechanic…"
              onChange={(e) => update(i, { prompt: e.target.value })} aria-label={`Question ${i + 1}`}
            />
            <div className="mt-1 flex shrink-0 rounded-lg border border-line p-0.5 text-xs" role="radiogroup" aria-label={`Question ${i + 1} type`}>
              {(["text", "rating"] as const).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={q.type === t} onClick={() => update(i, { type: t })}
                  className={`rounded-md px-2 py-1 ${q.type === t ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}>{t === "text" ? "Open" : "1–5"}</button>
              ))}
            </div>
            <button type="button" aria-label={`Remove question ${i + 1}`} className="mt-1.5 rounded px-1.5 text-muted opacity-40 hover:text-bad group-hover:opacity-100" onClick={() => setQs(qs.filter((_, j) => j !== i))}>✕</button>
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-3">
        <button type="button" className="btn-ghost" onClick={() => setQs([...qs, { type: "text", prompt: "" }])}>+ Question</button>
        <span className="ml-auto text-xs text-muted">{msg || (dirty ? (initial ? "Unsaved changes" : "Not saved yet") : "")}</span>
        <button type="button" className="btn-primary" disabled={busy || (!dirty && Boolean(initial))} onClick={save}>{busy ? "Saving…" : initial ? "Save new version" : "Save"}</button>
      </div>
    </div>
  );
}

interface InviteRow { id: string; token: string; active: number; build_label: string; q_version: number; sessions: number }

export function InviteManager({ projectId, builds, hasQuestionnaire, invites }: { projectId: string; builds: { id: string; label: string }[]; hasQuestionnaire: boolean; invites: InviteRow[] }) {
  const router = useRouter();
  const [buildId, setBuildId] = useState(builds[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  async function create() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/projects/${projectId}/invites`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ buildId: buildId || builds[0]?.id }) });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error);
    router.refresh();
  }
  async function toggle(id: string, active: boolean) {
    await fetch(`/api/invites/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active }) });
    router.refresh();
  }

  const ready = builds.length > 0 && hasQuestionnaire;
  return (
    <div className="space-y-3">
      {!ready && <p className="text-sm text-muted">Upload a build and save a questionnaire first.</p>}
      {ready && (
        <div className="flex gap-2">
          <select className="input" value={buildId} onChange={(e) => setBuildId(e.target.value)} aria-label="Build">
            {builds.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          <button className="btn-primary shrink-0" disabled={busy} onClick={create}>Create link</button>
        </div>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
      <ul className="space-y-2">
        {invites.map((inv) => {
          const url = `${origin}/t/${inv.token}`;
          return (
            <li key={inv.id} className={`rounded-lg border border-line p-2.5 text-sm ${inv.active ? "" : "opacity-60"}`}>
              <div className="flex justify-between text-xs text-muted">
                <span>{inv.build_label} · questionnaire v{inv.q_version}</span>
                <span>{inv.sessions} session{inv.sessions === 1 ? "" : "s"}</span>
              </div>
              <code className="block mt-1 truncate text-xs">{url}</code>
              <div className="flex gap-2 mt-2">
                <button className="btn-ghost py-1 text-xs" disabled={!inv.active} onClick={() => { navigator.clipboard.writeText(url); setCopied(inv.id); }}>{copied === inv.id ? "Copied" : "Copy"}</button>
                <a className="btn-ghost py-1 text-xs" href={`/t/${inv.token}`} target="_blank" rel="noreferrer">Open</a>
                <button className="btn-ghost py-1 text-xs ml-auto" onClick={() => toggle(inv.id, !inv.active)}>{inv.active ? "Disable" : "Enable"}</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
