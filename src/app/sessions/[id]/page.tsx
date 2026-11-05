import { finalizeStaleSessions } from "@/lib/processing";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Shell } from "@/components/shell";
import { Status } from "@/components/ui";
import { fmtDate, fmtTime } from "@/lib/format";
import { getProject, getQuestionnaire, getSession, listAnswers, listPrompts, listUtterances, purgeExpired } from "@/lib/repo";
import { RETENTION_MS } from "@/lib/types";
import { ReviewPlayer } from "./review-player";

export const dynamic = "force-dynamic";

export default async function SessionReview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  purgeExpired();
  finalizeStaleSessions();
  const s = getSession(id);
  if (!s) notFound();
  const project = getProject(s.project_id)!;
  const q = getQuestionnaire(s.questionnaire_id)!;
  const utterances = listUtterances(id);
  const prompts = listPrompts(id);
  const answers = new Map(listAnswers(id).map((a) => [a.question_id, a]));
  const daysLeft = Math.max(0, Math.ceil((s.created_at + RETENTION_MS - Date.now()) / 86400000));

  const capture: Record<string, string> = { "screen+mic": "Screen + mic", screen: "Screen only", mic: "Mic only", "comments-only": "Typed notes only" };

  return (
    <Shell projectId={project.id}>
      <nav className="mb-3 text-sm"><Link href={`/projects/${project.id}`} className="text-muted hover:text-foreground">{project.name}: feedback</Link></nav>
      <header className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="tag">Tester session</p>
          <h1 className="flex items-center gap-3 font-display text-4xl font-semibold tracking-tight">{s.tester_name} <Status value={s.status} /></h1>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Meta label="Played" value={fmtDate(s.created_at)} />
          <Meta label="Length" value={s.duration_ms ? fmtTime(s.duration_ms) : "–"} />
          <Meta label="Captured" value={capture[s.capture_mode] ?? s.capture_mode} />
          <Meta label="Transcript" value={<Status value={s.transcript_status} />} />
          <Meta label="Reminders" value={<Status value={s.prompts_status} />} />
          <Meta label="Deleted in" value={`${daysLeft} day${daysLeft === 1 ? "" : "s"}`} />
        </dl>
      </header>
      {s.processing_error && <p className="mb-5 rounded-xl bg-bad-soft px-4 py-2.5 text-sm text-bad">Processing problem: {s.processing_error}</p>}
      <ReviewPlayer
        sessionId={id}
        projectId={project.id}
        hasRecording={Boolean(s.recording_bytes)}
        audioOnly={s.capture_mode === "mic"}
        durationMs={s.duration_ms ?? 0}
        utterances={utterances}
        questions={q.questions.map((question) => {
          const a = answers.get(question.id);
          const used = new Set<string>(a ? JSON.parse(a.prompt_ids_json) : []);
          return {
            ...question,
            answer: a ? { text: a.text, rating: a.rating } : null,
            prompts: prompts.filter((p) => p.question_id === question.id).map((p) => {
              const u = utterances.find((x) => x.id === p.utterance_id);
              return { ...p, used: used.has(p.id), quote: u?.text ?? "", moment_ms: u?.start_ms ?? p.replay_start_ms };
            }),
          };
        })}
      />
    </Shell>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="tag">{label}</dt>
      <dd className="num mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
