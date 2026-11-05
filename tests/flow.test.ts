import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { beforeAll, describe, expect, it } from "vitest";

// Isolated data dir per test run; must be set before the db module loads.
process.env.PLAYTEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "playtest-test-"));
delete process.env.GEMINI_API_KEY;
delete process.env.RECALL_PROVIDER;

type Repo = typeof import("@/lib/repo");
type Proc = typeof import("@/lib/processing");
let repo: Repo;
let proc: Proc;

beforeAll(async () => {
  repo = await import("@/lib/repo");
  proc = await import("@/lib/processing");
});

async function sampleZip() {
  const z = new JSZip();
  z.file("Game/index.html", "<html><script src='game.js'></script></html>");
  z.file("Game/game.js", "console.log(1)");
  return z.generateAsync({ type: "uint8array" });
}

describe("creator → tester → review flow", () => {
  it("runs end to end with mock AI", async () => {
    const p = repo.createProject("Lantern Hop");
    const b = await repo.createBuild(p.id, "v1", "game.zip", await sampleZip());
    expect(b.entry_path).toBe("index.html");
    expect(fs.existsSync(path.join(process.env.PLAYTEST_DATA_DIR!, "builds", b.id, "game.js"))).toBe(true);

    const q = repo.saveQuestionnaire(p.id, "Test", [
      { type: "text", prompt: "Which part felt too difficult?" },
      { type: "rating", prompt: "How did the controls feel?" },
    ]);
    const inv = repo.createInvite(p.id, b.id, q.id);

    const s = repo.createSession(inv.token, "Sam", "comments-only", "idem-1");
    // Idempotent creation returns the same session.
    expect(repo.createSession(inv.token, "Sam", "comments-only", "idem-1").id).toBe(s.id);

    repo.addUtterances(s.id, [
      { source: "typed", text: "this jump is too hard", start_ms: 12_000, end_ms: 12_000 },
      { source: "typed", text: "controls feel floaty", start_ms: 30_000, end_ms: 30_000 },
    ]);
    await proc.assembleRecording(s.id, 0);
    repo.updateSession(s.id, { status: "processing" });
    await proc.processSession(s.id);

    const done = repo.getSession(s.id)!;
    expect(done.prompts_status).toBe("done");
    expect(done.ai_provider).toContain("mock");
    const prompts = repo.listPrompts(s.id);
    expect(prompts.length).toBeGreaterThan(0);
    const hard = prompts.find((x) => x.question_id === q.questions[0].id)!;
    expect(hard.replay_start_ms).toBe(7_000); // 5 s before the comment
    expect(hard.replay_end_ms).toBe(17_000);

    repo.saveAnswer(s.id, q.questions[1].id, "a bit floaty", 3, [hard.id, "rcp_fake"]);
    const ans = repo.listAnswers(s.id)[0];
    expect(ans.rating).toBe(3);
    expect(JSON.parse(ans.prompt_ids_json)).toEqual([hard.id]); // unknown prompt id dropped
  });

  it("records whether the tester inserted their quote or the AI wording (decision 0005)", async () => {
    const p = repo.createProject("Provenance");
    const b = await repo.createBuild(p.id, "v1", "game.zip", await sampleZip());
    const q = repo.saveQuestionnaire(p.id, "", [{ type: "text", prompt: "Which part felt too difficult?" }]);
    const s = repo.createSession(repo.createInvite(p.id, b.id, q.id).token, "Ana", "comments-only", null);
    repo.addUtterances(s.id, [
      { source: "typed", text: "this jump is too hard", start_ms: 12_000, end_ms: 12_000 },
      { source: "typed", text: "the jump at the end is too hard too", start_ms: 20_000, end_ms: 20_000 },
    ]);
    repo.updateSession(s.id, { status: "processing" });
    await proc.processSession(s.id);
    const [a, c] = repo.listPrompts(s.id);
    expect(a.inserted_as).toBeNull();

    repo.setPromptState(s.id, a.id, "inserted", "summary");
    repo.setPromptState(s.id, c.id, "inserted", "quote");
    expect(repo.listPrompts(s.id).map((x) => x.inserted_as)).toEqual(["summary", "quote"]);
    // Dismissing afterwards keeps the record: the inserted wording may still be in the answer.
    repo.setPromptState(s.id, a.id, "dismissed");
    expect(repo.listPrompts(s.id)[0]).toMatchObject({ state: "dismissed", inserted_as: "summary" });

    expect(() => repo.setPromptState(s.id, a.id, "inserted", "made-up")).toThrow(/Invalid/);
    expect(() => repo.setPromptState(s.id, a.id, "bogus")).toThrow(/Invalid/);
  });

  it("enforces invite and session scoping", async () => {
    const p1 = repo.createProject("A");
    const p2 = repo.createProject("B");
    const b1 = await repo.createBuild(p1.id, "", "a.zip", await sampleZip());
    const q2 = repo.saveQuestionnaire(p2.id, "", [{ type: "text", prompt: "hi" }]);
    expect(() => repo.createInvite(p1.id, b1.id, q2.id)).toThrow(/does not belong/);

    const q1 = repo.saveQuestionnaire(p1.id, "", [{ type: "text", prompt: "hi" }]);
    const inv = repo.createInvite(p1.id, b1.id, q1.id);
    const s = repo.createSession(inv.token, "x", "mic", null);
    const other = repo.createInvite(p1.id, b1.id, q1.id);
    expect(() => repo.requireTesterSession(s.id, other.token)).toThrow();
    expect(repo.requireTesterSession(s.id, inv.token).id).toBe(s.id);

    repo.setInviteActive(inv.id, false);
    expect(() => repo.createSession(inv.token, "y", "mic", null)).toThrow(/invalid|turned off/);
  });

  it("purges sessions past the 7-day window", async () => {
    const p = repo.createProject("Old");
    const b = await repo.createBuild(p.id, "", "a.zip", await sampleZip());
    const q = repo.saveQuestionnaire(p.id, "", [{ type: "text", prompt: "hi" }]);
    const inv = repo.createInvite(p.id, b.id, q.id);
    const s = repo.createSession(inv.token, "x", "mic", null);
    repo.updateSession(s.id, { created_at: Date.now() - 8 * 86400000 });
    repo.purgeExpired();
    expect(repo.getSession(s.id)).toBeUndefined();
  });
});

describe("abandoned sessions", () => {
  it("closes a session with no activity for 30 min and keeps what was recorded", async () => {
    const p = repo.createProject("Left Early");
    const b = await repo.createBuild(p.id, "", "a.zip", await sampleZip());
    const q = repo.saveQuestionnaire(p.id, "", [{ type: "text", prompt: "Which part felt too difficult?" }]);
    const inv = repo.createInvite(p.id, b.id, q.id);
    const s = repo.createSession(inv.token, "Quitter", "comments-only", null);
    repo.addUtterances(s.id, [{ source: "typed", text: "this is too hard", start_ms: 1000, end_ms: 1000 }]);
    const fresh = repo.createSession(inv.token, "Still playing", "comments-only", null);
    repo.updateSession(s.id, { consent_at: Date.now() - 31 * 60 * 1000 });

    expect(await proc.finalizeStaleSessions()).toBe(1);
    await new Promise((r) => setTimeout(r, 50));
    const closed = repo.getSession(s.id)!;
    expect(closed.status).toBe("abandoned");
    expect(closed.prompts_status).toBe("done"); // developer still gets recall data
    expect(repo.listPrompts(s.id).length).toBeGreaterThan(0);
    expect(repo.getSession(fresh.id)!.status).toBe("recording");
  });
});

describe("questionnaire versions and limits", () => {
  it("existing invites keep the questions they were created with", async () => {
    const p = repo.createProject("Versions");
    const b = await repo.createBuild(p.id, "", "a.zip", await sampleZip());
    const v1 = repo.saveQuestionnaire(p.id, "", [{ type: "text", prompt: "Old question?" }]);
    const inv = repo.createInvite(p.id, b.id, v1.id);
    repo.saveQuestionnaire(p.id, "", [{ type: "text", prompt: "New question?" }]);
    const s = repo.createSession(inv.token, "x", "comments-only", null);
    expect(repo.getQuestionnaire(s.questionnaire_id)!.questions[0].prompt).toBe("Old question?");
    expect(repo.latestQuestionnaire(p.id)!.version).toBe(2);
  });

  it("rejects more than 30 questions and drops blank ones", () => {
    const p = repo.createProject("Limits");
    expect(() => repo.saveQuestionnaire(p.id, "", Array.from({ length: 31 }, (_, i) => ({ type: "text" as const, prompt: `Q${i}` })))).toThrow(/30/);
    expect(() => repo.saveQuestionnaire(p.id, "", [{ type: "text", prompt: "   " }])).toThrow(/at least one/);
    expect(repo.saveQuestionnaire(p.id, "", [{ type: "text", prompt: "a" }, { type: "text", prompt: "" }]).questions).toHaveLength(1);
  });

  it("clamps ratings and ignores answers to unknown questions", async () => {
    const p = repo.createProject("Ratings");
    const b = await repo.createBuild(p.id, "", "a.zip", await sampleZip());
    const q = repo.saveQuestionnaire(p.id, "", [{ type: "rating", prompt: "Controls?" }]);
    const s = repo.createSession(repo.createInvite(p.id, b.id, q.id).token, "x", "comments-only", null);
    repo.saveAnswer(s.id, q.questions[0].id, "", 9, []);
    expect(repo.listAnswers(s.id)[0].rating).toBe(5);
    expect(() => repo.saveAnswer(s.id, "q_nope", "x", null, [])).toThrow(/Unknown question/);
  });
});
