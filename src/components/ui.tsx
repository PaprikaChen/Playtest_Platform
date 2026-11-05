
export function Logo() {
  // A play triangle sitting on a timeline: playtests are moments on a timeline.
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <rect width="22" height="22" rx="6" fill="var(--accent-light)" />
      <path d="M8 6.5v7l6-3.5z" fill="#fff" />
      <rect x="5" y="16" width="12" height="1.6" rx=".8" fill="#fff" opacity=".7" />
    </svg>
  );
}

/**
 * A labelled region: title + a few-word tag saying what it is for.
 * `flush` lets the body run edge to edge (tables, video, lists) while the header keeps its padding.
 */
export function Panel({ title, tag, action, children, className = "", id, flush = false, divided = false }: { title: string; tag: string; action?: React.ReactNode; children: React.ReactNode; className?: string; id?: string; flush?: boolean; divided?: boolean }) {
  return (
    <section id={id} className={`card ${flush ? "overflow-hidden p-0" : ""} ${className}`} aria-label={title}>
      <header className={`flex items-start gap-3 ${flush ? `px-5 pt-5 ${divided ? "border-b border-line pb-4" : "pb-4"}` : "mb-4"}`}>
        <div className="min-w-0 flex-1">
          <h2 className="h2">{title}</h2>
          <p className="tag mt-0.5">{tag}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  recording: { label: "Playing now", cls: "bg-accent-soft text-accent-strong" },
  processing: { label: "Processing", cls: "bg-warn-soft text-warn" },
  running: { label: "Running", cls: "bg-warn-soft text-warn" },
  pending: { label: "Waiting", cls: "bg-background text-muted" },
  ready: { label: "Answering", cls: "bg-accent-soft text-accent-strong" },
  done: { label: "Done", cls: "bg-ok-soft text-ok" },
  submitted: { label: "Submitted", cls: "bg-ok-soft text-ok" },
  skipped: { label: "Skipped", cls: "bg-background text-muted" },
  failed: { label: "Failed", cls: "bg-bad-soft text-bad" },
  abandoned: { label: "Left early", cls: "bg-warn-soft text-warn" },
};
export function Status({ value, label }: { value: string; label?: string }) {
  const s = STATUS[value] ?? { label: value, cls: "bg-background text-muted" };
  return <span className={`pill ${s.cls}`}>{label ? `${label}: ` : ""}{s.label}</span>;
}

export { fmtTime, fmtDate, fmtBytes } from "@/lib/format";
