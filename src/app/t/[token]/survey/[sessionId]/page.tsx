import { getProject, getSession, inviteByToken } from "@/lib/repo";
import { SurveyPage } from "./survey-page";

export const dynamic = "force-dynamic";

// Own URL so a reload during the questionnaire doesn't lose the session.
export default async function Page({ params }: { params: Promise<{ token: string; sessionId: string }> }) {
  const { token, sessionId } = await params;
  const inv = inviteByToken(token);
  const s = getSession(sessionId);
  if (!inv || !s || s.invite_id !== inv.id) {
    return <main className="min-h-screen grid place-items-center p-6"><div className="card">This session link isn&apos;t valid.</div></main>;
  }
  if (s.submitted_at) {
    return <main className="min-h-screen grid place-items-center p-6"><div className="card text-center"><h1 className="font-semibold">Feedback already submitted. Thank you!</h1></div></main>;
  }
  return <SurveyPage token={token} sessionId={sessionId} projectName={getProject(s.project_id)!.name} audioOnly={s.capture_mode === "mic"} />;
}
