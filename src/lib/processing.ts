import fs from "node:fs";
import path from "node:path";
import { all, run, tx } from "./db";
import { chunkPath, recordingPath, sessionDir } from "./paths";
import { addUtterances, getQuestionnaire, getSession, listUtterances, newId, updateSession } from "./repo";
import { transcribeRecording } from "./ai/transcribe";
import { generateRecall } from "./ai/recall";
import { makeSeekable } from "./webm";
import { REPLAY_AFTER_MS, REPLAY_BEFORE_MS, STALE_RECORDING_MS, type SessionRow } from "./types";

/** Concatenate uploaded chunks in sequence order into one recording file. */
export function assembleRecording(sessionId: string, expectedChunks: number, durationMs = 0): { bytes: number; missing: number[] } {
  const seqs = all<{ seq: number }>("SELECT seq FROM chunks WHERE session_id=? ORDER BY seq", sessionId).map((r) => r.seq);
  const have = new Set(seqs);
  const missing: number[] = [];
  for (let i = 0; i < expectedChunks; i++) if (!have.has(i)) missing.push(i);
  if (seqs.length === 0) return { bytes: 0, missing };

  const out = recordingPath(sessionId);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const parts = seqs.map((s) => fs.readFileSync(chunkPath(sessionId, s)));
  let buf: Buffer = Buffer.concat(parts);
  try {
    buf = makeSeekable(buf, durationMs);
  } catch (e) {
    console.warn(`[processing] could not add webm cues for ${sessionId}:`, e);
  }
  fs.writeFileSync(out, buf);
  fs.rmSync(path.join(sessionDir(sessionId), "chunks"), { recursive: true, force: true });
  return { bytes: buf.byteLength, missing };
}

const inflight = new Set<string>();

/** After processing: keep "submitted" / "abandoned", otherwise the tester can now answer ("ready"). */
function settledStatus(sessionId: string): SessionRow["status"] {
  const st = getSession(sessionId)?.status;
  return st === "submitted" || st === "abandoned" ? st : "ready";
}

/**
 * Close sessions whose tester left mid-play (tab closed, crash): no upload or
 * comment for STALE_RECORDING_MS. Whatever was recorded is assembled and
 * processed so the developer still gets it. Called lazily on reads.
 */
export function finalizeStaleSessions(now = Date.now()) {
  const cutoff = now - STALE_RECORDING_MS;
  const stale = all<{ id: string }>(
    `SELECT s.id FROM sessions s WHERE s.status='recording'
       AND MAX(s.consent_at, COALESCE((SELECT MAX(c.created_at) FROM chunks c WHERE c.session_id=s.id), 0)) < ?`,
    cutoff,
  );
  for (const { id } of stale) {
    const seqs = all<{ seq: number }>("SELECT seq FROM chunks WHERE session_id=? ORDER BY seq", id);
    const { bytes } = assembleRecording(id, seqs.length ? seqs[seqs.length - 1].seq + 1 : 0);
    updateSession(id, {
      status: "abandoned",
      ended_at: now,
      recording_bytes: bytes || null,
      recording_mime: bytes ? "video/webm" : null,
      processing_error: "Tester left before finishing; the session was closed automatically.",
    });
    void processSession(id);
  }
  return stale.length;
}
export const isProcessing = (sessionId: string) => inflight.has(sessionId);

/**
 * Async pipeline after a session ends: transcript -> recall prompts.
 * Failures are recorded on the session; the questionnaire never blocks on this.
 */
export async function processSession(sessionId: string) {
  if (inflight.has(sessionId)) return;
  inflight.add(sessionId);
  try {
    const s = getSession(sessionId);
    if (!s) return;
    const q = getQuestionnaire(s.questionnaire_id)!;

    // Resumable: a stage that already finished is not repeated (avoids duplicate transcript rows).
    if (!["done", "skipped", "failed"].includes(s.transcript_status)) {
      updateSession(sessionId, { transcript_status: "running" });
      try {
        const file = fs.existsSync(recordingPath(sessionId)) ? recordingPath(sessionId) : null;
        const t = await transcribeRecording(file, s.language);
        tx(() => {
          // Replace, don't append: a retried run must not duplicate transcript rows.
          run("DELETE FROM utterances WHERE session_id=? AND source='voice'", sessionId);
          if (t.segments.length) {
            // A full transcript supersedes the rough live captions.
            run("DELETE FROM utterances WHERE session_id=? AND source='voice-live'", sessionId);
          }
        });
        if (t.segments.length) addUtterances(sessionId, t.segments.map((seg) => ({ source: "voice" as const, ...seg })));
        updateSession(sessionId, { transcript_status: t.placeholder ? "skipped" : "done" });
      } catch (e) {
        updateSession(sessionId, { transcript_status: "failed", processing_error: String((e as Error).message ?? e) });
      }
    }

    updateSession(sessionId, { prompts_status: "running" });
    try {
      const utterances = listUtterances(sessionId);
      const result = await generateRecall(q.questions, utterances);
      const byId = new Map(utterances.map((u) => [u.id, u]));
      tx(() => {
        run("DELETE FROM recall_prompts WHERE session_id=?", sessionId);
        for (const m of result.matches) {
          const u = byId.get(m.utterance_id)!;
          run(
            "INSERT INTO recall_prompts (id,session_id,question_id,utterance_id,hint,replay_start_ms,replay_end_ms) VALUES (?,?,?,?,?,?,?)",
            newId("rcp"), sessionId, m.question_id, m.utterance_id, m.hint,
            Math.max(0, u.start_ms - REPLAY_BEFORE_MS), u.end_ms + REPLAY_AFTER_MS,
          );
        }
      });
      updateSession(sessionId, {
        prompts_status: "done",
        ai_provider: result.placeholder ? `${result.provider} (placeholder)` : `${result.provider}:${result.model}`,
        prompts_ready_at: Date.now(),
        status: settledStatus(sessionId),
      });
    } catch (e) {
      updateSession(sessionId, { prompts_status: "failed", processing_error: String((e as Error).message ?? e), status: settledStatus(sessionId) });
    }
  } finally {
    inflight.delete(sessionId);
  }
}
