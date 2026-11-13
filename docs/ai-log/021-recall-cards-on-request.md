---
id: 021
date: 2026-11-13
issue: null
agent: claude-code
model: claude-opus-5-5
type: feature
commits: [33e11ad, 362e7f6, 1120b9c]
outcome: in-progress
human_corrections: 1
caught_by: [unit-test]
---
## Requirement
Recall-card redesign agreed with Amilia (2026-11-12): (1) the AI wording appears only when the tester asks for it;
(2) a comment gets one card, under its best-fit question, with an "Also relates to question N" link instead of
repeating; (3) comments no question picked up are offered at the end ("Other things you mentioned").

## Prompt
(translated from Chinese) "I agree it should be only on request… go with the recommendations."

## What the AI did
- Design review first; proposed a per-game switch for the AI wording. Amilia rejected it as unnecessary: "only on
  request" for everyone, with git/Revert as the way back (the human correction).
- Tests first (recall + flow), seen failing. `sanitizeMatches` keeps one card per comment (later listings become
  `also`); the prompt asks for one question plus `also_question_ids`; the keyword mock picks the best-scoring question.
- `recall_prompts.also_json` and `summary_revealed` (additive migrations); PATCH `{reveal: true}`; GET returns
  `otherMoments` once matching settles (one-word filler skipped).
- Survey: "Help me put this in words" reveals the wording; links to related questions; "Add to a question" for
  unmatched comments. Review shows "opened by tester" / "not opened". Banner text updated.

## Validation
- `npm run check`: 45 unit tests pass (2 Whisper tests skipped with SKIP_ASR=1); typecheck and lint clean.
- One E2E run reached the questionnaire and its screenshot looks right; a later step failed and was not yet diagnosed.

## Not verified
- The full E2E suite: the disk is 98% full (about 4 GB free) and the Next.js test server cannot start within its
  2-minute limit. To be rerun once space is freed.
- Whether a real model follows the one-question rule (no API key here; #16). Phone width not checked yet.

## Lesson
A "safe" extra option (the per-game switch) was scope the user did not need; version control was already the undo.
