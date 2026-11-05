import Link from "next/link";
import { Shell } from "@/components/shell";
import { Panel } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { listProjects } from "@/lib/repo";
import { NewProjectForm } from "./new-project-form";

export const dynamic = "force-dynamic";

export default function Dashboard() {
  const projects = listProjects();
  return (
    <Shell>
      <header className="mb-8 max-w-2xl">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Your games</h1>
        <p className="mt-2 text-muted">Each game gets its own builds, questions, invite links and feedback.</p>
      </header>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Games" className="space-y-3">
          {projects.length === 0 && (
            <div className="card border-dashed text-center">
              <p className="font-medium">No games yet</p>
              <p className="tag mt-1">Add your first game on the right</p>
            </div>
          )}
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="card group flex items-center gap-4 transition-colors hover:border-accent/40">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft font-display text-lg font-semibold text-accent-strong">{p.name.slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-lg font-semibold tracking-tight [overflow-wrap:anywhere]">{p.name}</span>
                {p.description && <span className="block truncate text-sm text-muted">{p.description}</span>}
              </span>
              <dl className="hidden gap-6 text-right sm:flex">
                <div><dt className="tag">Sessions</dt><dd className="num font-semibold">{p.sessions}</dd></div>
                <div><dt className="tag">Builds</dt><dd className="num font-semibold">{p.builds}</dd></div>
                <div><dt className="tag">Created</dt><dd className="text-sm">{fmtDate(p.created_at)}</dd></div>
              </dl>
            </Link>
          ))}
        </section>
        <aside>
          <Panel id="new-game" title="New game" tag="start a playtest project">
            <NewProjectForm />
          </Panel>
        </aside>
      </div>
    </Shell>
  );
}
