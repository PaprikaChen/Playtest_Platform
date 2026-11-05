import { describe, expect, it } from "vitest";
import { buildRecallPrompt, mockRecall, sanitizeMatches } from "@/lib/ai/recall";
import type { Question } from "@/lib/types";

const questions: Question[] = [
  { id: "q_a", type: "text", prompt: "Which part felt too difficult or frustrating?" },
  { id: "q_b", type: "rating", prompt: "How responsive did the controls feel?" },
  { id: "q_c", type: "text", prompt: "What did you enjoy most?" },
];
const utterances = [
  { id: "u1", text: "this jump is impossible, I keep dying", start_ms: 63_000 },
  { id: "u2", text: "the music is nice", start_ms: 90_000 },
  { id: "u3", text: "okay", start_ms: 95_000 },
];

describe("sanitizeMatches", () => {
  it("drops unknown ids, duplicates, and caps per question", () => {
    const out = sanitizeMatches(
      {
        matches: [
          { question_id: "q_a", utterance_id: "u1", hint: "You mentioned this jump. Say more?" },
          { question_id: "q_a", utterance_id: "u1", hint: "dup" },
          { question_id: "q_x", utterance_id: "u1", hint: "bad q" },
          { question_id: "q_a", utterance_id: "u9", hint: "bad u" },
        ],
      },
      questions,
      utterances,
    );
    expect(out).toEqual([{ question_id: "q_a", utterance_id: "u1", hint: "You mentioned this jump. Say more?", summary: "" }]);
  });

  it("keeps a summary, normalises whitespace, and caps its length", () => {
    const out = sanitizeMatches(
      {
        matches: [
          { question_id: "q_a", utterance_id: "u1", hint: "h", summary: "  The tester found\n the jump too hard.  " },
          { question_id: "q_c", utterance_id: "u2", hint: "h", summary: "x".repeat(1000) },
          { question_id: "q_b", utterance_id: "u3", hint: "h", summary: 42 },
        ],
      },
      questions,
      utterances,
    );
    expect(out[0].summary).toBe("The tester found the jump too hard.");
    expect(out[1].summary).toHaveLength(400);
    expect(out[2].summary).toBe("42"); // coerced, never crashes
  });

  it("handles malformed model output", () => {
    expect(sanitizeMatches("nope", questions, utterances)).toEqual([]);
    expect(sanitizeMatches({ matches: "x" }, questions, utterances)).toEqual([]);
  });

  it("caps at 3 per question", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `u${i}`, text: "hard", start_ms: i }));
    const out = sanitizeMatches({ matches: many.map((u) => ({ question_id: "q_a", utterance_id: u.id, hint: "h" })) }, questions, many);
    expect(out).toHaveLength(3);
  });
});

describe("mockRecall", () => {
  it("matches difficulty and enjoyment comments via synonyms", () => {
    const r = mockRecall(questions, utterances);
    const pairs = r.matches.map((m) => `${m.question_id}:${m.utterance_id}`);
    expect(pairs).toContain("q_a:u1");
    expect(pairs).not.toContain("q_a:u3");
    expect(r.placeholder).toBe(true);
  });

  it("produces no summaries (they require a real model)", () => {
    for (const m of mockRecall(questions, utterances).matches) expect(m.summary).toBe("");
  });
});

describe("buildRecallPrompt", () => {
  it("references comments by id and asks for JSON", () => {
    const p = buildRecallPrompt(questions, utterances);
    expect(p).toContain("u1 [1:03]: this jump is impossible");
    expect(p).toContain('"matches"');
  });

  it("asks for a grounded first-person summary in the tester's language", () => {
    const p = buildRecallPrompt(questions, utterances);
    expect(p).toContain('"summary"');
    expect(p.toLowerCase()).toContain("same language");
    expect(p).toContain("FIRST PERSON");
    // "a bit hard" must not become "very hard": the summary keeps the tester's own intensity.
    expect(p).toContain("Do not strengthen or soften");
  });
});
