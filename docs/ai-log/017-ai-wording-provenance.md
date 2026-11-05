---
id: 017
date: 2026-11-05
issue: 37
agent: claude-code
model: claude-opus-5-5
type: feature
commits: [89bef7f]
outcome: accepted
human_corrections: 0
caught_by: [review]
---
## Requirement
Follow-ups from Amilia's review of PR #38 (decision 0005): (1) record whether the tester inserted their quote or the AI
wording, and mark answers with AI wording on the developer review; (2) the summary must not strengthen or soften what
the tester said; (3) the CLAUDE.md product paragraph should mention summaries.

## Prompt
(translated from Chinese) "Can you just make these changes directly?" — about the three review points above.

## What the AI did
- Test first: `tests/flow.test.ts` provenance test failed on the missing column, then passed.
- `recall_prompts.inserted_as` (`quote` | `summary`, additive migration), set through `repo.setPromptState` (validated,
  400 on bad input; sticky, so a later dismiss keeps the record). The PATCH route now uses it instead of inline SQL.
- Survey insert buttons send `insertedAs`. Review: "Used quote" / "Used AI wording" pills, "Includes AI wording" under
  the answer; sessions from before this change show plain "Used".
- Prompt rule "Do not strengthen or soften…", with a test; decision 0005 and CLAUDE.md updated.

## Validation
- `npm run check`: lint, typecheck, 38/38 unit tests. `npm run e2e`: 11/11.
- Dev server, seeded summaries in local data: review page correct at 1440 and 375 px (no horizontal scroll); clicking
  "Use this wording" in the survey stored `inserted_as=summary`; PATCH with a bad `insertedAs` → 400, without a token → 403.

## Not verified
- Whether the new prompt rule actually stops a real model from intensifying (no API key on this machine; belongs in #16).
- E2E still runs the mock, which makes no summaries, so the summary buttons have no automated browser test.

## Lesson
A label in the UI is not provenance: once AI text is inside an answer, only a stored field can tell the developer.
