import { getBuild, getProject, getQuestionnaire, inviteByToken } from "@/lib/repo";
import { TesterApp } from "./tester-app";

export const dynamic = "force-dynamic";

export default async function TesterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = inviteByToken(token);
  if (!inv) {
    return (
      <main className="min-h-screen grid place-items-center p-6">
        <div className="card max-w-md text-center">
          <h1 className="font-semibold">This playtest link isn&apos;t active</h1>
          <p className="text-sm text-muted mt-2">Ask the developer for a new link.</p>
        </div>
      </main>
    );
  }
  const project = getProject(inv.project_id)!;
  const build = getBuild(inv.build_id)!;
  const q = getQuestionnaire(inv.questionnaire_id)!;
  return (
    <TesterApp
      token={token}
      projectName={project.name}
      projectDescription={project.description}
      buildLabel={build.label}
      gameUrl={`/g/${token}/${build.entry_path}`}
      questionCount={q.questions.length}
    />
  );
}
