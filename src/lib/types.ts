export type QuestionType = "text" | "rating";

export interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
}

export interface Utterance {
  id: string;
  session_id: string;
  source: "typed" | "voice" | "voice-live";
  text: string;
  start_ms: number;
  end_ms: number;
}

export interface RecallPrompt {
  id: string;
  session_id: string;
  question_id: string;
  utterance_id: string;
  hint: string;
  /** AI-generated restatement of the utterance; "" when the provider produces none (mock, old sessions). */
  summary: string;
  replay_start_ms: number;
  replay_end_ms: number;
  state: "shown" | "inserted" | "dismissed";
  /** What the tester inserted into their answer: their own quote or the AI wording. Kept after a later dismiss. */
  inserted_as: "quote" | "summary" | null;
}

export interface SessionRow {
  id: string;
  invite_id: string;
  project_id: string;
  build_id: string;
  questionnaire_id: string;
  tester_name: string;
  capture_mode: string;
  language: string | null;
  status: "recording" | "processing" | "ready" | "failed" | "submitted" | "abandoned";
  transcript_status: string;
  prompts_status: string;
  processing_error: string | null;
  ai_provider: string | null;
  recording_mime: string | null;
  recording_bytes: number | null;
  duration_ms: number | null;
  consent_at: number;
  ended_at: number | null;
  submitted_at: number | null;
  completed_at: number | null;
  prompts_ready_at: number | null;
  created_at: number;
}

/**
 * Languages a tester can declare they will speak (consent-page picker).
 * The whole chain follows the choice: Whisper transcription (`whisper` is the
 * name local Whisper expects) and the recall hints + summaries.
 */
export const SPOKEN_LANGUAGES = [
  { code: "en", label: "English", whisper: "english" },
  { code: "zh", label: "中文", whisper: "chinese" },
  { code: "es", label: "Español", whisper: "spanish" },
  { code: "fr", label: "Français", whisper: "french" },
  { code: "de", label: "Deutsch", whisper: "german" },
  { code: "ja", label: "日本語", whisper: "japanese" },
  { code: "ko", label: "한국어", whisper: "korean" },
] as const;

export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** A session still "recording" with no uploads for this long is treated as abandoned. */
export const STALE_RECORDING_MS = 30 * 60 * 1000;
export const REPLAY_BEFORE_MS = 5000;
export const REPLAY_AFTER_MS = 5000;
