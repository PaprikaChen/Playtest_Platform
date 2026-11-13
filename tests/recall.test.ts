import { describe, expect, it } from "vitest";
import { buildRecallPrompt, FIXTURE_SUMMARY_TAG, fixtureRecall, mockRecall, sanitizeMatches } from "@/lib/ai/recall";
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
    expect(out).toEqual([{ question_id: "q_a", utterance_id: "u1", hint: "You mentioned this jump. Say more?", summary: "", also: [] }]);
  });

  it("gives each comment ONE card, under its first (best) question; other questions become 'also'", () => {
    const out = sanitizeMatches(
      {
        matches: [
          { question_id: "q_a", utterance_id: "u1", hint: "h", also_question_ids: ["q_b", "q_x", "q_a"] },
          { question_id: "q_c", utterance_id: "u1", hint: "second listing of the same comment" },
          { question_id: "q_c", utterance_id: "u2", hint: "h" },
        ],
      },
      questions,
      utterances,
    );
    expect(out.map((m) => [m.question_id, m.utterance_id, m.also])).toEqual([
      ["q_a", "u1", ["q_b", "q_c"]], // unknown q_x and the primary itself are dropped
      ["q_c", "u2", []],
    ]);
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

  it("puts a comment under the question it fits best, never twice", () => {
    const qs: Question[] = [
      { id: "q_ctrl", type: "rating", prompt: "How did the controls feel?" },
      { id: "q_hard", type: "text", prompt: "Which part felt too difficult or frustrating?" },
    ];
    // "jump" hits controls once; "hard", "impossible", "frustrating" hit difficulty three times.
    const us = [{ id: "u1", text: "this jump is hard, impossible and frustrating", start_ms: 0 }];
    const r = mockRecall(qs, us);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]).toMatchObject({ question_id: "q_hard", utterance_id: "u1", also: ["q_ctrl"] });
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
    expect(p).toContain("at most ONE question");
    expect(p).toContain('"also_question_ids"');
  });

  it("names the declared session language so output never follows the browser locale", () => {
    // The tester declares what they speak (issue #40); "zh-CN" style tags normalise to the primary code.
    expect(buildRecallPrompt(questions, utterances, "en")).toContain("in english");
    expect(buildRecallPrompt(questions, utterances, "zh-CN")).toContain("in chinese");
    expect(buildRecallPrompt(questions, utterances, "xx")).toContain("same language");
  });
});

describe("fixtureRecall (E2E only)", () => {
  it("adds a deterministic summary only to comments tagged for it, so both card layouts get tested", () => {
    const tagged = [...utterances, { id: "u4", text: `this jump is impossible ${FIXTURE_SUMMARY_TAG}`, start_ms: 99_000 }];
    const r = fixtureRecall(questions, tagged);
    const byU = new Map(r.matches.map((m) => [m.utterance_id, m.summary]));
    expect(byU.get("u4")).toBe("In my words: this jump is impossible.");
    expect(byU.get("u1")).toBe("");
    expect(r.placeholder).toBe(true);
  });
});
