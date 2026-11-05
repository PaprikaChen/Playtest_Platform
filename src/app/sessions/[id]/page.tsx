import { notFound } from "next/navigation";
import { Shell, Status, fmtDate, fmtTime } from "@/components/ui";
import { getProject, getQuestionnaire, getSession, listAnswers, listPrompts, listUtterances, purgeExpired } from "@/lib/repo";
import { RETENTION_MS } from "@/lib/types";
import { ReviewPlayer } from "./review-player";

export const dynamic = "force-dynamic";

export default async function SessionReview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  purgeExpired();
  const s = getSession(id);
  if (!s) notFound();
  const project = getProject(s.project_id)!;
  const q = getQuestionnaire(s.questionnaire_id)!;
  const utterances = listUtterances(id);
  const prompts = listPrompts(id);
  const answers = new Map(listAnswers(id).map((a) => [a.question_id, a]));
  const daysLeft = Math.max(0, Math.ceil((s.created_at + RETENTION_MS - Date.now()) / 86400000));

  return (
    <Shell crumbs={[{ href: `/projects/${project.id}`, label: project.name }, { label: s.tester_name }]}>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">{s.tester_name}</h1>
        <Status value={s.status} />
        <span className="text-sm text-muted">{fmtDate(s.created_at)} · {s.duration_ms ? fmtTime(s.duration_ms) : "—"} · {s.capture_mode}</span>
        <span className="text-xs text-muted ml-auto">Auto-deletes in {daysLeft} day{daysLeft === 1 ? "" : "s"}</span>
      </div>
      <div className="flex flex-wrap gap-2 text-xs mb-5">
        <Status value={s.transcript_status} label="Transcript" />
        <Status value={s.prompts_status} label="Recall prompts" />
        {s.ai_provider && <span className="pill bg-background text-muted">AI: {s.ai_provider}</span>}
        {s.processing_error && <span className="pill bg-bad-soft text-bad">{s.processing_error}</span>}
      </div>
      <ReviewPlayer
        sessionId={id}
        hasRecording={Boolean(s.recording_bytes)}
        audioOnly={s.capture_mode === "mic"}
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
