import Link from "next/link";

export function Shell({ children, crumbs }: { children: React.ReactNode; crumbs?: { href?: string; label: string }[] }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-3 text-sm">
          <Link href="/" className="font-semibold tracking-tight">▶ Playtest</Link>
          {crumbs?.map((c, i) => (
            <span key={i} className="flex items-center gap-3 text-muted">
              <span>/</span>
              {c.href ? <Link href={c.href} className="hover:text-foreground">{c.label}</Link> : <span className="text-foreground">{c.label}</span>}
            </span>
          ))}
          <span className="ml-auto pill bg-warn-soft text-warn">Alpha · local creator mode</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}

const STATUS: Record<string, string> = {
  recording: "bg-accent-soft text-accent",
  processing: "bg-warn-soft text-warn",
  running: "bg-warn-soft text-warn",
  pending: "bg-background text-muted",
  ready: "bg-ok-soft text-ok",
  done: "bg-ok-soft text-ok",
  submitted: "bg-ok-soft text-ok",
  skipped: "bg-background text-muted",
  failed: "bg-bad-soft text-bad",
};
export function Status({ value, label }: { value: string; label?: string }) {
  return <span className={`pill ${STATUS[value] ?? "bg-background text-muted"}`}>{label ? `${label}: ` : ""}{value}</span>;
}

export const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
export const fmtDate = (t: number) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const fmtBytes = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.ceil(b / 1e3)} KB`);
