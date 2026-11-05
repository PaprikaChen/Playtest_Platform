import type { Question } from "../types";

export interface RecallInputUtterance { id: string; text: string; start_ms: number }
export interface RecallMatch { question_id: string; utterance_id: string; hint: string; summary: string }
export interface RecallResult { provider: string; model: string | null; placeholder: boolean; matches: RecallMatch[] }

export const MAX_PROMPTS_PER_QUESTION = 3;

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// One compact prompt per session: all questions + all utterances, JSON out.
// This keeps token use to a single call regardless of question count.
export function buildRecallPrompt(questions: Question[], utterances: RecallInputUtterance[]): string {
  const qs = questions.map((q) => `${q.id}: ${q.prompt}`).join("\n");
  const us = utterances.map((u) => `${u.id} [${fmt(u.start_ms)}]: ${u.text}`).join("\n");
  return `You help a game playtester recall what they said while playing, so they can answer a questionnaire.
Match each tester comment to the questionnaire questions it is clearly relevant to.

Rules:
- Only match when the comment is genuinely relevant to the question. Skip unrelated comments.
- At most ${MAX_PROMPTS_PER_QUESTION} comments per question. A comment may match more than one question.
- For each match write "hint": ONE short, neutral sentence (max 20 words) inviting the tester to expand.
  Do not judge, do not add sentiment the tester did not express, do not suggest an answer.
  Good: "You mentioned the jump here. Want to say more about it?"
- For each match also write "summary": 1-2 sentences in the tester's FIRST PERSON ("I ..."), phrasing what they
  expressed in that comment as a possible written answer, including any suggestion they themselves voiced.
  Ground it ONLY in the tester's comments: no sentiment they did not express, no advice of your own,
  no judgement of the game. Do not strengthen or soften what they said: keep their intensity and
  hedges ("a bit hard" stays "a bit hard", never "very hard"). Write the summary in the same language as the comment.
  Good: "I found the second level very hard and didn't understand why failing sent me back to level one."
- Refer to comments only by their id. Do not quote or rewrite them.

QUESTIONS
${qs}

COMMENTS
${us}

Respond with JSON only: {"matches":[{"question_id":"...","utterance_id":"...","hint":"...","summary":"..."}]}`;
}

/** Keep only matches that reference real IDs, de-duplicate, cap per question. */
export function sanitizeMatches(raw: unknown, questions: Question[], utterances: RecallInputUtterance[]): RecallMatch[] {
  const qids = new Set(questions.map((q) => q.id));
  const uids = new Set(utterances.map((u) => u.id));
  const list = (raw as { matches?: unknown })?.matches;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const perQ = new Map<string, number>();
  const out: RecallMatch[] = [];
  for (const m of list) {
    const q = String(m?.question_id ?? "");
    const u = String(m?.utterance_id ?? "");
    const hint = String(m?.hint ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    // The summary is AI-generated display text: whitespace-normalised and capped, never trusted as-is.
    const summary = String(m?.summary ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
    if (!qids.has(q) || !uids.has(u) || seen.has(`${q}|${u}`)) continue;
    if ((perQ.get(q) ?? 0) >= MAX_PROMPTS_PER_QUESTION) continue;
    seen.add(`${q}|${u}`);
    perQ.set(q, (perQ.get(q) ?? 0) + 1);
    out.push({ question_id: q, utterance_id: u, hint: hint || "You commented on this while playing. Want to say more?", summary });
  }
  return out;
}

// ---------- mock provider: keyword overlap, no network, no tokens ----------
const STOP = new Set(
  "a an the and or but if to of in on at for with is are was were be been it this that these those i you we they he she my your our their me us them do did does done have has had not no yes so very really just about what which who how when where why there here can could would should will any some more most much many than then too also from by as into out up down over again like feel felt think".split(" "),
);
const SYNONYMS: Record<string, string[]> = {
  difficult: ["hard", "difficulty", "tough", "challenging", "impossible", "frustrating", "die", "died", "dying", "death"],
  confusing: ["confused", "confuse", "unclear", "lost", "stuck", "understand", "where", "know", "tutorial", "explain"],
  control: ["controls", "jump", "move", "movement", "key", "keys", "button", "input", "responsive"],
  enjoy: ["fun", "like", "liked", "love", "enjoyed", "cool", "nice", "great", "boring"],
  visual: ["art", "graphics", "look", "looks", "color", "colors", "see", "visible", "ui"],
  sound: ["audio", "music", "sfx", "sounds"],
};
function tokens(s: string): Set<string> {
  const words = s.toLowerCase().match(/[a-z']+/g) ?? [];
  const out = new Set<string>();
  for (const w0 of words) {
    const w = w0.replace(/'s$/, "").replace(/(ing|ed|s)$/, "") || w0;
    // Synonym groups first: words like "where"/"know" signal confusion even though they're stopwords.
    for (const [k, vs] of Object.entries(SYNONYMS)) if (k === w0 || k === w || vs.includes(w0)) out.add(`#${k}`);
    if (STOP.has(w0) || w0.length < 3) continue;
    out.add(w0);
    out.add(w);
  }
  return out;
}

export function mockRecall(questions: Question[], utterances: RecallInputUtterance[]): RecallResult {
  const matches: RecallMatch[] = [];
  for (const q of questions) {
    const qt = tokens(q.prompt);
    const scored = utterances
      .map((u) => ({ u, score: [...tokens(u.text)].filter((t) => qt.has(t)).length }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_PROMPTS_PER_QUESTION);
    for (const { u } of scored) {
      // No summary from the keyword matcher: a summary that just echoes the quote adds noise, not recall.
      matches.push({ question_id: q.id, utterance_id: u.id, hint: `You commented on this around ${fmt(u.start_ms)}. Want to say more about it?`, summary: "" });
    }
  }
  return { provider: "mock", model: null, placeholder: true, matches };
}

// ---------- real providers (selected by RECALL_PROVIDER) ----------
function extractJson(text: string): unknown {
  const m = text.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : {};
}

async function callProvider(provider: string, prompt: string): Promise<{ model: string; text: string }> {
  if (provider === "gemini") {
    const model = process.env.RECALL_MODEL ?? "gemini-2.5-flash-lite";
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
    const body = await res.json();
    return { model, text: body.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}" };
  }
  if (provider === "openai") {
    const model = process.env.RECALL_MODEL ?? "gpt-4.1-mini";
    const res = await fetch(`${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}` },
      body: JSON.stringify({ model, temperature: 0.2, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
    const body = await res.json();
    return { model, text: body.choices?.[0]?.message?.content ?? "{}" };
  }
  if (provider === "anthropic") {
    const model = process.env.RECALL_MODEL ?? "claude-haiku-5-5";
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      // Summaries made the output grow with match count: 2000 tokens truncated an
      // 11-match Chinese session mid-JSON and the whole prompts stage failed.
      body: JSON.stringify({ model, max_tokens: 16000, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
    const body = await res.json();
    return { model, text: body.content?.find((c: { type: string }) => c.type === "text")?.text ?? "{}" };
  }
  throw new Error(`Unknown RECALL_PROVIDER: ${provider}`);
}

export function configuredRecallProvider(): string {
  if (process.env.RECALL_PROVIDER) return process.env.RECALL_PROVIDER;
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "mock";
}

export async function generateRecall(questions: Question[], utterances: RecallInputUtterance[]): Promise<RecallResult> {
  const provider = configuredRecallProvider();
  if (provider === "mock" || utterances.length === 0) return mockRecall(questions, utterances);
  const { model, text } = await callProvider(provider, buildRecallPrompt(questions, utterances));
  return { provider, model, placeholder: false, matches: sanitizeMatches(extractJson(text), questions, utterances) };
}
