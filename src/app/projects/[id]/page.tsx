import Link from "next/link";
import { finalizeStaleSessions } from "@/lib/processing";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { Panel, Status } from "@/components/ui";
import { fmtBytes, fmtDate, fmtTime } from "@/lib/format";
import { getProject, latestQuestionnaire, listBuilds, listInvites, listSessions, purgeExpired } from "@/lib/repo";
import { BuildUpload, InviteManager, QuestionnaireEditor } from "./client";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  purgeExpired();
  finalizeStaleSessions();
  const project = getProject(id);
  if (!project) notFound();
  const builds = listBuilds(id);
  const questionnaire = latestQuestionnaire(id);
  const invites = listInvites(id);
  const sessions = listSessions(id);
  const steps = [
    { done: builds.length > 0, label: "Upload build" },
    { done: Boolean(questionnaire), label: "Save questions" },
    { done: invites.some((i) => i.active), label: "Create link" },
    { done: sessions.length > 0, label: "First tester" },
  ];
  const submitted = sessions.filter((s) => s.submitted_at).length;

  return (
    <Shell projectId={id}>
      <header className="mb-6 flex flex-wrap items-end gap-6">
        <div className="min-w-0 flex-1">
          <p className="tag">Game</p>
          <h1 className="font-display text-4xl font-semibold tracking-tight">{project.name}</h1>
          {project.description && <p className="mt-1 text-muted">Testing: {project.description}</p>}
        </div>
        <dl className="flex gap-8">
          <Stat label="Sessions" value={sessions.length} />
          <Stat label="Submitted" value={submitted} />
          <Stat label="Builds" value={builds.length} />
        </dl>
      </header>

      {sessions.length === 0 && (
        <section aria-label="Get started" className="mb-6">
          <p className="tag mb-2">Get started</p>
          <ol className="grid gap-2 sm:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.label} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium ${s.done ? "border-ok/25 bg-ok-soft text-ok" : "border-line bg-surface"}`}>
                <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${s.done ? "bg-ok text-white" : "border border-line text-muted"}`}>{s.done ? "✓" : i + 1}</span>
                {s.label}
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Panel flush title="Feedback" tag="sessions from testers" action={<span className="tag">auto-deleted after 7 days</span>}>
            {sessions.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">No sessions yet. Send the invite link to a tester.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-y border-line bg-background/60 text-left text-xs text-muted">
                  <tr>
                    <th className="px-5 py-2 font-medium">Tester</th>
                    <th className="px-3 py-2 font-medium">Build</th>
                    <th className="px-3 py-2 font-medium">Played</th>
                    <th className="px-3 py-2 text-right font-medium">Length</th>
                    <th className="px-3 py-2 text-right font-medium">Moments</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-5 py-2"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-background/60">
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-2.5 font-medium">
                          <span className="grid size-7 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-strong">{s.tester_name.slice(0, 1).toUpperCase()}</span>
                          {s.tester_name}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-muted">{s.build_label}</td>
                      <td className="px-3 py-3 text-muted">{fmtDate(s.created_at)}</td>
                      <td className="num px-3 py-3 text-right">{s.duration_ms ? fmtTime(s.duration_ms) : "–"}</td>
                      <td className="num px-3 py-3 text-right">{s.comment_count}</td>
                      <td className="px-3 py-3"><Status value={s.status} /></td>
                      <td className="px-5 py-3 text-right"><Link className="font-medium text-accent-strong hover:underline" href={`/sessions/${s.id}`}>Review</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel title="Questions" tag="asked after playing" action={questionnaire && <span className="pill bg-background text-muted">Version {questionnaire.version}</span>}>
            <QuestionnaireEditor projectId={id} initial={questionnaire ?? null} />
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="Invite link" tag="share with testers">
            <InviteManager projectId={id} builds={builds.map((b) => ({ id: b.id, label: b.label }))} hasQuestionnaire={Boolean(questionnaire)} invites={invites} />
          </Panel>
          <Panel title="Builds" tag="your game files (.zip)">
            <BuildUpload projectId={id} />
            {builds.length > 0 && (
              <ul className="mt-3 divide-y divide-line text-sm">
                {builds.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="truncate font-medium">{b.label}</span>
                    <span className="num shrink-0 text-xs text-muted">{b.file_count} files, {fmtBytes(b.total_bytes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="tag">{label}</dt>
      <dd className="num font-display text-2xl font-semibold">{value}</dd>
    </div>
  );
}
