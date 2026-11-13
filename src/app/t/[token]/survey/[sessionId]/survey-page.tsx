"use client";
import { useState } from "react";
import { Survey } from "../../survey";

export function SurveyPage({ alreadySubmitted, ...props }: { token: string; sessionId: string; projectName: string; audioOnly: boolean; alreadySubmitted: boolean }) {
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <main className="min-h-screen grid place-items-center p-6">
        <div className="card max-w-md text-center space-y-2">
          <h1 className="text-xl font-semibold">Thanks for playtesting! 🎉</h1>
          <p className="text-sm text-muted">Your feedback was sent to the developer of {props.projectName}. You can close this tab.</p>
        </div>
      </main>
    );
  }
  if (alreadySubmitted) {
    return <main className="min-h-screen grid place-items-center p-6"><div className="card text-center"><h1 className="font-semibold">Feedback already submitted. Thank you!</h1></div></main>;
  }
  return <Survey {...props} onSubmitted={() => setDone(true)} />;
}
