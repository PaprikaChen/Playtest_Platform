"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/** Header dropdown: which game you're looking at, and a way to switch or add one. */
export function ProjectSwitcher({ projects, currentId }: { projects: { id: string; name: string }[]; currentId?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = projects.find((p) => p.id === currentId);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-background">
        <span className="text-muted">Game</span>
        <span className="max-w-48 truncate font-medium">{current?.name ?? "All games"}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      {open && (
        <div role="listbox" aria-label="Switch game" className="absolute left-0 top-full z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-[0_8px_30px_rgba(18,24,38,.12)]">
          <p className="px-2.5 pb-1 pt-1.5 text-xs text-muted">Your games</p>
          {projects.length === 0 && <p className="px-2.5 py-2 text-sm text-muted">None yet</p>}
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} role="option" aria-selected={p.id === currentId} onClick={() => setOpen(false)}
              className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-sm hover:bg-background ${p.id === currentId ? "font-medium text-accent-strong" : ""}`}>
              <span className="truncate">{p.name}</span>
              {p.id === currentId && <span aria-hidden>✓</span>}
            </Link>
          ))}
          <div className="my-1 h-px bg-line" />
          <Link href="/#new-game" onClick={() => setOpen(false)} className="block rounded-lg px-2.5 py-2 text-sm text-accent-strong hover:bg-accent-soft">+ New game</Link>
          <Link href="/" onClick={() => setOpen(false)} className="block rounded-lg px-2.5 py-2 text-sm hover:bg-background">All games</Link>
        </div>
      )}
    </div>
  );
}
