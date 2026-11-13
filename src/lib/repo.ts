import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { all, get, run, tx } from "./db";
import { buildDir, safeJoin, sessionDir } from "./paths";
import type { Question, RecallPrompt, SessionRow, Utterance } from "./types";
import { RETENTION_MS } from "./types";
import { readEntryCapped, validateBuildZip, ZIP_LIMITS, ZipLimitError } from "./zip";

export const newId = (prefix: string) => `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
const now = () => Date.now();

// ---------- projects ----------
export interface Project { id: string; name: string; description: string; created_at: number }

export function createProject(name: string, description = ""): Project {
  const p = { id: newId("prj"), name: name.trim(), description: description.trim(), created_at: now() };
  if (!p.name) throw new HttpError(400, "Project name is required.");
  run("INSERT INTO projects (id,name,description,created_at) VALUES (?,?,?,?)", p.id, p.name, p.description, p.created_at);
  return p;
}
export const listProjects = () =>
  all<Project & { sessions: number; builds: number }>(
    `SELECT p.*, (SELECT COUNT(*) FROM sessions s WHERE s.project_id=p.id) AS sessions,
            (SELECT COUNT(*) FROM builds b WHERE b.project_id=p.id) AS builds
     FROM projects p ORDER BY created_at DESC`,
  );
export const getProject = (id: string) => get<Project>("SELECT * FROM projects WHERE id=?", id);
export function requireProject(id: string) {
  const p = getProject(id);
  if (!p) throw new HttpError(404, "Project not found.");
  return p;
}

// ---------- builds ----------
export interface Build {
  id: string; project_id: string; label: string; original_name: string;
  entry_path: string; file_count: number; total_bytes: number; created_at: number;
}

export async function createBuild(projectId: string, label: string, originalName: string, data: Uint8Array): Promise<Build> {
  requireProject(projectId);
  const v = await validateBuildZip(data);
  if (!v.ok) throw new HttpError(422, v.error);

  const id = newId("bld");
  const root = buildDir(id);
  fs.mkdirSync(root, { recursive: true });
  let written = 0;
  try {
    for (const e of v.entries) {
      const target = safeJoin(root, e.path);
      if (!target) throw new HttpError(422, `Unsafe path in ZIP: ${e.path}`);
      // Declared sizes can lie; enforce the real limit while inflating, not after.
      const buf = await readEntryCapped(e.file, ZIP_LIMITS.maxUncompressedBytes - written).catch((err) => {
        throw err instanceof ZipLimitError ? new HttpError(422, err.message) : err;
      });
      written += buf.byteLength;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buf);
    }
  } catch (err) {
    fs.rmSync(root, { recursive: true, force: true });
    throw err;
  }

  const count = (get<{ n: number }>("SELECT COUNT(*) n FROM builds WHERE project_id=?", projectId)?.n ?? 0) + 1;
  const b: Build = {
    id, project_id: projectId, label: label.trim() || `Build ${count}`, original_name: originalName,
    entry_path: v.entryPath, file_count: v.entries.length, total_bytes: written, created_at: now(),
  };
  run(
    "INSERT INTO builds (id,project_id,label,original_name,entry_path,file_count,total_bytes,created_at) VALUES (?,?,?,?,?,?,?,?)",
    b.id, b.project_id, b.label, b.original_name, b.entry_path, b.file_count, b.total_bytes, b.created_at,
  );
  return b;
}
export const listBuilds = (projectId: string) =>
  all<Build>("SELECT * FROM builds WHERE project_id=? ORDER BY created_at DESC", projectId);
export const getBuild = (id: string) => get<Build>("SELECT * FROM builds WHERE id=?", id);

// ---------- questionnaires ----------
export interface Questionnaire {
  id: string; project_id: string; version: number; title: string; questions: Question[]; created_at: number;
}
type QRow = Omit<Questionnaire, "questions"> & { questions_json: string };
const toQ = (r: QRow): Questionnaire => {
  const { questions_json, ...rest } = r;
  return { ...rest, questions: JSON.parse(questions_json) };
};

export function saveQuestionnaire(projectId: string, title: string, questions: Partial<Question>[]): Questionnaire {
  requireProject(projectId);
  const clean: Question[] = questions
    .map((q) => ({
      id: q.id && /^q_[a-z0-9]+$/.test(q.id) ? q.id : newId("q"),
      type: q.type === "rating" ? ("rating" as const) : ("text" as const),
      prompt: String(q.prompt ?? "").trim(),
    }))
    .filter((q) => q.prompt);
  if (clean.length === 0) throw new HttpError(400, "Add at least one question.");
  if (clean.length > 30) throw new HttpError(400, "At most 30 questions.");
  // Every save is a new immutable version so existing invites keep their questions.
  const version = (get<{ v: number }>("SELECT MAX(version) v FROM questionnaires WHERE project_id=?", projectId)?.v ?? 0) + 1;
  const q = { id: newId("qnr"), project_id: projectId, version, title: title.trim() || "Playtest questionnaire", questions: clean, created_at: now() };
  run(
    "INSERT INTO questionnaires (id,project_id,version,title,questions_json,created_at) VALUES (?,?,?,?,?,?)",
    q.id, q.project_id, q.version, q.title, JSON.stringify(q.questions), q.created_at,
  );
  return q;
}
export function latestQuestionnaire(projectId: string): Questionnaire | undefined {
  const r = get<QRow>("SELECT * FROM questionnaires WHERE project_id=? ORDER BY version DESC LIMIT 1", projectId);
  return r && toQ(r);
}
export function getQuestionnaire(id: string): Questionnaire | undefined {
  const r = get<QRow>("SELECT * FROM questionnaires WHERE id=?", id);
  return r && toQ(r);
}

// ---------- invites ----------
export interface Invite {
  id: string; project_id: string; build_id: string; questionnaire_id: string; token: string; active: number; created_at: number;
}
export function createInvite(projectId: string, buildId: string, questionnaireId: string): Invite {
  const b = getBuild(buildId);
  const q = getQuestionnaire(questionnaireId);
  if (!b || b.project_id !== projectId) throw new HttpError(400, "Build does not belong to this project.");
  if (!q || q.project_id !== projectId) throw new HttpError(400, "Questionnaire does not belong to this project.");
  const inv = { id: newId("inv"), project_id: projectId, build_id: buildId, questionnaire_id: questionnaireId, token: crypto.randomBytes(18).toString("base64url"), active: 1, created_at: now() };
  run("INSERT INTO invites (id,project_id,build_id,questionnaire_id,token,active,created_at) VALUES (?,?,?,?,?,?,?)",
    inv.id, inv.project_id, inv.build_id, inv.questionnaire_id, inv.token, inv.active, inv.created_at);
  return inv;
}
export const listInvites = (projectId: string) =>
  all<Invite & { build_label: string; q_version: number; sessions: number }>(
    `SELECT i.*, b.label build_label, q.version q_version,
       (SELECT COUNT(*) FROM sessions s WHERE s.invite_id=i.id) sessions
     FROM invites i JOIN builds b ON b.id=i.build_id JOIN questionnaires q ON q.id=i.questionnaire_id
     WHERE i.project_id=? ORDER BY i.created_at DESC`, projectId);
export function setInviteActive(id: string, active: boolean) {
  const r = run("UPDATE invites SET active=? WHERE id=?", active ? 1 : 0, id);
  if (!r.changes) throw new HttpError(404, "Invite link not found.");
}
export function inviteByToken(token: string) {
  const inv = get<Invite>("SELECT * FROM invites WHERE token=?", token);
  if (!inv || !inv.active) return undefined;
  return inv;
}

// ---------- sessions ----------
export function createSession(token: string, testerName: string, captureMode: string, idempotencyKey: string | null, language: string | null = null): SessionRow {
  const inv = inviteByToken(token);
  if (!inv) throw new HttpError(403, "This invite link is invalid or has been turned off.");
  if (idempotencyKey) {
    const existing = get<SessionRow>("SELECT * FROM sessions WHERE idempotency_key=?", idempotencyKey);
    if (existing) {
      if (existing.invite_id !== inv.id) throw new HttpError(409, "Idempotency key reused for a different invite.");
      return existing;
    }
  }
  const id = newId("ses");
  const t = now();
  run(
    `INSERT INTO sessions (id,invite_id,project_id,build_id,questionnaire_id,tester_name,idempotency_key,capture_mode,language,status,consent_at,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, inv.id, inv.project_id, inv.build_id, inv.questionnaire_id, testerName.trim().slice(0, 60) || "Anonymous tester",
    idempotencyKey, captureMode, language && /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/.test(language) ? language : null, "recording", t, t,
  );
  return getSession(id)!;
}
export const getSession = (id: string) => get<SessionRow>("SELECT * FROM sessions WHERE id=?", id);
export function updateSession(id: string, fields: Partial<SessionRow>) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  run(`UPDATE sessions SET ${keys.map((k) => `${k}=?`).join(",")} WHERE id=?`,
    ...keys.map((k) => (fields as Record<string, string | number | null>)[k]), id);
}
export const listSessions = (projectId: string) =>
  all<SessionRow & { build_label: string; comment_count: number; answer_count: number }>(
    `SELECT s.*, b.label build_label,
       (SELECT COUNT(*) FROM utterances u WHERE u.session_id=s.id) comment_count,
       (SELECT COUNT(*) FROM answers a WHERE a.session_id=s.id) answer_count
     FROM sessions s JOIN builds b ON b.id=s.build_id WHERE s.project_id=? ORDER BY s.created_at DESC`, projectId);

/** Tester-side access check: the session must belong to the invite token presented. */
export function requireTesterSession(sessionId: string, token: string | null): SessionRow {
  const s = getSession(sessionId);
  const inv = token ? get<Invite>("SELECT * FROM invites WHERE token=?", token) : undefined;
  if (!s || !inv || s.invite_id !== inv.id) throw new HttpError(403, "Not allowed for this session.");
  // A link the developer turned off locks its sessions too, not only new ones.
  if (!inv.active) throw new HttpError(403, "This playtest link was turned off by the developer.");
  return s;
}

export function addUtterances(sessionId: string, items: Omit<Utterance, "id" | "session_id">[]) {
  tx(() => {
    for (const u of items) {
      const text = String(u.text ?? "").trim().slice(0, 2000);
      if (!text) continue;
      const start = Math.max(0, Math.round(Number(u.start_ms) || 0));
      const end = Math.max(start, Math.round(Number(u.end_ms) || start));
      run("INSERT INTO utterances (id,session_id,source,text,start_ms,end_ms) VALUES (?,?,?,?,?,?)",
        newId("utt"), sessionId, u.source, text, start, end);
    }
  });
}
export const listUtterances = (sessionId: string) =>
  all<Utterance>("SELECT * FROM utterances WHERE session_id=? ORDER BY start_ms, id", sessionId);
export const listPrompts = (sessionId: string) =>
  all<RecallPrompt>("SELECT * FROM recall_prompts WHERE session_id=? ORDER BY replay_start_ms", sessionId);

const PROMPT_STATES = ["shown", "inserted", "dismissed"];
const INSERTED_AS = ["quote", "summary"];
/** Card state from the tester. `insertedAs` is sticky: once AI wording went into an answer, the developer must see it. */
export function setPromptState(sessionId: string, promptId: string, state: string, insertedAs?: string | null) {
  if (!PROMPT_STATES.includes(state)) throw new HttpError(400, "Invalid state.");
  if (insertedAs != null && (state !== "inserted" || !INSERTED_AS.includes(insertedAs))) throw new HttpError(400, "Invalid insertedAs.");
  run("UPDATE recall_prompts SET state=?, inserted_as=COALESCE(?, inserted_as) WHERE id=? AND session_id=?", state, insertedAs ?? null, promptId, sessionId);
}

/** The tester asked to see the AI wording on a card (it is hidden until they do). */
export function revealSummary(sessionId: string, promptId: string) {
  run("UPDATE recall_prompts SET summary_revealed=1 WHERE id=? AND session_id=?", promptId, sessionId);
}

/** Comments no recall card picked up, offered at the end of the questionnaire. One-word filler is skipped. */
export function listUnmatchedUtterances(sessionId: string): Utterance[] {
  const used = new Set(listPrompts(sessionId).map((p) => p.utterance_id));
  const substantial = (t: string) => t.trim().length >= 6 || /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]{2,}/.test(t);
  return listUtterances(sessionId).filter((u) => !used.has(u.id) && substantial(u.text));
}

export interface Answer { id: string; session_id: string; question_id: string; text: string; rating: number | null; prompt_ids_json: string; updated_at: number }
export const listAnswers = (sessionId: string) => all<Answer>("SELECT * FROM answers WHERE session_id=?", sessionId);

export function saveAnswer(sessionId: string, questionId: string, text: string, rating: number | null, promptIds: string[]) {
  const s = getSession(sessionId)!;
  const q = getQuestionnaire(s.questionnaire_id)!;
  if (!q.questions.some((x) => x.id === questionId)) throw new HttpError(400, "Unknown question.");
  const r = rating == null ? null : Math.min(5, Math.max(1, Math.round(rating)));
  const valid = new Set(listPrompts(sessionId).map((p) => p.id));
  const ids = promptIds.filter((id) => valid.has(id));
  run(
    `INSERT INTO answers (id,session_id,question_id,text,rating,prompt_ids_json,updated_at) VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(session_id,question_id) DO UPDATE SET text=excluded.text, rating=excluded.rating,
       prompt_ids_json=excluded.prompt_ids_json, updated_at=excluded.updated_at`,
    newId("ans"), sessionId, questionId, text.slice(0, 10000), r, JSON.stringify(ids), now(),
  );
}

export function deleteSession(id: string) {
  run("DELETE FROM sessions WHERE id=?", id);
  fs.rmSync(sessionDir(id), { recursive: true, force: true });
}

/** Delete sessions older than the 7-day retention window. Called lazily on reads. */
export function purgeExpired() {
  const cutoff = now() - RETENTION_MS;
  for (const s of all<{ id: string }>("SELECT id FROM sessions WHERE created_at < ?", cutoff)) deleteSession(s.id);
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
