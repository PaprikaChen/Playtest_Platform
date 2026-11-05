import Link from "next/link";
import { Shell, fmtDate } from "@/components/ui";
import { listProjects } from "@/lib/repo";
import { NewProjectForm } from "./new-project-form";

export const dynamic = "force-dynamic";

export default function Dashboard() {
  const projects = listProjects();
  return (
    <Shell>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your playtests</h1>
          <p className="text-muted text-sm mt-1">Upload a web build, write a questionnaire, share one link. Testers&apos; comments stay tied to the moment they happened.</p>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <section className="space-y-3">
          {projects.length === 0 && <div className="card text-sm text-muted">No projects yet. Create one to upload your first build.</div>}
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="card block hover:border-accent/50 transition-colors">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{p.name}</h3>
                <span className="text-xs text-muted">{fmtDate(p.created_at)}</span>
              </div>
              {p.description && <p className="text-sm text-muted mt-1">{p.description}</p>}
              <div className="flex gap-4 mt-3 text-xs text-muted">
                <span>{p.builds} build{p.builds === 1 ? "" : "s"}</span>
                <span>{p.sessions} session{p.sessions === 1 ? "" : "s"}</span>
              </div>
            </Link>
          ))}
        </section>
        <aside><NewProjectForm /></aside>
      </div>
    </Shell>
  );
}
