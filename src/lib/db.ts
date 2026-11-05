import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./paths";

// Local SQLite store for the alpha. The schema mirrors the Supabase tables we
// plan to migrate to, so IDs and relations stay the same after the switch.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS builds (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  original_name TEXT NOT NULL,
  entry_path TEXT NOT NULL,
  file_count INTEGER NOT NULL,
  total_bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS questionnaires (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  questions_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(project_id, version)
);
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  build_id TEXT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  questionnaire_id TEXT NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  invite_id TEXT NOT NULL REFERENCES invites(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  build_id TEXT NOT NULL,
  questionnaire_id TEXT NOT NULL,
  tester_name TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  capture_mode TEXT NOT NULL,
  language TEXT,
  status TEXT NOT NULL,
  transcript_status TEXT NOT NULL DEFAULT 'pending',
  prompts_status TEXT NOT NULL DEFAULT 'pending',
  processing_error TEXT,
  ai_provider TEXT,
  recording_mime TEXT,
  recording_bytes INTEGER,
  duration_ms INTEGER,
  consent_at INTEGER NOT NULL,
  ended_at INTEGER,
  submitted_at INTEGER,
  completed_at INTEGER,
  prompts_ready_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, seq)
);
CREATE TABLE IF NOT EXISTS utterances (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  text TEXT NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS recall_prompts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  utterance_id TEXT NOT NULL REFERENCES utterances(id) ON DELETE CASCADE,
  hint TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  replay_start_ms INTEGER NOT NULL,
  replay_end_ms INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'shown'
);
CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  rating INTEGER,
  prompt_ids_json TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL,
  UNIQUE(session_id, question_id)
);
`;

const globalForDb = globalThis as unknown as { __playtestDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (!globalForDb.__playtestDb) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const conn = new DatabaseSync(path.join(DATA_DIR, "playtest.sqlite"));
    conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    conn.exec(SCHEMA);
    migrate(conn);
    globalForDb.__playtestDb = conn;
  }
  return globalForDb.__playtestDb;
}

/** Additive migrations for databases created by older versions of SCHEMA. */
function migrate(conn: DatabaseSync) {
  const cols = (table: string) => (conn.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  if (!cols("sessions").includes("language")) conn.exec("ALTER TABLE sessions ADD COLUMN language TEXT");
  if (!cols("recall_prompts").includes("summary")) conn.exec("ALTER TABLE recall_prompts ADD COLUMN summary TEXT NOT NULL DEFAULT ''");
}

type Row = Record<string, unknown>;
type Param = string | number | null;

// node:sqlite returns null-prototype rows; copy into plain objects so they
// can be passed to React client components.
export function all<T = Row>(sql: string, ...params: Param[]): T[] {
  return db().prepare(sql).all(...params).map((r) => ({ ...r })) as T[];
}
export function get<T = Row>(sql: string, ...params: Param[]): T | undefined {
  const r = db().prepare(sql).get(...params);
  return r ? ({ ...r } as T) : undefined;
}
export function run(sql: string, ...params: Param[]) {
  return db().prepare(sql).run(...params);
}

export function tx<T>(fn: () => T): T {
  const conn = db();
  conn.exec("BEGIN");
  try {
    const out = fn();
    conn.exec("COMMIT");
    return out;
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}
