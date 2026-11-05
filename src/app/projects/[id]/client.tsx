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

  const update = (i: number, patch: Partial<Draft>) => setQs(qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));

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

  return (
    <div className="space-y-3">
      <input className="input font-medium" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Questionnaire title" />
      <ul className="space-y-2">
        {qs.map((q, i) => (
          <li key={i} className="rounded-lg border border-line p-2.5 space-y-2">
            <textarea className="input" rows={2} value={q.prompt} onChange={(e) => update(i, { prompt: e.target.value })} aria-label={`Question ${i + 1}`} />
            <div className="flex items-center gap-2 text-xs">
              <select className="input w-auto py-1" value={q.type} onChange={(e) => update(i, { type: e.target.value as Draft["type"] })}>
                <option value="text">Open answer</option>
                <option value="rating">1–5 rating + why</option>
              </select>
              <button type="button" className="ml-auto text-muted hover:text-bad" onClick={() => setQs(qs.filter((_, j) => j !== i))}>Remove</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button type="button" className="btn-ghost" onClick={() => setQs([...qs, { type: "text", prompt: "" }])}>+ Question</button>
        <button type="button" className="btn-primary ml-auto" disabled={busy} onClick={save}>{busy ? "Saving…" : initial ? "Save new version" : "Save"}</button>
      </div>
      {msg && <p className="text-xs text-muted">{msg}</p>}
      {initial && <p className="text-xs text-muted">Current: v{initial.version}. Saving creates a new version; existing links keep theirs.</p>}
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
