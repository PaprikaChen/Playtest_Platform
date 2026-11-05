import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell, Status, fmtBytes, fmtDate, fmtTime } from "@/components/ui";
import { getProject, latestQuestionnaire, listBuilds, listInvites, listSessions, purgeExpired } from "@/lib/repo";
import { BuildUpload, InviteManager, QuestionnaireEditor } from "./client";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  purgeExpired();
  const project = getProject(id);
  if (!project) notFound();
  const builds = listBuilds(id);
  const questionnaire = latestQuestionnaire(id);
  const invites = listInvites(id);
  const sessions = listSessions(id);
  const steps = [
    { done: builds.length > 0, label: "Upload a web build" },
    { done: Boolean(questionnaire), label: "Save the questionnaire" },
    { done: invites.some((i) => i.active), label: "Create an invite link" },
    { done: sessions.length > 0, label: "Share it with a tester" },
  ];
  const submitted = sessions.filter((s) => s.submitted_at).length;

  return (
    <Shell crumbs={[{ label: project.name }]}>
      <header className="mb-6 flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
          {project.description && <p className="mt-1 text-sm text-muted">{project.description}</p>}
        </div>
        <dl className="flex gap-6 text-sm">
          <Stat label="Sessions" value={sessions.length} />
          <Stat label="Submitted" value={submitted} />
          <Stat label="Builds" value={builds.length} />
        </dl>
      </header>

      {sessions.length === 0 && (
        <ol className="mb-6 grid gap-2 sm:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.label} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${s.done ? "border-ok/30 bg-ok-soft/60" : "border-line bg-surface"}`}>
              <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${s.done ? "bg-ok text-white" : "border border-line text-muted"}`}>{s.done ? "✓" : i + 1}</span>
              {s.label}
            </li>
          ))}
        </ol>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6 min-w-0">
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">Feedback</h2>
              <span className="text-xs text-muted">Sessions auto-delete 7 days after they start</span>
            </div>
            {sessions.length === 0 ? (
              <div className="card text-sm text-muted">No sessions yet. Create an invite link on the right and send it to a tester; their sessions appear here.</div>
            ) : (
              <ul className="card divide-y divide-line p-0">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <Link href={`/sessions/${s.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-background">
                      <span className="grid size-8 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">{s.tester_name.slice(0, 1).toUpperCase()}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{s.tester_name}</span>
                        <span className="block text-xs text-muted">{s.build_label} · {fmtDate(s.created_at)} · {s.duration_ms ? fmtTime(s.duration_ms) : "—"}</span>
                      </span>
                      <span className="text-xs text-muted">{s.comment_count} moment{s.comment_count === 1 ? "" : "s"} · {s.answer_count} answer{s.answer_count === 1 ? "" : "s"}</span>
                      <Status value={s.status} />
                      <span className="text-accent text-sm">Review →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card space-y-4">
            <div className="flex items-baseline justify-between">
              <h2 className="h2">Questionnaire</h2>
              {questionnaire && <span className="text-xs text-muted">v{questionnaire.version} · links keep the version they were created with</span>}
            </div>
            <QuestionnaireEditor projectId={id} initial={questionnaire ?? null} />
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card space-y-3">
            <h2 className="h2">Invite links</h2>
            <InviteManager projectId={id} builds={builds.map((b) => ({ id: b.id, label: b.label }))} hasQuestionnaire={Boolean(questionnaire)} invites={invites} />
          </section>
          <section className="card space-y-3">
            <h2 className="h2">Builds</h2>
            <BuildUpload projectId={id} />
            {builds.length > 0 && (
              <ul className="divide-y divide-line text-sm">
                {builds.map((b) => (
                  <li key={b.id} className="flex justify-between gap-2 py-2">
                    <span className="truncate font-medium">{b.label}</span>
                    <span className="shrink-0 text-xs text-muted">{b.file_count} files · {fmtBytes(b.total_bytes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-right">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
