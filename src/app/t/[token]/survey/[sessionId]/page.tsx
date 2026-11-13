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
  // Always the same client component, with "already submitted" as a prop: a server refresh right after submit
  // (dev HMR, router.refresh) then keeps the client's thank-you state instead of swapping the whole tree.
  return <SurveyPage token={token} sessionId={sessionId} projectName={getProject(s.project_id)!.name} audioOnly={s.capture_mode === "mic"} alreadySubmitted={Boolean(s.submitted_at)} />;
}
