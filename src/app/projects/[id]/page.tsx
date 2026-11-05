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

  return (
    <Shell crumbs={[{ label: project.name }]}>
      <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
      {project.description && <p className="text-muted text-sm mt-1">{project.description}</p>}

      <ol className="mt-6 grid gap-6 lg:grid-cols-3">
        <li className="card space-y-4">
          <StepTitle n={1} title="Upload a web build" done={builds.length > 0} />
          <BuildUpload projectId={id} />
          <ul className="divide-y divide-line text-sm">
            {builds.map((b) => (
              <li key={b.id} className="py-2 flex justify-between gap-2">
                <span className="font-medium truncate">{b.label}</span>
                <span className="text-muted text-xs shrink-0">{b.file_count} files · {fmtBytes(b.total_bytes)}</span>
              </li>
            ))}
          </ul>
        </li>
        <li className="card space-y-4">
          <StepTitle n={2} title="Write the questionnaire" done={Boolean(questionnaire)} />
          <QuestionnaireEditor projectId={id} initial={questionnaire ?? null} />
        </li>
        <li className="card space-y-4">
          <StepTitle n={3} title="Share an invite link" done={invites.some((i) => i.active)} />
          <InviteManager
            projectId={id}
            builds={builds.map((b) => ({ id: b.id, label: b.label }))}
            hasQuestionnaire={Boolean(questionnaire)}
            invites={invites}
          />
        </li>
      </ol>

      <section className="mt-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold">Feedback sessions</h2>
          <span className="text-xs text-muted">Recordings are deleted automatically 7 days after the session.</span>
        </div>
        {sessions.length === 0 ? (
          <div className="card text-sm text-muted">No sessions yet. Share an invite link and sessions will appear here.</div>
        ) : (
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted border-b border-line">
                <tr>{["Tester", "Build", "Started", "Length", "Comments", "Answers", "Status", ""].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-background">
                    <td className="px-4 py-2.5 font-medium">{s.tester_name}</td>
                    <td className="px-4 py-2.5">{s.build_label}</td>
                    <td className="px-4 py-2.5 text-muted">{fmtDate(s.created_at)}</td>
                    <td className="px-4 py-2.5">{s.duration_ms ? fmtTime(s.duration_ms) : "—"}</td>
                    <td className="px-4 py-2.5">{s.comment_count}</td>
                    <td className="px-4 py-2.5">{s.answer_count}</td>
                    <td className="px-4 py-2.5"><Status value={s.status} /></td>
                    <td className="px-4 py-2.5 text-right"><Link className="text-accent hover:underline" href={`/sessions/${s.id}`}>Review →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Shell>
  );
}

function StepTitle({ n, title, done }: { n: number; title: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`size-6 rounded-full grid place-items-center text-xs font-semibold ${done ? "bg-ok text-white" : "bg-background text-muted border border-line"}`}>{done ? "✓" : n}</span>
      <h2 className="h2">{title}</h2>
    </div>
  );
}
