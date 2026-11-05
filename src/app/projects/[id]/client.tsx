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
    setMsg({ ok: true, text: `Published “${body.build.label}” (${body.build.file_count} files)` });
    setLabel("");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="label" htmlFor="build-label">Build name</label>
        <input id="build-label" className="input" placeholder="e.g. v0.3 jump tuning" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <label className={`block cursor-pointer rounded-xl border-2 border-dashed border-line px-4 py-5 text-center transition-colors hover:border-accent/50 hover:bg-accent-soft/40 ${busy ? "opacity-60" : ""}`}>
        <input ref={input} type="file" accept=".zip" className="sr-only" disabled={busy}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <span className="block text-sm font-semibold text-accent-strong">{busy ? "Checking and publishing…" : "Upload web build (.zip)"}</span>
        <span className="mt-2 flex flex-wrap justify-center gap-1.5 text-[11px] text-muted">
          <span className="pill bg-background">has index.html</span><span className="pill bg-background">up to 2000 files</span><span className="pill bg-background">up to 200 MB</span>
        </span>
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
    setMsg(res.ok ? `Saved as version ${body.questionnaire.version}` : body.error);
    if (res.ok) router.refresh();
  }

  const savedJson = JSON.stringify(initial ? { title: initial.title, qs: initial.questions.map(({ type, prompt }) => ({ type, prompt })) } : null);
  const dirty = savedJson !== JSON.stringify({ title, qs: qs.map(({ type, prompt }) => ({ type, prompt })) });

  return (
    <div className="space-y-3">
      <div>
        <label className="label" htmlFor="q-title">Title testers see</label>
        <input id="q-title" className="input font-medium" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="flex px-3 text-xs text-muted" aria-hidden>
        <span className="w-8">#</span><span className="flex-1">Question</span><span className="w-[116px]">Answer type</span><span className="w-7" />
      </div>
      <ol className="-mt-1 divide-y divide-line rounded-xl border border-line">
        {qs.map((q, i) => (
          <li key={i} className="group flex items-start gap-3 px-3 py-2.5">
            <span className="num mt-2 w-5 shrink-0 text-xs font-semibold text-muted">{i + 1}</span>
            <textarea
              className="min-h-9 flex-1 resize-none rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none [field-sizing:content] hover:border-line focus:border-accent focus:bg-surface"
              rows={1} value={q.prompt} placeholder="Ask about a moment, a feeling, a mechanic…"
              onChange={(e) => update(i, { prompt: e.target.value })} aria-label={`Question ${i + 1}`}
            />
            <div className="mt-1 flex shrink-0 rounded-lg border border-line p-0.5 text-xs" role="radiogroup" aria-label={`Question ${i + 1} type`}>
              {(["text", "rating"] as const).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={q.type === t} onClick={() => update(i, { type: t })}
                  className={`rounded-md px-2 py-1 ${q.type === t ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}>{t === "text" ? "Text" : "1–5 scale"}</button>
              ))}
            </div>
            <button type="button" aria-label={`Remove question ${i + 1}`} className="mt-1.5 rounded px-1.5 text-muted opacity-40 hover:text-bad group-hover:opacity-100" onClick={() => setQs(qs.filter((_, j) => j !== i))}>✕</button>
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-3">
        <button type="button" className="btn-ghost" onClick={() => setQs([...qs, { type: "text", prompt: "" }])}>Add question</button>
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
  async function copy(id: string, url: string) {
    // navigator.clipboard is missing on plain-http LAN addresses; fall back to letting the user copy.
    try { await navigator.clipboard.writeText(url); setCopied(id); } catch { setCopied(`fail:${id}`); }
  }
  async function toggle(id: string, active: boolean) {
    await fetch(`/api/invites/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active }) });
    router.refresh();
  }

  const ready = builds.length > 0 && hasQuestionnaire;
  return (
    <div className="space-y-3">
      {!ready && <p className="text-sm text-muted">Needs a build and saved questions first.</p>}
      {ready && (
        <div>
          <label className="label" htmlFor="invite-build">Build to test</label>
          <div className="flex gap-2">
            <select id="invite-build" className="input" value={buildId} onChange={(e) => setBuildId(e.target.value)}>
              {builds.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
            <button className="btn-primary shrink-0" disabled={busy} onClick={create}>Create link</button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
      <ul className="space-y-2">
        {invites.map((inv) => {
          const url = `${origin}/t/${inv.token}`;
          return (
            <li key={inv.id} className={`rounded-xl border p-3 text-sm ${inv.active ? "border-line" : "border-dashed border-line opacity-60"}`}>
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{inv.build_label}</span>
                <span className={`pill ml-auto shrink-0 ${inv.active ? "bg-ok-soft text-ok" : "bg-background text-muted"}`}>{inv.active ? "Active" : "Off"}</span>
              </div>
              <p className="tag num mt-0.5">Questions v{inv.q_version}, {inv.sessions} session{inv.sessions === 1 ? "" : "s"}</p>
              <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label={`Invite link for ${inv.build_label}`}
                className="mt-2 w-full truncate rounded-md border border-line bg-background px-2 py-1 text-xs text-muted" />
              <div className="mt-2 flex items-center gap-2">
                <button className="btn-primary whitespace-nowrap py-1 text-xs" disabled={!inv.active} onClick={() => copy(inv.id, url)}>{copied === inv.id ? "Copied" : copied === `fail:${inv.id}` ? "Select and copy" : "Copy link"}</button>
                <a className="btn-ghost py-1 text-xs" href={`/t/${inv.token}`} target="_blank" rel="noreferrer">Open</a>
                <button className="btn ml-auto whitespace-nowrap py-1 text-xs text-muted hover:text-foreground" onClick={() => toggle(inv.id, !inv.active)}>{inv.active ? "Turn off" : "Turn on"}</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
