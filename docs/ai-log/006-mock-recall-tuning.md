---
id: 006
date: 2026-11-04
issue: 9
agent: claude-code
model: claude-opus-5-5
type: feature
commits: [2bf7a65]
outcome: accepted-with-fixes
human_corrections: 0
caught_by: [browser-test]
---
## Requirement
The no-key placeholder matcher should map comments to questions sensibly enough to demo.

## Prompt
Agent-initiated after inspecting a synthetic session's recall output.

## What the AI did
1. "wait, where do I go…?" didn't match the *confused* question, because stopwords were removed **before** synonym
   expansion. Fixed by expanding synonym groups first.
2. That fix plus adding `what` as a synonym caused a regression: "What did you enjoy most?" now looked like a confusion
   question. The agent removed `what`.

## Validation
A second synthetic session produced the expected mapping. The unit test `mockRecall` covers the synonym path.

## Human correction / what we learned
Tuning heuristics by eye on one example over-fits. This is the motivation for a labeled eval set (#16) before choosing an
LLM provider.
