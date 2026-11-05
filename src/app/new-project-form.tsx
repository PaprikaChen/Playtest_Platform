"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, description }) });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error);
    router.push(`/projects/${body.project.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label" htmlFor="pname">Game name</label>
        <input id="pname" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lantern Hop" required />
      </div>
      <div>
        <label className="label" htmlFor="pdesc">What are you testing? <span className="font-normal text-muted">optional</span></label>
        <textarea id="pdesc" className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. levels 1–2, new jump tuning" />
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
      <button className="btn-primary w-full" disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create game"}</button>
    </form>
  );
}
