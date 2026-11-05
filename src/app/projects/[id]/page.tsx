import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { Panel, Status } from "@/components/ui";
import { fmtBytes, fmtDate, fmtTime } from "@/lib/format";
import { finalizeStaleSessions } from "@/lib/processing";
import { getProject, latestQuestionnaire, listBuilds, listInvites, listSessions, purgeExpired } from "@/lib/repo";
import { BuildUpload, InviteManager, QuestionnaireEditor } from "./client";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "feedback", label: "Feedback" },
  { key: "questions", label: "Questions" },
  { key: "share", label: "Share & builds" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  purgeExpired();
  await finalizeStaleSessions();
  const project = getProject(id);
  if (!project) notFound();
  const builds = listBuilds(id);
  const questionnaire = latestQuestionnaire(id);
  const invites = listInvites(id);
  const sessions = listSessions(id);
  const steps: { done: boolean; label: string; tab: Tab }[] = [
    { done: builds.length > 0, label: "Upload build", tab: "share" },
    { done: Boolean(questionnaire), label: "Save questions", tab: "questions" },
    { done: invites.some((i) => i.active), label: "Create link", tab: "share" },
    { done: sessions.length > 0, label: "First tester", tab: "share" },
  ];
  // New games open on the next setup step; games with feedback open on Feedback.
  // Pin the choice in the URL so later refreshes (after an upload, a save…) don't jump to another tab under the user.
  if (!TABS.some((t) => t.key === tabParam)) redirect(`/projects/${id}?tab=${sessions.length ? "feedback" : (steps.find((s) => !s.done)?.tab ?? "share")}`);
  const tab = tabParam as Tab;
  const submitted = sessions.filter((s) => s.submitted_at).length;
  const counts: Record<Tab, number> = { feedback: sessions.length, questions: questionnaire?.questions.length ?? 0, share: invites.filter((i) => i.active).length };

  return (
    <Shell projectId={id}>
      <header className="flex flex-wrap items-end gap-6">
        <div className="min-w-0 flex-1">
          <p className="tag">Game</p>
          <h1 className="[overflow-wrap:anywhere] font-display text-4xl font-semibold tracking-tight">{project.name}</h1>
          {project.description && <p className="mt-1 [overflow-wrap:anywhere] text-muted">Testing: {project.description}</p>}
        </div>
        <dl className="flex gap-8">
          <Stat label="Sessions" value={sessions.length} />
          <Stat label="Submitted" value={submitted} />
          <Stat label="Builds" value={builds.length} />
        </dl>
      </header>

      {sessions.length === 0 && (
        <section aria-label="Get started" className="mt-6">
          <ol className="grid gap-2 sm:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.label}>
                <Link href={`?tab=${s.tab}`} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${s.done ? "border-ok/25 bg-ok-soft text-ok" : "border-line bg-surface hover:border-accent/40"}`}>
                  <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${s.done ? "bg-ok text-white" : "border border-line text-muted"}`}>{s.done ? "✓" : i + 1}</span>
                  {s.label}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <nav aria-label="Game sections" className="mt-6 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <Link key={t.key} href={`?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium transition-colors ${tab === t.key ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"}`}>
            {t.label}
            <span className={`num rounded-full px-1.5 text-xs ${tab === t.key ? "bg-accent-soft text-accent-strong" : "bg-background text-muted"}`}>{counts[t.key]}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "feedback" && (
          <Panel flush title="Tester sessions" tag="open one to watch and read answers" action={<span className="tag hidden sm:inline">auto-deleted after 7 days</span>}>
            {sessions.length === 0 ? (
              <div className="px-5 pb-8 pt-2 text-center">
                <p className="font-medium">No feedback yet</p>
                <p className="tag mt-1">Send your invite link to a tester. <Link href="?tab=share" className="font-medium text-accent-strong hover:underline">Get the link</Link></p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
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
                        <td className="max-w-[220px] px-5 py-3">
                          <span className="flex items-center gap-2.5 font-medium">
                            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-strong">{s.tester_name.slice(0, 1).toUpperCase()}</span>
                            <span className="truncate" title={s.tester_name}>{s.tester_name}</span>
                          </span>
                        </td>
                        <td className="max-w-[180px] truncate px-3 py-3 text-muted" title={s.build_label}>{s.build_label}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-muted">{fmtDate(s.created_at)}</td>
                        <td className="num px-3 py-3 text-right">{s.duration_ms ? fmtTime(s.duration_ms) : "–"}</td>
                        <td className="num px-3 py-3 text-right">{s.comment_count}</td>
                        <td className="px-3 py-3"><Status value={s.status} /></td>
                        <td className="px-5 py-3 text-right"><Link className="font-medium text-accent-strong hover:underline" href={`/sessions/${s.id}`}>Review</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}

        {tab === "questions" && (
          <div className="mx-auto max-w-3xl">
            <Panel title="Questions" tag="asked after playing" action={questionnaire && <span className="pill bg-background text-muted">Version {questionnaire.version}</span>}>
              <QuestionnaireEditor projectId={id} initial={questionnaire ?? null} />
            </Panel>
            <p className="tag mt-3 text-center">Saving makes a new version. Links you already shared keep the version they were made with.</p>
          </div>
        )}

        {tab === "share" && (
          <div className="grid gap-6 md:grid-cols-2">
            <Panel title="Invite links" tag="share with testers">
              <InviteManager projectId={id} builds={builds.map((b) => ({ id: b.id, label: b.label }))} hasQuestionnaire={Boolean(questionnaire)} invites={invites} />
            </Panel>
            <Panel title="Builds" tag="your game files (.zip)">
              <BuildUpload projectId={id} />
              {builds.length > 0 && (
                <ul className="mt-3 divide-y divide-line text-sm">
                  {builds.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="truncate font-medium" title={b.label}>{b.label}</span>
                      <span className="num shrink-0 text-xs text-muted">{b.file_count} files, {fmtBytes(b.total_bytes)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        )}
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
